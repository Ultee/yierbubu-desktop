import {contextBridge,ipcRenderer} from 'electron';
import type {PetBridge} from './bridge.ts';
const api:PetBridge={
  getState:()=>ipcRenderer.invoke('state'),
  save:(config,preferences)=>ipcRenderer.invoke('save',config,preferences),
  setSize:size=>ipcRenderer.invoke('size',size),
  openSettings:()=>ipcRenderer.send('settings'),
  closeSettings:()=>ipcRenderer.send('close-settings'),
  menu:()=>ipcRenderer.send('menu'),
  passthrough:ignore=>ipcRenderer.send('passthrough',ignore),
  drag:(action,point)=>ipcRenderer.send('drag',action,point),
  onChanged:listener=>{ipcRenderer.on('changed',()=>listener());}
};
contextBridge.exposeInMainWorld('petAPI',api);
