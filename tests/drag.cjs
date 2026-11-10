const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'salary-pet-drag-'));let app;
  try{
    const env={...process.env,SALARY_PET_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch(process.env.SALARY_PET_EXECUTABLE?{executablePath:process.env.SALARY_PET_EXECUTABLE,args:[],env}:{args:[path.resolve('.')],env});
    const pet=app.windows().find(p=>p.url().endsWith('pet.html'))??await app.waitForEvent('window',p=>p.url().endsWith('pet.html'));
    await pet.waitForLoadState();
    await app.evaluate(({BrowserWindow,screen})=>{
      BrowserWindow.getAllWindows().filter(w=>!w.webContents.getURL().endsWith('pet.html')).forEach(w=>w.close());
      // Only substitute the OS cursor. Keep IPC, clamp, native window and persistence real.
      globalThis.dragCursor={x:362,y:427};
      screen.getCursorScreenPoint=()=>({...globalThis.dragCursor});
      BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')).setPosition(200,150);
    });
    const position=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')).getPosition());
    const size=()=>app.evaluate(({BrowserWindow})=>{const b=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')).getBounds();return {width:b.width,height:b.height};});
    const send=async(action,point)=>{
      await pet.evaluate(({action,point})=>window.petAPI.drag(action,point),{action,point});
      await pet.evaluate(()=>window.petAPI.getState());
    };
    await send('start',{x:362,y:427});
    await app.evaluate(()=>{globalThis.dragCursor={x:342,y:417};});
    await send('move',{x:342,y:417});
    assert.deepEqual(await position(),[180,140],'native cursor delta determines window displacement');
    assert.deepEqual(await size(),{width:320,height:350},'drag must pin the pet window size (fractional DPI must not inflate it)');
    // Window movement/DPI rounding can produce stale or shifted renderer coordinates.
    // The cursor is stationary: these events must not feed back into window position.
    for(const point of [{x:343,y:418},{x:350,y:426},{x:380,y:456}]){
      await send('move',point);
      assert.deepEqual(await position(),[180,140],'stationary native cursor must not drift with renderer screen coordinates');
    }
    await app.evaluate(()=>{globalThis.dragCursor={x:392,y:437};});
    await send('move',{x:430,y:480});
    assert.deepEqual(await position(),[230,160],'drag tracks native cursor in both directions');
    await send('end');
    assert.deepEqual(await size(),{width:320,height:350},'size stays pinned after repeated drag moves');
    await app.evaluate(()=>{globalThis.dragCursor={x:450,y:490};});
    await send('move',{x:450,y:490});
    assert.deepEqual(await position(),[230,160],'release ends movement');
    const stored=JSON.parse(await fs.readFile(path.join(profile,'settings.json'),'utf8'));
    assert.deepEqual(stored.position,{x:230,y:160},'persist final native position');
    await pet.locator('#pet').hover();
    await pet.mouse.down();await pet.evaluate(()=>window.petAPI.getState());
    await app.evaluate(()=>{globalThis.dragCursor={x:430,y:480};});
    const b=await pet.locator('#pet').boundingBox();
    await pet.mouse.move(b.x+b.width/2-20,b.y+b.height/2-10);
    await pet.evaluate(()=>window.petAPI.getState());await pet.mouse.up();
    assert.deepEqual(await position(),[210,150],'renderer initiates native offset at pointerdown');
    assert.equal(await pet.locator('#pet').getAttribute('data-action'),'','drag does not trigger click action');
    for(const type of ['pointercancel','lostpointercapture']){
      await pet.locator('#pet').hover();await pet.mouse.down();
      await pet.evaluate(()=>window.petAPI.getState());
      await app.evaluate(()=>{globalThis.dragCursor.x+=20;globalThis.dragCursor.y+=10;});
      const box=await pet.locator('#pet').boundingBox();
      await pet.mouse.move(box.x+box.width/2+20,box.y+box.height/2+10);
      await pet.evaluate(type=>document.querySelector('#pet').dispatchEvent(new PointerEvent(type,{bubbles:true})),type);
      await pet.evaluate(()=>window.petAPI.getState());
      const stopped=await position();
      await app.evaluate(()=>{globalThis.dragCursor.x+=30;});
      await send('move');await pet.mouse.up();
      assert.deepEqual(await position(),stopped,`${type} stops native movement`);
      assert.equal(await pet.locator('#pet').evaluate(el=>el.classList.contains('dragging')),false);
      assert.equal((await pet.evaluate(()=>window.petAPI.setSize('medium'))).ok,true,`${type} releases drag lock`);
      assert.equal(await pet.locator('#pet').getAttribute('data-action'),'','cancelled gesture never clicks');
    }
    console.log('PASS: native cursor delta, stationary cursor with shifted renderer events, both directions, release/cancel/lost capture, persistence and renderer gesture.');
  }finally{if(app)await app.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

