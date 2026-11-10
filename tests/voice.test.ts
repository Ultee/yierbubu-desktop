import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeVoiceConfig} from '../src/voice-config.ts';
import {VoiceService} from '../src/voice-service.ts';

const cipher={available:()=>true,encrypt:(text:string)=>Buffer.from(text),decrypt:(buffer:Buffer)=>buffer.toString()};
function setup(){
  const dir=mkdtempSync(join(tmpdir(),'salary-pet-voice-')),samples=join(dir,'voice');
  mkdirSync(samples);writeFileSync(join(samples,'yier.mp3'),'yier-sample');writeFileSync(join(samples,'bubu.mp3'),'bubu-sample');
  return {dir,samples,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
const audioResponse=(bytes='fake-audio')=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{audio:{data:Buffer.from(bytes).toString('base64')}}}]}),{status:200,headers:{'content-type':'application/json'}});
const uploadAudio='data:audio/mpeg;base64,'+Buffer.from('custom-sample').toString('base64');

test('voice config defaults to Qwen and validates provider, volume and speed',()=>{
  assert.deepEqual(normalizeVoiceConfig(undefined),{provider:'qwen',enabled:false,volume:.8,speed:1,qwenWorkspace:'',qwenModel:'cosyvoice-v3.5-flash'});
  assert.deepEqual(normalizeVoiceConfig({provider:'mimo',enabled:true,volume:.35,speed:1.2}),{provider:'mimo',enabled:true,volume:.35,speed:1.2,qwenWorkspace:'',qwenModel:'cosyvoice-v3.5-flash'});
  assert.throws(()=>normalizeVoiceConfig({provider:'other'}));
  assert.throws(()=>normalizeVoiceConfig({volume:1.3}));
  assert.throws(()=>normalizeVoiceConfig({speed:2.1}));
  assert.throws(()=>normalizeVoiceConfig({qwenWorkspace:'bad.workspace'}));
});

test('MiMo adapter sends a DataURL sample and caches identical lines',async()=>{
  const {dir,samples,cleanup}=setup(),original=globalThis.fetch;
  const calls:any[]=[];
  globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{
    calls.push(JSON.parse(String(init?.body)));
    return audioResponse();
  }) as typeof fetch;
  try{
    const service=new VoiceService(dir,cipher,samples);
    service.save({provider:'mimo',enabled:true,volume:.8,speed:1},'mimo-key');
    const first=await service.speak('yier','你好呀');
    assert.equal(first.ok,true);assert.equal(first.audio,Buffer.from('fake-audio').toString('base64'));
    assert.equal(calls.length,1);assert.equal(calls[0].model,'mimo-v2.5-tts-voiceclone');
    assert.equal(calls[0].messages[0].role,'assistant');assert.equal(calls[0].messages[0].content,'你好呀');
    assert.match(calls[0].audio.voice,/^data:audio\/mpeg;base64,/);
    const cached=await service.speak('yier','你好呀');
    assert.equal(cached.ok,true);assert.equal(calls.length,1);
    const buddy=await service.speak('bubu','你好呀');
    assert.equal(buddy.ok,true);assert.equal(calls.length,2);assert.notEqual(calls[0].audio.voice,calls[1].audio.voice);
    const state=service.getState();assert.equal(state.config.provider,'mimo');assert.equal(state.keys.mimo,true);assert.equal(state.keys.qwen,false);
  }finally{globalThis.fetch=original;cleanup();}
});

