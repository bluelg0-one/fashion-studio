import test from 'node:test';
import assert from 'node:assert/strict';
import {studio} from './studio.js';
const image='data:image/png;base64,aGVsbG8=';
test('status exposes only credential presence',async()=>{assert.deepEqual(await studio('status',{},{}),{configured:false,openai:false,photoroom:false,claude:false,googleClientId:null});assert.deepEqual(await studio('status',{}, {OPENAI_API_KEY:'test-only',PHOTOROOM_API_KEY:'test-only'}),{configured:true,openai:true,photoroom:true,claude:false,googleClientId:null});assert.equal((await studio('status',{},{GOOGLE_CLIENT_ID:'123-abc.apps.googleusercontent.com'})).googleClientId,'123-abc.apps.googleusercontent.com');assert.equal((await studio('status',{},{GOOGLE_CLIENT_ID:'<script>'})).googleClientId,null);});
test('missing key fails before upstream call',async()=>{await assert.rejects(studio('edit',{image},{},()=>{throw Error('unexpected request')}),{status:503});});
test('rejects URLs and oversized input',async()=>{for(const input of ['https://example.com/p.png','data:image/png;base64,'+'a'.repeat(9*1024*1024)])await assert.rejects(studio('edit',{image:input},{OPENAI_API_KEY:'test-only'}),{status:400});});
test('upstream credentials and errors do not leak',async()=>{await assert.rejects(studio('edit',{image},{OPENAI_API_KEY:'test-only'},async()=>({ok:false,status:401,json:async()=>({error:{message:'sensitive upstream text'}})})),e=>e.status===401&&!e.message.includes('sensitive'));});
test('analysis accepts copy without unreliable crop coordinates',async()=>{const copy={headline:'제목',description:'설명',points:['줄무늬']};const result=await studio('analyze',{image},{OPENAI_API_KEY:'test-only'},async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(copy)}]}]})}));assert.deepEqual(result,copy);});
test('image edit requests restrained wrinkle correction, high fidelity and color preservation',async()=>{
 let form;
 await studio('edit',{image},{OPENAI_API_KEY:'test-only'},async(url,options)=>{form=options.body;return {ok:true,json:async()=>({data:[{b64_json:'cG5n'}]})};});
 assert.equal(form.get('input_fidelity'),'high');assert.equal(form.get('background'),'transparent');assert.match(form.get('prompt'),/Gently reduce only distracting accidental creases/);assert.match(form.get('prompt'),/never blow out highlights or change the actual garment color/);assert.match(form.get('prompt'),/Preserve the view and crop/);
});
import {cutoutBounds} from '../src/utils/detailCrops.js';
test('cutout bounds follow the foreground',()=>{
 const width=100,height=100,data=new Uint8ClampedArray(width*height*4);
 for(let y=20;y<90;y++)for(let x=30;x<70;x++)data[(y*width+x)*4+3]=255;
 assert.deepEqual(cutoutBounds({data,width,height}),{x:.3,y:.2,w:.4,h:.7});
});
test('opaque or empty results are not accepted as transparent cutouts',()=>{
 for(const alpha of [0,255]){const data=new Uint8ClampedArray(400).fill(alpha);assert.throws(()=>cutoutBounds({data,width:10,height:10}));}
});

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
test('presets use one Photoroom call: AI ironing feature plus editWithAI prompt',async()=>{
 const calls=[];
 await studio('retouch',{image,options:{presets:['iron','straighten','bogus'],custom:'라벨 숨기기',lighting:true}},env,async(url,o)=>{calls.push(o);return imageResponse();});
 assert.equal(calls.length,1);const f=calls[0].body;
 assert.equal(f.get('ironing.mode'),'ai.auto');assert.equal(calls[0].headers['pr-ironing-model-version'],'v2');
 assert.equal(f.get('lighting.mode'),'ai.preserve-hue-and-saturation');assert.equal(f.get('editWithAI.mode'),'ai.auto');assert.equal(f.get('removeBackground'),'true');
 const p=f.get('editWithAI.prompt');
 assert.match(p,/do not change its color, pattern/);assert.match(p,/upright/);assert.match(p,/라벨 숨기기/);assert.doesNotMatch(p,/ironed/);assert.doesNotMatch(p,/symmetrical/);
});
test('ironing alone needs no prompt',async()=>{
 const calls=[];
 await studio('retouch',{image,options:{presets:['iron']}},env,async(url,o)=>{calls.push(o);return imageResponse();});
 assert.equal(calls.length,1);assert.equal(calls[0].body.get('ironing.mode'),'ai.auto');assert.equal(calls[0].body.get('editWithAI.mode'),null);
});
test('openai engine edits the Photoroom cutout',async()=>{
 const urls=[];
 const r=await studio('retouch',{image,options:{presets:['symmetry'],engine:'openai'}},env,async(url,o)=>{urls.push(url);return url.includes('openai')?{ok:true,json:async()=>({data:[{b64_json:'cG5n'}]})}:imageResponse();});
 assert.deepEqual(urls,['https://image-api.photoroom.com/v2/edit','https://api.openai.com/v1/images/edits']);assert.equal(r.image,'data:image/png;base64,cG5n');
});
test('failed prompt step keeps the cutout and reports a warning',async()=>{
 const forms=[];
 const r=await studio('retouch',{image,options:{presets:['symmetry']}},env,async(url,o)=>{forms.push(o.body);return forms.length===1?{ok:false,status:400,json:async()=>({detail:'unknown argument'})}:imageResponse();});
 assert.equal(forms.length,2);assert.equal(forms[1].get('editWithAI.mode'),null);
 assert.equal(r.image,'data:image/webp;base64,d2VicA==');assert.match(r.warning,/unknown argument/);
});
test('missing Photoroom key and Photoroom errors are explained',async()=>{
 await assert.rejects(studio('retouch',{image},{OPENAI_API_KEY:'x'},()=>{throw Error('unexpected')}),{status:503});
 await assert.rejects(studio('retouch',{image},env,async()=>({ok:false,status:402,json:async()=>({detail:'no credits'})})),e=>e.status===402&&/크레딧/.test(e.message)&&!e.message.includes('pr-test'));
});
test('credits reads the Photoroom balance without editing',async()=>{
 let call;
 const r=await studio('credits',{},env,async(url,o)=>{call={url,o};return {ok:true,json:async()=>({images:{available:7,subscription:10},plan:'x'})};});
 assert.equal(call.url,'https://image-api.photoroom.com/v2/account');assert.equal(call.o.method,undefined);assert.deepEqual(r,{available:7,subscription:10});
});
test('shopee copy keeps seller data as data and returns title/description',async()=>{
 let sent;
 const r=await studio('shopee',{garment:'긴팔티셔츠',headline:'스트라이프 티',product:'면 100%',image},env,async(url,o)=>{sent=JSON.parse(o.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'{"title":"Women\'s Striped Tee","description":"Soft stripes"}'}]}]})};});
 assert.deepEqual(r,{title:"Women's Striped Tee",description:'Soft stripes'});
 const text=sent.input[0].content[0].text;assert.match(text,/Never invent material/);assert.match(text,/면 100%/);assert.equal(sent.input[0].content[1].type,'input_image');
 await assert.rejects(studio('shopee',{},{PHOTOROOM_API_KEY:'x'}),{status:503});
});
test('plain cutout asks for HD background removal and keeps resolution flag off',async()=>{
 let call;
 const r=await studio('retouch',{image,options:{center:true}},env,async(url,o)=>{call=o;return imageResponse();});
 assert.equal(call.headers['pr-hd-background-removal'],'auto');assert.equal(call.body.get('shadow.mode'),null);assert.equal(r.lowResolution,undefined);
});
test('shadow uses the 2026-04-15 model with upright pose',async()=>{
 let call;
 await studio('retouch',{image,options:{shadow:true}},env,async(url,o)=>{call=o;return imageResponse();});
 assert.equal(call.headers['pr-ai-shadows-model-version'],'2026-04-15');assert.equal(call.body.get('shadow.mode'),'ai.auto-with-overrides');assert.equal(call.body.get('shadow.subjectPoseOverride'),'upright');
});
test('ghost mannequin is sent alone and flagged as 1K',async()=>{
 const calls=[];
 const r=await studio('retouch',{image,options:{mannequin:'ghost',presets:['iron'],shadow:true}},env,async(url,o)=>{calls.push(o);return imageResponse();});
 assert.equal(calls.length,1);const f=calls[0].body;
 assert.equal(f.get('ghostMannequin.mode'),'ai.auto');assert.equal(f.get('ghostMannequin.size'),'PORTRAIT_HD_4_3');
 assert.equal(f.get('ironing.mode'),null);assert.equal(f.get('shadow.mode'),null);assert.equal(f.get('removeBackground'),null);assert.equal(r.lowResolution,true);
});
test('flat lay uses square output; editWithAI prompts are flagged as 1K, ironing alone is not',async()=>{
 let call;
 await studio('retouch',{image,options:{mannequin:'flatlay'}},env,async(url,o)=>{call=o;return imageResponse();});
 assert.equal(call.body.get('flatLay.mode'),'ai.auto');assert.equal(call.body.get('flatLay.size'),'SQUARE_HD');
 const iron=await studio('retouch',{image,options:{presets:['iron']}},env,async()=>imageResponse());assert.equal(iron.lowResolution,undefined);
 const sym=await studio('retouch',{image,options:{presets:['symmetry']}},env,async()=>imageResponse());assert.equal(sym.lowResolution,true);
});
