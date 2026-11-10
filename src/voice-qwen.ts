import {existsSync,readFileSync,statSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import type {VoiceResult,VoiceSpeaker} from './voice-config.ts';

const REGION = 'cn-beijing';
const RESPONSE_LIMIT = 16 * 1024 * 1024;
const AUDIO_LIMIT = 12 * 1024 * 1024;
const CREATE_TIMEOUT = 30000;
const SYNTH_TIMEOUT = 20000;
const DOWNLOAD_TIMEOUT = 20000;
const VOICE_POLL_INTERVAL = 5000;
const VOICE_POLL_TIMEOUT = 60000;

class UserError extends Error {}
interface VoiceCreateResult {ok: boolean; voiceId?: string; error?: string}

function safeError(error: unknown): string {
  return error instanceof UserError ? error.message : 'Qwen 语音服务失败，请检查网络和设置后重试';
}
function cleanBase64(value: string): string {
  const raw = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const audio = raw.replace(/\s/g, '');
  if (!audio || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) throw new UserError('Qwen 返回的音频格式无效');
  const size = Buffer.from(audio, 'base64').byteLength;
  if (!size || size > AUDIO_LIMIT) throw new UserError('Qwen 返回的音频为空或过大');
  return audio;
}
function customizationUrl(workspace: string): string {
  return `https://${workspace}.${REGION}.maas.aliyuncs.com/api/v1/services/audio/tts/customization`;
}
function speechUrl(workspace: string): string {
  return `https://${workspace}.${REGION}.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`;
}
function prefix(): string {
  return ('pvc' + randomBytes(4).toString('hex')).slice(0, 10);
}

export class QwenAdapter {
  private samplesDir: string;
  private sampleCache = new Map<VoiceSpeaker, string>();
  private active = new Set<AbortController>();

  constructor(samplesDir: string) {
    this.samplesDir = samplesDir;
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

  builtinSample(who: VoiceSpeaker): string | null {
    const cached = this.sampleCache.get(who);
    if (cached) return cached;
    if (!this.hasSample(who)) return null;
    const data = 'data:audio/mpeg;base64,' + readFileSync(join(this.samplesDir, `${who}.mp3`)).toString('base64');
    this.sampleCache.set(who, data);
    return data;
  }

  async createVoice(audio: string, key: string, workspace: string, model: string): Promise<VoiceCreateResult> {
    if (!key) return {ok: false, error: '请先填写 Qwen API Key'};
    if (!workspace) return {ok: false, error: '请填写 Qwen 业务空间 ID'};
    if (typeof audio !== 'string' || !/^data:audio\/[a-z0-9.+-]+;base64,/i.test(audio)) return {ok: false, error: '参考音频格式无效'};
    const decoded = Buffer.from(audio.slice(audio.indexOf(',') + 1), 'base64');
    if (!decoded.byteLength || decoded.byteLength > 10 * 1024 * 1024) return {ok: false, error: '参考音频须小于 10MB'};
    const sample = audio;
    const controller = new AbortController();
    this.active.add(controller);
    const timer = setTimeout(() => controller.abort(), CREATE_TIMEOUT);
    try {
      const result = await this.post(customizationUrl(workspace), key, {
        model: 'voice-enrollment',
        input: {
          action: 'create_voice',
          target_model: model,
          prefix: prefix(),
          audio: sample,
          language_hints: ['zh'],
          enable_volume_normalization: 'false',
        },
      }, controller.signal);
      const voiceId = result?.output?.voice_id ?? result?.output?.voice;
      if (typeof voiceId !== 'string' || !voiceId) throw new UserError('Qwen 没有返回音色 ID');
      const status = result?.output?.status;
      if (!status || status === 'OK') return {ok: true, voiceId};
      if (status === 'UNDEPLOYED') throw new UserError('Qwen 音色审核未通过，请检查参考音频');
      return await this.waitForVoice(voiceId, key, workspace);
    } catch (error) {
      if (controller.signal.aborted) return {ok: false, error: 'Qwen 音色创建超时，请稍后重试'};
      return {ok: false, error: safeError(error)};
    } finally {
      clearTimeout(timer);
      this.active.delete(controller);
      controller.abort();
    }
  }

  private async waitForVoice(voiceId: string, key: string, workspace: string): Promise<VoiceCreateResult> {
    const controller = new AbortController();
    this.active.add(controller);
    const timer = setTimeout(() => controller.abort(), VOICE_POLL_TIMEOUT);
    const deadline = Date.now() + VOICE_POLL_TIMEOUT;
    try {
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, VOICE_POLL_INTERVAL));
        if (controller.signal.aborted) throw new Error();
        const result = await this.post(customizationUrl(workspace), key, {
          model: 'voice-enrollment',
          input: {action: 'query_voice', voice_id: voiceId},
        }, controller.signal);
        const status = result?.output?.status;
        if (status === 'OK' || !status) return {ok: true, voiceId};
        if (status === 'UNDEPLOYED') throw new UserError('Qwen 音色审核未通过，请检查参考音频');
      }
      throw new UserError('Qwen 音色仍在处理中，请稍后在语音设置里重试');
    } catch (error) {
      if (controller.signal.aborted) throw new UserError('Qwen 音色仍在处理中，请稍后在语音设置里重试');
      throw error;
    } finally {
      clearTimeout(timer);
      this.active.delete(controller);
      controller.abort();
    }
  }

  async deleteVoice(voiceId: string, key: string, workspace: string): Promise<VoiceResult> {
    if (!key) return {ok: false, error: '请先填写 Qwen API Key'};
    if (!workspace) return {ok: false, error: '请填写 Qwen 业务空间 ID'};
    if (!voiceId) return {ok: false, error: '音色 ID 无效'};
    const controller = new AbortController();
    this.active.add(controller);
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      await this.post(customizationUrl(workspace), key, {
        model: 'voice-enrollment',
        input: {action: 'delete_voice', voice_id: voiceId},
      }, controller.signal);
      return {ok: true};
    } catch (error) {
      if (controller.signal.aborted) return {ok: false, error: '删除 Qwen 音色超时，请稍后重试'};
      return {ok: false, error: safeError(error)};
    } finally {
      clearTimeout(timer);
      this.active.delete(controller);
      controller.abort();
    }
  }

  async synthesize(who: VoiceSpeaker, text: string, key: string, workspace: string, model: string, voiceId: string, speed: number): Promise<VoiceResult> {
    if (!key) return {ok: false, error: '请先填写 Qwen API Key'};
    if (!workspace) return {ok: false, error: '请填写 Qwen 业务空间 ID'};
    if (!voiceId) return {ok: false, error: '请先在语音设置中创建 Qwen 音色'};
    const rate = Number.isFinite(speed) && speed >= 0.5 && speed <= 2 ? speed : 1;
    const controller = new AbortController();
    this.active.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, SYNTH_TIMEOUT);
    try {
      const result = await this.post(speechUrl(workspace), key, {
        model,
        input: {text, voice: voiceId, format: 'mp3', sample_rate: 24000, rate},
      }, controller.signal);
      const data = result?.output?.audio?.data;
      if (typeof data === 'string' && data) return {ok: true, audio: cleanBase64(data)};
      const url = result?.output?.audio?.url;
      if (typeof url !== 'string' || !url) throw new UserError('Qwen 没有返回音频，请重试');
      return {ok: true, audio: await this.download(url, controller.signal)};
    } catch (error) {
      if (controller.signal.aborted) return {ok: false, error: timedOut ? '语音合成超时，请稍后重试' : '语音合成已取消'};
      return {ok: false, error: safeError(error)};
    } finally {
      clearTimeout(timer);
      this.active.delete(controller);
      controller.abort();
    }
  }

  private async post(url: string, key: string, body: unknown, signal: AbortSignal): Promise<any> {
    const response = await fetch(url, {
      method: 'POST', redirect: 'manual', signal,
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`},
      body: JSON.stringify(body),
    });
    if (response.status >= 300 && response.status < 400) throw new UserError('Qwen 接口返回跳转，已拒绝请求');
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new UserError('Qwen 拒绝访问，请检查 API Key 和业务空间');
      if (response.status === 429) throw new UserError('Qwen 请求受限或额度不足，请稍后再试');
      if (response.status === 400 || response.status === 404) throw new UserError('Qwen 参数或业务空间无效，请检查 WorkspaceId');
      throw new UserError('Qwen 语音服务暂时不可用，请稍后重试');
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength > RESPONSE_LIMIT || !response.body) throw new UserError('Qwen 响应过大或为空');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > RESPONSE_LIMIT) throw new UserError('Qwen 响应过大');
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new UserError('Qwen 返回格式无效'); }
  }

  private async download(raw: string, signal: AbortSignal): Promise<string> {
    let url: URL;
    try {
      url = new URL(raw);
      if (url.protocol === 'http:') url.protocol = 'https:';
    } catch { throw new UserError('Qwen 返回的音频地址无效'); }
    if (url.protocol !== 'https:' || url.username || url.password || !/(^|\.)aliyuncs\.com$/i.test(url.hostname)) throw new UserError('Qwen 返回的音频地址不可信');
    const controller = new AbortController();
    this.active.add(controller);
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);
    try {
      const response = await fetch(url, {redirect: 'follow', signal: controller.signal});
      if (!response.ok) throw new UserError('Qwen 音频下载失败，请重试');
      const contentLength = Number(response.headers.get('content-length'));
      if (contentLength > AUDIO_LIMIT) throw new UserError('Qwen 音频过大');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.byteLength || buffer.byteLength > AUDIO_LIMIT) throw new UserError('Qwen 音频为空或过大');
      return buffer.toString('base64');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      this.active.delete(controller);
      controller.abort();
    }
  }
}