test('Qwen creates built-ins, uploads a custom voice, applies and deletes with fallback',async()=>{
  const {dir,samples,cleanup}=setup(),original=globalThis.fetch;
  const calls:{url:string;body:any;headers:any}[]=[];
  globalThis.fetch=(async(url:unknown,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body)),target=String(url);
    calls.push({url:target,body,headers:init?.headers});
    if(target.endsWith('/customization')){
      if(body.input.action==='create_voice')return new Response(JSON.stringify({output:{voice_id:`vid-${body.input.prefix}`,status:'OK'}}),{status:200});
      if(body.input.action==='delete_voice')return new Response(JSON.stringify({output:{}}),{status:200});
      if(body.input.action==='query_voice')return new Response(JSON.stringify({output:{status:'OK'}}),{status:200});
    }
    if(target.endsWith('/SpeechSynthesizer'))return new Response(JSON.stringify({output:{audio:{data:Buffer.from('qwen-audio').toString('base64')}}}),{status:200});
    throw new Error(`unexpected ${target}`);
  }) as typeof fetch;
  try{
    const service=new VoiceService(dir,cipher,samples);
    service.save({provider:'qwen',enabled:true,volume:.8,speed:1.25,qwenWorkspace:'ws_test',qwenModel:'cosyvoice-v3.5-flash'},'qwen-key');
    const before=await service.speak('yier','你好');
    assert.equal(before.ok,false);assert.match(before.error??'',/内置音色/);
    const builtins=await service.createQwenVoices();
    assert.equal(builtins.ok,true,builtins.error??'');assert.equal(builtins.created,2);
    let state=service.getState();
    assert.equal(state.library.builtins.every(item=>item.ready),true);
    assert.equal(state.library.assignments.yier,'builtin:yier');
    const custom=await service.createCustomVoice({name:'测试音色',target:'both',audio:uploadAudio});
    assert.equal(custom.ok,true,custom.error??'');
    state=service.getState();
    assert.equal(state.library.custom.length,1);assert.equal(state.library.custom[0]?.name,'测试音色');
    const customId=state.library.custom[0]!.id;
    assert.equal(state.library.assignments.yier,customId);assert.equal(state.library.assignments.bubu,customId);
    const speak=await service.speak('yier','你好','coquettish');
    assert.equal(speak.ok,true);assert.equal(speak.audio,Buffer.from('qwen-audio').toString('base64'));
    const synth=calls.find(call=>call.url.endsWith('/SpeechSynthesizer'))!;
    assert.equal(synth.body.model,'cosyvoice-v3.5-flash');assert.equal(synth.body.input.text,'你好');
    assert.equal(synth.body.input.rate,1.25);assert.match(synth.body.input.instruction,/撒娇/);assert.match(synth.body.input.voice,/^vid-/);assert.equal(synth.headers.Authorization,'Bearer qwen-key');
    const wrong=await service.assignVoice('builtin:yier','bubu');assert.equal(wrong.ok,false);
    const builtinDelete=await service.deleteVoice('builtin:yier');assert.equal(builtinDelete.ok,false);assert.match(builtinDelete.error??'',/不可删除/);
    const synthCount=calls.filter(call=>call.url.endsWith('/SpeechSynthesizer')).length;
    service.save({provider:'qwen',enabled:true,volume:.8,speed:.9,qwenWorkspace:'ws_test',qwenModel:'cosyvoice-v3.5-flash'});
    await service.speak('yier','你好');
    assert.ok(calls.filter(call=>call.url.endsWith('/SpeechSynthesizer')).length>synthCount,'speed change must invalidate cache');
    const deleted=await service.deleteVoice(customId);
    assert.equal(deleted.ok,true,deleted.error??'');
    state=service.getState();
    assert.equal(state.library.custom.length,0);assert.equal(state.library.assignments.yier,'builtin:yier');assert.equal(state.library.assignments.bubu,'builtin:bubu');
    assert.ok(calls.some(call=>call.url.endsWith('/customization')&&call.body.input.action==='delete_voice'));
  }finally{globalThis.fetch=original;cleanup();}
});

test('Qwen cannot be enabled without key or workspace, and v2 Qwen voices require rebuilding',async()=>{
  const {dir,samples,cleanup}=setup();
  try{
    const service=new VoiceService(dir,cipher,samples);
    assert.throws(()=>service.save({provider:'qwen',enabled:true,volume:.8,speed:1,qwenWorkspace:'ws_test'}));
    writeFileSync(join(dir,'voice-settings.json'),JSON.stringify({version:2,config:{provider:'qwen',enabled:false,volume:.8,qwenWorkspace:'ws_test',qwenModel:'cosyvoice-v3.5-flash'},encryptedKeys:{qwen:Buffer.from('qwen-key').toString('base64')},qwenVoices:{yier:'old-yier',bubu:'old-bubu'},qwenVoiceModel:'cosyvoice-v3.5-flash'}));
    const migrated=new VoiceService(dir,cipher,samples);
    const state=migrated.getState();
    assert.equal(state.config.speed,1);assert.equal(state.keys.qwen,true);assert.equal(state.library.builtins.every(item=>!item.ready),true);assert.match(state.warning,/内置音色/);
  }finally{cleanup();}
});
