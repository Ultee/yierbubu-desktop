import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProactivePolicy} from '../src/ai-proactive.ts';
test('schedule speech occurs only on live transitions and never at startup or after long suspension',()=>{
  const policy=new ProactivePolicy();
  assert.equal(policy.tick('schedule','working',1000),false);
  assert.equal(policy.tick('schedule','lunch',11000),true);
  assert.equal(policy.tick('schedule','lunch',21000),false);
  assert.equal(policy.tick('schedule','working',31000),true);
  assert.equal(policy.tick('schedule','finished',8*3600000),false);
});
test('occasional speech respects cooldown, off and rest days',()=>{
  const policy=new ProactivePolicy();
  assert.equal(policy.tick('occasional','working',0),false);
  for(let t=10000;t<1800000;t+=10000)assert.equal(policy.tick('occasional','working',t),false);
  assert.equal(policy.tick('occasional','working',1800000),true);
  assert.equal(policy.tick('occasional','rest',1810000),false);
  assert.equal(policy.tick('off','lunch',1820000),false);
  assert.equal(policy.tick('occasional','lunch',1830000),false);
});
test('schedule edits reset the baseline without causing a paid proactive greeting',()=>{
  const policy=new ProactivePolicy();
  policy.tick('schedule','rest',0);
  policy.reset();
  assert.equal(policy.tick('schedule','working',10000),false);
  assert.equal(policy.tick('schedule','lunch',20000),true);
});
