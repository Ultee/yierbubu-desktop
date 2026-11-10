import {ipcMain,BrowserWindow} from 'electron';
import type {IpcMainEvent,IpcMainInvokeEvent} from 'electron';
import {existsSync,mkdirSync,readFileSync,renameSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {applyEvent,dateKey,FEED_SNACKS,festivalFor,normalizeAffinity,publicAffinity,startupAffinity} from './affinity.ts';
import type {AffinityEventType,AffinityState} from './affinity.ts';

interface Host {dir:string;pet:()=>BrowserWindow|null;settings:()=>BrowserWindow|null;broadcast:()=>void}
const EGG_TEXT: Record<string,string> = {
  purr:'呼噜呼噜…摸头最舒服了',
  'shy-rush':'别戳啦，再戳就躲起来了！',
  night:'都这个点儿了，咱陪你熬着。',
  dawn:'嚯，起这么早？给您请安了。',
  corner:'这块儿风水好，咱就在这儿眯着。',
  offwork:'收工！今儿的活计到这儿了。',
  birthday:'生日快乐！今儿您最大。',
  festival:'过节啦，乐呵乐呵！',
  daze:'（一二盯着空气发呆……）',
  tail:'（一二追着自己尾巴转了一圈）',
  sneeze:'哈啾！',
  'buddy-trip':'（布布一个趔趄又站稳了）',
};
const FEED_TEXT: Record<string,string> = {
  cookie:'布布：啊这，小饼干！咔嚓咔嚓。',
  fish:'一二：小鱼干！咱可就不客气了。',
  tea:'一二：奶茶续命，谢啦您嘞。',
};

export function installAffinity(host: Host) {
  const path = join(host.dir, 'affinity.json');
  let warning = '';
  let state: AffinityState;
  try {
    mkdirSync(host.dir, { recursive: true });
    if (statSync(path).size > 256 * 1024) throw new Error();
    state = normalizeAffinity(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    if (existsSync(path)) warning = '陪伴记录无法读取或已损坏，已重新开始。';
    state = normalizeAffinity(undefined);
  }
  function save() {
    writeFileSync(path + '.tmp', JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(path + '.tmp', path);
  }
  const pending: string[] = [];
  function toast(text: string) {
    const pet = host.pet();
    if (pet && !pet.isDestroyed()) pet.webContents.send('affinity-toast', text);
    else if (pending.length < 4) pending.push(text);
  }
  function publish() {
    const data = publicAffinity(state, warning);
    for (const window of [host.pet(), host.settings()]) {
      if (window && !window.isDestroyed()) window.webContents.send('affinity', data);
    }
    host.broadcast();
  }
  function commit(result: ReturnType<typeof applyEvent>) {
    state = result.state;
    try { save(); } catch { warning = '陪伴记录保存失败，请检查本机目录权限。'; }
    if (result.accepted) {
      if (result.levelUp) toast(`好嘛，交情升级：${result.levelUp.name}！`);
      for (const id of result.achievements) {
        const name = publicAffinity(state).achievements.find(item => item.id === id)?.name ?? id;
        toast(`解锁小成就：${name}`);
      }
    }
    publish();
  }
  function eggToast(id: string) { const text = EGG_TEXT[id]; if (text) toast(text); }
  const initial = startupAffinity(state, new Date());
  commit(initial);
  let lastFestivalDay = '';
  let lastStatus = '';
  const own = (event: IpcMainEvent | IpcMainInvokeEvent, window: BrowserWindow | null) => !!window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;

  ipcMain.handle('affinity-state', event => {
    if (!own(event, host.pet()) && !own(event, host.settings())) throw new Error('无效请求');
    if (pending.length) {
      const pet = host.pet();
      setTimeout(() => {
        if (pet && !pet.isDestroyed()) for (const text of pending.splice(0)) pet.webContents.send('affinity-toast', text);
      }, 400);
    }
    return { state: publicAffinity(state, warning) };
  });
  ipcMain.handle('affinity-event', (event, type: unknown, meta: unknown) => {
    if (!own(event, host.pet()) || typeof type !== 'string' || !['click', 'pat-tick', 'egg'].includes(type)) return { ok: false };
    const input = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta as Record<string, unknown> : {};
    const action = typeof input.action === 'string' ? input.action : undefined;
    const egg = typeof input.egg === 'string' ? input.egg : undefined;
    const result = applyEvent(state, type as AffinityEventType, { action, egg }, new Date());
    commit(result);
    if (type === 'egg' && egg && result.accepted) eggToast(egg);
    return { ok: true, gained: result.gained, accepted: result.accepted };
  });
  ipcMain.handle('affinity-birthday', (event, value: unknown) => {
    if (!own(event, host.settings())) return { ok: false, error: '无效请求' };
    if (value !== null && (typeof value !== 'string' || !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))) return { ok: false, error: '生日格式须为 MM-DD' };
    state = { ...state, birthday: value as string | null };
    try { save(); } catch { return { ok: false, error: '陪伴记录保存失败，请检查本机目录权限。' }; }
    publish();
    return { ok: true };
  });
  return {
    chat() { commit(applyEvent(state, 'chat', {}, new Date())); },
    feed(snack: unknown) {
      if (typeof snack !== 'string' || !(FEED_SNACKS as readonly string[]).includes(snack)) return false;
      const result = applyEvent(state, 'feed', {}, new Date());
      commit(result);
      if (!result.accepted) { toast('今儿吃得够够的啦，留着下回吧。'); return false; }
      if (FEED_TEXT[snack]) toast(FEED_TEXT[snack]);
      const pet = host.pet();
      if (pet && !pet.isDestroyed()) pet.webContents.send('feed', snack);
      return true;
    },
    egg(id: string, now = new Date()) { const result = applyEvent(state, 'egg', { egg: id }, now); commit(result); if (result.accepted) eggToast(id); return result.accepted; },
    dailyCheck(now = new Date()) {
      const today = dateKey(now);
      if (lastFestivalDay === today) return;
      lastFestivalDay = today;
      const festival = festivalFor(state, today);
      if (festival) this.egg(festival, now);
    },
    statusTick(status: string) {
      if (lastStatus && status !== lastStatus && status === 'finished') this.egg('offwork');
      lastStatus = status;
    },
    dispose() { /* listeners live for the app lifetime */ },
  };
}
