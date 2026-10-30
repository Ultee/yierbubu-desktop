const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'salary-pet-package-'));
  let app;
  try{
    const env={...process.env,SALARY_PET_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch({executablePath:process.env.SALARY_PET_EXECUTABLE||path.resolve('../release/SalaryPet-win32-x64/SalaryPet.exe'),args:[],env});
    const form=app.windows().find(p=>p.url().endsWith('settings.html'))??await app.waitForEvent('window',p=>p.url().endsWith('settings.html'));
    await form.locator('#salary').waitFor();assert.equal(await form.locator('#salary').inputValue(),'');
    // Keep setup away from the user's running always-on-top pet during GUI input.
    await app.evaluate(({BrowserWindow,screen})=>{const area=screen.getPrimaryDisplay().workArea;BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('settings.html')).setPosition(area.x+12,area.y+12);});
    const state=await form.evaluate(()=>window.petAPI.getState());assert.equal(state.config,null);
    const info=await app.evaluate(({app})=>({packaged:app.isPackaged,path:app.getAppPath()}));
    assert.equal(info.packaged,true);assert.match(info.path,/app\.asar$/);
    assert.equal(await app.evaluate(({app})=>app.getVersion()),'1.3.2');
    await form.locator('#salary').fill('10000');await form.locator('#pet-size').selectOption('large');await form.locator('#action-heart').uncheck();await form.locator('#save').click();
    await form.locator('#notice').filter({hasText:'已保存'}).waitFor();
    const pet=app.windows().find(p=>p.url().endsWith('pet.html'));
    await pet.waitForFunction(()=>document.querySelector('#pet').getBoundingClientRect().width===234);
    await app.close();
    app=await electron.launch({executablePath:process.env.SALARY_PET_EXECUTABLE||path.resolve('../release/SalaryPet-win32-x64/SalaryPet.exe'),args:[],env});
    const restored=await app.firstWindow();await restored.waitForLoadState('domcontentloaded');
    const saved=await restored.evaluate(()=>window.petAPI.getState());
    assert.equal(saved.config.salaryCents,1000000);assert.equal(saved.preferences.size,'large');assert.equal(saved.preferences.actions.includes('heart'),false);assert.equal(saved.preferences.actions.length,5);
    console.log('PASS: packaged v1.3.2 EXE launches from app.asar with empty salary, saves preferences and restores salary/size/action toggles on restart.');
  }finally{if(app)await app.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
