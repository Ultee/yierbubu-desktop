import type {} from './bridge.ts';
import {ConfigError,validateConfig} from './core.ts';
import type {Config} from './core.ts';
const input=(id:string)=>document.getElementById(id) as HTMLInputElement;
const value=(id:string)=>input(id).value;
let overrides:Record<string,boolean>={};
const weekdays=()=>Array.from(document.querySelectorAll<HTMLInputElement>('#weekdays input:checked')).map(x=>Number(x.value));
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
    const result=await window.petAPI.save(config);
    if(!result.ok){error(result.field??'general',result.error??'保存失败');return;}
    input('salary').value=(config.salaryCents/100).toFixed(2);document.getElementById('notice')!.textContent='已保存，小猫会按新设置计算收入。';document.getElementById('warning')!.hidden=true;
  }catch{error('general','保存失败，请稍后重试。');}finally{button.disabled=false;}
});
for(const id of ['start','end','lunch-enabled','lunch-start','lunch-end'])input(id).addEventListener('change',summary);
document.getElementById('close')!.addEventListener('click',()=>window.petAPI.closeSettings());
void load();
