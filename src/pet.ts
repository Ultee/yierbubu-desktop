import type {} from './bridge.ts';
import type {Status} from './core.ts';
import {normalizePreferences,chooseAction,activityFor,Gesture} from './pet-behavior.ts';
import type {Action} from './pet-behavior.ts';
const pet=document.querySelector<HTMLElement>('#pet')!,card=document.querySelector<HTMLElement>('#card')!;
const speech=document.getElementById('speech')!;
let speechTimer:ReturnType<typeof setTimeout>|undefined;
const text=(id:string,value:string)=>{document.getElementById(id)!.textContent=value;};
let actionTimer:ReturnType<typeof setTimeout>|undefined,actionFrame:number|undefined;
let dragging=false,lastIgnore:boolean|undefined,gesture:Gesture|null=null,pointerOrigin:{x:number;y:number}|null=null;
let preferences=normalizePreferences(undefined),previousAction:Action|null=null;
const labels:Record<Status,string>={unconfigured:'等待设置',empty:'暂无排班',rest:'休息日',before:'未上班',working:'工作中',lunch:'午休中',finished:'已下班'};
function stopAction(){clearTimeout(actionTimer);if(actionFrame!==undefined){cancelAnimationFrame(actionFrame);actionFrame=undefined;}pet.dataset.action='';}
async function refresh(){
  try{
    const state=await window.petAPI.getState(),s=state.snapshot;
    card.hidden=!state.incomeVisible||dragging;document.body.classList.toggle('expanded',!card.hidden);
    preferences=normalizePreferences(state.preferences);document.body.dataset.size=preferences.size;
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
  const active=!!gesture||!!(event.target as Element).closest('#pet,#card,#speech');
  if(lastIgnore!==!active){lastIgnore=!active;window.petAPI.passthrough(!active);}
});
document.addEventListener('mouseleave',()=>{if(!gesture){window.petAPI.passthrough(true);lastIgnore=true;}});
function react(){
  const action=chooseAction(preferences.actions,previousAction);if(!action)return;
  stopAction();previousAction=action;
  actionFrame=requestAnimationFrame(()=>{actionFrame=undefined;pet.dataset.action=action;actionTimer=setTimeout(()=>{pet.dataset.action='';},1800);});
}
pet.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;event.preventDefault();stopAction();gesture=new Gesture(event.screenX,event.screenY);pointerOrigin={x:event.screenX,y:event.screenY};pet.setPointerCapture(event.pointerId);window.petAPI.passthrough(false);lastIgnore=false;
});
pet.addEventListener('pointermove',event=>{
  if(!gesture)return;
  if(gesture.move(event.screenX,event.screenY)){
    if(!dragging){dragging=true;pet.classList.add('dragging');card.hidden=true;speech.hidden=true;document.body.classList.remove('expanded');window.petAPI.drag('start',pointerOrigin!);}
    window.petAPI.drag('move',{x:event.screenX,y:event.screenY});
  }
});
function end(event:PointerEvent,cancelled=false){
  if(!gesture)return;gesture.move(event.screenX,event.screenY);
  const tap=gesture.finish(cancelled);gesture=null;pointerOrigin=null;
  if(dragging){dragging=false;pet.classList.remove('dragging');window.petAPI.drag('end');}
  lastIgnore=undefined;if(tap)react();
}
pet.addEventListener('pointerup',event=>end(event));
pet.addEventListener('lostpointercapture',event=>end(event,true));pet.addEventListener('pointercancel',event=>end(event,true));
document.addEventListener('contextmenu',event=>{event.preventDefault();window.petAPI.menu();});
document.getElementById('open-settings')!.addEventListener('click',()=>window.petAPI.openSettings());
document.getElementById('close-card')!.addEventListener('click',()=>window.petAPI.hideIncome());
document.getElementById('open-chat')!.addEventListener('click',()=>window.petAPI.openChat());
speech.addEventListener('click',()=>{speech.hidden=true;window.petAPI.openChat();});
window.petAPI.onSpeech(message=>{clearTimeout(speechTimer);speech.textContent=message;speech.hidden=!message||dragging;if(message)speechTimer=setTimeout(()=>{speech.hidden=true;},12000);});
window.petAPI.onChanged(()=>void refresh());setInterval(()=>void refresh(),1000);void refresh();
