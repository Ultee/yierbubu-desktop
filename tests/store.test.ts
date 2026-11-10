import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.ts';
import {normalizePreferences} from '../src/pet-behavior.ts';
const config={version:1 as const,salaryCents:800000,weekdays:[1,2,3,4,5],start:'09:00',end:'18:00',lunch:null,overrides:{}};
test('real disk roundtrip preserves validated configuration and window position',()=>{
  const dir=mkdtempSync(join(tmpdir(),'salary-pet-'));
  try{const s=new Store(dir);assert.equal(s.load().config,null);s.save({config,position:{x:-20,y:44}});assert.deepEqual(new Store(dir).load(),{config,position:{x:-20,y:44},preferences:normalizePreferences(undefined),warning:''});}finally{rmSync(dir,{recursive:true,force:true});}
});
test('appearance preferences survive restart and legacy files keep salary and schedule',()=>{
  const dir=mkdtempSync(join(tmpdir(),'salary-pet-'));
  try{
    writeFileSync(join(dir,'settings.json'),JSON.stringify({version:1,config,position:{x:10,y:20}}));
    const s=new Store(dir),legacy=s.load();assert.equal(legacy.config?.salaryCents,800000);assert.equal(legacy.preferences.size,'medium');assert.equal(legacy.preferences.actions.length,6);
    s.save({...legacy,preferences:{size:'large',actions:['heart','stretch']}});
    assert.deepEqual(new Store(dir).load().preferences,normalizePreferences({size:'large',actions:['heart','stretch']}));
    s.save({...legacy,preferences:{size:'small',actions:[]}});assert.deepEqual(new Store(dir).load().preferences.actions,[]);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('corrupt source remains untouched and recovers after explicit save',()=>{
  const dir=mkdtempSync(join(tmpdir(),'salary-pet-'));
  try{writeFileSync(join(dir,'settings.json'),'broken salary data');const s=new Store(dir);assert.match(s.load().warning,/损坏/);assert.equal(readFileSync(join(dir,'settings.json'),'utf8'),'broken salary data');s.save({config,position:null});assert.equal(readFileSync(join(dir,'settings.corrupt.json'),'utf8'),'broken salary data');assert.equal(s.load().config?.salaryCents,800000);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('failed temporary write leaves previous settings readable',()=>{
  const dir=mkdtempSync(join(tmpdir(),'salary-pet-'));
  try{const s=new Store(dir);s.save({config,position:null});mkdirSync(join(dir,'settings.json.tmp'));assert.throws(()=>s.save({config:{...config,salaryCents:900000},position:null}));assert.equal(s.load().config?.salaryCents,800000);}finally{rmSync(dir,{recursive:true,force:true});}
});
