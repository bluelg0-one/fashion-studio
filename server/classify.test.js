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
test('batched classification: earlier garments are sent as references R1.. and matches come back with the browser id (mock)',async()=>{
 const client=fake({garments:[{id:'R1',description:'중복'},{id:'g1',description:'네이비 니트'}],photos:[{index:1,garment:'R1',shot:'back',confidence:.9,review:false,note:''},{index:2,garment:'g1',shot:'front',confidence:.9,review:false,note:''}]});
 const r=await classifyPhotos({photos:[{id:'a',image:img},{id:'b',image:img}],references:[{id:'G-7',description:'핑크 후드 "니트"',image:img}]},{},client);
 const c=client.calls[0].messages[0].content;
 assert.equal(c[0].text,'Reference R1: "핑크 후드 \\"니트\\""');assert.equal(c[1].type,'image');assert.equal(c[2].text,'Photo 1');
 assert.match(c.at(-1).text,/set its garment to that reference id/);
 assert.deepEqual(r.garments,[{id:'g1',description:'네이비 니트'}],'참고 옷은 새 옷 목록에서 빠짐');
 assert.deepEqual(r.photos.map(p=>[p.id,p.garment,Boolean(p.reference)]),[['a','G-7',true],['b','g1',false]]);
 const plain=fake({garments:[],photos:[]});await classifyPhotos({photos:[{id:'a',image:img}]},{},plain);
 assert.doesNotMatch(plain.calls[0].messages[0].content.at(-1).text,/Reference garments/,'참고 없으면 지시도 없음');
 await assert.rejects(classifyPhotos({photos:[{id:'a',image:img}],references:Array.from({length:25},(_,i)=>({id:'G'+i,image:img}))},{},plain),{status:400});
});
test('hanger v2 mode: front/back/unknown only, hanger instructions, duplicate fronts become review (mock)',async()=>{
 const client=fake({garments:[{id:'g1',description:'아이보리 가디건'}],photos:[{index:1,garment:'g1',shot:'front',confidence:.95,review:false,note:''},{index:2,garment:'g1',shot:'front',confidence:.9,review:false,note:''},{index:3,garment:'g1',shot:'back',confidence:.9,review:false,note:''},{index:4,garment:'g1',shot:'unknown',confidence:.9,review:false,note:''}]});
 const r=await classifyPhotos({mode:'hanger',photos:[1,2,3,4].map(i=>({id:'p'+i,image:img}))},{},client);
 const t=client.calls[0].messages[0].content.at(-1).text;
 assert.match(t,/on a hanger/);assert.match(t,/- back: the back of the garment on the hanger/);assert.doesNotMatch(t,/frontZoom|mannequin/);
 const schema=JSON.stringify(client.calls[0].output_config.format);assert.match(schema,/"front","back","unknown"/);assert.doesNotMatch(schema,/frontZoom/);
 assert.deepEqual(r.photos.map(p=>[p.id,p.shot,p.review]),[['p1','front',true],['p2','front',true],['p3','back',false],['p4','unknown',true]]);
 assert.match(r.photos[0].note,/정면 사진이 2장/);
 const old=fake({garments:[],photos:[]});await classifyPhotos({photos:[{id:'a',image:img}]},{},old);
 assert.match(old.calls[0].messages[0].content.at(-1).text,/mannequin/,'mode 없으면 예전 지시');
});
import {findDetailBoxes} from './classify.js';
test('014 detail boxes (mock): only the asked parts, present=false kept, boxes clamped, low effort, usage returned',async()=>{
 const client=fake({details:[{id:'cuff',present:true,x0:120,y0:900,x1:80,y1:1100,note:'왼쪽 소매'},{id:'placket',present:false,x0:0,y0:0,x1:0,y1:0,note:'여밈 없음'},{id:'hem',present:true,x0:1,y0:1,x1:900,y1:999,note:'안 물어봄'}]});
 const r=await findDetailBoxes({image:img,width:1200,height:1600,ids:['cuff','placket','bogus']},{},client);
 const p=client.calls[0],t=p.messages[0].content.at(-1).text;
 assert.match(t,/1200x1600/);assert.match(t,/- cuff:/);assert.match(t,/- placket:/);assert.doesNotMatch(t,/- hem:|bogus/);assert.match(t,/nothing is generated/);
 assert.equal(p.output_config.effort,'low');
 assert.deepEqual(r.details.cuff,{present:true,x0:80,x1:120,y0:900,y1:1000,note:'왼쪽 소매'});
 assert.deepEqual(r.details.placket,{present:false,note:'여밈 없음'});assert.equal(r.details.hem,undefined);
 assert.deepEqual(r.usage,{input_tokens:10,output_tokens:5,cache_read_input_tokens:0,cache_creation_input_tokens:0});
 await assert.rejects(findDetailBoxes({image:img,ids:[]},{},client),{status:400});
 await assert.rejects(findDetailBoxes({image:img,ids:['cuff']},{}),{status:503});
});
