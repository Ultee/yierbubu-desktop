import {ipcMain,safeStorage} from 'electron';
import type {BrowserWindow,IpcMainEvent,IpcMainInvokeEvent} from 'electron';
import {join} from 'node:path';
import {VoiceService} from './voice-service.ts';
import {isVoiceSpeaker} from './voice-config.ts';

interface Host {
  dir: string;
  pet: () => BrowserWindow | null;
  settings: () => BrowserWindow | null;
  broadcast: () => void;
}

export function installVoice(host: Host) {
  const service = new VoiceService(host.dir, {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: text => safeStorage.encryptString(text),
    decrypt: buffer => safeStorage.decryptString(buffer),
  }, join(__dirname, 'assets', 'voice'));
  const own = (event: IpcMainEvent | IpcMainInvokeEvent, window: BrowserWindow | null) =>
    !!window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  const allowed = (event: IpcMainEvent | IpcMainInvokeEvent) => own(event, host.pet()) || own(event, host.settings());

  ipcMain.handle('voice-state', event => {
    if (!allowed(event)) throw new Error('无效请求');
    return service.getState();
  });
  ipcMain.handle('voice-save', (event, input: unknown, key: unknown, remove: unknown) => {
    if (!own(event, host.settings()) || (key !== undefined && typeof key !== 'string') || (remove !== undefined && typeof remove !== 'boolean')) return {ok: false, error: '无效请求'};
    try {
      service.save(input, key as string | undefined, remove as boolean | undefined);
      host.broadcast();
      return {ok: true};
    } catch (error) {
      return {ok: false, error: error instanceof Error ? error.message : '语音设置保存失败'};
    }
  });
  ipcMain.handle('voice-test', (event, who: unknown) => {
    if (!own(event, host.settings())) return {ok: false, error: '无效请求'};
    if (!isVoiceSpeaker(who)) return {ok: false, error: '角色无效'};
    return service.test(who);
  });
  ipcMain.handle('voice-create-qwen', event => {
    if (!own(event, host.settings())) return {ok: false, error: '无效请求'};
    return service.createQwenVoices();
  });
  ipcMain.handle('voice-create-custom', (event, input: unknown) => {
    if (!own(event, host.settings())) return {ok: false, error: '无效请求'};
    return service.createCustomVoice(input);
  });
  ipcMain.handle('voice-assign', (event, entryId: unknown, target: unknown) => {
    if (!own(event, host.settings())) return {ok: false, error: '无效请求'};
    return service.assignVoice(entryId, target);
  });
  ipcMain.handle('voice-delete', (event, entryId: unknown) => {
    if (!own(event, host.settings())) return {ok: false, error: '无效请求'};
    return service.deleteVoice(entryId);
  });
  ipcMain.handle('voice-preview', (event, entryId: unknown) => {
    if (!own(event, host.settings())) return {ok: false, error: '无效请求'};
    return service.previewVoice(entryId);
  });
  ipcMain.handle('voice-speak', (event, who: unknown, text: unknown, emotion: unknown) => {
    if (!own(event, host.pet())) return {ok: false, error: '无效请求'};
    return service.speak(who, text, emotion);
  });

  return {dispose(){service.cancel();}};
}
