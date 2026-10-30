import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateConfig } from './core.ts';
import type { Config } from './core.ts';
import {normalizePreferences} from './pet-behavior.ts';
import type {Preferences} from './pet-behavior.ts';
export interface Stored {config:Config|null; position:{x:number;y:number}|null;preferences:Preferences}
export class Store {
  private path:string;
  private corrupt=false;
  constructor(dir:string) {mkdirSync(dir,{recursive:true});this.path=join(dir,'settings.json');}
  load():Stored & {warning:string} {
    if(!existsSync(this.path)) return {config:null,position:null,preferences:normalizePreferences(undefined),warning:''};
    try {
      const data=JSON.parse(readFileSync(this.path,'utf8'));
      if(data.version!==1) throw new Error('version');
      const config=data.config===null?null:validateConfig(data.config);
      const p=data.position;
      const position=p&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)?{x:p.x,y:p.y}:null;
      this.corrupt=false;
      return {config,position,preferences:normalizePreferences(data.preferences),warning:''};
    } catch {
      this.corrupt=true;
      return {config:null,position:null,preferences:normalizePreferences(undefined),warning:'设置文件无法读取或已损坏。原文件已保留，重新保存时会先备份。'};
    }
  }
  save(data:Omit<Stored,'preferences'>&{preferences?:Preferences}):void {
    const config=data.config===null?null:validateConfig(data.config);
    const p=data.position;
    if(p&&(!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y))) throw new Error('窗口位置无效');
    const temp=this.path+'.tmp';
    const preferences=normalizePreferences(data.preferences);
    writeFileSync(temp,JSON.stringify({version:1,config,position:p,preferences},null,2),'utf8');
    if(this.corrupt&&existsSync(this.path)) {
      const backup=this.path.replace('settings.json','settings.corrupt.json');
      copyFileSync(this.path,existsSync(backup)?backup+'.'+Date.now():backup);
    }
    renameSync(temp,this.path);
    this.corrupt=false;
  }
}
