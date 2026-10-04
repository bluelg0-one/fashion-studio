import test from 'node:test';
import assert from 'node:assert/strict';
import {studio} from './studio.js';
const image='data:image/png;base64,aGVsbG8=';
test('status exposes only credential presence',async()=>{assert.deepEqual(await studio('status',{},{}),{configured:false});assert.deepEqual(await studio('status',{}, {OPENAI_API_KEY:'test-only'}),{configured:true});});
test('missing key fails before upstream call',async()=>{await assert.rejects(studio('edit',{image},{},()=>{throw Error('unexpected request')}),{status:503});});
test('rejects URLs and oversized input',async()=>{for(const input of ['https://example.com/p.png','data:image/png;base64,'+'a'.repeat(9*1024*1024)])await assert.rejects(studio('edit',{image:input},{OPENAI_API_KEY:'test-only'}),{status:400});});
test('upstream credentials and errors do not leak',async()=>{await assert.rejects(studio('edit',{image},{OPENAI_API_KEY:'test-only'},async()=>({ok:false,status:401,json:async()=>({error:{message:'sensitive upstream text'}})})),e=>e.status===401&&!e.message.includes('sensitive'));});
test('analysis rejects invented invalid crop coordinates',async()=>{const copy={headline:'제목',description:'설명',points:['단추'],details:[{label:'단추',x:0.2,y:0.3,w:0.2,h:0.2},{label:'잘못된 영역',x:-1,y:0,w:1,h:1}]};const result=await studio('analyze',{image},{OPENAI_API_KEY:'test-only'},async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(copy)}]}]})}));assert.equal(result.details.length,1);});
