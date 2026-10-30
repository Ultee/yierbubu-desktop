import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProactivePolicy} from '../src/ai-proactive.ts';
import {normalizeAIConfig} from '../src/ai-config.ts';
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
test('old AI settings default to thirty minutes and custom interval rejects invalid input',()=>{
  assert.equal(normalizeAIConfig({proactive:'occasional'}).proactiveIntervalMinutes,30);
  for(const minutes of [1,10,20,1440])assert.equal(normalizeAIConfig({proactiveIntervalMinutes:minutes}).proactiveIntervalMinutes,minutes);
  for(const minutes of [0,-1,1.5,1441,'10',null,NaN,Infinity])assert.throws(()=>normalizeAIConfig({proactiveIntervalMinutes:minutes}),/间隔/);
});
test('custom intervals determine first and following proactive calls at ten and twenty minutes',()=>{
  for(const minutes of [10,20]){
    const policy=new ProactivePolicy(),period=minutes*60000;
    assert.equal(policy.tick('occasional','working',0,minutes),false);
    for(let now=10000;now<period*2;now+=10000)assert.equal(policy.tick('occasional','working',now,minutes),now===period);
    assert.equal(policy.tick('occasional','working',period*2,minutes),true);
  }
});
