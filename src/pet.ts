import type {} from './bridge.ts';
import type {Status} from './core.ts';
import {normalizePreferences,chooseAction,activityFor,Gesture} from './pet-behavior.ts';
import type {Action} from './pet-behavior.ts';
import {OUTFIT_CATALOG} from './outfits.ts';
import type {Outfit,OutfitSlot} from './outfits.ts';
const pet=document.querySelector<HTMLElement>('#pet')!,card=document.querySelector<HTMLElement>('#card')!;
const speech=document.getElementById('speech')!,buddy=document.getElementById('buddy')!;
const petDialogue=document.getElementById('pet-dialogue')!,buddyDialogue=document.getElementById('buddy-dialogue')!;
let speechTimer:ReturnType<typeof setTimeout>|undefined;
const text=(id:string,value:string)=>{document.getElementById(id)!.textContent=value;};
let actionTimer:ReturnType<typeof setTimeout>|undefined,actionFrame:number|undefined;
let dragging=false,lastIgnore:boolean|undefined,gesture:Gesture|null=null;
let preferences=normalizePreferences(undefined),previousAction:Action|null=null;
let voiceEnabled=false,voiceVolume=.8,voiceSpeed=1,voiceProvider='qwen',voiceGeneration=0,voiceAudio:HTMLAudioElement|null=null,voiceUrl='';
let voiceAudios=new Map<number,string>(),voiceFailures=new Set<number>(),voiceWaiters=new Map<number,(audio:string|null)=>void>(),voiceEndResolver:(()=>void)|null=null;
const labels:Record<Status,string>={unconfigured:'等待设置',empty:'暂无排班',rest:'休息日',before:'未上班',working:'工作中',lunch:'午休中',finished:'已下班'};
function stopAction(){clearTimeout(actionTimer);if(actionFrame!==undefined){cancelAnimationFrame(actionFrame);actionFrame=undefined;}pet.dataset.action='';}
function applyOutfits(container:HTMLElement,outfit:Outfit|undefined){
  for(const group of container.querySelectorAll<SVGGElement>('.wear')){
    const slot=group.dataset.slot as OutfitSlot|undefined,item=group.dataset.item;
    group.style.display=outfit&&slot&&item&&outfit[slot]===item?'block':'none';
  }
}
const SLOT_ORDER:OutfitSlot[]=['neck','face','head','body','hand'];
function buildWearLayers(container:HTMLElement){
  const layers=new Map<string,SVGGElement>();
  container.querySelectorAll<SVGGElement>('.wear-layer').forEach(layer=>layers.set(layer.dataset.layer!,layer));
  for(const slot of SLOT_ORDER){
    const target=slot==='body'?layers.get('body'):slot==='hand'?layers.get('hand'):layers.get('top');
    if(!target)continue;
    for(const item of OUTFIT_CATALOG[slot]){
      const group=document.createElementNS('http://www.w3.org/2000/svg','g');
      group.setAttribute('class','wear');group.dataset.slot=slot;group.dataset.item=item.id;
      group.innerHTML=item.art;
      target.append(group);
    }
  }
}
buildWearLayers(pet);buildWearLayers(buddy);
async function refresh(){
  try{
    const state=await window.petAPI.getState(),s=state.snapshot;
    card.hidden=!state.incomeVisible||dragging;document.body.classList.toggle('expanded',!card.hidden);
    preferences=normalizePreferences(state.preferences);document.body.dataset.size=preferences.size;
    applyOutfits(pet,preferences.outfits?.yier);applyOutfits(buddy,preferences.outfits?.bubu);
    pet.dataset.enabledActions=preferences.actions.join(',');pet.dataset.activity=activityFor(s.status);
    if(pet.dataset.action&&!preferences.actions.includes(pet.dataset.action as Action))stopAction();
    text('earned',(s.earnedCents/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}));
    text('rate',s.rate===null?'—':s.rate<.0001?' < ¥0.0001/秒':`¥${s.rate.toFixed(4)}/秒`);
    text('state-label',labels[s.status]);
    const message=s.status==='unconfigured'?'请先设置月薪与作息':s.status==='empty'?'本月未安排工作时间':s.status==='rest'?'今天好好休息吧':s.status==='finished'?'今天辛苦啦，明天见':s.status==='lunch'?'午休中，收入暂停':'距离下班';
    text('status',message);
    const n=s.remainingSeconds;
    text('countdown',['working','before','lunch'].includes(s.status)?`${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:'');
    const warning=document.getElementById('warning')!;warning.hidden=!state.warning;warning.textContent=state.warning;
  }catch{text('status','暂时无法读取设置，请通过右键菜单重试');}
}
document.addEventListener('mousemove',event=>{
  const active=!!gesture||!!(event.target as Element).closest('#pet,#card,#speech,#buddy');
  if(lastIgnore!==!active){lastIgnore=!active;window.petAPI.passthrough(!active);}
});
document.addEventListener('mouseleave',()=>{if(!gesture){window.petAPI.passthrough(true);lastIgnore=true;}});
function react(){
  const action=chooseAction(preferences.actions,previousAction);if(!action)return;
  stopAction();clearLink();stopDialogue();stopFeed();previousAction=action;
  trackClick();maybeGreet();
  void window.petAPI.affinityEvent('click',{action});
  actionFrame=requestAnimationFrame(()=>{actionFrame=undefined;pet.dataset.action=action;actionTimer=setTimeout(()=>{pet.dataset.action='';},1800);});
  void window.petAPI.actionReply(action);
}
pet.addEventListener('pointerenter',()=>{if(!gesture&&!dragging){pet.dataset.pat='';startPat();}});
pet.addEventListener('pointerleave',()=>{delete pet.dataset.pat;stopPat();});
pet.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;event.preventDefault();stopAction();clearLink();stopDialogue();stopFeed();stopPat();delete pet.dataset.corner;maybeGreet();gesture=new Gesture(event.screenX,event.screenY);pet.setPointerCapture(event.pointerId);window.petAPI.drag('start');window.petAPI.passthrough(false);lastIgnore=false;
});
pet.addEventListener('pointermove',event=>{
  if(!gesture)return;
  if(gesture.move(event.screenX,event.screenY)){
    if(!dragging){dragging=true;pet.classList.add('dragging');card.hidden=true;speech.hidden=true;document.body.classList.remove('expanded');}
    window.petAPI.drag('move');
  }
});
function end(event:PointerEvent,cancelled=false){
  if(!gesture)return;gesture.move(event.screenX,event.screenY);
  const tap=gesture.finish(cancelled);gesture=null;window.petAPI.drag('end');
  if(dragging){dragging=false;pet.classList.remove('dragging');}
  lastIgnore=undefined;if(tap)react();
}
pet.addEventListener('pointerup',event=>end(event));
pet.addEventListener('lostpointercapture',event=>end(event,true));pet.addEventListener('pointercancel',event=>end(event,true));
let linkTimer:ReturnType<typeof setTimeout>|undefined;
const linkStages:ReturnType<typeof setTimeout>[]=[];
function clearLink(){
  while(linkStages.length)clearTimeout(linkStages.pop());
  delete pet.dataset.link;delete buddy.dataset.link;
}
function linkLater(ms:number,run:()=>void){linkStages.push(setTimeout(run,ms));}
function startLink(){
  if(document.hidden||gesture||dragging||pet.dataset.action||pet.dataset.link||buddy.dataset.link||pet.dataset.activity==='sleeping')return;
  if(Math.random()<.5){
    buddy.dataset.link='hello';
    linkLater(750,()=>{pet.dataset.link='nod';});
    linkLater(1700,()=>{delete buddy.dataset.link;});
    linkLater(2800,()=>{delete pet.dataset.link;});
  }else{
    pet.dataset.link='nod';
    linkLater(850,()=>{buddy.dataset.link='hop';});
    linkLater(1500,()=>{delete pet.dataset.link;});
    linkLater(2400,()=>{delete buddy.dataset.link;});
  }
}
function scheduleLink(){clearTimeout(linkTimer);linkTimer=setTimeout(()=>{startLink();scheduleLink();},20000+Math.random()*20000);}
function stopVoiceAudio(){
  const end=voiceEndResolver;voiceEndResolver=null;
  if(voiceAudio){voiceAudio.pause();voiceAudio.src='';voiceAudio=null;}
  if(voiceUrl){URL.revokeObjectURL(voiceUrl);voiceUrl='';}
  if(end)end();
}
function notifyVoice(index:number,audio:string|null){
  const wait=voiceWaiters.get(index);
  if(wait){voiceWaiters.delete(index);wait(audio);}
}
function stopVoice(){
  voiceGeneration+=1;
  stopVoiceAudio();
  for(const wait of voiceWaiters.values())wait(null);
  voiceWaiters.clear();
}
async function loadVoice(){
  try{
    const {config}=await window.petAPI.getVoice();
    const changed=voiceProvider!==config.provider;
    voiceEnabled=config.enabled;voiceVolume=config.volume;voiceSpeed=config.speed;voiceProvider=config.provider;
    if(!voiceEnabled||changed)stopVoice();
  }catch{}
}
function playVoice(base64:string):Promise<void>{
  stopVoiceAudio();
  return new Promise(resolve=>{
    let settled=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const done=()=>{
      if(settled)return;settled=true;
      if(timer)clearTimeout(timer);
      if(voiceEndResolver===done)voiceEndResolver=null;
      resolve();
    };
    voiceEndResolver=done;
    try{
      const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));
      const audio=new Audio(url);
      voiceAudio=audio;voiceUrl=url;audio.volume=voiceVolume;
      audio.preservesPitch=true;
      audio.playbackRate=voiceProvider==='mimo'?voiceSpeed:1;
      const cleanup=()=>{
        if(voiceAudio===audio){voiceAudio=null;if(voiceUrl===url){URL.revokeObjectURL(url);voiceUrl='';}}
      };
      audio.addEventListener('ended',()=>{cleanup();done();},{once:true});
      audio.addEventListener('error',()=>{cleanup();done();},{once:true});
      timer=setTimeout(()=>{cleanup();done();},30000);
      void audio.play().catch(()=>{cleanup();done();});
    }catch{stopVoiceAudio();done();}
  });
}
function waitForVoice(index:number,generation:number,timeout:number):Promise<string|null>{
  const audio=voiceAudios.get(index);
  if(audio)return Promise.resolve(audio);
  if(voiceFailures.has(index)||generation!==voiceGeneration)return Promise.resolve(null);
  return new Promise(resolve=>{
    let settled=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const finish=(value:string|null)=>{
      if(settled)return;settled=true;
      if(timer)clearTimeout(timer);
      voiceWaiters.delete(index);
      resolve(value);
    };
    voiceWaiters.set(index,finish);
    timer=setTimeout(()=>finish(null),timeout);
  });
}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}
async function prefetchVoice(lines:{who:'yier'|'bubu';text:string}[],generation:number){
  for(let index=0;index<lines.length;index++){
    if(generation!==voiceGeneration)return;
    const line=lines[index]!;
    if(!line.text.trim()){voiceFailures.add(index);notifyVoice(index,null);continue;}
    let result:{ok:boolean;audio?:string;error?:string}=await window.petAPI.speakLine(line.who,line.text).catch(()=>({ok:false}));
    if(generation!==voiceGeneration)return;
    if(!result.ok||!result.audio){
      if(!/未启用|API Key|业务空间|Qwen 音色/.test(result.error??'')){
        await sleep(700);
        if(generation!==voiceGeneration)return;
        result=await window.petAPI.speakLine(line.who,line.text).catch(()=>({ok:false}));
        if(generation!==voiceGeneration)return;
      }
    }
    if(result.ok&&result.audio){
      voiceAudios.set(index,result.audio);
      notifyVoice(index,result.audio);
    }else{
      voiceFailures.add(index);
      notifyVoice(index,null);
    }
  }
}
function stopDialogue(){
  stopTypewriter(petDialogue);stopTypewriter(buddyDialogue);
  petDialogue.hidden=true;buddyDialogue.hidden=true;
  stopVoice();
  voiceAudios.clear();voiceFailures.clear();
}
async function runDialogue(lines:{who:'yier'|'bubu';text:string}[],generation:number){
  for(let index=0;index<lines.length;index++){
    if(generation!==voiceGeneration||dragging)return;
    const line=lines[index]!;
    stopTypewriter(petDialogue);stopTypewriter(buddyDialogue);
    petDialogue.hidden=true;buddyDialogue.hidden=true;
    const bubble=line.who==='bubu'?buddyDialogue:petDialogue;
    bubble.hidden=false;
    const length=graphemes(line.text).length;
    typewrite(bubble,line.text,Math.min(45,Math.max(14,Math.round(1400/Math.max(1,length)))));
    const audio=await waitForVoice(index,generation,10000);
    if(generation!==voiceGeneration||dragging)return;
    if(audio)await playVoice(audio);
    if(generation!==voiceGeneration||dragging)return;
    if(index===lines.length-1){
      await sleep(audio?2600:4800);
      if(generation!==voiceGeneration)return;
      bubble.hidden=true;stopTypewriter(bubble);
    }else{
      await sleep(audio?300:4200);
      if(generation!==voiceGeneration||dragging)return;
    }
  }
}
function playDialogue(lines:{who:'yier'|'bubu';text:string}[]){
  stopDialogue();
  if(dragging||!Array.isArray(lines)||lines.length<2)return;
  const generation=voiceGeneration;
  void prefetchVoice(lines,generation);
  void runDialogue(lines,generation);
}
petDialogue.addEventListener('click',stopDialogue);buddyDialogue.addEventListener('click',stopDialogue);
window.petAPI.onDialogue(playDialogue);
buddy.addEventListener('click',()=>{
  if(dragging||gesture)return;
  clearLink();
  buddy.dataset.link='poke';
  if(pet.dataset.activity!=='sleeping')pet.dataset.link='look';
  linkLater(1000,()=>{delete pet.dataset.link;});
  linkLater(1500,()=>{delete buddy.dataset.link;});
});
scheduleLink();
const affinityBadge=document.getElementById('affinity-badge')!,affinityDays=document.getElementById('affinity-days')!,affinityToast=document.getElementById('affinity-toast')!;
function renderAffinity(state:{level:number;name:string;days:number;festival:string|null}){
  affinityBadge.textContent=`❤ ${state.name}`;
  affinityDays.textContent=`认识第 ${state.days} 天`;
  document.body.dataset.festival=state.festival??'';
}
void window.petAPI.getAffinity().then(({state})=>renderAffinity(state)).catch(()=>{});
window.petAPI.onAffinity(state=>renderAffinity(state));
const toastQueue:string[]=[];
let toastTimer:ReturnType<typeof setTimeout>|undefined;
function queueToast(text:string){
  if(toastQueue.length>=3)return;
  toastQueue.push(text);
  if(!toastTimer)drainToast();
}
function drainToast(){
  if(!speech.hidden||!petDialogue.hidden||!buddyDialogue.hidden){toastTimer=setTimeout(drainToast,1200);return;}
  const text=toastQueue.shift();
  if(!text){toastTimer=undefined;return;}
  affinityToast.textContent=text;affinityToast.hidden=false;
  toastTimer=setTimeout(()=>{affinityToast.hidden=true;toastTimer=setTimeout(drainToast,500);},4200);
}
window.petAPI.onAffinityToast(queueToast);
const clickTimes:number[]=[];
function trackClick(){
  const now=Date.now();clickTimes.push(now);
  while(clickTimes.length&&now-(clickTimes[0]??now)>6000)clickTimes.shift();
  if(clickTimes.length>=8){clickTimes.length=0;void triggerEgg('shy-rush');}
}
let greetDay='';
function maybeGreet(){
  const now=new Date(),key=`${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if(greetDay===key)return;
  greetDay=key;
  const hour=now.getHours();
  if(hour>=23||hour<7)void triggerEgg(hour>=23?'night':'dawn');
}
async function triggerEgg(egg:string){
  try{
    const result=await window.petAPI.affinityEvent('egg',{egg});
    if(!result.ok||!result.accepted)return;
    if(egg==='buddy-trip'){buddy.dataset.egg='trip';setTimeout(()=>{delete buddy.dataset.egg;},1600);return;}
    pet.dataset.egg=egg==='shy-rush'?'shy':egg;
    const duration=egg==='daze'?3000:egg==='purr'?2400:1400;
    setTimeout(()=>{delete pet.dataset.egg;},duration);
  }catch{}
}
window.petAPI.onEggAction(egg=>{if(egg==='corner')pet.dataset.corner='';});
const snack=document.getElementById('snack')!;
let feedTimers:ReturnType<typeof setTimeout>[]=[];
function stopFeed(){
  while(feedTimers.length)clearTimeout(feedTimers.pop());
  delete pet.dataset.feed;delete buddy.dataset.feed;
  snack.dataset.kind='';snack.classList.remove('eating');
}
window.petAPI.onFeed(kind=>{
  stopFeed();
  if(!['cookie','fish','tea'].includes(kind))return;
  snack.dataset.kind=kind;snack.classList.add('eating');pet.dataset.feed='';
  if(kind!=='fish')buddy.dataset.feed='happy';
  feedTimers.push(setTimeout(stopFeed,2900));
});
window.petAPI.onWander(direction=>{
  if(direction==='left'||direction==='right')document.body.dataset.walking=direction;
  else delete document.body.dataset.walking;
});
let patTimer:ReturnType<typeof setInterval>|undefined,patSeconds=0;
function startPat(){
  if(patTimer)return;patSeconds=0;
  patTimer=setInterval(()=>{
    if(!pet.dataset.pat||dragging||gesture){stopPat();return;}
    patSeconds+=1;
    if(patSeconds%10===0){void window.petAPI.affinityEvent('pat-tick');if(patSeconds===10)void triggerEgg('purr');}
  },1000);
}
function stopPat(){if(patTimer){clearInterval(patTimer);patTimer=undefined;}}
const RARE_EGGS=['daze','tail','sneeze','buddy-trip'] as const;
setInterval(()=>{
  if(document.hidden||dragging||gesture||pet.dataset.action||pet.dataset.pat||!speech.hidden||!petDialogue.hidden||!buddyDialogue.hidden)return;
  if(Math.random()<0.005){const egg=RARE_EGGS[Math.floor(Math.random()*RARE_EGGS.length)]!;void triggerEgg(egg);}
},1000);
document.addEventListener('contextmenu',event=>{event.preventDefault();window.petAPI.menu();});
document.getElementById('open-settings')!.addEventListener('click',()=>window.petAPI.openSettings());
document.getElementById('close-card')!.addEventListener('click',()=>window.petAPI.hideIncome());
document.getElementById('open-chat')!.addEventListener('click',()=>window.petAPI.openChat());
speech.addEventListener('click',()=>{stopTypewriter(speech);speech.hidden=true;window.petAPI.openChat();});
const reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('zh',{granularity:'grapheme'}):null;
const graphemes=(text:string)=>segmenter?Array.from(segmenter.segment(text),part=>part.segment):[...text];
const typewriters=new WeakMap<HTMLElement,ReturnType<typeof setInterval>>();
function stopTypewriter(el:HTMLElement){const timer=typewriters.get(el);if(timer){clearInterval(timer);typewriters.delete(el);}}
function typewrite(el:HTMLElement,text:string,ms:number){
  stopTypewriter(el);
  const parts=graphemes(text);
  if(reduceMotion()||parts.length<2){el.textContent=text;return;}
  let shown=1;
  el.textContent=parts[0];
  const timer=setInterval(()=>{
    shown+=1;
    if(shown>=parts.length){stopTypewriter(el);el.textContent=text;return;}
    el.textContent=parts.slice(0,shown).join('');
  },ms);
  typewriters.set(el,timer);
}
window.petAPI.onSpeech(message=>{
  clearTimeout(speechTimer);stopTypewriter(speech);
  if(!message){speech.hidden=true;speech.textContent='';return;}
  speech.hidden=dragging;typewrite(speech,message,38);
  speechTimer=setTimeout(()=>{speech.hidden=true;stopTypewriter(speech);},12000);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopVoice();});
void loadVoice();
window.petAPI.onChanged(()=>{void refresh();void loadVoice();});setInterval(()=>void refresh(),1000);void refresh();
