import type {Status} from './core.ts';
export class ProactivePolicy {
  private previous:Status|undefined;
  private lastTick:number|undefined;
  private lastSpeech:number|undefined;
  reset(){this.previous=undefined;this.lastTick=undefined;this.lastSpeech=undefined;}
  tick(mode:'off'|'schedule'|'occasional',status:Status,now:number):boolean {
    const previous=this.previous,lastTick=this.lastTick;
    this.previous=status;this.lastTick=now;
    if(lastTick===undefined||now-lastTick>60000||now<lastTick){this.lastSpeech=now;return false;}
    if(mode==='off'){this.lastSpeech=now;return false;}
    const due=mode==='schedule'?status!==previous&&['working','lunch','finished'].includes(status):['working','lunch'].includes(status)&&now-(this.lastSpeech??now)>=1800000;
    if(due)this.lastSpeech=now;
    return due;
  }
}
