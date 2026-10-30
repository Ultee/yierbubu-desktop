import type {} from './bridge.ts';
import {PROVIDERS} from './ai-config.ts';
import type {AIConfig} from './ai-config.ts';
export function initAISettings(){
  const input=(id:string)=>document.getElementById(`ai-${id}`) as HTMLInputElement;
  const notice=document.getElementById('ai-notice')!;
  let removeKey=false;
  const message=(text:string,failed=false)=>{notice.textContent=text;notice.classList.toggle('failed',failed);};
  const persona=()=>{document.getElementById('ai-custom-fields')!.hidden=input('persona-mode').value!=='custom';document.getElementById('ai-preset-fields')!.hidden=input('persona-mode').value==='custom';};
  const proactive=()=>{document.getElementById('ai-interval-fields')!.hidden=input('proactive').value!=='occasional';};
  const draft=():AIConfig=>({enabled:input('enabled').checked,provider:input('provider').value as AIConfig['provider'],baseUrl:input('base-url').value,model:input('model').value,nickname:input('nickname').value,personaMode:input('persona-mode').value as AIConfig['personaMode'],persona:input('persona').value as AIConfig['persona'],customPrompt:input('custom-prompt').value,proactive:input('proactive').value as AIConfig['proactive'],proactiveIntervalMinutes:Number(input('proactive-minutes').value),memory:input('memory').checked,shareIncome:input('share-income').checked});
  function show(config:AIConfig,hasKey:boolean,warning=''){
    for(const key of ['enabled','memory','shareIncome'] as const)input(key==='shareIncome'?'share-income':key).checked=config[key];
    for(const [id,key] of [['provider','provider'],['base-url','baseUrl'],['model','model'],['nickname','nickname'],['persona-mode','personaMode'],['persona','persona'],['custom-prompt','customPrompt'],['proactive','proactive']] as const)input(id).value=config[key];
    input('proactive-minutes').value=String(config.proactiveIntervalMinutes);proactive();
    input('key').value='';input('key').placeholder=hasKey?'密钥已加密保存，留空保持原密钥':'粘贴服务商提供的 API Key';
    document.getElementById('ai-key-status')!.textContent=hasKey?'已保存密钥':'尚未保存密钥';removeKey=false;persona();if(warning)message(warning,true);
  }
  input('provider').addEventListener('change',()=>{
    const provider=PROVIDERS.find(p=>p.id===input('provider').value);
    if(provider){input('base-url').value=provider.baseUrl;input('model').value=provider.model;}
    message('切换接口后，请重新填写对应密钥并保存。');
  });
  input('persona-mode').addEventListener('change',persona);
  input('proactive').addEventListener('change',proactive);
  input('key').addEventListener('input',()=>{if(input('key').value)removeKey=false;});
  document.getElementById('ai-remove-key')!.addEventListener('click',()=>{removeKey=true;input('key').value='';message('点击“保存 AI 设置”后移除已存密钥。');});
  async function run(test:boolean){
    const save=document.getElementById('ai-save') as HTMLButtonElement,button=document.getElementById('ai-test') as HTMLButtonElement;
    save.disabled=button.disabled=true;message(test?'正在测试连接…':'正在保存…');
    try{
      const config=draft(),key=input('key').value;
      const result=test?await window.petAPI.testAI(config,key||undefined):await window.petAPI.saveAI(config,key||undefined,removeKey);
      if(!result.ok){message(result.error??'操作失败，请重试。',true);return;}
      if(test)message('连接成功，一二可以和你聊天了。');
      else{const state=await window.petAPI.getAI();show(state.config,state.hasKey,state.warning);message('AI 设置已保存。');}
    }catch{message('暂时无法完成，请稍后重试。',true);}finally{save.disabled=button.disabled=false;}
  }
  document.getElementById('ai-save')!.addEventListener('click',()=>void run(false));
  document.getElementById('ai-test')!.addEventListener('click',()=>void run(true));
  document.getElementById('ai-open-chat')!.addEventListener('click',()=>window.petAPI.openChat());
  document.getElementById('ai-clear')!.addEventListener('click',async()=>{try{const result=await window.petAPI.clearChat();message(result.ok?'聊天记录已清空。':result.error??'清空失败',!result.ok);}catch{message('清空失败，请重试。',true);}});
  void window.petAPI.getAI().then(state=>show(state.config,state.hasKey,state.warning)).catch(()=>message('读取 AI 设置失败，请关闭后重试。',true));
}
