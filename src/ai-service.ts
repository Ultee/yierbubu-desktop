import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeAIConfig } from './ai-config.ts';
import type { AIConfig, AIPublicState, AIResult, ChatMessage } from './ai-config.ts';
import type { Config, Snapshot } from './core.ts';
import { BASE_PROMPT, PERSONA_PROMPTS, PROACTIVE_PROMPT } from './ai-prompts.ts';
export type { AIConfig, AIPublicState, AIResult, ChatMessage } from './ai-config.ts';

interface Cipher { available(): boolean; encrypt(text: string): Buffer; decrypt(buffer: Buffer): string }
const HISTORY_LIMIT = 40;
const RESPONSE_LIMIT = 1024 * 1024;
const OUTPUT_LIMIT = 16000;
// Forty bounded Unicode messages can exceed a single response's byte limit.
const HISTORY_FILE_LIMIT = HISTORY_LIMIT * OUTPUT_LIMIT * 6 + 16384;

function readJson(path: string, limit = RESPONSE_LIMIT): unknown {
  if (statSync(path).size > limit) throw new Error('size');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function writeJson(path: string, value: unknown): void {
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(path + '.tmp', path);
}
function checkedKey(value: unknown): string {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020\u007f]/.test(value)) throw new Error('密钥格式无效，请重新输入');
  return value;
}
function safeError(error: unknown): string {
  // Only errors deliberately created by this module/config are ever exposed.
  return error instanceof UserError ? error.message : 'AI 请求失败，请检查网络和接口设置后重试';
}
class UserError extends Error {}

export class AiService {
  private settingsPath: string;
  private historyPath: string;
  private config: AIConfig = normalizeAIConfig(undefined);
  private key = '';
  private encryptedKey = '';
  private history: ChatMessage[] = [];
  private warning = '';
  private cipher: Cipher;
  private active: AbortController | null = null;
  private generation = 0;

