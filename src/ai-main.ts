import {BrowserWindow,ipcMain,safeStorage,screen,powerMonitor} from 'electron';
import type {IpcMainEvent,IpcMainInvokeEvent} from 'electron';
import {join} from 'node:path';
import {AiService} from './ai-service.ts';
import {ProactivePolicy} from './ai-proactive.ts';
import {parseDialogue} from './ai-dialogue.ts';
import type {Config,Snapshot} from './core.ts';
import type {AIResult} from './ai-config.ts';

interface Host {dir:string;pet:()=>BrowserWindow|null;settings:()=>BrowserWindow|null;context:()=>{config:Config|null;snapshot:Snapshot};protect:(w:BrowserWindow)=>void;broadcast:()=>void;affinityChat?:()=>void}
export function installAI(host:Host){
  const service=new AiService(host.dir,{available:()=>safeStorage.isEncryptionAvailable(),encrypt:text=>safeStorage.encryptString(text),decrypt:buffer=>safeStorage.decryptString(buffer)});
  const policy=new ProactivePolicy();
  let chat:BrowserWindow|null=null,busy=false,error='',generation=0,testBusy=false,lastAction=0,dialogueBusy=false,lastDialogue=Date.now(),previousStatus:string|undefined,locked=false;
  const onLock=()=>{locked=true;},onUnlock=()=>{locked=false;};
  powerMonitor.on('lock-screen',onLock);powerMonitor.on('unlock-screen',onUnlock);
  const own=(event:IpcMainEvent|IpcMainInvokeEvent,w:BrowserWindow|null)=>!!w&&!w.isDestroyed()&&event.sender===w.webContents&&event.senderFrame===w.webContents.mainFrame;
  const allowed=(e:IpcMainEvent|IpcMainInvokeEvent)=>[host.pet(),host.settings(),chat].some(w=>own(e,w));
  function changed(){host.broadcast();if(chat&&!chat.isDestroyed())chat.webContents.send('changed');}
  function cancel(){generation++;service.cancel();busy=false;error='';changed();}
  function openChat(){
    if(chat){chat.show();chat.focus();return;}
    const pet=host.pet(),p=pet?.getBounds(),area=screen.getDisplayNearestPoint(p?{x:p.x,y:p.y}:{x:0,y:0}).workArea;
    chat=new BrowserWindow({width:440,height:600,minWidth:380,minHeight:440,x:Math.max(area.x,Math.min((p?.x??area.x)-440,area.x+area.width-440)),y:Math.max(area.y,Math.min(p?.y??area.y,area.y+area.height-600)),title:'和一二聊聊',backgroundColor:'#f6f7f2',autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    host.protect(chat);chat.loadFile(join(__dirname,'chat.html'));chat.on('closed',()=>{chat=null;});
  }
  async function send(text:string,proactive=false):Promise<AIResult>{
    if(busy||testBusy)return {ok:false,error:'一二还在想，稍等一下再说。'};
    const token=generation;busy=true;error='';changed();
    try{
      const result=await service.send(text,host.context(),proactive?'proactive':'chat');
      if(token!==generation)return {ok:false,error:'设置或记忆已变更，请重新发送。'};
      if(!result.ok)error=result.error??'暂时没有收到回复，请重试。';
      else if(proactive&&result.text)host.pet()?.webContents.send('speech',result.text.slice(0,240));
      if(result.ok&&!proactive)host.affinityChat?.();
      return result;
    }catch{if(token===generation)error='暂时无法聊天，请稍后重试。';return {ok:false,error:'暂时无法聊天，请稍后重试。'};}
    finally{if(token===generation){busy=false;changed();}}
  }
  async function actionReply(action:string):Promise<AIResult>{
    const now=Date.now();
    if(busy||testBusy||now-lastAction<2000)return {ok:false,error:'跳过'};
    lastAction=now;
    try{
      const result=await service.send(action,host.context(),'action');
      if(result.ok&&result.text)host.pet()?.webContents.send('speech',result.text.slice(0,240));
      return result;
    }catch{return {ok:false,error:'跳过'};}
  }
  async function dialogue():Promise<void>{
    if(dialogueBusy||busy||testBusy)return;
    const state=service.getState();
    if(!state.config.enabled||!state.hasKey||!state.config.dialogue)return;
    dialogueBusy=true;
    try{
      const result=await service.send('来一小段你和布布的日常对话吧。',host.context(),'dialogue');
      if(result.ok&&result.text){
        const lines=parseDialogue(result.text);
        if(lines){lastDialogue=Date.now();host.pet()?.webContents.send('dialogue',lines);}
      }
    }catch{}
    finally{dialogueBusy=false;}
  }
  ipcMain.handle('ai-state',e=>{if(!allowed(e))throw new Error('无效请求');return service.getState();});
  ipcMain.handle('ai-save',(e,input:unknown,key:unknown,remove:unknown)=>{
    if(!own(e,host.settings())||(key!==undefined&&typeof key!=='string')||(remove!==undefined&&typeof remove!=='boolean'))return {ok:false,error:'无效请求'};
    try{cancel();service.save(input,key as string|undefined,remove as boolean|undefined);policy.reset();host.pet()?.webContents.send('speech','');changed();return {ok:true};}
    catch(err){return {ok:false,error:err instanceof Error?err.message:'AI设置保存失败。'};}
  });
  ipcMain.handle('ai-test',async(e,input:unknown,key:unknown)=>{
    if(!own(e,host.settings())||(key!==undefined&&typeof key!=='string'))return {ok:false,error:'无效请求'};
    if(testBusy||busy)return {ok:false,error:'当前请求尚未完成，请稍后测试。'};
    testBusy=true;changed();try{return await service.test(input,key as string|undefined);}finally{testBusy=false;changed();}
  });
  ipcMain.handle('chat-state',e=>{
    if(!allowed(e))throw new Error('无效请求');const state=service.getState();
    return {messages:service.getHistory(),busy:busy||testBusy,error,enabled:state.config.enabled&&state.hasKey,nickname:state.config.nickname,memory:state.config.memory};
  });
  ipcMain.handle('chat-send',(e,text:unknown)=>{
    if(!own(e,chat)||typeof text!=='string'||text.trim().length===0||text.length>4000)return {ok:false,error:'请输入1到4000字的消息。'};
    return send(text.trim());
  });
  ipcMain.handle('chat-clear',e=>{
    if(!own(e,chat)&&!own(e,host.settings()))return {ok:false,error:'无效请求'};
    try{cancel();service.clearHistory();host.pet()?.webContents.send('speech','');changed();return {ok:true};}catch{return {ok:false,error:'清空失败，请检查本地文件夹权限。'};}
  });
  ipcMain.handle('ai-action',(e,action:unknown)=>{
    if(!own(e,host.pet())||typeof action!=='string')return {ok:false,error:'无效请求'};
    return actionReply(action);
  });
  ipcMain.on('chat-open',e=>{if(allowed(e))openChat();});
  const timer=setInterval(()=>{
    const state=service.getState(),context=host.context(),status=context.snapshot.status,now=Date.now();
    const due=policy.tick(state.config.enabled&&state.hasKey?state.config.proactive:'off',status,now,state.config.proactiveIntervalMinutes);
    if(due&&!busy&&!testBusy)void send('请根据当前作息，主动说一句简短的陪伴或提醒，不超过60字。',true);
    const ready=state.config.enabled&&state.hasKey&&state.config.dialogue&&!dialogueBusy&&!busy&&!testBusy&&!locked&&!['lunch','unconfigured','empty','rest'].includes(status);
    const sceneChange=previousStatus!==undefined&&status!==previousStatus&&['before','working','finished'].includes(status);
    const intervalDue=status==='working'&&now-lastDialogue>=state.config.dialogueIntervalMinutes*60000;
    if(ready&&(sceneChange||intervalDue))void dialogue();
    previousStatus=status;
  },10000);
  return {openChat,isChat:(e:IpcMainEvent)=>own(e,chat),resetSchedule(){policy.reset();},dispose(){clearInterval(timer);cancel();powerMonitor.removeListener('lock-screen',onLock);powerMonitor.removeListener('unlock-screen',onUnlock);}};
}
