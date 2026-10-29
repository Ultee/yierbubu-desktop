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
    app=await electron.launch({executablePath:path.resolve('../release/SalaryPet-win32-x64/SalaryPet.exe'),args:[],env});
    const form=app.windows().find(p=>p.url().endsWith('settings.html'))??await app.waitForEvent('window',p=>p.url().endsWith('settings.html'));
    await form.locator('#salary').waitFor();assert.equal(await form.locator('#salary').inputValue(),'');
    const state=await form.evaluate(()=>window.petAPI.getState());assert.equal(state.config,null);
    const info=await app.evaluate(({app})=>({packaged:app.isPackaged,path:app.getAppPath()}));
    assert.equal(info.packaged,true);assert.match(info.path,/app\.asar$/);
    console.log('PASS: packaged EXE launches from app.asar with empty salary and functional isolated bridge.');
  }finally{if(app)await app.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
