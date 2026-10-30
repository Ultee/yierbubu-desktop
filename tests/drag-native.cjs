// Physical Windows input: CDP mouse events do not update the OS cursor API.
const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'salary-pet-native-drag-'));let app;
  try{
    const env={...process.env,SALARY_PET_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch(process.env.SALARY_PET_EXECUTABLE?{executablePath:process.env.SALARY_PET_EXECUTABLE,args:[],env}:{args:[path.resolve('.')],env});
    const pet=app.windows().find(p=>p.url().endsWith('pet.html'))??await app.waitForEvent('window',p=>p.url().endsWith('pet.html'));
    await pet.waitForLoadState();
    await app.evaluate(({BrowserWindow,ipcMain,screen})=>{
      for(const w of BrowserWindow.getAllWindows())if(!w.webContents.getURL().endsWith('pet.html'))w.close();
      const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html'));
      w.setPosition(200,150);w.showInactive();
      globalThis.nativeDragLog=[];
      const readCursor=screen.getCursorScreenPoint;
      // Observe the exact real OS sample used by production; do not replace its value.
      screen.getCursorScreenPoint=()=>{const p=readCursor();globalThis.lastNativeCursor={...p};return p;};
      ipcMain.on('drag',(_e,action)=>globalThis.nativeDragLog.push({action,cursor:globalThis.lastNativeCursor,pos:w.getPosition(),area:screen.getDisplayNearestPoint({x:w.getPosition()[0]+160,y:w.getPosition()[1]+175}).workArea}));
    });
    const b=await pet.locator('#pet').boundingBox();
    const points=await app.evaluate(({screen},p)=>p.map(screen.dipToScreenPoint),[
      {x:200+b.x+b.width/2,y:150+b.y+b.height/2},
      {x:240+b.x+b.width/2,y:180+b.y+b.height/2},
      {x:180+b.x+b.width/2,y:140+b.y+b.height/2},
    ]);
    const helper=path.join(profile,'input.ps1');
    await fs.writeFile(helper,`Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public class DragInput {
[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(System.IntPtr context);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint flags,int x,int y,uint data,System.UIntPtr extra);
}
'@
[DragInput]::SetProcessDpiAwarenessContext([System.IntPtr]::new(-4)) | Out-Null
[DragInput]::SetCursorPos(${points[0].x},${points[0].y}) | Out-Null
Start-Sleep -Milliseconds 250
[DragInput]::mouse_event(2,0,0,0,[System.UIntPtr]::Zero)
try {
  Start-Sleep -Milliseconds 150
  [DragInput]::SetCursorPos(${points[1].x},${points[1].y}) | Out-Null
  Start-Sleep -Milliseconds 400
  [DragInput]::SetCursorPos(${points[2].x},${points[2].y}) | Out-Null
  Start-Sleep -Milliseconds 500
} finally { [DragInput]::mouse_event(4,0,0,0,[System.UIntPtr]::Zero) }
`);
    await promisify(execFile)('powershell.exe',['-NoProfile','-File',helper],{windowsHide:true});
    await pet.evaluate(()=>window.petAPI.getState());
    const pos=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')).getPosition());
    const log=await app.evaluate(()=>globalThis.nativeDragLog);
    await fs.mkdir('test-results',{recursive:true});
    await fs.writeFile('test-results/native-drag.json',JSON.stringify({points,log},null,2));
    const start=log.find(e=>e.action==='start'),moves=log.filter(e=>e.action==='move');
    assert.ok(start&&moves.length>=2,'physical input must reach the real renderer drag handler');
    for(const m of moves){
      // Other physical mouse input may coexist; compare the actual sampled cursor,
      // rather than assuming the automation has exclusive control of the mouse.
      const x=Math.max(m.area.x,Math.min(start.pos[0]+m.cursor.x-start.cursor.x,m.area.x+m.area.width-320));
      const y=Math.max(m.area.y,Math.min(start.pos[1]+m.cursor.y-start.cursor.y,m.area.y+m.area.height-350));
      assert.deepEqual(m.pos,[Math.round(x),Math.round(y)],'every native movement preserves the grab offset');
    }
    assert.deepEqual(pos,moves.at(-1).pos,'no window movement after the last sampled drag');
    assert.equal(await pet.locator('#pet').getAttribute('data-action'),'','physical drag must not trigger a click');
    assert.equal(await pet.locator('#pet').evaluate(el=>el.classList.contains('dragging')),false,'release ends physical gesture');
    console.log(`PASS: physical Windows input, ${moves.length} real cursor/window samples preserve grab offset, release and no click; no cursor value substitution.`);
  }finally{if(app)await app.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
