const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'salary-pet-features-'));let app;
  try{
    const env={...process.env,SALARY_PET_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch({args:[path.resolve('.')],env});
    const form=app.windows().find(p=>p.url().endsWith('settings.html'))??await app.waitForEvent('window',p=>p.url().endsWith('settings.html'));
    form.setDefaultTimeout(6000);await form.locator('#salary').fill('10000');
    await form.locator('#pet-size').selectOption('small');await form.locator('#action-clap').uncheck();await form.locator('#save').click();await form.locator('#notice').filter({hasText:'已保存'}).waitFor();
    const pet=app.windows().find(p=>p.url().endsWith('pet.html'));pet.setDefaultTimeout(6000);
    await pet.waitForFunction(()=>document.querySelector('#pet').getBoundingClientRect().width===135);
    const prefs=await form.evaluate(()=>window.petAPI.getState());assert.equal(prefs.preferences.size,'small');assert.equal(prefs.preferences.actions.includes('clap'),false);
    const font=await pet.locator('#earned').evaluate(el=>getComputedStyle(el).fontSize);
    for(const [size,width,height] of [['small',135,315],['medium',180,350],['large',234,392]]){
      assert.equal((await pet.evaluate(size=>window.petAPI.setSize(size),size)).ok,true);
      await pet.waitForFunction(width=>document.querySelector('#pet').getBoundingClientRect().width===width,width);
      assert.equal(await pet.locator('#earned').evaluate(el=>getComputedStyle(el).fontSize),font);
      const bounds=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')).getBounds());assert.ok(Math.abs(bounds.width-320)<=1);assert.ok(Math.abs(bounds.height-height)<=1);
    }
    await form.waitForFunction(()=>document.querySelector('#pet-size').value==='large',{},{timeout:2000});
    assert.equal(await form.locator('#action-clap').isChecked(),false,'size sync must preserve other form edits');
    assert.equal((await pet.evaluate(()=>window.petAPI.setSize('giant'))).ok,false);
    // A failed write must preserve preferences, and a successful retry must recover.
    await fs.mkdir(path.join(profile,'settings.json.tmp'));
    assert.equal((await pet.evaluate(()=>window.petAPI.setSize('medium'))).ok,false);
    const failed=await pet.evaluate(()=>window.petAPI.getState());assert.equal(failed.preferences.size,'large');assert.ok(failed.warning);
    await fs.rmdir(path.join(profile,'settings.json.tmp'));
    await pet.evaluate(()=>window.petAPI.setSize('medium'));
    assert.equal((await pet.evaluate(()=>window.petAPI.getState())).warning,'','successful retry must clear the transient write warning');
    await form.locator('#close').click();
    const clock=async hour=>{
      await app.evaluate((_electron,hour)=>{
        globalThis.__petNativeDate??=Date;globalThis.__petClock=new globalThis.__petNativeDate(2026,9,30,hour,30).getTime();
        globalThis.Date=class extends globalThis.__petNativeDate{constructor(...args){super(...(args.length?args:[globalThis.__petClock]));}static now(){return globalThis.__petClock;}};
      },hour);
    };
    await fs.mkdir('test-results',{recursive:true});
    for(const [hour,activity] of [[10,'typing'],[12,'sleeping'],[19,'waving']]){
      await clock(hour);await pet.waitForFunction(a=>document.querySelector('#pet').dataset.activity===a,activity);
      await pet.mouse.move(2,2);await pet.locator('#card').waitFor({state:'hidden'});
      await pet.screenshot({path:`test-results/scene-${activity}.png`,omitBackground:true});
      if(activity==='sleeping')assert.equal(await pet.locator('.sleep-z').evaluate(el=>getComputedStyle(el).display)!=='none',true);
    }
    await pet.locator('#pet').hover();await pet.locator('#open-settings').click();
    const settings=app.windows().find(p=>p.url().endsWith('settings.html'))??await app.waitForEvent('window',p=>p.url().endsWith('settings.html'));await settings.locator('#salary').waitFor();
    // One enabled action makes each screenshot deterministic; random selection is unit tested.
    for(const action of ['heart','wave','clap','nod','shy','stretch']){
      await settings.evaluate(async action=>{const s=await window.petAPI.getState();await window.petAPI.save(s.config,{...s.preferences,actions:[action]});},action);
      await pet.waitForFunction(action=>document.querySelector('#pet').dataset.enabledActions===action,action);
      await pet.locator('#pet').click();await pet.waitForFunction(action=>document.querySelector('#pet').dataset.action===action,action);
      await pet.mouse.move(2,2);await pet.locator('#card').waitFor({state:'hidden'});
      // Capture a visible middle frame rather than the initial animation pose.
      await new Promise(resolve=>setTimeout(resolve,350));
      await pet.screenshot({path:`test-results/action-${action}.png`,omitBackground:true});
      await pet.waitForFunction(()=>document.querySelector('#pet').dataset.action==='');
      assert.equal(await pet.locator('#pet').getAttribute('data-activity'),'waving');
    }
    await settings.locator('#toggle-actions').click(); // Turn currently enabled action off.
    await settings.locator('#save').click();await settings.locator('#notice').filter({hasText:'已保存'}).waitFor();
    await pet.waitForFunction(()=>document.querySelector('#pet').dataset.enabledActions==='');
    await pet.locator('#pet').click();assert.equal(await pet.locator('#pet').getAttribute('data-action'),'');
    await settings.locator('#toggle-actions').click();await settings.locator('#save').click();await settings.locator('#notice').filter({hasText:'已保存'}).waitFor();await settings.locator('#close').click();
    await pet.waitForFunction(()=>document.querySelector('#pet').dataset.enabledActions.split(',').length===6);
    await pet.mouse.move(2,2);await pet.locator('#card').waitFor({state:'hidden'});
    const box=await pet.locator('#pet').boundingBox();await pet.mouse.move(box.x+box.width/2,box.y+box.height/2);await pet.mouse.down();await pet.mouse.move(box.x+box.width/2-30,box.y+box.height/2-20,{steps:6});await pet.mouse.up();
    assert.equal(await pet.locator('#pet').getAttribute('data-action'),'','drag must not trigger action');
    // Two gestures in the same animation frame must cancel the queued click reaction.
    await pet.locator('#pet').hover();
    await pet.evaluate(()=>document.querySelector('#pet').addEventListener('pointerdown',e=>{globalThis.__pointer={pointerId:e.pointerId,screenX:e.screenX,screenY:e.screenY,button:0,bubbles:true};},{once:true}));
    await pet.mouse.down();
    await pet.evaluate(()=>{
      const el=document.querySelector('#pet'),origin=globalThis.__pointer;
      el.dispatchEvent(new PointerEvent('pointerup',origin));
      el.dispatchEvent(new PointerEvent('pointerdown',origin));
      const moved={...origin,screenX:origin.screenX-25,screenY:origin.screenY-15};
      el.dispatchEvent(new PointerEvent('pointermove',moved));
      el.dispatchEvent(new PointerEvent('pointerup',moved));
    });
    await pet.mouse.up();
    await pet.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await pet.locator('#pet').getAttribute('data-action'),'','drag must cancel a reaction queued by an earlier tap');
    await pet.evaluate(()=>window.petAPI.setSize('large'));
    await app.close();app=await electron.launch({args:[path.resolve('.')],env});const restarted=await app.firstWindow();await restarted.waitForLoadState('domcontentloaded');
    const restored=await restarted.evaluate(()=>window.petAPI.getState());assert.equal(restored.preferences.size,'large');assert.equal(restored.preferences.actions.length,6);assert.equal(restored.config.salaryCents,1000000);
    console.log('PASS: schedule scenes, six click actions, per-action toggles, all-off, drag separation, size layout, security validation and restart.');
  }finally{if(app)await app.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