  constructor(dir: string, cipher: Cipher) {
    this.cipher = cipher;
    this.settingsPath = join(dir, 'ai-settings.json');
    this.historyPath = join(dir, 'ai-history.json');
    mkdirSync(dir, { recursive: true });
    if (!existsSync(this.settingsPath)) return;
    try {
      const saved = readJson(this.settingsPath) as Record<string, unknown>;
      if (!saved || saved.version !== 1 || typeof saved.encryptedKey !== 'string' || saved.encryptedKey.length > 32768) throw new Error();
      this.config = normalizeAIConfig(saved.config);
      this.encryptedKey = saved.encryptedKey;
    } catch {
      this.warning = 'AI 设置文件无法读取或已损坏，请重新保存设置';
      return;
    }
    if (this.encryptedKey) {
      try {
        if (!cipher.available()) throw new Error();
        this.key = checkedKey(cipher.decrypt(Buffer.from(this.encryptedKey, 'base64')));
        if (!this.key) throw new Error();
      } catch { this.warning = '本机安全加密不可用或密钥无法解密，请重新输入密钥'; }
    }
    if (this.config.memory && existsSync(this.historyPath)) {
      try {
        const saved = readJson(this.historyPath, HISTORY_FILE_LIMIT) as Record<string, unknown>;
        if (!saved || saved.version !== 1 || !Array.isArray(saved.messages) || saved.messages.length > HISTORY_LIMIT) throw new Error();
        this.history = saved.messages.map((message: unknown) => {
          const item = message as ChatMessage;
          if (!item || (item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string' || !item.content.trim() || [...item.content].length > OUTPUT_LIMIT) throw new Error();
          return { role: item.role, content: item.content };
        });
      } catch { this.history = []; this.warning = 'AI 聊天记录无法读取或已损坏，已跳过旧记录'; }
    }
  }

  getState(): AIPublicState { return { config: { ...this.config }, hasKey: Boolean(this.key), warning: this.warning }; }
  getHistory(): ChatMessage[] { return this.history.map(message => ({ ...message })); }

  save(input: unknown, key?: string, removeKey = false): void {
    this.cancel();
    const next = normalizeAIConfig(input);
    if (typeof removeKey !== 'boolean') throw new Error('移除密钥选项无效');
    const supplied = checkedKey(key);
    if (next.baseUrl !== this.config.baseUrl && this.encryptedKey && !supplied && !removeKey) throw new Error('修改接口地址时须重新输入密钥，或先移除已存密钥');
    const nextKey = removeKey ? '' : supplied || this.key;
    let encryptedKey = removeKey ? '' : this.encryptedKey;
    if (supplied && !removeKey) {
      try {
        if (!this.cipher.available()) throw new Error();
        encryptedKey = this.cipher.encrypt(supplied).toString('base64');
        if (!encryptedKey) throw new Error();
      } catch { throw new Error('本机安全加密不可用，无法保存密钥'); }
    }
    const clear = this.config.memory !== next.memory || (this.config.shareIncome && !next.shareIncome) || this.config.baseUrl !== next.baseUrl;
    try {
      if (clear || !next.memory) this.removeHistoryFile();
      writeJson(this.settingsPath, { version: 1, config: next, encryptedKey });
    } catch { throw new Error('AI 设置无法保存，请检查本机目录权限后重试'); }
    if (clear) this.history = [];
    this.config = next; this.key = nextKey; this.encryptedKey = encryptedKey; this.warning = '';
  }

  async test(input: unknown, key?: string): Promise<AIResult> {
    let config: AIConfig;
    let supplied: string;
    try { config = normalizeAIConfig(input); supplied = checkedKey(key); }
    catch { return { ok: false, error: 'AI 设置或密钥格式无效，请检查后重试' }; }
    if (!supplied && this.encryptedKey && config.baseUrl !== this.config.baseUrl) return { ok: false, error: '测试新接口时请重新输入密钥' };
    return this.request(config, supplied || this.key, [
      { role: 'system', content: '这是连接测试，请简短回复：连接成功。' },
      { role: 'user', content: '你好，请确认连接。' },
    ]);
  }

  async send(text: string, context: { config: Config | null; snapshot: Snapshot }, kind: 'chat' | 'proactive' = 'chat'): Promise<AIResult> {
    if (!this.config.enabled) return { ok: false, error: '请先在设置中启用 AI 陪伴' };
    if (typeof text !== 'string' || !text.trim() || [...text.trim()].length > 4000) return { ok: false, error: '消息须为 1 至 4000 字' };
    if (kind !== 'chat' && kind !== 'proactive') return { ok: false, error: '消息类型无效' };
    if (!context || !context.snapshot) return { ok: false, error: '当前作息状态无法读取' };
    const config = { ...this.config };
    const generation = this.generation;
    const status = context.snapshot.status;
    const statuses = ['unconfigured', 'empty', 'rest', 'before', 'working', 'lunch', 'finished'];
    if (!statuses.includes(status)) return { ok: false, error: '当前作息状态无效' };
    let system = BASE_PROMPT;
    if (config.nickname) system += `\n用户希望被称为：${config.nickname}。`;
    system += '\n' + (config.personaMode === 'custom' ? `用户自定义人设：${config.customPrompt}` : PERSONA_PROMPTS[config.persona]);
    if (kind === 'proactive') system += `\n主动气泡规则：${PROACTIVE_PROMPT}`;
    system += `\n当前作息状态：${status}。`;
    if (config.shareIncome) {
      const income: Record<string, number | null> = {};
      if (context.config && Number.isSafeInteger(context.config.salaryCents)) income.salaryCents = context.config.salaryCents;
      for (const field of ['earnedCents', 'rate', 'monthSeconds', 'elapsedSeconds', 'remainingSeconds', 'workdays'] as const) {
        const value = context.snapshot[field];
        if (value === null || (typeof value === 'number' && Number.isFinite(value))) income[field] = value;
      }
      system += `\n用户已授权分享的当前收入快照（金额分、秒薪元/秒）：${JSON.stringify(income)}`;
    }
    const user: ChatMessage = { role: 'user', content: text.trim() };
    const result = await this.request(config, this.key, [
      { role: 'system', content: system },
      ...(config.memory ? this.history.slice(-20) : []),
      user,
    ]);
    if (generation !== this.generation) return { ok: false, error: 'AI 请求已取消' };
    if (!result.ok || !result.text) return result;
    const assistant: ChatMessage = { role: 'assistant', content: result.text };
    const next: ChatMessage[] = [...this.history, ...(kind === 'chat' ? [user] : []), assistant].slice(-HISTORY_LIMIT);
    if (config.memory) {
      try { writeJson(this.historyPath, { version: 1, messages: next }); }
      catch { return { ok: false, error: 'AI 回复已收到，但聊天记录无法保存，请检查本机目录权限' }; }
    }
    this.history = next;
    return result;
  }

  clearHistory(): void {
    this.cancel();
    try { this.removeHistoryFile(); }
    catch { throw new Error('聊天记录无法清除，请检查本机目录权限后重试'); }
    this.history = [];
  }

  cancel(): void { this.generation++; this.active?.abort(); this.active = null; }

  private removeHistoryFile(): void {
    for (const path of [this.historyPath, this.historyPath + '.tmp']) if (existsSync(path)) unlinkSync(path);
  }

  private async request(config: AIConfig, key: string, messages: Array<{ role: string; content: string }>): Promise<AIResult> {
    if (!key) return { ok: false, error: '请先在设置中填写 API 密钥' };
    if (this.active) return { ok: false, error: 'AI 正在回复，请稍候再发送' };
    const controller = new AbortController();
    this.active = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
    try {
      const url = config.baseUrl.endsWith('/chat/completions') ? config.baseUrl : `${config.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: config.model, messages, stream: false, max_tokens: 1000 }),
      });
      if (response.status >= 300 && response.status < 400) throw new UserError('接口返回跳转，已拒绝；请直接填写最终接口地址');
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new UserError('接口拒绝访问，请检查密钥和模型权限');
        if (response.status === 429) throw new UserError('接口请求受限或额度不足，请稍后再试');
        throw new UserError('AI 服务暂时不可用，请稍后手动重试');
      }
      const contentLength = Number(response.headers.get('content-length'));
      if (contentLength > RESPONSE_LIMIT || !response.body) throw new UserError('AI 响应过大或为空，请重试');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > RESPONSE_LIMIT) throw new UserError('AI 响应过大，请重试');
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      let data: any;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new UserError('AI 返回格式无效，请检查兼容接口和模型设置'); }
      const answer = data?.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim() || [...answer.trim()].length > OUTPUT_LIMIT) throw new UserError('AI 返回内容为空或过长，请重试');
      if (controller.signal.aborted) throw new Error();
      return { ok: true, text: answer.trim() };
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, error: timedOut ? 'AI 请求超时，请稍后手动重试' : 'AI 请求已取消' };
      return { ok: false, error: safeError(error) };
    } finally {
      clearTimeout(timer);
      if (this.active === controller) this.active = null;
      // Also closes unread bodies on rejected, redirected or oversized responses.
      controller.abort();
    }
  }
}
