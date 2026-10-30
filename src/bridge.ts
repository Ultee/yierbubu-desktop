import type {Config,Snapshot} from './core.ts';
import type {Preferences,PetSize} from './pet-behavior.ts';
import type {AIConfig,AIPublicState,AIResult,ChatMessage} from './ai-config.ts';
export interface ChatState {messages:ChatMessage[];busy:boolean;error:string;enabled:boolean;nickname:string;memory:boolean}
export interface State { config:Config|null; snapshot:Snapshot; preferences:Preferences; warning:string;incomeVisible:boolean }
export interface PetBridge {
  getState():Promise<State>;
  save(config:unknown,preferences:Preferences):Promise<{ok:boolean;field?:string;error?:string}>;
  setSize(size:PetSize):Promise<{ok:boolean;error?:string}>;
  getAI():Promise<AIPublicState>;
  saveAI(config:AIConfig,key?:string,removeKey?:boolean):Promise<AIResult>;
  testAI(config:AIConfig,key?:string):Promise<AIResult>;
  getChat():Promise<ChatState>;
  sendChat(text:string):Promise<AIResult>;
  clearChat():Promise<AIResult>;
  openChat():void;
  hideIncome():void;
  onSpeech(listener:(text:string)=>void):void;
  openSettings():void; closeSettings():void; menu():void;
  passthrough(ignore:boolean):void; drag(action:'start'|'move'|'end',point?:{x:number;y:number}):void;
  onChanged(listener:()=>void):void;
}
declare global { interface Window { petAPI:PetBridge } }
