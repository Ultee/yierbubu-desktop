const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'salary-pet-bubble-'));let app;
  const env={...process.env,SALARY_PET_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
  try{
    app=await electron.launch(process.env.SALARY_PET_EXECUTABLE?{executablePath:process.env.SALARY_PET_EXECUTABLE,args:[],env}:{args:[path.resolve('.')],env});
    const pet=app.windows().find(p=>p.url().endsWith('pet.html'))??await app.waitForEvent('window',p=>p.url().endsWith('pet.html'));
    await pet.waitForLoadState('domcontentloaded');
    for(const size of ['small','medium','large'])for(const width of [320,1200]){
      await pet.evaluate(size=>window.petAPI.setSize(size),size);
      await app.evaluate(({BrowserWindow},width)=>{
        const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html'));
        w.setBounds({...w.getBounds(),width});
        w.webContents.send('speech','小林，再撑一会儿就下班啦，秒薪还在给你攒着呢，我陪你到最后一秒～');
      },width);
      await pet.locator('#speech').waitFor({state:'visible'});
      const layout=await pet.evaluate(()=>{
        const el=document.querySelector('#speech'),style=getComputedStyle(el),box=el.getBoundingClientRect(),p=document.querySelector('#pet').getBoundingClientRect();
        return {characters:(box.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-2)/parseFloat(style.fontSize),center:box.x+box.width/2,petCenter:p.x+p.width/2,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,height:box.height,lineHeight:parseFloat(style.lineHeight)};
      });
      assert.ok(Math.abs(layout.characters-15)<=.1,`speech must stay about 15 Chinese characters wide: ${JSON.stringify({size,width,layout})}`);
      assert.ok(Math.abs(layout.center-layout.petCenter)<1,'speech must stay centered above pet');
      assert.equal(layout.scrollWidth,layout.clientWidth,'long text must wrap without horizontal scrolling');
      assert.ok(layout.height>=layout.lineHeight*2,'long sentence must span multiple lines');
    }
    await pet.evaluate(()=>window.petAPI.setSize('medium'));
    await fs.mkdir('test-results',{recursive:true});await pet.screenshot({path:'test-results/bubble-15-characters.png',omitBackground:true});
    console.log('PASS: 15-character centered bubble wraps in all three pet sizes and normal/wide windows.');
  }finally{if(app)await app.close();await fs.rm(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
