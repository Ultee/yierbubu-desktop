import type {Config,Snapshot} from './core.ts';
import type {Preferences,PetSize} from './pet-behavior.ts';
export interface State { config:Config|null; snapshot:Snapshot; preferences:Preferences; warning:string }
export interface PetBridge {
  getState():Promise<State>;
  save(config:unknown,preferences:Preferences):Promise<{ok:boolean;field?:string;error?:string}>;
  setSize(size:PetSize):Promise<{ok:boolean;error?:string}>;
  openSettings():void; closeSettings():void; menu():void;
  passthrough(ignore:boolean):void; drag(action:'start'|'move'|'end',point?:{x:number;y:number}):void;
  onChanged(listener:()=>void):void;
}
declare global { interface Window { petAPI:PetBridge } }
