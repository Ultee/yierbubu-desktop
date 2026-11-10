import {app,BrowserWindow,ipcMain,Menu,Tray,nativeImage,screen,powerMonitor} from 'electron';
import type {IpcMainEvent,IpcMainInvokeEvent} from 'electron';
import {join} from 'node:path';
import {Store} from './store.ts';
import {ConfigError,validateConfig,snapshot} from './core.ts';
import type {Stored} from './store.ts';
import {normalizePreferences,petLayout,SIZES} from './pet-behavior.ts';
import type {PetSize,Preferences} from './pet-behavior.ts';
import {installAI} from './ai-main.ts';
import {installAffinity} from './affinity-main.ts';
import {installVoice} from './voice-main.ts';

// Test profiles are isolated; the normal app never uses fixture salary data.
const profile=process.env.SALARY_PET_PROFILE;
if(profile) app.setPath('userData',profile);
app.setName('SalaryPet');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
let pet:BrowserWindow|null=null,settings:BrowserWindow|null=null,tray:Tray|null=null;
let store:Store,data:Stored={config:null,position:null,preferences:normalizePreferences(undefined)},warning='';
let dragOffset:{x:number;y:number}|null=null,dragMoved=false,positionTimer:ReturnType<typeof setTimeout>|null=null;
let walking=false,walkStep:ReturnType<typeof setTimeout>|null=null,nextWanderAt=0,systemLocked=false;
powerMonitor.on('lock-screen',()=>{systemLocked=true;stopWalk();});
powerMonitor.on('unlock-screen',()=>{systemLocked=false;});
const wanderDelay=()=>15*60000+Math.random()*15*60000;
function stopWalk(){
  if(walkStep){clearTimeout(walkStep);walkStep=null;}
  if(!walking)return;
  walking=false;
  pet?.webContents.send('wander','');
  nextWanderAt=Date.now()+wanderDelay();
}
function startWalk(){
  if(!pet||walking||dragOffset||systemLocked||!data.preferences.wander)return;
  walking=true;
  nextWanderAt=Date.now()+wanderDelay();
  const direction=Math.random()<.5?-1:1,distance=80+Math.floor(Math.random()*161);
  let moved=0;
  pet.webContents.send('wander',direction<0?'left':'right');
  const tick=()=>{
    walkStep=null;
    if(!walking||!pet||dragOffset||systemLocked||!data.preferences.wander){stopWalk();return;}
    const cursor=screen.getCursorScreenPoint(),[x,y]=pet.getPosition();
    if(cursor.x>=x-56&&cursor.x<=x+width+56&&cursor.y>=y-56&&cursor.y<=y+height+56){stopWalk();return;}
    if(moved>=distance){stopWalk();return;}
    const next=clamped(x+direction*4,y);
    if(next.x===x){stopWalk();return;}
    pet.setBounds({x:next.x,y:next.y,width,height});
    moved+=Math.abs(next.x-x);
    walkStep=setTimeout(tick,90);
  };
  walkStep=setTimeout(tick,120);
}
function maybeWander(status:string){
  if(!data.preferences.wander||walking||dragOffset||systemLocked||!pet||status!=='working')return;
  if(!nextWanderAt)nextWanderAt=Date.now()+wanderDelay();
  if(Date.now()>=nextWanderAt)startWalk();
}
let {width,height}=petLayout('medium');
let ai:ReturnType<typeof installAI>|undefined;
let affinity:ReturnType<typeof installAffinity>|undefined;
let voice:ReturnType<typeof installVoice>|undefined;
let affinityTimer:ReturnType<typeof setInterval>|undefined;
let incomeVisible=false;
const own=(event:IpcMainEvent|IpcMainInvokeEvent,window:BrowserWindow|null) => !!window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame;
function protect(window:BrowserWindow) {
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
}
function clamped(x:number,y:number) {
  const area=screen.getDisplayNearestPoint({x:Math.round(x+width/2),y:Math.round(y+height/2)}).workArea;
  return {x:Math.round(Math.max(area.x,Math.min(x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(y,area.y+area.height-height)))};
}
function broadcast(){ for(const w of [pet,settings]) if(w&&!w.isDestroyed()) w.webContents.send('changed'); }
function persistPosition(){
  if(!pet||warning) return;
  try{data.position=pet.getPosition().reduce((p,v,i)=>({...p,[i?'y':'x']:v}),{} as {x:number;y:number});store.save(data);}
  catch{warning='位置保存失败，请检查本地文件夹权限。';broadcast();}
}
function openSettings(){
  if(settings){settings.show();settings.focus();return;}
  settings=new BrowserWindow({width:760,height:850,minWidth:650,minHeight:650,title:'秒薪桌宠 · 设置',backgroundColor:'#0B1322',autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  protect(settings);settings.loadFile(join(__dirname,'settings.html'));
  settings.on('closed',()=>{settings=null;});
}
function applySize(){
  const next=petLayout(data.preferences.size),oldHeight=height;height=next.height;width=next.width;
  if(pet){const [x,y]=pet.getPosition();const pos=clamped(x,y+oldHeight-height);pet.setBounds({...pos,width,height});}
}
function savePreferences(preferences:Preferences):{ok:boolean;error?:string}{
  try{
    store.save({...data,preferences});data.preferences=preferences;warning='';applySize();
    if(preferences.wander)nextWanderAt=Date.now()+wanderDelay();else stopWalk();
    tray?.setContextMenu(menu());broadcast();return {ok:true};
  }catch{warning='外观保存失败，请检查磁盘空间与文件夹权限。';broadcast();return {ok:false,error:warning};}
}
function setIncomeVisible(visible:boolean){incomeVisible=visible;tray?.setContextMenu(menu());broadcast();}
const menu=()=>Menu.buildFromTemplate([{label:'查看',type:'checkbox',checked:incomeVisible,click:()=>setIncomeVisible(!incomeVisible)},{label:'和一二聊聊',click:()=>ai?.openChat()},{label:'设置月薪、作息与AI',click:openSettings},
  {label:'桌宠大小',submenu:SIZES.map(size=>({label:size.label,type:'radio' as const,checked:data.preferences.size===size.id,click:()=>savePreferences({...data.preferences,size:size.id})}))},
  {label:'喂点零食',submenu:[{label:'小饼干',click:()=>affinity?.feed('cookie')},{label:'小鱼干',click:()=>affinity?.feed('fish')},{label:'奶茶',click:()=>affinity?.feed('tea')}]},
  {type:'separator'},{label:'退出秒薪桌宠',click:()=>app.quit()}]);
function icon(){
  const pixels=Buffer.alloc(16*16*4);
  for(let y=0;y<16;y++) for(let x=0;x<16;x++) {
    const ear=(x-3)**2+(y-3)**2<=5||(x-12)**2+(y-3)**2<=5;
    const radius=((x-7.5)/6.5)**2+((y-8)/5.6)**2;
    const head=radius<=1,body=y>=12&&y<=15&&x>=5&&x<=10;
    if(ear||head||body){
      const eye=y===8&&(x===5||x===10),cheek=y===10&&(x===4||x===11);
      const dark=eye||(!head&&ear)||(head&&radius>.76);
      const color=dark?[45,49,80]:cheek?[175,180,245]:[253,254,255];
      const i=(y*16+x)*4;pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=255;
    }
  }
  return nativeImage.createFromBitmap(pixels,{width:16,height:16});
}
if(!app.requestSingleInstanceLock()) app.quit();
else {
app.on('second-instance',()=>openSettings());
app.whenReady().then(()=>{
  store=new Store(app.getPath('userData'));const loaded=store.load();data={config:loaded.config,position:loaded.position,preferences:loaded.preferences};warning=loaded.warning;
  affinity=installAffinity({dir:app.getPath('userData'),pet:()=>pet,settings:()=>settings,broadcast});
  ai=installAI({dir:app.getPath('userData'),pet:()=>pet,settings:()=>settings,context:()=>({config:data.config,snapshot:snapshot(data.config,new Date())}),protect,broadcast,affinityChat:()=>affinity?.chat()});
  voice=installVoice({dir:app.getPath('userData'),pet:()=>pet,settings:()=>settings,broadcast});
  affinityTimer=setInterval(()=>{
    if(!affinity)return;
    const now=new Date();
    const status=data.config?snapshot(data.config,now).status:'unconfigured';
    affinity.statusTick(status);
    affinity.dailyCheck(now);
    maybeWander(status);
  },10000);
  ({width,height}=petLayout(data.preferences.size));
  const a=screen.getPrimaryDisplay().workArea;
  const pos=data.position??{x:a.x+a.width-width-28,y:a.y+a.height-height-28};
  pet=new BrowserWindow({...clamped(pos.x,pos.y),width,height,backgroundColor:'#00000000',transparent:true,frame:false,resizable:false,hasShadow:false,skipTaskbar:true,alwaysOnTop:true,focusable:false,show:false,webPreferences:{preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  protect(pet);pet.setAlwaysOnTop(true,'floating');pet.setIgnoreMouseEvents(true,{forward:true});pet.loadFile(join(__dirname,'pet.html'));
  // Fractional display scaling can inflate the freshly created window by a pixel or two.
  pet.once('ready-to-show',()=>{const [x,y]=pet?.getPosition()??[0,0];pet?.setBounds({x,y,width,height});pet?.showInactive();});
  pet.on('move',()=>{if(positionTimer)clearTimeout(positionTimer);positionTimer=setTimeout(persistPosition,350);});
  tray=new Tray(icon());tray.setToolTip('秒薪桌宠 · 右键选择“查看”显示收入');tray.setContextMenu(menu());tray.on('double-click',openSettings);
  const reposition=()=>{if(pet){const [x,y]=pet.getPosition();pet.setPosition(...Object.values(clamped(x,y)) as [number,number]);}};
  screen.on('display-removed',reposition);screen.on('display-metrics-changed',reposition);powerMonitor.on('resume',broadcast);
  if(!data.config)openSettings();
});
ipcMain.handle('state',(event)=>{
  if(!own(event,pet)&&!own(event,settings))throw new Error('无效请求');
  return {config:data.config,snapshot:snapshot(data.config,new Date()),preferences:data.preferences,warning,incomeVisible};
});
ipcMain.handle('save',(event,input:unknown,prefs:unknown)=>{
  if(!own(event,settings))return {ok:false,error:'无效请求'};
  try{const config=validateConfig(input),preferences=normalizePreferences(prefs);store.save({...data,config,preferences});data.config=config;data.preferences=preferences;warning='';ai?.resetSchedule();applySize();tray?.setContextMenu(menu());broadcast();return {ok:true};}
  catch(error){return {ok:false,field:error instanceof ConfigError?error.field:'general',error:error instanceof ConfigError?error.message:'保存失败，请检查磁盘空间与文件夹权限。'};}
});
ipcMain.handle('size',(event,size:unknown)=>{
  if((!own(event,pet)&&!own(event,settings))||!SIZES.some(s=>s.id===size))return {ok:false,error:'无效的桌宠大小'};
  if(dragOffset)return {ok:false,error:'请先结束拖动'};
  return savePreferences({...data.preferences,size:size as PetSize});
});
ipcMain.handle('prefs-save',(event,prefs:unknown)=>{
  if(!own(event,settings))return {ok:false,error:'无效请求'};
  if(dragOffset)return {ok:false,error:'请先结束拖动'};
  return savePreferences(normalizePreferences(prefs));
});
ipcMain.on('settings',event=>{if(own(event,pet)||ai?.isChat(event))openSettings();});
ipcMain.on('close-settings',event=>{if(own(event,settings))settings?.close();});
ipcMain.on('menu',event=>{if(own(event,pet)&&pet)menu().popup({window:pet});});
ipcMain.on('income-hide',event=>{if(own(event,pet))setIncomeVisible(false);});
ipcMain.on('passthrough',(event,ignore:unknown)=>{if(own(event,pet)&&typeof ignore==='boolean'&&!dragOffset)pet?.setIgnoreMouseEvents(ignore,{forward:true});});
ipcMain.on('drag',(event,action:unknown)=>{
  if(!own(event,pet)||!pet)return;
  // Cursor and window positions must share Electron's native DIP coordinate space.
  // Renderer screen coordinates can shift when a captured window moves on Windows.
  if(action==='start'){
    if(dragOffset)return;
    stopWalk();
    const cursor=screen.getCursorScreenPoint(),[x,y]=pet.getPosition();
    dragOffset={x:cursor.x-x,y:cursor.y-y};dragMoved=false;pet.setIgnoreMouseEvents(false);
  }else if(action==='move'&&dragOffset){
    if(!dragMoved){dragMoved=true;setIncomeVisible(false);}
    const cursor=screen.getCursorScreenPoint(),p=clamped(cursor.x-dragOffset.x,cursor.y-dragOffset.y),[x,y]=pet.getPosition();
    // setPosition alone lets fractional DPI scaling inflate the window on every move;
    // pinning the logical size keeps both pets' layout stable while dragging.
    if(p.x!==x||p.y!==y)pet.setBounds({x:p.x,y:p.y,width,height});
  }else if(action==='end'){
    if(pet&&affinity){const [x,y]=pet.getPosition(),area=screen.getDisplayNearestPoint({x:x+Math.round(width/2),y:y+Math.round(height/2)}).workArea;const horizontal=x<=area.x+48||x+width>=area.x+area.width-48,vertical=y<=area.y+48||y+height>=area.y+area.height-48;if(horizontal&&vertical&&affinity.egg('corner'))pet.webContents.send('egg-action','corner');}
    dragOffset=null;if(dragMoved)persistPosition();dragMoved=false;
  }
});
app.on('window-all-closed',()=>{});
app.on('before-quit',()=>{ai?.dispose();voice?.dispose();if(positionTimer)clearTimeout(positionTimer);if(affinityTimer)clearInterval(affinityTimer);if(walkStep)clearTimeout(walkStep);persistPosition();tray?.destroy();});
}
