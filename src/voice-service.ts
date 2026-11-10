import {createHash, randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {isVoiceSpeaker,normalizeVoiceConfig,QWEN_MODEL} from './voice-config.ts';
import type {VoiceConfig,VoiceCreateResult,VoiceProvider,VoicePublicState,VoiceResult,VoiceSpeaker} from './voice-config.ts';
import {MimoAdapter} from './voice-mimo.ts';
import {QwenAdapter} from './voice-qwen.ts';
import {instructionFor} from './voice-emotions.ts';

interface Cipher { available(): boolean; encrypt(text: string): Buffer; decrypt(buffer: Buffer): string }
interface StoredLibraryEntry {id: string; name: string; voiceId: string; model: string; workspace: string; createdAt: string}
interface StoredV3 {
  version: 3;
  config: VoiceConfig;
  encryptedKeys: Partial<Record<VoiceProvider, string>>;
  qwenBuiltins?: Partial<Record<VoiceSpeaker, string>>;
  qwenBuiltinVersion?: number;
  qwenBuiltinModel?: string;
  qwenBuiltinWorkspace?: string;
  qwenLibrary?: StoredLibraryEntry[];
  assignments?: Partial<Record<VoiceSpeaker, string>>;
}
const SETTINGS_LIMIT = 128 * 1024;
const CACHE_LIMIT = 80;
const BUILTIN_VERSION = 2;
const BUILTIN_IDS: Record<VoiceSpeaker, string> = {yier: 'builtin:yier', bubu: 'builtin:bubu'};

function readJson(path: string, limit: number): unknown {
  if (statSync(path).size > limit) throw new Error('size');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function writeJson(path: string, value: unknown): void {
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 2), {encoding: 'utf8', mode: 0o600});
  renameSync(path + '.tmp', path);
}
function checkedKey(value: unknown): string {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020\u007f]/.test(value)) throw new Error('密钥格式无效，请重新输入');
  return value;
}
function validVoiceId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
}
function validName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('音色名称格式无效');
  const name = value.trim();
  if (!name || [...name].length > 30 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('音色名称须为 1 至 30 个字符');
  return name;
}
function targetValue(value: unknown): VoiceSpeaker[] {
  if (value === 'yier') return ['yier'];
  if (value === 'bubu') return ['bubu'];
  if (value === 'both') return ['yier', 'bubu'];
  throw new Error('应用角色无效');
}

export class VoiceService {
  private settingsPath: string;
  private config: VoiceConfig = normalizeVoiceConfig(undefined);
  private keys: Record<VoiceProvider, string> = {qwen: '', mimo: ''};
  private encryptedKeys: Partial<Record<VoiceProvider, string>> = {};
  private qwenBuiltins: Partial<Record<VoiceSpeaker, string>> = {};
  private qwenLibrary: StoredLibraryEntry[] = [];
  private assignments: Record<VoiceSpeaker, string> = {...BUILTIN_IDS};
  private warning = '';
  private cipher: Cipher;
  private mimo: MimoAdapter;
  private qwen: QwenAdapter;
  private audioCache = new Map<string, string>();

  constructor(dir: string, cipher: Cipher, samplesDir: string) {
    this.cipher = cipher;
    this.mimo = new MimoAdapter(samplesDir);
    this.qwen = new QwenAdapter(samplesDir);
    this.settingsPath = join(dir, 'voice-settings.json');
    mkdirSync(dir, {recursive: true});
    if (!existsSync(this.settingsPath)) {
      this.refreshWarning();
      return;
    }
    try {
      const saved = readJson(this.settingsPath, SETTINGS_LIMIT) as Record<string, unknown>;
      if (saved.version === 1) this.loadV1(saved);
      else if (saved.version === 2) this.loadV2(saved);
      else if (saved.version === 3) this.loadV3(saved);
      else throw new Error();
      this.refreshWarning();
    } catch {
      this.warning = '语音设置文件无法读取或已损坏，请重新保存设置';
    }
  }

