import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPhotos} from './classify.js';
const img='data:image/jpeg;base64,aGVsbG8=';
const fake=(parsed,extra={})=>{const calls=[];return {calls,beta:{messages:{parse:async p=>{calls.push(p);return {stop_reason:'end_turn',parsed_output:parsed,model:'claude-opus-5-5',usage:{input_tokens:10,output_tokens:5},...extra};}}}};};
test('sends numbered images with the classification instructions and fallbacks',async()=>{
 const client=fake({garments:[{id:'g1',description:'카키 브이넥'}],photos:[{index:1,garment:'g1',shot:'front',confidence:.95,review:false,note:''},{index:2,garment:'g1',shot:'fabric',confidence:.4,review:false,note:'원단 접사'}]});
 const r=await classifyPhotos({photos:[{id:'a',image:img},{id:'b',image:img}]},{},client);
 const p=client.calls[0];
 assert.equal(p.model,'claude-opus-5-5');assert.equal(p.fallbacks,'default');assert.deepEqual(p.betas,['server-side-fallback-2026-07-01']);assert.equal(p.output_config.effort,'medium');
 const c=p.messages[0].content;assert.equal(c[0].text,'Photo 1');assert.equal(c[1].type,'image');assert.equal(c[1].source.media_type,'image/jpeg');assert.match(c.at(-1).text,/Group photos that show the same physical garment/);
 assert.deepEqual(r.photos.map(x=>[x.id,x.shot,x.review]),[['a','front',false],['b','fabric',true]],'low confidence becomes review');
});
test('missing or duplicated photos come back as review/unknown',async()=>{
 const client=fake({garments:[{id:'g1',description:'x'}],photos:[{index:1,garment:'g1',shot:'front',confidence:.9,review:false,note:''},{index:1,garment:'g1',shot:'back',confidence:.9,review:false,note:''}]});
 const r=await classifyPhotos({photos:[{id:'a',image:img},{id:'b',image:img}]},{},client);
 assert.equal(r.photos.length,2);assert.equal(r.photos.find(x=>x.id==='a').shot,'front');const b=r.photos.find(x=>x.id==='b');assert.equal(b.shot,'unknown');assert.equal(b.review,true);
});
test('input validation and missing key',async()=>{
 await assert.rejects(classifyPhotos({photos:[]},{ANTHROPIC_API_KEY:'x'}),{status:400});
 await assert.rejects(classifyPhotos({photos:[{id:'a',image:'https://x/y.jpg'}]},{ANTHROPIC_API_KEY:'x'}),{status:400});
 await assert.rejects(classifyPhotos({photos:[{id:'a',image:img}]},{}),{status:503});
 await assert.rejects(classifyPhotos({photos:[{id:'a',image:img}]},{},fake(null,{stop_reason:'refusal'})),{status:422});
});
import {findDefects} from './classify.js';
test('defect finder sends one image with size, clamps and filters boxes',async()=>{
 const client=fake({regions:[{type:'stain',x0:480,y0:180,x1:500,y1:195,confidence:.9,note:'목 얼룩'},{type:'wrinkle',x1:300,y1:780,x0:380,y0:760,confidence:.7,note:'구김'},{type:'lint',x0:10,y0:10,x1:11,y1:11,confidence:.5,note:'점'},{type:'other',x0:-5,y0:990,x1:20,y1:1200,confidence:2,note:''}]});
 const r=await findDefects({image:img,width:1024,height:1365},{},client);
 const t=client.calls[0].messages[0].content.at(-1).text;assert.match(t,/1024x1365/);assert.match(t,/NOT designed folds/);
 assert.equal(r.regions.length,3,'tiny box dropped');
 assert.deepEqual(r.regions[1],{type:'wrinkle',x0:300,y0:760,x1:380,y1:780,confidence:.7,note:'구김'},'swapped corners fixed');
 assert.deepEqual([r.regions[2].x0,r.regions[2].y1,r.regions[2].confidence],[0,1000,1]);
 await assert.rejects(findDefects({image:'x'},{ANTHROPIC_API_KEY:'k'}),{status:400});
});
