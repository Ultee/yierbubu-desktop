export interface AIConfig {
  enabled: boolean;
  provider: 'openai' | 'deepseek' | 'qwen' | 'custom';
  baseUrl: string;
  model: string;
  nickname: string;
  personaMode: 'preset' | 'custom';
  persona: 'gentle' | 'cute' | 'snarky' | 'worker';
  customPrompt: string;
  proactive: 'off' | 'schedule' | 'occasional';
  proactiveIntervalMinutes: number;
  memory: boolean;
  shareIncome: boolean;
}
export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface AIPublicState { config: AIConfig; hasKey: boolean; warning: string }
export interface AIResult { ok: boolean; text?: string; error?: string }

export const PROVIDERS: ReadonlyArray<{ id: AIConfig['provider']; label: string; baseUrl: string; model: string }> = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'custom', label: '自定义兼容接口', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
];

function choice<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error('AI 选项无效，请重新选择');
  return value as T;
}
function flag(value: unknown, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error('AI 开关格式无效');
  return value;
}
function text(value: unknown, fallback: string, limit: number, label: string, required = false): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new Error(`${label}格式无效`);
  const result = value.trim();
  if ([...result].length > limit || (required && !result)) throw new Error(`${label}${required ? '不能为空，且' : ''}不能超过 ${limit} 字`);
  return result;
}

/** Accept only an HTTPS base URL, or HTTP on an actual loopback host. */
function endpoint(value: unknown, fallback: string): string {
  const raw = text(value, fallback, 2048, '接口地址', true);
  try {
    const url = new URL(raw);
    const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) throw new Error();
    return url.href.replace(/\/+$/, '');
  } catch { throw new Error('接口地址须为 HTTPS；HTTP 仅支持本机回环地址，且不能含账号、查询参数或片段'); }
}

export function normalizeAIConfig(input: unknown): AIConfig {
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new Error('AI 设置格式无效');
  const value = (input ?? {}) as Record<string, unknown>;
  const provider = choice(value.provider, ['openai', 'deepseek', 'qwen', 'custom'], 'openai');
  const defaults = PROVIDERS.find(item => item.id === provider)!;
  const model = text(value.model, defaults.model, 200, '模型名称', true);
  if (/[\u0000-\u001f\u007f]/.test(model)) throw new Error('模型名称不能含控制字符');
  const nickname = text(value.nickname, '', 30, '称呼');
  if (/[\u0000-\u001f\u007f]/.test(nickname)) throw new Error('称呼不能含控制字符');
  const proactiveIntervalMinutes=value.proactiveIntervalMinutes===undefined?30:value.proactiveIntervalMinutes;
  if(typeof proactiveIntervalMinutes!=='number'||!Number.isInteger(proactiveIntervalMinutes)||proactiveIntervalMinutes<1||proactiveIntervalMinutes>1440)throw new Error('主动说话间隔须为1到1440之间的整数分钟');
  return {
    enabled: flag(value.enabled), provider, baseUrl: endpoint(value.baseUrl, defaults.baseUrl), model, nickname,
    personaMode: choice(value.personaMode, ['preset', 'custom'], 'preset'),
    persona: choice(value.persona, ['gentle', 'cute', 'snarky', 'worker'], 'gentle'),
    customPrompt: text(value.customPrompt, '', 4000, '自定义人设'),
    proactive: choice(value.proactive, ['off', 'schedule', 'occasional'], 'off'),
    proactiveIntervalMinutes,
    memory: flag(value.memory), shareIncome: flag(value.shareIncome),
  };
}
