import {contextBridge,ipcRenderer} from 'electron';
import type {PetBridge} from './bridge.ts';
const api:PetBridge={
  getState:()=>ipcRenderer.invoke('state'),
  save:config=>ipcRenderer.invoke('save',config),
  openSettings:()=>ipcRenderer.send('settings'),
  closeSettings:()=>ipcRenderer.send('close-settings'),
  menu:()=>ipcRenderer.send('menu'),
  passthrough:ignore=>ipcRenderer.send('passthrough',ignore),
  drag:(action,point)=>ipcRenderer.send('drag',action,point),
  onChanged:listener=>{ipcRenderer.on('changed',()=>listener());}
};
contextBridge.exposeInMainWorld('petAPI',api);
