import test from 'node:test';
import assert from 'node:assert/strict';
import {studio,STAIN_PROMPT} from './studio.js';
// 2차 보정 유료 대체(Photoroom) 요청 형식 검사. 실제 Photoroom은 부르지 않습니다(모의 request).
const png='data:image/png;base64,'+Buffer.from('fakepng').toString('base64');
const env={PHOTOROOM_API_KEY:'pr-test'};
const mock=calls=>async(url,o)=>{calls.push({url,form:Object.fromEntries([...o.body.entries()].filter(([k])=>k!=='imageFile')),headers:o.headers});
 return {ok:true,headers:new Headers({'content-type':'image/webp'}),arrayBuffer:async()=>new TextEncoder().encode('webp').buffer};};
test('wrinkles: one Photoroom call with AI Ironing on the existing transparent cutout, original size and position kept',async()=>{
 const calls=[];const r=await studio('retouch2',{image:png,options:{iron:true}},env,mock(calls));
 assert.equal(calls.length,1);const {form,headers}=calls[0];
 assert.equal(form['ironing.mode'],'ai.auto');assert.equal(headers['pr-ironing-model-version'],'v2');
 assert.equal(form.keepExistingAlphaChannel,'auto');assert.equal(form.referenceBox,'originalImage');assert.equal(form.outputSize,'originalImage');
 assert.equal(form['editWithAI.mode'],undefined,'얼룩 AI는 기본 꺼짐');assert.equal(r.lowResolution,undefined);
 assert.match(r.image,/^data:image\/webp;base64,/);
});
test('stains (opt-in): ironing and Edit With AI go in the SAME call ($0.10 once), flagged as 1K / generative',async()=>{
 const calls=[];const r=await studio('retouch2',{image:png,options:{iron:true,stains:true}},env,mock(calls));
 assert.equal(calls.length,1,'한 번의 호출');assert.equal(calls[0].form['editWithAI.mode'],'ai.auto');assert.equal(calls[0].form['editWithAI.prompt'],STAIN_PROMPT);
 assert.match(STAIN_PROMPT,/do not change its color, pattern, knit texture/);assert.equal(r.lowResolution,true);
});
test('needs the server key, a transparent 1st-stage image and at least one task',async()=>{
 await assert.rejects(studio('retouch2',{image:png,options:{}},{},mock([])),{status:503});
 await assert.rejects(studio('retouch2',{image:'data:image/jpeg;base64,AAAA',options:{}},env,mock([])),{status:400});
 await assert.rejects(studio('retouch2',{image:png,options:{iron:false,stains:false}},env,mock([])),{status:400});
});
