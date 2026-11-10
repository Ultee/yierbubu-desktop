import type {} from './bridge.ts';
import type {VoiceProvider,VoicePublicState,VoiceSpeaker,VoiceTarget} from './voice-config.ts';

export function initVoiceSettings() {
  const input = (id: string) => document.getElementById(`voice-${id}`) as HTMLInputElement;
  const notice = document.getElementById('voice-notice')!;
  let removeKey = false;
  let latest: VoicePublicState | null = null;
  let audio: HTMLAudioElement | null = null;
  let audioUrl = '';
  const message = (text: string, failed = false) => { notice.textContent = text; notice.classList.toggle('failed', failed); };
  const volume = () => Number(input('volume').value) / 100;
  const speed = () => Number(input('speed').value) / 100;
  const provider = () => input('provider').value as VoiceProvider;
  const draft = () => ({
    provider: provider(),
    enabled: input('enabled').checked,
    volume: volume(),
    speed: speed(),
    qwenWorkspace: input('workspace').value.trim(),
    qwenModel: 'cosyvoice-v3.5-flash',
  });

  function stopAudio() {
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
    if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = ''; }
  }

  function play(base64: string) {
    stopAudio();
    try {
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      audioUrl = URL.createObjectURL(new Blob([bytes], {type: 'audio/mpeg'}));
      audio = new Audio(audioUrl);
      audio.volume = volume();
      audio.addEventListener('ended', stopAudio, {once: true});
      audio.addEventListener('error', stopAudio, {once: true});
      void audio.play().catch(() => { stopAudio(); message('试听音频无法播放，请检查系统音频设备。', true); });
    } catch { stopAudio(); message('试听音频格式无效。', true); }
  }

  function syncProvider() {
    const qwen = provider() === 'qwen';
    document.getElementById('voice-qwen-fields')!.hidden = !qwen;
    document.getElementById('voice-mimo-fields')!.hidden = qwen;
    document.getElementById('voice-key-label')!.textContent = qwen ? 'Qwen API Key' : 'MiMo API Key';
    input('key').placeholder = qwen ? '粘贴 Qwen API Key' : '粘贴 MiMo API Key';
    document.getElementById('voice-provider-hint')!.textContent = qwen
      ? 'Qwen 需要 API Key 和北京业务空间 ID；内置音色不可删除，自定义音色只在本机管理。'
      : 'MiMo 使用内置参考音频，每次合成会携带样本；不支持云端音色库，语速由播放端调整。';
    const hasKey = latest ? latest.keys[provider()] : false;
    document.getElementById('voice-key-status')!.textContent = hasKey ? '已保存密钥' : '尚未保存密钥';
  }

  const speakerName = (who: VoiceSpeaker) => who === 'yier' ? '一二' : '布布';
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]!));

  async function previewEntry(entryId: string) {
    message('正在生成试听…');
    try {
      const result = await window.petAPI.previewVoice(entryId);
      if (!result.ok || !result.audio) { message(result.error ?? '试听失败，请重试。', true); return; }
      play(result.audio);
      message('试听已开始。');
    } catch { message('试听失败，请稍后重试。', true); }
  }

  async function assignEntry(entryId: string, target: VoiceTarget) {
    try {
      const result = await window.petAPI.assignVoice(entryId, target);
      if (!result.ok) { message(result.error ?? '应用音色失败。', true); return; }
      show(await window.petAPI.getVoice());
      message(target === 'both' ? '已应用到两只宠物。' : `已应用到${speakerName(target)}。`);
    } catch { message('应用音色失败，请稍后重试。', true); }
  }

  async function deleteEntry(entryId: string, name: string) {
    if (!window.confirm(`删除音色“${name}”？正在使用时会自动回退到内置音色。`)) return;
    message('正在删除音色…');
    try {
      const result = await window.petAPI.deleteVoice(entryId);
      if (!result.ok) { message(result.error ?? '删除失败，请重试。', true); return; }
      show(await window.petAPI.getVoice());
      message('音色已删除；正在使用的角色已回退到内置音色。');
    } catch { message('删除失败，请稍后重试。', true); }
  }

  function rowActions(entryId: string, speaker: VoiceSpeaker | null, ready: boolean, custom: boolean, name: string) {
    const actions: HTMLElement[] = [];
    const add = (text: string, className: string, handler: () => void, disabled = false) => {
      const button = document.createElement('button');
      button.type = 'button';button.textContent = text;button.className = className;button.disabled = disabled;
      button.addEventListener('click', handler);actions.push(button);
    };
    add('试听', '', () => void previewEntry(entryId), !ready);
    if (speaker) add(`应用到${speakerName(speaker)}`, '', () => void assignEntry(entryId, speaker), !ready || latest?.library.assignments[speaker] === entryId);
    else {
      for (const who of ['yier', 'bubu'] as const) add(`应用到${speakerName(who)}`, '', () => void assignEntry(entryId, who), !ready || latest?.library.assignments[who] === entryId);
    }
    if (custom) add('删除', 'danger', () => void deleteEntry(entryId, name));
    return actions;
  }

  function makeRow(infoHtml: string, actions: HTMLElement[]): HTMLElement {
    const row = document.createElement('div');row.className = 'voice-row';
    const info = document.createElement('div');info.className = 'voice-row-info';info.innerHTML = infoHtml;
    const controls = document.createElement('div');controls.className = 'voice-row-actions';controls.append(...actions);
    row.append(info, controls);return row;
  }

  function renderLibrary(state: VoicePublicState) {
    const root = document.getElementById('voice-library')!;root.replaceChildren();
    const {builtins, custom} = state.library;
    for (const item of builtins) {
      const tags = [
        '<span class="voice-tag">内置</span>',
        item.ready ? '<span class="voice-tag">可用</span>' : '<span class="voice-tag missing">未创建</span>',
        item.assignedTo.map(who => `<span class="voice-tag active">${speakerName(who)}</span>`).join(''),
      ].join('');
      root.append(makeRow(`<div class="voice-row-name">${escapeHtml(item.name)}</div><div class="voice-row-meta">${tags}</div>`, rowActions(item.id, item.speaker, item.ready, false, item.name)));
    }
    for (const item of custom) {
      const tags = [
        '<span class="voice-tag">自定义</span>',
        item.assignedTo.map(who => `<span class="voice-tag active">${speakerName(who)}</span>`).join(''),
      ].join('');
      root.append(makeRow(`<div class="voice-row-name">${escapeHtml(item.name)}</div><div class="voice-row-meta">${tags}</div>`, rowActions(item.id, null, true, true, item.name)));
    }
    if (!root.children.length) {
      const empty = document.createElement('div');empty.className = 'voice-empty';empty.textContent = '还没有音色，先点击“创建内置音色”。';root.append(empty);
    }
    document.getElementById('voice-library-count')!.textContent = `${custom.length} 个自定义 · ${builtins.filter(item => item.ready).length}/2 内置可用`;
  }

  function show(state: VoicePublicState) {
    latest = state;
    input('enabled').checked = state.config.enabled;
    input('provider').value = state.config.provider;
    input('workspace').value = state.config.qwenWorkspace;
    input('volume').value = String(Math.round(state.config.volume * 100));
    input('speed').value = String(Math.round(state.config.speed * 100));
    document.getElementById('voice-volume-label')!.textContent = `${Math.round(state.config.volume * 100)}%`;
    document.getElementById('voice-speed-label')!.textContent = `${state.config.speed.toFixed(2)}×`;
    input('key').value = '';
    removeKey = false;
    syncProvider();
    renderLibrary(state);
    const missing = !state.samples.yier || !state.samples.bubu;
    message(state.warning || (missing ? '语音样本缺失，请重新安装完整版本。' : ''), Boolean(state.warning || missing));
  }

  async function persistDraft(): Promise<boolean> {
    try {
      const result = await window.petAPI.saveVoice(draft(), input('key').value || undefined, removeKey);
      if (!result.ok) { message(result.error ?? '保存失败，请重试。', true); return false; }
      show(await window.petAPI.getVoice());
      return true;
    } catch { message('暂时无法保存语音设置，请稍后重试。', true); return false; }
  }

  input('provider').addEventListener('change', () => {
    input('key').value = '';
    removeKey = false;
    syncProvider();
    message('切换服务商后，请填写对应 Key 并保存语音设置。');
  });
  input('volume').addEventListener('input', () => { document.getElementById('voice-volume-label')!.textContent = `${input('volume').value}%`; });
  input('speed').addEventListener('input', () => { document.getElementById('voice-speed-label')!.textContent = `${speed().toFixed(2)}×`; });
  input('key').addEventListener('input', () => { if (input('key').value) removeKey = false; });
  document.getElementById('voice-remove-key')!.addEventListener('click', () => { removeKey = true; input('key').value = ''; message('点击“保存语音设置”后移除当前服务商的密钥。'); });

  document.getElementById('voice-save')!.addEventListener('click', async () => {
    const button = document.getElementById('voice-save') as HTMLButtonElement;
    button.disabled = true;
    message('正在保存…');
    try { if (await persistDraft()) message('语音设置已保存。'); }
    finally { button.disabled = false; }
  });

  document.getElementById('voice-create-qwen')!.addEventListener('click', async () => {
    const button = document.getElementById('voice-create-qwen') as HTMLButtonElement;
    button.disabled = true;
    message('正在保存设置…');
    try {
      if (!(await persistDraft())) return;
      message('正在创建内置音色，可能需要几十秒…');
      const result = await window.petAPI.createQwenVoices();
      if (!result.ok) { message(result.error ?? '内置音色创建失败，请重试。', true); return; }
      show(await window.petAPI.getVoice());
      message(result.created ? `已创建 ${result.created} 个内置音色。` : '内置音色已存在，无需重复创建。');
    } catch { message('内置音色创建失败，请稍后重试。', true); }
    finally { button.disabled = false; }
  });

  document.getElementById('voice-upload')!.addEventListener('click', () => input('file').click());
  input('file').addEventListener('change', async () => {
    const file = input('file').files?.[0];input('file').value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { message('音频文件不能超过 10MB。', true); return; }
    if (!/\.(mp3|wav|m4a)$/i.test(file.name) && !/^audio\//.test(file.type)) { message('请选择 MP3、WAV 或 M4A 音频。', true); return; }
    const upload = document.getElementById('voice-upload') as HTMLButtonElement;
    upload.disabled = true;
    message('正在检查音频…');
    try {
      const url = URL.createObjectURL(file);
      const duration = await new Promise<number>((resolve, reject) => {
        const probe = new Audio();
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => resolve(probe.duration);
        probe.onerror = () => reject(new Error('无法读取音频时长'));
        probe.src = url;
      }).finally(() => URL.revokeObjectURL(url));
      if (!Number.isFinite(duration) || duration < 5 || duration > 60) { message('参考音频须为 5～60 秒，建议 10～20 秒。', true); return; }
      const name = input('name').value.trim() || file.name.replace(/\.[^.]+$/, '');
      if (!name || [...name].length > 30) { message('请填写 1～30 个字符的音色名称。', true); return; }
      const audioData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('读取失败'));
        reader.onerror = () => reject(new Error('读取失败'));
        reader.readAsDataURL(file);
      });
      if (!(await persistDraft())) return;
      message('正在上传并创建音色，可能需要几十秒…');
      const result = await window.petAPI.createCustomVoice({name, target: input('target').value as VoiceTarget, audio: audioData});
      if (!result.ok) { message(result.error ?? '音色创建失败，请重试。', true); return; }
      show(await window.petAPI.getVoice());
      message(`音色“${name}”已创建并应用。`);
    } catch (error) {
      message(error instanceof Error ? error.message : '音色上传失败，请重试。', true);
    } finally { upload.disabled = false; }
  });

  for (const who of ['yier', 'bubu'] as const) {
    document.getElementById(`voice-test-${who}`)!.addEventListener('click', async () => {
      const button = document.getElementById(`voice-test-${who}`) as HTMLButtonElement;
      button.disabled = true;
      message('正在保存设置…');
      try {
        if (!(await persistDraft())) return;
        message(who === 'yier' ? '正在生成一二的试听…' : '正在生成布布的试听…');
        const result = await window.petAPI.testVoice(who);
        if (!result.ok || !result.audio) { message(result.error ?? '试听失败，请重试。', true); return; }
        play(result.audio);
        show(await window.petAPI.getVoice());
        message('试听已开始。');
      } catch { message('试听失败，请稍后重试。', true); }
      finally { button.disabled = false; }
    });
  }

  window.petAPI.getVoice().then(show).catch(() => message('读取语音设置失败，请关闭后重试。', true));
}
