import type {} from './bridge.ts';
import {ConfigError,validateConfig} from './core.ts';
import type {Config} from './core.ts';
import {ACTIONS,normalizePreferences} from './pet-behavior.ts';
import type {Action,PetSize} from './pet-behavior.ts';
import {initAISettings} from './ai-settings.ts';
import {initVoiceSettings} from './voice-settings.ts';
import type {AffinityPublic} from './affinity.ts';
import {EMPTY_OUTFITS,OUTFIT_CATALOG,OUTFIT_SLOTS,normalizeOutfits} from './outfits.ts';
import type {OutfitSlot,Outfits} from './outfits.ts';
const input=(id:string)=>document.getElementById(id) as HTMLInputElement;
const value=(id:string)=>input(id).value;
let overrides:Record<string,boolean>={};
let savedSize:PetSize='medium';
let currentOutfits:Outfits=EMPTY_OUTFITS();
const weekdays=()=>Array.from(document.querySelectorAll<HTMLInputElement>('#weekdays input:checked')).map(x=>Number(x.value));
const selectedActions=()=>Array.from(document.querySelectorAll<HTMLInputElement>('#action-options input:checked')).map(x=>x.value as Action);
const wanderEnabled=()=>input('pet-wander').checked;
const preferencesPayload=()=>({size:value('pet-size') as PetSize,actions:selectedActions(),wander:wanderEnabled(),outfits:currentOutfits});
const toggleLabel=()=>{document.getElementById('toggle-actions')!.textContent=selectedActions().length?'全部关闭':'全部开启';};
for(const action of ACTIONS){
  const label=document.createElement('label');label.className='action-option';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=action.id;checkbox.id=`action-${action.id}`;checkbox.checked=true;checkbox.addEventListener('change',toggleLabel);
  const details=document.createElement('span'),name=document.createElement('strong'),description=document.createElement('small');name.textContent=action.label;description.textContent=action.description;details.append(name,description);label.append(checkbox,details);document.getElementById('action-options')!.append(label);
}
document.getElementById('toggle-actions')!.addEventListener('click',()=>{const enabled=!selectedActions().length;document.querySelectorAll<HTMLInputElement>('#action-options input').forEach(x=>x.checked=enabled);toggleLabel();});
function error(field:string,message:string){const el=document.querySelector<HTMLElement>(`[data-error="${field}"]`)??document.querySelector<HTMLElement>('[data-error="general"]')!;el.textContent=message;el.scrollIntoView({block:'nearest'});}
function clearErrors(){document.querySelectorAll('[data-error]').forEach(el=>el.textContent='');document.getElementById('notice')!.textContent='';}
function renderOverrides(){
  const list=document.getElementById('overrides')!;list.replaceChildren();
  for(const [date,working] of Object.entries(overrides).sort(([a],[b])=>a.localeCompare(b))){
    const row=document.createElement('div');row.className='override-row';const time=document.createElement('time');time.textContent=date;
    const label=document.createElement('span');label.textContent=working?'工作日 · 按统一作息':'休息日 · 不累计';
    const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.textContent='×';remove.setAttribute('aria-label',`删除 ${date} 的调整`);remove.addEventListener('click',()=>{delete overrides[date];renderOverrides();document.getElementById('notice')!.textContent='日期调整尚未保存';});
    row.append(time,label,remove);list.append(row);
  }
}
function summary(){
  const lunch=input('lunch-enabled').checked;
  document.getElementById('lunch-fields')!.hidden=!lunch;
  const seconds=(t:string)=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
  const minutes=seconds(value('end'))-seconds(value('start'))-(lunch?seconds(value('lunch-end'))-seconds(value('lunch-start')):0);
  document.getElementById('summary')!.textContent=Number.isFinite(minutes)&&minutes>0?`每天有效工作 ${Number((minutes/60).toFixed(2))} 小时 · ${lunch?'午休不计入':'未设置午休'}`:'请检查上下班与午休时间';
}
async function load(){
  try{
    const state=await window.petAPI.getState(),c=state.config;
    if(c){input('salary').value=(c.salaryCents/100).toFixed(2);input('start').value=c.start;input('end').value=c.end;input('lunch-enabled').checked=!!c.lunch;if(c.lunch){input('lunch-start').value=c.lunch.start;input('lunch-end').value=c.lunch.end;}document.querySelectorAll<HTMLInputElement>('#weekdays input').forEach(x=>x.checked=c.weekdays.includes(Number(x.value)));overrides={...c.overrides};}
    const preferences=normalizePreferences(state.preferences);savedSize=preferences.size;input('pet-size').value=preferences.size;document.querySelectorAll<HTMLInputElement>('#action-options input').forEach(x=>x.checked=preferences.actions.includes(x.value as Action));input('pet-wander').checked=preferences.wander===true;currentOutfits=normalizeOutfits(preferences.outfits);renderOutfitSelection('yier');renderOutfitSelection('bubu');toggleLabel();
    const warning=document.getElementById('warning')!;warning.hidden=!state.warning;warning.textContent=state.warning;renderOverrides();summary();
  }catch{error('general','读取设置失败，请关闭窗口后重试。');}
}
document.getElementById('add-override')!.addEventListener('click',()=>{
  const date=value('override-date');
  if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)){error('overrides','请先选择日期');return;}
  overrides[date]=value('override-type')==='work';document.querySelector('[data-error="overrides"]')!.textContent='';renderOverrides();document.getElementById('notice')!.textContent='日期调整尚未保存';
});
document.getElementById('form')!.addEventListener('submit',async event=>{
  event.preventDefault();clearErrors();
  let config:Config;
  try{
    const salary=value('salary').trim();
    if(!/^\d+(\.\d{1,2})?$/.test(salary))throw new ConfigError('salary','请输入大于零、最多两位小数的金额');
    config=validateConfig({version:1,salaryCents:Math.round(Number(salary)*100),weekdays:weekdays(),start:value('start'),end:value('end'),lunch:input('lunch-enabled').checked?{start:value('lunch-start'),end:value('lunch-end')}:null,overrides});
  }catch(e){error(e instanceof ConfigError?e.field:'general',e instanceof Error?e.message:'请检查输入');return;}
  const button=document.getElementById('save') as HTMLButtonElement;button.disabled=true;
  try{
    const result=await window.petAPI.save(config,preferencesPayload());
    if(!result.ok){error(result.field??'general',result.error??'保存失败');return;}
    input('salary').value=(config.salaryCents/100).toFixed(2);document.getElementById('notice')!.textContent='已保存，一二会按新设置计算收入。';document.getElementById('warning')!.hidden=true;
  }catch{error('general','保存失败，请稍后重试。');}finally{button.disabled=false;}
});
for(const id of ['start','end','lunch-enabled','lunch-start','lunch-end'])input(id).addEventListener('change',summary);
document.getElementById('close')!.addEventListener('click',()=>window.petAPI.closeSettings());
const tabPanels=[['tab-ai','panel-ai'],['tab-salary','form'],['tab-voice','panel-voice'],['tab-yier','panel-yier'],['tab-bubu','panel-bubu']] as const;
function selectTab(active:string){
  for(const [tab,panel] of tabPanels){const selected=tab===active;document.getElementById(tab)!.setAttribute('aria-selected',String(selected));document.getElementById(panel)!.hidden=!selected;}
}
for(const [tab] of tabPanels)document.getElementById(tab)!.addEventListener('click',()=>selectTab(tab));
selectTab('tab-ai');
document.getElementById('pet-save')!.addEventListener('click',async()=>{
  const button=document.getElementById('pet-save') as HTMLButtonElement;button.disabled=true;
  try{
    const result=await window.petAPI.savePrefs(preferencesPayload());
    document.getElementById('pet-notice')!.textContent=result.ok?'桌宠设置已保存。':(result.error??'保存失败，请重试。');
  }catch{document.getElementById('pet-notice')!.textContent='保存失败，请稍后重试。';}
  finally{button.disabled=false;}
});
function renderAffinity(state:AffinityPublic){
  const setText=(id:string,text:string)=>{document.getElementById(id)!.textContent=text;};
  setText('affinity-level',state.name);setText('affinity-points',String(state.points));
  setText('affinity-days',`第 ${state.days} 天`);setText('affinity-today',String(state.todayGained));
  const list=document.getElementById('affinity-achievements')!;list.replaceChildren();
  for(const item of state.achievements){const chip=document.createElement('span');chip.textContent=item.name;if(item.unlocked)chip.className='unlocked';list.append(chip);}
  input('affinity-birthday').value=state.birthday??'';
  document.getElementById('affinity-notice')!.textContent=state.warning;
}
void window.petAPI.getAffinity().then(({state})=>renderAffinity(state)).catch(()=>{});
window.petAPI.onAffinity(state=>renderAffinity(state));
document.getElementById('affinity-save')!.addEventListener('click',async()=>{
  const raw=value('affinity-birthday').trim();
  const result=await window.petAPI.setBirthday(raw||null).catch(()=>({ok:false,error:'保存失败，请重试。'}));
  document.getElementById('affinity-notice')!.textContent=result.ok?'生日已保存。':(result.error??'保存失败，请重试。');
});
const NONE_THUMB='<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="22" cy="22" r="12" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 4"/></svg>';
function buildOutfitPanel(petId:'yier'|'bubu'){
  const root=document.getElementById(`outfit-${petId}`)!;root.replaceChildren();
  for(const slot of OUTFIT_SLOTS){
    const group=document.createElement('div');group.className='outfit-group';
    const title=document.createElement('div');title.className='outfit-group-title';title.textContent=slot.name;
    const items=document.createElement('div');items.className='outfit-items';
    const add=(id:string,name:string,thumb:string)=>{
      const button=document.createElement('button');button.type='button';button.className='outfit-item';button.dataset.slot=slot.id;button.dataset.item=id;
      button.innerHTML=thumb;
      const label=document.createElement('span');label.textContent=name;button.append(label);
      button.addEventListener('click',()=>{
        currentOutfits[petId][slot.id]=id||null;
        renderOutfitSelection(petId);
        void saveOutfits(petId);
      });
      items.append(button);
    };
    add('','不穿',NONE_THUMB);
    for(const item of OUTFIT_CATALOG[slot.id])add(item.id,item.name,item.thumb);
    group.append(title,items);root.append(group);
  }
}
function renderOutfitSelection(petId:'yier'|'bubu'){
  document.querySelectorAll<HTMLElement>(`#outfit-${petId} .outfit-item`).forEach(button=>{
    const slot=button.dataset.slot as OutfitSlot,item=button.dataset.item??'';
    button.classList.toggle('selected',(currentOutfits[petId][slot]??'')===item);
  });
}
async function saveOutfits(petId:'yier'|'bubu'){
  const notice=document.getElementById(`outfit-notice-${petId}`)!;notice.textContent='';
  try{
    const result=await window.petAPI.savePrefs(preferencesPayload());
    notice.textContent=result.ok?'已穿上并保存。':(result.error??'保存失败，请重试。');
  }catch{notice.textContent='保存失败，请稍后重试。';}
}
buildOutfitPanel('yier');buildOutfitPanel('bubu');
window.petAPI.onChanged(()=>{
  void window.petAPI.getState().then(state=>{
    const size=normalizePreferences(state.preferences).size;
    if(size!==savedSize){savedSize=size;input('pet-size').value=size;}
  }).catch(()=>{});
});
void load();
initAISettings();
initVoiceSettings();
