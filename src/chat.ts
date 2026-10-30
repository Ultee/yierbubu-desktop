import type {} from './bridge.ts';
const field=document.getElementById('chat-input') as HTMLTextAreaElement,button=document.getElementById('chat-send') as HTMLButtonElement,thread=document.getElementById('chat-thread')!,error=document.getElementById('chat-error')!;
let sending=false,lastMessages='',refreshId=0;
async function refresh(){
  const id=++refreshId;
  try{
    const state=await window.petAPI.getChat();if(id!==refreshId)return;
    document.getElementById('chat-caption')!.textContent=state.enabled?`${state.nickname||'你'}，我在听。`:'先在设置里开启 AI 并保存密钥。';
    document.getElementById('chat-memory')!.textContent=state.memory?'记忆已开启 · 最近40条保存在本机':'记忆关闭 · 本次聊天不保存到磁盘';
    document.getElementById('chat-empty')!.hidden=state.messages.length>0;
    const encoded=JSON.stringify(state.messages);
    if(lastMessages!==encoded){
      lastMessages=encoded;thread.replaceChildren();
      for(const message of state.messages){const el=document.createElement('div');el.className=`message ${message.role}`;el.textContent=message.content;thread.append(el);}
      const container=document.getElementById('chat-messages')!;container.scrollTop=container.scrollHeight;
    }
    document.getElementById('chat-thinking')!.hidden=!state.busy;button.disabled=state.busy||sending||!state.enabled;
    error.textContent=state.error;
  }catch{error.textContent='读取聊天失败，请关闭窗口后重试。';}
}
document.getElementById('chat-form')!.addEventListener('submit',async event=>{
  event.preventDefault();if(sending||button.disabled)return;const text=field.value.trim();if(!text)return;
  sending=true;button.disabled=true;error.textContent='';
  try{const result=await window.petAPI.sendChat(text);if(result.ok&&field.value.trim()===text)field.value='';await refresh();if(!result.ok)error.textContent=result.error??'发送失败，请重试。';}
  catch{error.textContent='发送失败，请重试。';}finally{sending=false;void refresh();field.focus();}
});
field.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();(document.getElementById('chat-form') as HTMLFormElement).requestSubmit();}});
document.getElementById('chat-clear')!.addEventListener('click',async()=>{try{const result=await window.petAPI.clearChat();if(result.ok)await refresh();else error.textContent=result.error??'清空失败';}catch{error.textContent='清空失败，请重试。';}});
document.getElementById('chat-settings')!.addEventListener('click',()=>window.petAPI.openSettings());
window.petAPI.onChanged(()=>void refresh());void refresh();
