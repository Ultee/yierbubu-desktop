import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, validateConfig } from '../src/core.ts';

const config = {version:1, salaryCents:1000000, weekdays:[1,2,3,4,5], start:'09:00', end:'18:00', lunch:{start:'12:00',end:'13:00'}, overrides:{}};
const at = (day:number,hour:number,minute=0) => new Date(2026,9,day,hour,minute);

test('October weekdays produce 633600 effective seconds and correct displayed cents', () => {
  const s = snapshot(validateConfig(config),at(29,18));
  assert.equal(s.monthSeconds,633600); assert.equal(s.earnedCents,45455);
  assert.equal(s.status,'finished'); assert.equal(s.remainingSeconds,0);
  assert.ok(Math.abs(s.rate!-0.0157828282828)<1e-10);
});
test('work boundaries and lunch clamp elapsed seconds without rounding rate', () => {
  for (const [h,m,elapsed,status] of [[8,59,0,'before'],[9,0,0,'working'],[12,0,10800,'lunch'],[12,30,10800,'lunch'],[13,0,10800,'working'],[18,0,28800,'finished'],[23,0,28800,'finished']] as const) {
    const s=snapshot(validateConfig(config),at(29,h,m));
    assert.equal(s.elapsedSeconds,elapsed); assert.equal(s.status,status);
  }
  assert.equal(snapshot(validateConfig(config),at(29,12,30)).earnedCents,17045);
});
test('date overrides take priority for Saturday work and weekday holidays', () => {
  const c=validateConfig({...config,overrides:{'2026-10-29':false,'2026-10-31':true}});
  assert.equal(snapshot(c,at(29,18)).earnedCents,0);
  assert.equal(snapshot(c,at(31,18)).earnedCents,45455);
  assert.equal(snapshot(validateConfig(config),at(31,18)).status,'rest');
});
test('leap February, cross-month and cross-day use fresh local calendar', () => {
  const c=validateConfig(config);
  assert.equal(snapshot(c,new Date(2024,1,29,18)).monthSeconds,604800);
  assert.equal(snapshot(c,new Date(2026,10,2,18)).monthSeconds,604800);
  assert.equal(snapshot(c,new Date(2026,9,30,0)).earnedCents,0);
  assert.equal(snapshot(c,at(29,14)).earnedCents,snapshot(c,at(29,14)).earnedCents);
});
test('zero scheduled month and unconfigured state never divide by zero', () => {
  const overrides=Object.fromEntries(Array.from({length:31},(_,i)=>[`2026-10-${String(i+1).padStart(2,'0')}`,false]));
  const s=snapshot(validateConfig({...config,overrides}),at(29,14));
  assert.equal(s.status,'empty'); assert.equal(s.rate,null); assert.equal(s.earnedCents,0);
  assert.equal(snapshot(null,at(29,14)).status,'unconfigured');
});
test('no lunch keeps full shift and salary changes recalculate immediately', () => {
  const s=snapshot(validateConfig({...config,lunch:null,salaryCents:2000000}),at(29,18));
  assert.equal(s.monthSeconds,712800); assert.equal(s.earnedCents,90909);
});
test('reject invalid money, schedule, calendar overrides and untrusted input', () => {
  for(const change of [{salaryCents:0},{salaryCents:Infinity},{salaryCents:1.2},{salaryCents:Number.MAX_SAFE_INTEGER},{weekdays:[]},{weekdays:[7]},{start:'25:00'},{end:'08:00'},{lunch:{start:'08:00',end:'13:00'}},{lunch:{start:'13:00',end:'12:00'}},{overrides:{'2026-02-30':true}},{overrides:{'2026-10-29':'true'}},{version:2}])
    assert.throws(()=>validateConfig({...config,...change}));
  assert.throws(()=>validateConfig(null));
});
