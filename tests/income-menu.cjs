const assert=require('node:assert/strict');
// Observe the real native popup, then invoke its production menu handler.
// This avoids relying on OS menu keyboard coordinates at different Windows DPI.
async function toggleIncome(application,pet){
  await application.evaluate(({Menu})=>{
    if(!globalThis.__salaryOriginalPopup){
      globalThis.__salaryOriginalPopup=Menu.prototype.popup;
      Menu.prototype.popup=function(...args){globalThis.__salaryPopup=this;return globalThis.__salaryOriginalPopup.apply(this,args);};
    }
    globalThis.__salaryPopup=null;
  });
  await pet.locator('#pet').click({button:'right'});
  const selected=await application.evaluate(()=>{
    const popup=globalThis.__salaryPopup,item=popup?.items.find(item=>item.label==='查看');
    if(!item){popup?.closePopup();return false;}
    item.click();popup.closePopup();return true;
  });
  assert.equal(selected,true,'right-click menu must include 查看');
}
module.exports={toggleIncome};
