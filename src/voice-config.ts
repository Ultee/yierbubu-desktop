export type VoiceProvider = 'qwen' | 'mimo';
export type VoiceSpeaker = 'yier' | 'bubu';
export type VoiceTarget = VoiceSpeaker | 'both';

export const QWEN_MODEL = 'cosyvoice-v3.5-flash';

export interface VoiceConfig {
  provider: VoiceProvider;
  enabled: boolean;
  volume: number;
  speed: number;
  qwenWorkspace: string;
  qwenModel: string;
}

export interface VoiceLibraryBuiltin {
  id: string;
  name: string;
  speaker: VoiceSpeaker;
  ready: boolean;
  assignedTo: VoiceSpeaker[];
}

export interface VoiceLibraryEntryPublic {
  id: string;
  name: string;
  assignedTo: VoiceSpeaker[];
  createdAt: string;
}

export interface VoiceLibraryState {
  builtins: VoiceLibraryBuiltin[];
  custom: VoiceLibraryEntryPublic[];
  assignments: Record<VoiceSpeaker, string>;
}

export interface VoicePublicState {
  config: VoiceConfig;
  hasKey: boolean;
  keys: Record<VoiceProvider, boolean>;
  warning: string;
  samples: Record<VoiceSpeaker, boolean>;
  library: VoiceLibraryState;
}

export interface VoiceResult {
  ok: boolean;
  audio?: string;
  error?: string;
}

export interface VoiceCreateResult extends VoiceResult {
  created?: number;
  voiceId?: string;
}

export function normalizeVoiceConfig(input: unknown): VoiceConfig {
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new Error('语音设置格式无效');
  const value = (input ?? {}) as Record<string, unknown>;
  const provider = value.provider ?? 'qwen';
  if (provider !== 'qwen' && provider !== 'mimo') throw new Error('语音服务商无效');
  const enabled = value.enabled ?? false;
  if (typeof enabled !== 'boolean') throw new Error('语音开关格式无效');
  const rawVolume = value.volume ?? 0.8;
  if (typeof rawVolume !== 'number' || !Number.isFinite(rawVolume) || rawVolume < 0 || rawVolume > 1) throw new Error('语音音量须为 0 到 1 之间的数字');
  const rawSpeed = value.speed ?? 1;
  if (typeof rawSpeed !== 'number' || !Number.isFinite(rawSpeed) || rawSpeed < 0.5 || rawSpeed > 2) throw new Error('语音语速须为 0.5 到 2.0 之间的数字');
  const workspace = value.qwenWorkspace ?? '';
  if (typeof workspace !== 'string') throw new Error('Qwen 业务空间 ID 格式无效');
  const qwenWorkspace = workspace.trim();
  if (qwenWorkspace.length > 80 || (qwenWorkspace && !/^[A-Za-z0-9_-]+$/.test(qwenWorkspace))) throw new Error('Qwen 业务空间 ID 只能包含字母、数字、下划线或短横线');
  const model = value.qwenModel ?? QWEN_MODEL;
  if (model !== QWEN_MODEL) throw new Error('Qwen 语音模型无效');
  return {provider, enabled, volume: Math.round(rawVolume * 100) / 100, speed: Math.round(rawSpeed * 100) / 100, qwenWorkspace, qwenModel: model};
}

export function isVoiceSpeaker(value: unknown): value is VoiceSpeaker {
  return value === 'yier' || value === 'bubu';
}
