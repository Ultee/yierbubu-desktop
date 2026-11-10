import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePreferences,chooseAction,activityFor,Gesture,petLayout} from '../src/pet-behavior.ts';

test('only enabled actions are selected and consecutive repeats are avoided',()=>{
  assert.equal(chooseAction(['heart','wave'],'heart',()=>0),'wave');
  assert.equal(chooseAction(['heart','wave'],'wave',()=>.99),'heart');
  assert.equal(chooseAction(['stretch'],'stretch',()=>0),'stretch');
  assert.equal(chooseAction([],null,()=>.5),null);
  assert.equal(chooseAction(['heart','wave','clap'],null,()=>.99),'clap');
});
test('old settings gain medium size and default enabled interactions; all-off remains off',()=>{
  const defaults=normalizePreferences(undefined);
  assert.equal(defaults.size,'medium');assert.equal(defaults.actions.length,6);assert.equal(defaults.wander,false);
  assert.deepEqual(defaults.outfits,{yier:{head:null,face:null,neck:null,body:null,hand:null},bubu:{head:null,face:null,neck:null,body:null,hand:null}});
  assert.deepEqual(normalizePreferences({size:'small',actions:[]}),{size:'small',actions:[],wander:false,outfits:defaults.outfits});
  assert.equal(normalizePreferences({size:'giant',actions:['wave','wave','shell']} ).size,'medium');
  assert.deepEqual(normalizePreferences({actions:['wave','wave','shell']}).actions,['wave']);
  assert.equal(normalizePreferences({wander:true}).wander,true);
  assert.equal(normalizePreferences({wander:'yes'}).wander,false);
  assert.equal(normalizePreferences({outfits:{yier:{head:'beanie'}}}).outfits?.yier?.head,'beanie');
  assert.equal(normalizePreferences({outfits:{yier:{head:'unknown'}}}).outfits?.yier?.head,null);
});
test('schedule status selects typing, lying asleep or waving without changing income',()=>{
  assert.equal(activityFor('working'),'typing');assert.equal(activityFor('lunch'),'sleeping');
  assert.equal(activityFor('finished'),'waving');
  for(const status of ['unconfigured','empty','rest','before'] as const)assert.equal(activityFor(status),'idle');
});
test('drag threshold distinguishes taps from drags even after returning to origin',()=>{
  const tap=new Gesture(100,100);assert.equal(tap.move(102,102),false);assert.equal(tap.finish(),true);
  const drag=new Gesture(100,100);assert.equal(drag.move(107,100),true);drag.move(100,100);assert.equal(drag.finish(),false);
  const cancelled=new Gesture(100,100);assert.equal(cancelled.finish(true),false);
});
test('each size keeps income card unchanged and reserves separate pet and card space',()=>{
  assert.deepEqual(petLayout('small'),{width:320,height:315,petWidth:135,petHeight:105,cardBottom:107});
  assert.deepEqual(petLayout('medium'),{width:320,height:350,petWidth:180,petHeight:140,cardBottom:142});
  assert.deepEqual(petLayout('large'),{width:320,height:392,petWidth:234,petHeight:182,cardBottom:184});
});
