import {contextBridge,ipcRenderer} from 'electron';
import type {PetBridge} from './bridge.ts';
const api:PetBridge={
  getState:()=>ipcRenderer.invoke('state'),
  save:(config,preferences)=>ipcRenderer.invoke('save',config,preferences),
  setSize:size=>ipcRenderer.invoke('size',size),
  getAI:()=>ipcRenderer.invoke('ai-state'),
  saveAI:(config,key,removeKey)=>ipcRenderer.invoke('ai-save',config,key,removeKey),
  testAI:(config,key)=>ipcRenderer.invoke('ai-test',config,key),
  getChat:()=>ipcRenderer.invoke('chat-state'),
  sendChat:text=>ipcRenderer.invoke('chat-send',text),
  clearChat:()=>ipcRenderer.invoke('chat-clear'),
  openChat:()=>ipcRenderer.send('chat-open'),
  onSpeech:listener=>{ipcRenderer.on('speech',(_event,text:unknown)=>{if(typeof text==='string')listener(text);});},
  openSettings:()=>ipcRenderer.send('settings'),
  closeSettings:()=>ipcRenderer.send('close-settings'),
  menu:()=>ipcRenderer.send('menu'),
  passthrough:ignore=>ipcRenderer.send('passthrough',ignore),
  drag:(action,point)=>ipcRenderer.send('drag',action,point),
  onChanged:listener=>{ipcRenderer.on('changed',()=>listener());}
};
contextBridge.exposeInMainWorld('petAPI',api);
