export type AffinityEventType = 'click' | 'pat-tick' | 'chat' | 'egg' | 'feed';
export interface AffinityDaily { date: string; click: number; pat: number; chat: number; egg: number; feeds: number }
export interface AffinityEggs { date: string; count: number; lastAt: number; today: Record<string, number> }
export interface AffinityCounters { clicks: number; pats: number; chats: number; activeDays: number; actionsSeen: string[]; eggs: string[]; feeds: number }
export interface AffinityState {
  version: 1; points: number; firstMetAt: string; lastSeenDate: string;
  daily: AffinityDaily; eggs: AffinityEggs; achievements: string[];
  counters: AffinityCounters; birthday: string | null;
}
export interface AchievementPublic { id: string; name: string; unlocked: boolean }
export interface AffinityPublic {
  level: number; name: string; points: number; nextAt: number | null;
  days: number; todayGained: number; achievements: AchievementPublic[];
  birthday: string | null; festival: string | null; warning: string;
}

export const LEVELS = [
  { level: 1, name: '陌生', min: 0 },
  { level: 2, name: '眼熟', min: 30 },
  { level: 3, name: '搭子', min: 100 },
  { level: 4, name: '挚友', min: 300 },
  { level: 5, name: '离不开', min: 800 },
] as const;
export const DAILY_CAPS = { click: 30, pat: 20, chat: 20, egg: 15, feeds: 5 } as const;
export const FEED_POINTS = 3;
export const FEED_SNACKS = ['cookie', 'fish', 'tea'] as const;
export const ACTION_IDS = ['heart', 'wave', 'clap', 'nod', 'shy', 'stretch'] as const;
export const EGG_POINTS: Record<string, number> = {
  purr: 5, 'shy-rush': 3, night: 3, dawn: 3, corner: 3, offwork: 3,
  birthday: 5, festival: 5, daze: 3, tail: 3, sneeze: 3, 'buddy-trip': 3,
};
export const EGG_LIMITS: Record<string, number> = {
  purr: 1, 'shy-rush': 3, night: 1, dawn: 1, corner: 1, offwork: 1,
  birthday: 1, festival: 1, daze: 1, tail: 1, sneeze: 1, 'buddy-trip': 1,
};
export const RARE_EGGS = ['daze', 'tail', 'sneeze', 'buddy-trip'] as const;
const RARE_COOLDOWN = 10 * 60 * 1000;
const RARE_DAILY = 6;

const ACHIEVEMENTS: Array<{ id: string; name: string; test: (s: AffinityState, today: string) => boolean }> = [
  { id: 'first_pat', name: '第一次摸头', test: s => s.counters.pats >= 1 },
  { id: 'pat_100', name: '摸头一百下', test: s => s.counters.pats >= 100 },
  { id: 'click_100', name: '点击一百次', test: s => s.counters.clicks >= 100 },
  { id: 'actions_all', name: '六种动作都见过', test: s => ACTION_IDS.every(action => s.counters.actionsSeen.includes(action)) },
  { id: 'chat_first', name: '第一次聊天', test: s => s.counters.chats >= 1 },
  { id: 'chat_100', name: '聊满一百句', test: s => s.counters.chats >= 100 },
  { id: 'days_7', name: '认识第七天', test: (s, today) => daysKnown(s.firstMetAt, today) >= 7 },
  { id: 'days_30', name: '认识满月', test: (s, today) => daysKnown(s.firstMetAt, today) >= 30 },
  { id: 'days_100', name: '认识一百天', test: (s, today) => daysKnown(s.firstMetAt, today) >= 100 },
  { id: 'night', name: '深夜陪伴', test: s => s.counters.eggs.includes('night') },
  { id: 'offwork', name: '收工常客', test: s => s.counters.eggs.includes('offwork') },
  { id: 'level_max', name: '离不开', test: s => s.points >= 800 },
];

const FESTIVALS: Record<string, string> = { '01-01': 'festival', '2026-02-17': 'festival', '2026-09-25': 'festival', '2027-02-06': 'festival', '2027-09-15': 'festival' };

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function daysKnown(first: string, today: string): number {
  const [fy, fm, fd] = first.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
  return Math.max(1, diff + 1);
}
export function levelFor(points: number) {
  const index = LEVELS.reduce((found, item, i) => (points >= item.min ? i : found), 0);
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  return { level: current.level, name: current.name, nextAt: next ? next.min : null };
}
export function festivalFor(state: AffinityState, today: string): string | null {
  const mmdd = today.slice(5);
  if (state.birthday && state.birthday === mmdd) return 'birthday';
  return FESTIVALS[today] === 'festival' || FESTIVALS[mmdd] === 'festival' ? 'festival' : null;
}

