import type {Status} from './core.ts';
export type Action='heart'|'wave'|'clap'|'nod'|'shy'|'stretch';
export type PetSize='small'|'medium'|'large';
export interface Preferences {size:PetSize;actions:Action[]}
export const ACTIONS:ReadonlyArray<{id:Action;label:string;description:string}>=[
  {id:'heart',label:'比心',description:'抱起双手，送你一颗爱心'},
  {id:'wave',label:'招手',description:'举起小手打个招呼'},
  {id:'clap',label:'鼓掌',description:'拍拍小手，为你加油'},
  {id:'nod',label:'点头',description:'认真点头，表示收到'},
  {id:'shy',label:'害羞',description:'捂住脸颊，轻轻晃一晃'},
  {id:'stretch',label:'伸懒腰',description:'举起双手，放松一下'}
];
export const SIZES:ReadonlyArray<{id:PetSize;label:string;scale:number}>=[{id:'small',label:'小号 · 75%',scale:.75},{id:'medium',label:'中号 · 100%',scale:1},{id:'large',label:'大号 · 130%',scale:1.3}];
export function normalizePreferences(input:unknown):Preferences{
  const p=input&&typeof input==='object'?input as Record<string,unknown>:{};
  return {size:SIZES.some(s=>s.id===p.size)?p.size as PetSize:'medium',actions:Array.isArray(p.actions)?[...new Set(p.actions.filter((a):a is Action=>ACTIONS.some(item=>item.id===a)))]:ACTIONS.map(a=>a.id)};
}
export function chooseAction(enabled:Action[],previous:Action|null,random:()=>number=Math.random):Action|null{
  const options=enabled.length>1?enabled.filter(a=>a!==previous):enabled;
  if(!options.length)return null;
  return options[Math.min(options.length-1,Math.max(0,Math.floor(random()*options.length)))];
}
export function activityFor(status:Status):'typing'|'sleeping'|'waving'|'idle'{return status==='working'?'typing':status==='lunch'?'sleeping':status==='finished'?'waving':'idle';}
export function petLayout(size:PetSize){
  const scale=SIZES.find(s=>s.id===size)!.scale,petWidth=Math.round(180*scale),petHeight=Math.round(140*scale);
  return {width:320,height:210+petHeight,petWidth,petHeight,cardBottom:petHeight+2};
}
export class Gesture {
  private x:number;private y:number;private dragged=false;
  constructor(x:number,y:number){this.x=x;this.y=y;}
  move(x:number,y:number):boolean{if(Math.hypot(x-this.x,y-this.y)>6)this.dragged=true;return this.dragged;}
  finish(cancelled=false):boolean{return !cancelled&&!this.dragged;}
}
