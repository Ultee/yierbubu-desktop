import {app,BrowserWindow,ipcMain,Menu,Tray,nativeImage,screen,powerMonitor} from 'electron';
import type {IpcMainEvent,IpcMainInvokeEvent} from 'electron';
import {join} from 'node:path';
import {Store} from './store.ts';
import {ConfigError,validateConfig,snapshot} from './core.ts';
import type {Stored} from './store.ts';

// Test profiles are isolated; the normal app never uses fixture salary data.
const profile=process.env.SALARY_PET_PROFILE;
if(profile) app.setPath('userData',profile);
app.setName('SalaryPet');
let pet:BrowserWindow|null=null,settings:BrowserWindow|null=null,tray:Tray|null=null;
let store:Store,data:Stored={config:null,position:null},warning='';
let dragOffset:{x:number;y:number}|null=null,positionTimer:ReturnType<typeof setTimeout>|null=null;
const width=320,height=350;
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
  settings=new BrowserWindow({width:760,height:850,minWidth:650,minHeight:650,title:'秒薪桌宠 · 设置',backgroundColor:'#f7f8f5',autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  protect(settings);settings.loadFile(join(__dirname,'settings.html'));
  settings.on('closed',()=>{settings=null;});
}
const menu=()=>Menu.buildFromTemplate([{label:'设置月薪与作息',click:openSettings},{type:'separator'},{label:'退出秒薪桌宠',click:()=>app.quit()}]);
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
  store=new Store(app.getPath('userData'));const loaded=store.load();data={config:loaded.config,position:loaded.position};warning=loaded.warning;
  const a=screen.getPrimaryDisplay().workArea;
  const pos=data.position??{x:a.x+a.width-width-28,y:a.y+a.height-height-28};
  pet=new BrowserWindow({...clamped(pos.x,pos.y),width,height,backgroundColor:'#00000000',transparent:true,frame:false,resizable:false,hasShadow:false,skipTaskbar:true,alwaysOnTop:true,focusable:false,show:false,webPreferences:{preload:join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  protect(pet);pet.setAlwaysOnTop(true,'floating');pet.setIgnoreMouseEvents(true,{forward:true});pet.loadFile(join(__dirname,'pet.html'));
  pet.once('ready-to-show',()=>pet?.showInactive());
  pet.on('move',()=>{if(positionTimer)clearTimeout(positionTimer);positionTimer=setTimeout(persistPosition,350);});
  tray=new Tray(icon());tray.setToolTip('秒薪桌宠 · 鼠标移到一二上查看收入');tray.setContextMenu(menu());tray.on('double-click',openSettings);
  const reposition=()=>{if(pet){const [x,y]=pet.getPosition();pet.setPosition(...Object.values(clamped(x,y)) as [number,number]);}};
  screen.on('display-removed',reposition);screen.on('display-metrics-changed',reposition);powerMonitor.on('resume',broadcast);
  if(!data.config)openSettings();
});
ipcMain.handle('state',(event)=>{
  if(!own(event,pet)&&!own(event,settings))throw new Error('无效请求');
  return {config:data.config,snapshot:snapshot(data.config,new Date()),warning};
});
ipcMain.handle('save',(event,input:unknown)=>{
  if(!own(event,settings))return {ok:false,error:'无效请求'};
  try{const config=validateConfig(input);store.save({...data,config});data.config=config;warning='';broadcast();return {ok:true};}
  catch(error){return {ok:false,field:error instanceof ConfigError?error.field:'general',error:error instanceof ConfigError?error.message:'保存失败，请检查磁盘空间与文件夹权限。'};}
});
ipcMain.on('settings',event=>{if(own(event,pet))openSettings();});
ipcMain.on('close-settings',event=>{if(own(event,settings))settings?.close();});
ipcMain.on('menu',event=>{if(own(event,pet)&&pet)menu().popup({window:pet});});
ipcMain.on('passthrough',(event,ignore:unknown)=>{if(own(event,pet)&&typeof ignore==='boolean'&&!dragOffset)pet?.setIgnoreMouseEvents(ignore,{forward:true});});
ipcMain.on('drag',(event,action:unknown,point:unknown)=>{
  if(!own(event,pet)||!pet)return;
  const p=point as {x:number;y:number}|undefined;
  if(action!=='end'&&(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1000000||Math.abs(p.y)>1000000))return;
  const cursor=p??screen.getCursorScreenPoint();
  if(action==='start'){const [x,y]=pet.getPosition();dragOffset={x:cursor.x-x,y:cursor.y-y};pet.setIgnoreMouseEvents(false);}
  else if(action==='move'&&dragOffset){const p=clamped(cursor.x-dragOffset.x,cursor.y-dragOffset.y);pet.setPosition(p.x,p.y);}
  else if(action==='end'){dragOffset=null;persistPosition();}
});
app.on('window-all-closed',()=>{});
app.on('before-quit',()=>{if(positionTimer)clearTimeout(positionTimer);persistPosition();tray?.destroy();});
}
