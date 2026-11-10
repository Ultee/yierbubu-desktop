import type {Config,Snapshot} from './core.ts';
import type {Preferences,PetSize} from './pet-behavior.ts';
import type {AIConfig,AIPublicState,AIResult,ChatMessage} from './ai-config.ts';
import type {DialogueLine} from './ai-dialogue.ts';
import type {AffinityPublic} from './affinity.ts';
import type {VoiceConfig,VoiceCreateResult,VoicePublicState,VoiceResult,VoiceSpeaker,VoiceTarget} from './voice-config.ts';
export interface ChatState {messages:ChatMessage[];busy:boolean;error:string;enabled:boolean;nickname:string;memory:boolean}
export interface State { config:Config|null; snapshot:Snapshot; preferences:Preferences; warning:string;incomeVisible:boolean }
export interface PetBridge {
  getState():Promise<State>;
  save(config:unknown,preferences:Preferences):Promise<{ok:boolean;field?:string;error?:string}>;
  savePrefs(preferences:Preferences):Promise<{ok:boolean;error?:string}>;
  setSize(size:PetSize):Promise<{ok:boolean;error?:string}>;
  getAI():Promise<AIPublicState>;
  saveAI(config:AIConfig,key?:string,removeKey?:boolean):Promise<AIResult>;
  testAI(config:AIConfig,key?:string):Promise<AIResult>;
  getChat():Promise<ChatState>;
  sendChat(text:string):Promise<AIResult>;
  actionReply(action:string):Promise<AIResult>;
  clearChat():Promise<AIResult>;
  openChat():void;
  hideIncome():void;
  onSpeech(listener:(text:string)=>void):void;
  onDialogue(listener:(lines:DialogueLine[])=>void):void;
  getAffinity():Promise<{state:AffinityPublic}>;
  affinityEvent(type:'click'|'pat-tick'|'egg',meta?:{action?:string;egg?:string}):Promise<{ok:boolean;gained?:number;accepted?:boolean}>;
  setBirthday(value:string|null):Promise<{ok:boolean;error?:string}>;
  onAffinity(listener:(state:AffinityPublic)=>void):void;
  onAffinityToast(listener:(text:string)=>void):void;
  onEggAction(listener:(egg:string)=>void):void;
  onFeed(listener:(snack:string)=>void):void;
  onWander(listener:(direction:string)=>void):void;
  getVoice():Promise<VoicePublicState>;
  saveVoice(config:VoiceConfig,key?:string,removeKey?:boolean):Promise<{ok:boolean;error?:string}>;
  testVoice(who:VoiceSpeaker):Promise<VoiceResult>;
  createQwenVoices():Promise<VoiceCreateResult>;
  createCustomVoice(input:{name:string;target:VoiceTarget;audio:string}):Promise<VoiceCreateResult>;
  assignVoice(entryId:string,target:VoiceTarget):Promise<VoiceResult>;
  deleteVoice(entryId:string):Promise<VoiceResult>;
  previewVoice(entryId:string):Promise<VoiceResult>;
  speakLine(who:VoiceSpeaker,text:string,emotion?:DialogueLine['emotion']):Promise<VoiceResult>;
  openSettings():void; closeSettings():void; menu():void;
  passthrough(ignore:boolean):void; drag(action:'start'|'move'|'end'):void;
  onChanged(listener:()=>void):void;
}
declare global { interface Window { petAPI:PetBridge } }