function defaultState(today: string): AffinityState {
  return {
    version: 1, points: 0, firstMetAt: today, lastSeenDate: today,
    daily: { date: today, click: 0, pat: 0, chat: 0, egg: 0, feeds: 0 },
    eggs: { date: today, count: 0, lastAt: 0, today: {} },
    achievements: [], birthday: null,
    counters: { clicks: 0, pats: 0, chats: 0, activeDays: 1, actionsSeen: [], eggs: [], feeds: 0 },
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function nonNegative(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('陪伴记录数值无效');
  return value;
}
function dayString(value: unknown): string {
  if (typeof value !== 'string' || !DATE.test(value)) throw new Error('陪伴记录日期无效');
  return value;
}
function stringList(value: unknown, limit = 64): string[] {
  if (!Array.isArray(value) || value.length > limit || value.some(item => typeof item !== 'string' || item.length > 64)) throw new Error('陪伴记录列表无效');
  return [...new Set(value as string[])];
}

export function normalizeAffinity(input: unknown, today = dateKey(new Date())): AffinityState {
  if (input === undefined || input === null) return defaultState(today);
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('陪伴记录格式无效');
  const value = input as Record<string, unknown>;
  if (value.version !== 1) throw new Error('陪伴记录版本无效');
  const birthday = value.birthday === null || value.birthday === undefined ? null : (typeof value.birthday === 'string' && MONTH_DAY.test(value.birthday) ? value.birthday : (() => { throw new Error('生日格式无效'); })());
  const daily = value.daily && typeof value.daily === 'object' ? value.daily as Record<string, unknown> : (() => { throw new Error('陪伴记录缺少每日数据'); })();
  const eggs = value.eggs && typeof value.eggs === 'object' ? value.eggs as Record<string, unknown> : (() => { throw new Error('陪伴记录缺少彩蛋数据'); })();
  const counters = value.counters && typeof value.counters === 'object' ? value.counters as Record<string, unknown> : (() => { throw new Error('陪伴记录缺少统计'); })();
  const todayMap: Record<string, number> = {};
  if (eggs.today && typeof eggs.today === 'object' && !Array.isArray(eggs.today)) {
    for (const [key, count] of Object.entries(eggs.today as Record<string, unknown>)) {
      if (typeof key !== 'string' || key.length > 32) throw new Error('彩蛋记录无效');
      todayMap[key] = nonNegative(count);
    }
  }
  return {
    version: 1,
    points: nonNegative(value.points),
    firstMetAt: dayString(value.firstMetAt),
    lastSeenDate: dayString(value.lastSeenDate),
    daily: { date: dayString(daily.date), click: nonNegative(daily.click), pat: nonNegative(daily.pat), chat: nonNegative(daily.chat), egg: nonNegative(daily.egg), feeds: daily.feeds === undefined ? 0 : nonNegative(daily.feeds) },
    eggs: { date: dayString(eggs.date), count: nonNegative(eggs.count), lastAt: nonNegative(eggs.lastAt), today: todayMap },
    achievements: stringList(value.achievements),
    birthday,
    counters: {
      clicks: nonNegative(counters.clicks), pats: nonNegative(counters.pats), chats: nonNegative(counters.chats),
      activeDays: Math.max(1, nonNegative(counters.activeDays)),
      actionsSeen: stringList(counters.actionsSeen), eggs: stringList(counters.eggs),
      feeds: counters.feeds === undefined ? 0 : nonNegative(counters.feeds),
    },
  };
}

function rollover(state: AffinityState, today: string): AffinityState {
  const daily = state.daily.date === today ? state.daily : { date: today, click: 0, pat: 0, chat: 0, egg: 0, feeds: 0 };
  const eggs = state.eggs.date === today ? state.eggs : { date: today, count: 0, lastAt: state.eggs.lastAt, today: {} as Record<string, number> };
  return daily === state.daily && eggs === state.eggs ? state : { ...state, daily, eggs };
}

function unlockAchievements(state: AffinityState, today: string) {
  const unlocked = [...state.achievements];
  for (const item of ACHIEVEMENTS) if (!unlocked.includes(item.id) && item.test(state, today)) unlocked.push(item.id);
  const ids = unlocked.filter(id => !state.achievements.includes(id));
  return ids.length ? { state: { ...state, achievements: unlocked }, ids } : { state, ids };
}

export interface AffinityResult { state: AffinityState; gained: number; accepted: boolean; levelUp: { level: number; name: string } | null; achievements: string[] }

export function startupAffinity(state: AffinityState, now = new Date()): AffinityResult {
  const today = dateKey(now);
  let next = rollover(state, today);
  let gained = 0;
  if (next.lastSeenDate !== today) {
    next = { ...next, lastSeenDate: today, counters: { ...next.counters, activeDays: next.counters.activeDays + 1 } };
    gained += 5;
    next = { ...next, points: next.points + gained };
  }
  const before = levelFor(state.points);
  const unlocked = unlockAchievements(next, today);
  const after = levelFor(unlocked.state.points);
  return { state: unlocked.state, gained, accepted: true, levelUp: after.level > before.level ? after : null, achievements: unlocked.ids };
}

export function applyEvent(state: AffinityState, type: AffinityEventType, meta: { action?: string; egg?: string } = {}, now = new Date()): AffinityResult {
  const today = dateKey(now);
  let next = rollover(state, today);
  let gained = 0;
  let accepted = true;
  if (type === 'click') {
    if (next.daily.click < DAILY_CAPS.click) { gained = 1; next.daily.click += 1; }
    next = { ...next, counters: { ...next.counters, clicks: next.counters.clicks + 1 } };
    if (meta.action && (ACTION_IDS as readonly string[]).includes(meta.action) && !next.counters.actionsSeen.includes(meta.action)) {
      next = { ...next, counters: { ...next.counters, actionsSeen: [...next.counters.actionsSeen, meta.action] } };
    }
  } else if (type === 'pat-tick') {
    if (next.daily.pat < DAILY_CAPS.pat) { gained = 1; next.daily.pat += 1; }
    next = { ...next, counters: { ...next.counters, pats: next.counters.pats + 1 } };
  } else if (type === 'chat') {
    gained = Math.min(2, Math.max(0, DAILY_CAPS.chat - next.daily.chat));
    next.daily.chat += gained;
    next = { ...next, counters: { ...next.counters, chats: next.counters.chats + 1 } };
  } else if (type === 'egg') {    const id = meta.egg ?? '';
    const limit = EGG_LIMITS[id];
    accepted = false;
    if (limit !== undefined && (next.eggs.today[id] ?? 0) < limit && next.daily.egg < DAILY_CAPS.egg) {
      const rare = (RARE_EGGS as readonly string[]).includes(id);
      const rareToday = RARE_EGGS.reduce((sum, egg) => sum + (next.eggs.today[egg] ?? 0), 0);
      if (!rare || (now.getTime() - next.eggs.lastAt >= RARE_COOLDOWN && rareToday < RARE_DAILY)) {
        gained = Math.min(EGG_POINTS[id] ?? 3, DAILY_CAPS.egg - next.daily.egg);
        if (gained > 0) {
          accepted = true;
          next.daily.egg += gained;
          next.eggs = { ...next.eggs, count: next.eggs.count + 1, lastAt: rare ? now.getTime() : next.eggs.lastAt, today: { ...next.eggs.today, [id]: (next.eggs.today[id] ?? 0) + 1 } };
          if (!next.counters.eggs.includes(id)) next = { ...next, counters: { ...next.counters, eggs: [...next.counters.eggs, id] } };
        }
      }
    }
  } else if (type === 'feed') {
    if (next.daily.feeds < DAILY_CAPS.feeds) {
      gained = FEED_POINTS;
      next.daily.feeds += 1;
      next = { ...next, counters: { ...next.counters, feeds: next.counters.feeds + 1 } };
    } else accepted = false;
  } else accepted = false;
  next = { ...next, points: next.points + gained };
  const before = levelFor(state.points);
  const unlocked = unlockAchievements(next, today);
  const after = levelFor(unlocked.state.points);
  return { state: unlocked.state, gained, accepted, levelUp: after.level > before.level ? after : null, achievements: unlocked.ids };
}

export function publicAffinity(state: AffinityState, warning = '', now = new Date()): AffinityPublic {
  const today = dateKey(now);
  const level = levelFor(state.points);
  return {
    level: level.level, name: level.name, points: state.points, nextAt: level.nextAt,
    days: daysKnown(state.firstMetAt, today),
    todayGained: state.daily.date === today ? state.daily.click + state.daily.pat + state.daily.chat + state.daily.egg : 0,
    achievements: ACHIEVEMENTS.map(item => ({ id: item.id, name: item.name, unlocked: state.achievements.includes(item.id) })),
    birthday: state.birthday, festival: festivalFor(state, today), warning,
  };
}
