import type {} from './bridge.ts';
import type {Status} from './core.ts';
const pet=document.querySelector<HTMLElement>('#pet')!,card=document.querySelector<HTMLElement>('#card')!;
const text=(id:string,value:string)=>{document.getElementById(id)!.textContent=value;};
let collapse:ReturnType<typeof setTimeout>|undefined,dragging=false,lastIgnore:boolean|undefined;
const labels:Record<Status,string>={unconfigured:'等待设置',empty:'暂无排班',rest:'休息日',before:'未上班',working:'工作中',lunch:'午休中',finished:'已下班'};
async function refresh(){
  try{
    const state=await window.petAPI.getState(),s=state.snapshot;
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
function expand(){clearTimeout(collapse);if(!dragging){card.hidden=false;document.body.classList.add('expanded');void refresh();}}
function shrink(){clearTimeout(collapse);collapse=setTimeout(()=>{card.hidden=true;document.body.classList.remove('expanded');},200);}
for(const el of [pet,card,document.getElementById('bridge')!]){el.addEventListener('mouseenter',expand);el.addEventListener('mouseleave',shrink);}
document.addEventListener('mousemove',event=>{
  const active=dragging||!!(event.target as Element).closest('#pet,#card,body.expanded #bridge');
  if(lastIgnore!==!active){lastIgnore=!active;window.petAPI.passthrough(!active);}
});
document.addEventListener('mouseleave',()=>{if(!dragging){window.petAPI.passthrough(true);lastIgnore=true;shrink();}});
pet.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;event.preventDefault();dragging=true;pet.classList.add('dragging');pet.setPointerCapture(event.pointerId);clearTimeout(collapse);card.hidden=true;document.body.classList.remove('expanded');window.petAPI.drag('start',{x:event.screenX,y:event.screenY});
});
pet.addEventListener('pointermove',event=>{if(dragging)window.petAPI.drag('move',{x:event.screenX,y:event.screenY});});
function end(){if(!dragging)return;dragging=false;pet.classList.remove('dragging');window.petAPI.drag('end');lastIgnore=undefined;}
pet.addEventListener('pointerup',end);pet.addEventListener('lostpointercapture',end);pet.addEventListener('pointercancel',end);
document.addEventListener('contextmenu',event=>{event.preventDefault();window.petAPI.menu();});
document.getElementById('open-settings')!.addEventListener('click',()=>window.petAPI.openSettings());
window.petAPI.onChanged(()=>void refresh());setInterval(()=>void refresh(),1000);void refresh();
