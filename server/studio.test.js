import test from 'node:test';
import assert from 'node:assert/strict';
import {studio} from './studio.js';
const image='data:image/png;base64,aGVsbG8=';
test('status exposes only credential presence',async()=>{assert.deepEqual(await studio('status',{},{}),{configured:false,openai:false,photoroom:false});assert.deepEqual(await studio('status',{}, {OPENAI_API_KEY:'test-only',PHOTOROOM_API_KEY:'test-only'}),{configured:true,openai:true,photoroom:true});});
test('missing key fails before upstream call',async()=>{await assert.rejects(studio('edit',{image},{},()=>{throw Error('unexpected request')}),{status:503});});
test('rejects URLs and oversized input',async()=>{for(const input of ['https://example.com/p.png','data:image/png;base64,'+'a'.repeat(9*1024*1024)])await assert.rejects(studio('edit',{image:input},{OPENAI_API_KEY:'test-only'}),{status:400});});
test('upstream credentials and errors do not leak',async()=>{await assert.rejects(studio('edit',{image},{OPENAI_API_KEY:'test-only'},async()=>({ok:false,status:401,json:async()=>({error:{message:'sensitive upstream text'}})})),e=>e.status===401&&!e.message.includes('sensitive'));});
test('analysis accepts copy without unreliable crop coordinates',async()=>{const copy={headline:'제목',description:'설명',points:['줄무늬']};const result=await studio('analyze',{image},{OPENAI_API_KEY:'test-only'},async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(copy)}]}]})}));assert.deepEqual(result,copy);});
test('image edit requests restrained wrinkle correction, high fidelity and color preservation',async()=>{
 let form;
 await studio('edit',{image},{OPENAI_API_KEY:'test-only'},async(url,options)=>{form=options.body;return {ok:true,json:async()=>({data:[{b64_json:'cG5n'}]})};});
 assert.equal(form.get('input_fidelity'),'high');assert.equal(form.get('background'),'transparent');assert.match(form.get('prompt'),/Gently reduce only distracting accidental creases/);assert.match(form.get('prompt'),/never blow out highlights or change the actual garment color/);assert.match(form.get('prompt'),/Preserve the view and crop/);
});
import {cutoutBounds,defaultDetails,clampCrop} from '../src/utils/detailCrops.js';
test('detail regions follow the foreground instead of background coordinates',()=>{
 const width=100,height=100,data=new Uint8ClampedArray(width*height*4);
 for(let y=20;y<90;y++)for(let x=30;x<70;x++)data[(y*width+x)*4+3]=255;
 const bounds=cutoutBounds({data,width,height});assert.deepEqual(bounds,{x:.3,y:.2,w:.4,h:.7});
 for(const d of defaultDetails(bounds)){assert.ok(d.x>=.3&&d.x+d.w<=.7);assert.ok(d.y>=.2&&d.y+d.h<=.9);}
});
test('opaque or empty results are not accepted as transparent cutouts',()=>{
 for(const alpha of [0,255]){const data=new Uint8ClampedArray(400).fill(alpha);assert.throws(()=>cutoutBounds({data,width:10,height:10}));}
});
test('user crop controls stay inside the image',()=>{assert.deepEqual(clampCrop({x:.9,y:-1,w:.5,h:2}),{x:.5,y:0,w:.5,h:1});});

const env={PHOTOROOM_API_KEY:'pr-test',OPENAI_API_KEY:'oa-test'};
const imageResponse=()=>({ok:true,headers:new Headers({'content-type':'image/webp'}),arrayBuffer:async()=>new TextEncoder().encode('webp').buffer});
test('retouch without prompts makes one Photoroom cutout call with centering',async()=>{
 const calls=[];
 const result=await studio('retouch',{image,options:{center:true,presets:[],custom:''}},env,async(url,o)=>{calls.push({url,o});return imageResponse();});
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://image-api.photoroom.com/v2/edit');
 assert.equal(calls[0].o.headers['x-api-key'],'pr-test');
 const f=calls[0].o.body;assert.equal(f.get('removeBackground'),'true');assert.equal(f.get('horizontalAlignment'),'center');assert.equal(f.get('lighting.mode'),null);assert.ok(f.get('imageFile'));
 assert.equal(result.image,'data:image/webp;base64,d2VicA==');assert.equal(result.warning,undefined);
});
test('selected presets and custom prompt go to the AI step with preservation text',async()=>{
 const forms=[];
 await studio('retouch',{image,options:{presets:['iron','clean','bogus'],custom:'라벨 숨기기',engine:'photoroom'}},env,async(url,o)=>{forms.push(o.body);return imageResponse();});
 assert.equal(forms.length,2);const p=forms[1].get('describeAnyChange.prompt');
 assert.match(p,/do not change its color, pattern/);assert.match(p,/ironed/);assert.match(p,/dust/);assert.match(p,/라벨 숨기기/);assert.doesNotMatch(p,/symmetrical/);
});
test('openai engine edits the Photoroom cutout',async()=>{
 const urls=[];
 const r=await studio('retouch',{image,options:{presets:['symmetry'],engine:'openai'}},env,async(url,o)=>{urls.push(url);return url.includes('openai')?{ok:true,json:async()=>({data:[{b64_json:'cG5n'}]})}:imageResponse();});
 assert.deepEqual(urls,['https://image-api.photoroom.com/v2/edit','https://api.openai.com/v1/images/edits']);assert.equal(r.image,'data:image/png;base64,cG5n');
});
test('failed prompt step keeps the cutout and reports a warning',async()=>{
 let n=0;
 const r=await studio('retouch',{image,options:{presets:['iron']}},env,async()=>++n===1?imageResponse():{ok:false,status:400,json:async()=>({detail:'unknown argument'})});
 assert.equal(r.image,'data:image/webp;base64,d2VicA==');assert.match(r.warning,/unknown argument/);
});
test('missing Photoroom key and Photoroom errors are explained',async()=>{
 await assert.rejects(studio('retouch',{image},{OPENAI_API_KEY:'x'},()=>{throw Error('unexpected')}),{status:503});
 await assert.rejects(studio('retouch',{image},env,async()=>({ok:false,status:402,json:async()=>({detail:'no credits'})})),e=>e.status===402&&/크레딧/.test(e.message)&&!e.message.includes('pr-test'));
});
