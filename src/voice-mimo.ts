import {existsSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import type {VoiceResult,VoiceSpeaker} from './voice-config.ts';

const MODEL = 'mimo-v2.5-tts-voiceclone';
const DEFAULT_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions';
const RESPONSE_LIMIT = 16 * 1024 * 1024;
const AUDIO_LIMIT = 12 * 1024 * 1024;
const REQUEST_TIMEOUT = 15000;

class UserError extends Error {}

function safeError(error: unknown): string {
  return error instanceof UserError ? error.message : 'MiMo 语音合成失败，请检查网络和设置后重试';
}
function normalizedBase64(value: string): string {
  const raw = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const audio = raw.replace(/\s/g, '');
  if (!audio || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) throw new UserError('MiMo 返回的音频格式无效');
  if (!Buffer.from(audio, 'base64').byteLength || Buffer.from(audio, 'base64').byteLength > AUDIO_LIMIT) throw new UserError('MiMo 返回的音频为空或过大');
  return audio;
}

export class MimoAdapter {
  private samplesDir: string;
  private endpoint: string;
  private sampleCache = new Map<VoiceSpeaker, string>();
  private active = new Set<AbortController>();

  constructor(samplesDir: string, endpoint = DEFAULT_ENDPOINT) {
    this.samplesDir = samplesDir;
    this.endpoint = endpoint;
  }

  hasSample(who: VoiceSpeaker): boolean {
    const path = join(this.samplesDir, `${who}.mp3`);
    try { return existsSync(path) && statSync(path).size > 0; }
    catch { return false; }
  }

  cancel(): void {
    for (const controller of this.active) controller.abort();
    this.active.clear();
  }

  private sample(who: VoiceSpeaker): string | null {
    const cached = this.sampleCache.get(who);
    if (cached) return cached;
    if (!this.hasSample(who)) return null;
    const data = 'data:audio/mpeg;base64,' + readFileSync(join(this.samplesDir, `${who}.mp3`)).toString('base64');
    this.sampleCache.set(who, data);
    return data;
  }

  async synthesize(who: VoiceSpeaker, text: string, key: string): Promise<VoiceResult> {
    if (!key) return {ok: false, error: '请先在设置中填写 MiMo API Key'};
    const sample = this.sample(who);
    if (!sample) return {ok: false, error: '语音样本缺失，请重新安装完整版本'};
    const controller = new AbortController();
    this.active.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: {'Content-Type': 'application/json', 'api-key': key},
        body: JSON.stringify({
          model: MODEL,
          messages: [{role: 'assistant', content: text}],
          audio: {format: 'mp3', voice: sample},
          stream: false,
        }),
      });
      if (response.status >= 300 && response.status < 400) throw new UserError('MiMo 接口返回跳转，已拒绝请求');
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new UserError('MiMo 拒绝访问，请检查 API Key');
        if (response.status === 429) throw new UserError('MiMo 请求受限或额度不足，请稍后再试');
        throw new UserError('MiMo 语音服务暂时不可用，请稍后重试');
      }
      const contentLength = Number(response.headers.get('content-length'));
      if (contentLength > RESPONSE_LIMIT || !response.body) throw new UserError('MiMo 响应过大或为空');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > RESPONSE_LIMIT) throw new UserError('MiMo 响应过大');
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      let data: any;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new UserError('MiMo 返回格式无效'); }
      if (data?.choices?.[0]?.finish_reason === 'content_filter') throw new UserError('这段文本被 MiMo 内容策略拦截');
      const raw = data?.choices?.[0]?.message?.audio?.data;
      if (typeof raw !== 'string') throw new UserError('MiMo 没有返回音频，请重试');
      return {ok: true, audio: normalizedBase64(raw)};
    } catch (error) {
      if (controller.signal.aborted) return {ok: false, error: timedOut ? '语音合成超时，请稍后重试' : '语音合成已取消'};
      return {ok: false, error: safeError(error)};
    } finally {
      clearTimeout(timer);
      this.active.delete(controller);
      controller.abort();
    }
  }
}
