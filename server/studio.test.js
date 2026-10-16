import test from 'node:test';
import assert from 'node:assert/strict';
import {studio} from './studio.js';
const image='data:image/png;base64,aGVsbG8=';
test('status exposes only credential presence',async()=>{assert.deepEqual(await studio('status',{},{}),{configured:false});assert.deepEqual(await studio('status',{}, {OPENAI_API_KEY:'test-only'}),{configured:true});});
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