  private loadV1(saved: Record<string, unknown>): void {
    this.config = normalizeVoiceConfig({...((saved.config ?? {}) as Record<string, unknown>), provider: 'qwen'});
    const oldKey = typeof saved.encryptedKey === 'string' ? saved.encryptedKey : '';
    const key = oldKey ? this.decryptKey(oldKey) : '';
    this.keys.mimo = key;
    this.encryptedKeys = key ? {mimo: oldKey} : {};
    this.warning = key ? '已保留旧版 MiMo 密钥；Qwen 需要填写 API Key 和业务空间 ID。' : '';
  }

  private loadV2(saved: Record<string, unknown>): void {
    const config = normalizeVoiceConfig(saved.config);
    const encrypted = saved.encryptedKeys && typeof saved.encryptedKeys === 'object' && !Array.isArray(saved.encryptedKeys) ? saved.encryptedKeys as Record<string, unknown> : {};
    this.loadEncryptedKeys(encrypted);
    this.config = config;
    this.warning = '内置音色已更新，请重新创建 Qwen 内置音色。';
  }

  private loadV3(saved: Record<string, unknown>): void {
    const config = normalizeVoiceConfig(saved.config);
    const encrypted = saved.encryptedKeys && typeof saved.encryptedKeys === 'object' && !Array.isArray(saved.encryptedKeys) ? saved.encryptedKeys as Record<string, unknown> : {};
    this.loadEncryptedKeys(encrypted);
    this.config = config;
    const sameModel = saved.qwenBuiltinModel === config.qwenModel && saved.qwenBuiltinWorkspace === config.qwenWorkspace;
    if (saved.qwenBuiltinVersion === BUILTIN_VERSION && sameModel) {
      const builtins = saved.qwenBuiltins && typeof saved.qwenBuiltins === 'object' && !Array.isArray(saved.qwenBuiltins) ? saved.qwenBuiltins as Record<string, unknown> : {};
      for (const who of ['yier', 'bubu'] as const) if (validVoiceId(builtins[who])) this.qwenBuiltins[who] = builtins[who];
    } else if (!sameModel) {
      this.warning = 'Qwen 业务空间或模型已变化，请重新创建内置音色和自定义音色。';
    } else {
      this.warning = '内置音色已更新，请重新创建 Qwen 内置音色。';
    }
    if (sameModel && Array.isArray(saved.qwenLibrary)) {
      const seen = new Set<string>();
      for (const raw of saved.qwenLibrary) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const item = raw as Record<string, unknown>;
        if (typeof item.id !== 'string' || !item.id || item.id.length > 100 || seen.has(item.id)) continue;
        if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 30) continue;
        if (!validVoiceId(item.voiceId) || item.model !== config.qwenModel || item.workspace !== config.qwenWorkspace) continue;
        if (typeof item.createdAt !== 'string' || item.createdAt.length > 40) continue;
        seen.add(item.id);
        this.qwenLibrary.push({id: item.id, name: item.name.trim(), voiceId: item.voiceId, model: item.model, workspace: item.workspace, createdAt: item.createdAt});
      }
    }
    const assignments = saved.assignments && typeof saved.assignments === 'object' && !Array.isArray(saved.assignments) ? saved.assignments as Record<string, unknown> : {};
    for (const who of ['yier', 'bubu'] as const) {
      const value = assignments[who];
      if (value === BUILTIN_IDS[who] || (typeof value === 'string' && this.qwenLibrary.some(entry => entry.id === value))) this.assignments[who] = value;
      else this.assignments[who] = BUILTIN_IDS[who];
    }
  }

  private loadEncryptedKeys(encrypted: Record<string, unknown>): void {
    const nextEncrypted: Partial<Record<VoiceProvider, string>> = {};
    for (const provider of ['qwen', 'mimo'] as const) {
      const value = encrypted[provider];
      if (value === undefined) continue;
      if (typeof value !== 'string' || value.length > 32768) throw new Error();
      if (value) {
        nextEncrypted[provider] = value;
        this.keys[provider] = this.decryptKey(value);
      }
    }
    this.encryptedKeys = nextEncrypted;
  }

  private decryptKey(value: string): string {
    try {
      if (!this.cipher.available()) return '';
      return checkedKey(this.cipher.decrypt(Buffer.from(value, 'base64')));
    } catch { return ''; }
  }

  private refreshWarning(): void {
    if (!this.qwen.hasSample('yier') || !this.qwen.hasSample('bubu')) {
      this.warning = '语音样本缺失，请重新安装完整版本';
      return;
    }
    if (this.config.provider === 'qwen') {
      if (!this.keys.qwen || !this.config.qwenWorkspace) this.warning = 'Qwen 语音未配置完整：请填写 API Key 和业务空间 ID';
      else if (!this.qwenBuiltins.yier || !this.qwenBuiltins.bubu) this.warning = 'Qwen 内置音色尚未创建，请点击“创建内置音色”';
      else if (!this.resolveQwenVoice('yier') || !this.resolveQwenVoice('bubu')) this.warning = '当前分配的音色不可用，请在音色库中重新选择';
      else this.warning = '';
    } else {
      this.warning = this.keys.mimo ? '' : 'MiMo 语音未配置：请填写 MiMo API Key';
    }
  }

  private assignedTo(id: string): VoiceSpeaker[] {
    return (['yier', 'bubu'] as const).filter(who => this.assignments[who] === id);
  }

  private resolveQwenVoice(who: VoiceSpeaker): string | null {
    const id = this.assignments[who];
    if (id === BUILTIN_IDS[who]) return this.qwenBuiltins[who] ?? null;
    return this.qwenLibrary.find(entry => entry.id === id)?.voiceId ?? null;
  }

  getState(): VoicePublicState {
    return {
      config: {...this.config},
      hasKey: Boolean(this.keys[this.config.provider]),
      keys: {qwen: Boolean(this.keys.qwen), mimo: Boolean(this.keys.mimo)},
      warning: this.warning,
      samples: {yier: this.mimo.hasSample('yier'), bubu: this.mimo.hasSample('bubu')},
      library: {
        builtins: (['yier', 'bubu'] as const).map(who => ({
          id: BUILTIN_IDS[who],
          name: who === 'yier' ? '内置 · 一二' : '内置 · 布布',
          speaker: who,
          ready: Boolean(this.qwenBuiltins[who]),
          assignedTo: this.assignedTo(BUILTIN_IDS[who]),
        })),
        custom: this.qwenLibrary.map(entry => ({id: entry.id, name: entry.name, assignedTo: this.assignedTo(entry.id), createdAt: entry.createdAt})),
        assignments: {...this.assignments},
      },
    };
  }

  save(input: unknown, key?: string, removeKey = false): void {
    this.cancel();
    const next = normalizeVoiceConfig(input);
    if (typeof removeKey !== 'boolean') throw new Error('移除密钥选项无效');
    const supplied = checkedKey(key);
    const nextKey = removeKey ? '' : supplied || this.keys[next.provider];
    if (next.enabled) {
      if (!nextKey) throw new Error(next.provider === 'qwen' ? '启用 Qwen 语音前请先填写 API Key' : '启用 MiMo 语音前请先填写 API Key');
      if (next.provider === 'qwen' && !next.qwenWorkspace) throw new Error('启用 Qwen 语音前请先填写业务空间 ID');
    }
    const nextEncrypted = {...this.encryptedKeys};
    if (removeKey) delete nextEncrypted[next.provider];
    else if (supplied) {
      try {
        if (!this.cipher.available()) throw new Error();
        const encrypted = this.cipher.encrypt(supplied).toString('base64');
        if (!encrypted) throw new Error();
        nextEncrypted[next.provider] = encrypted;
      } catch { throw new Error('本机安全加密不可用，无法保存语音密钥'); }
    }
    const contextChanged = next.qwenWorkspace !== this.config.qwenWorkspace || next.qwenModel !== this.config.qwenModel;
    if (contextChanged) {
      this.qwenBuiltins = {};
      this.qwenLibrary = [];
      this.assignments = {...BUILTIN_IDS};
    }
    this.config = next;
    this.keys[next.provider] = nextKey;
    this.encryptedKeys = nextEncrypted;
    this.persist();
    this.audioCache.clear();
    this.refreshWarning();
  }

  async test(who: unknown): Promise<VoiceResult> {
    if (!isVoiceSpeaker(who)) return {ok: false, error: '请选择要试听的角色'};
    const text = who === 'yier' ? '你好，我是一二。' : '你好，我是布布。';
    if (this.config.provider === 'qwen') {
      if (!this.keys.qwen) return {ok: false, error: '请先填写 Qwen API Key'};
      if (!this.config.qwenWorkspace) return {ok: false, error: '请先填写 Qwen 业务空间 ID'};
      if (this.assignments[who] === BUILTIN_IDS[who] && !this.qwenBuiltins[who]) {
        const created = await this.ensureBuiltin(who);
        if (!created.ok) return {ok: false, error: created.error};
      }
      const voiceId = this.resolveQwenVoice(who);
      if (!voiceId) return {ok: false, error: '当前分配的音色不可用，请在音色库中重新选择'};
      return this.synthesizeQwen(who, text, voiceId);
    }
    if (!this.keys.mimo) return {ok: false, error: '请先填写 MiMo API Key'};
    return this.synthesizeMimo(who, text);
  }

  async speak(who: unknown, text: unknown, emotion?: unknown): Promise<VoiceResult> {
    if (!isVoiceSpeaker(who)) return {ok: false, error: '角色无效'};
    if (!this.config.enabled) return {ok: false, error: '语音未启用'};
    const value = typeof text === 'string' ? text.trim() : '';
    if (!value || [...value].length > 300) return {ok: false, error: '语音文本须为 1 至 300 字'};
    if (this.config.provider === 'qwen') {
      if (!this.keys.qwen) return {ok: false, error: '请先在设置中填写 Qwen API Key'};
      if (!this.config.qwenWorkspace) return {ok: false, error: '请先在设置中填写 Qwen 业务空间 ID'};
      const voiceId = this.resolveQwenVoice(who);
      if (!voiceId) return {ok: false, error: this.assignments[who] === BUILTIN_IDS[who] ? '请先创建 Qwen 内置音色' : '当前分配的音色不可用，请在音色库中重新选择'};
      return this.synthesizeQwen(who, value, voiceId, instructionFor(emotion));
    }
    if (!this.keys.mimo) return {ok: false, error: '请先在设置中填写 MiMo API Key'};
    return this.synthesizeMimo(who, value);
  }

  async createQwenVoices(): Promise<VoiceCreateResult> {
    if (!this.keys.qwen) return {ok: false, error: '请先填写 Qwen API Key'};
    if (!this.config.qwenWorkspace) return {ok: false, error: '请先填写 Qwen 业务空间 ID'};
    let created = 0;
    for (const who of ['yier', 'bubu'] as const) {
      if (this.qwenBuiltins[who]) continue;
      const result = await this.ensureBuiltin(who);
      if (!result.ok) return result;
      created += 1;
    }
    this.refreshWarning();
    return {ok: true, created};
  }

  async createCustomVoice(input: unknown): Promise<VoiceCreateResult> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok: false, error: '音色参数无效'};
    const value = input as Record<string, unknown>;
    let name: string, targets: VoiceSpeaker[];
    try { name = validName(value.name); targets = targetValue(value.target); }
    catch (error) { return {ok: false, error: error instanceof Error ? error.message : '音色参数无效'}; }
    if (typeof value.audio !== 'string' || !/^data:audio\/[a-z0-9.+-]+;base64,/i.test(value.audio)) return {ok: false, error: '参考音频格式无效'};
    const bytes = Buffer.from(value.audio.slice(value.audio.indexOf(',') + 1), 'base64');
    if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) return {ok: false, error: '参考音频须小于 10MB'};
    if (!this.keys.qwen) return {ok: false, error: '请先填写 Qwen API Key'};
    if (!this.config.qwenWorkspace) return {ok: false, error: '请先填写 Qwen 业务空间 ID'};
    const created = await this.qwen.createVoice(value.audio, this.keys.qwen, this.config.qwenWorkspace, this.config.qwenModel);
    if (!created.ok || !created.voiceId) return {ok: false, error: created.error ?? '音色创建失败'};
    const entry: StoredLibraryEntry = {id: randomUUID(), name, voiceId: created.voiceId, model: this.config.qwenModel, workspace: this.config.qwenWorkspace, createdAt: new Date().toISOString()};
    this.qwenLibrary.push(entry);
    for (const who of targets) this.assignments[who] = entry.id;
    try { this.persist(); }
    catch {
      this.qwenLibrary = this.qwenLibrary.filter(item => item.id !== entry.id);
      return {ok: false, error: '音色已创建，但保存音色库失败，请检查本机目录权限'};
    }
    this.audioCache.clear();
    this.refreshWarning();
    return {ok: true, created: 1, voiceId: entry.voiceId};
  }

  async assignVoice(entryId: unknown, target: unknown): Promise<VoiceResult> {
    if (typeof entryId !== 'string' || !entryId) return {ok: false, error: '音色 ID 无效'};
    let targets: VoiceSpeaker[];
    try { targets = targetValue(target); }
    catch (error) { return {ok: false, error: error instanceof Error ? error.message : '应用角色无效'}; }
    if (entryId === BUILTIN_IDS.yier || entryId === BUILTIN_IDS.bubu) {
      const speaker = entryId === BUILTIN_IDS.yier ? 'yier' : 'bubu';
      if (targets.length !== 1 || targets[0] !== speaker) return {ok: false, error: '内置音色只能应用到对应角色'};
    } else if (!this.qwenLibrary.some(entry => entry.id === entryId)) {
      return {ok: false, error: '音色不存在'};
    }
    for (const who of targets) this.assignments[who] = entryId;
    try { this.persist(); }
    catch { return {ok: false, error: '保存音色应用失败，请检查本机目录权限'}; }
    this.audioCache.clear();
    this.refreshWarning();
    return {ok: true};
  }

  async deleteVoice(entryId: unknown): Promise<VoiceResult> {
    if (typeof entryId !== 'string' || !entryId) return {ok: false, error: '音色 ID 无效'};
    if (entryId === BUILTIN_IDS.yier || entryId === BUILTIN_IDS.bubu) return {ok: false, error: '内置音色不可删除'};
    const entry = this.qwenLibrary.find(item => item.id === entryId);
    if (!entry) return {ok: false, error: '音色不存在'};
    if (!this.keys.qwen || !this.config.qwenWorkspace) return {ok: false, error: '请先配置 Qwen API Key 和业务空间 ID'};
    const deleted = await this.qwen.deleteVoice(entry.voiceId, this.keys.qwen, this.config.qwenWorkspace);
    if (!deleted.ok) return deleted;
    this.qwenLibrary = this.qwenLibrary.filter(item => item.id !== entry.id);
    for (const who of ['yier', 'bubu'] as const) if (this.assignments[who] === entry.id) this.assignments[who] = BUILTIN_IDS[who];
    try { this.persist(); }
    catch { return {ok: false, error: '音色已删除，但保存音色库失败，请检查本机目录权限'}; }
    this.audioCache.clear();
    this.refreshWarning();
    return {ok: true};
  }

  async previewVoice(entryId: unknown): Promise<VoiceResult> {
    if (this.config.provider !== 'qwen') return {ok: false, error: '请切换到 Qwen 后试听音色库'};
    if (!this.keys.qwen || !this.config.qwenWorkspace) return {ok: false, error: '请先配置 Qwen API Key 和业务空间 ID'};
    if (typeof entryId !== 'string' || !entryId) return {ok: false, error: '音色 ID 无效'};
    let voiceId: string | undefined;
    if (entryId === BUILTIN_IDS.yier) voiceId = this.qwenBuiltins.yier;
    else if (entryId === BUILTIN_IDS.bubu) voiceId = this.qwenBuiltins.bubu;
    else voiceId = this.qwenLibrary.find(entry => entry.id === entryId)?.voiceId;
    if (!voiceId) return {ok: false, error: '音色尚未创建或不存在'};
    return this.qwen.synthesize('yier', '这是一段音色试听，听听效果怎么样？', this.keys.qwen, this.config.qwenWorkspace, this.config.qwenModel, voiceId, this.config.speed);
  }

  cancel(): void {
    this.mimo.cancel();
    this.qwen.cancel();
  }

  private async ensureBuiltin(who: VoiceSpeaker): Promise<VoiceCreateResult> {
    const sample = this.qwen.builtinSample(who);
    if (!sample) return {ok: false, error: '语音样本缺失，请重新安装完整版本'};
    const result = await this.qwen.createVoice(sample, this.keys.qwen, this.config.qwenWorkspace, this.config.qwenModel);
    if (!result.ok || !result.voiceId) return result;
    this.qwenBuiltins[who] = result.voiceId;
    try { this.persist(); }
    catch { return {ok: false, error: '内置音色已创建，但保存设置失败，请检查本机目录权限'}; }
    this.refreshWarning();
    return {ok: true, voiceId: result.voiceId};
  }

  private persist(): void {
    writeJson(this.settingsPath, {
      version: 3,
      config: this.config,
      encryptedKeys: this.encryptedKeys,
      qwenBuiltins: this.qwenBuiltins,
      qwenBuiltinVersion: BUILTIN_VERSION,
      qwenBuiltinModel: this.config.qwenModel,
      qwenBuiltinWorkspace: this.config.qwenWorkspace,
      qwenLibrary: this.qwenLibrary,
      assignments: this.assignments,
    } satisfies StoredV3);
  }

  private cacheKey(who: VoiceSpeaker, text: string, voiceId: string, instruction = ''): string {
    return createHash('sha256').update(`${this.config.provider}\0${this.config.qwenModel}\0${voiceId}\0${this.config.speed}\0${instruction}\0${who}\0${text}`).digest('hex');
  }

  private remember(key: string, audio: string): void {
    this.audioCache.set(key, audio);
    if (this.audioCache.size > CACHE_LIMIT) {
      const oldest = this.audioCache.keys().next().value;
      if (oldest) this.audioCache.delete(oldest);
    }
  }

  private async synthesizeQwen(who: VoiceSpeaker, text: string, voiceId: string, instruction = ''): Promise<VoiceResult> {
    const key = this.cacheKey(who, text, voiceId, instruction);
    const cached = this.audioCache.get(key);
    if (cached) return {ok: true, audio: cached};
    const result = await this.qwen.synthesize(who, text, this.keys.qwen, this.config.qwenWorkspace, this.config.qwenModel, voiceId, this.config.speed, instruction);
    if (result.ok && result.audio) this.remember(key, result.audio);
    return result;
  }

  private async synthesizeMimo(who: VoiceSpeaker, text: string): Promise<VoiceResult> {
    const key = this.cacheKey(who, text, '');
    const cached = this.audioCache.get(key);
    if (cached) return {ok: true, audio: cached};
    const result = await this.mimo.synthesize(who, text, this.keys.mimo);
    if (result.ok && result.audio) this.remember(key, result.audio);
    return result;
  }
}
