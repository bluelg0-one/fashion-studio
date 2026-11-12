import test from 'node:test';
import assert from 'node:assert/strict';
import {rgbToLab,labToRgb,dominantLab,colorShift,applyShift} from '../src/utils/colorMatch.js';
const img=(w,h,fill)=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=fill(x,y);data.set(c,(y*w+x)*4);}return {data,width:w,height:h};};
test('lab round trip stays within 1 level',()=>{for(const c of [[0,0,0],[255,255,255],[86,94,62],[200,30,40],[128,128,128]]){const back=labToRgb(...rgbToLab(...c));back.forEach((v,i)=>assert.ok(Math.abs(v-c[i])<=1,`${c} -> ${back}`));}});
test('dominant color ignores transparent pixels and a white mannequin',()=>{
 // 40% 투명, 25% 흰 마네킹, 35% 카키 옷
 const im=img(100,100,(x)=>x<40?[0,0,0,0]:x<65?[240,238,232,255]:[86,94,62,255]);
 const d=dominantLab(im),k=rgbToLab(86,94,62);
 assert.ok(Math.abs(d.L-k[0])<1&&Math.abs(d.a-k[1])<1&&Math.abs(d.b-k[2])<1);
});
test('white garments are still measured when nearly everything is white',()=>{const d=dominantLab(img(50,50,()=>[245,245,243,255]));assert.ok(d.L>95);});
test('shift moves the target dominant color onto the reference and is capped',()=>{
 const ref=img(60,60,()=>[86,94,62,255]),target=img(60,60,(x)=>x<10?[0,0,0,0]:[100,104,64,255]);
 const s=colorShift(dominantLab(target),dominantLab(ref),1);applyShift(target,s);
 const after=dominantLab(target),want=dominantLab(ref);
 assert.ok(Math.abs(after.L-want.L)<1.5&&Math.abs(after.a-want.a)<1.5&&Math.abs(after.b-want.b)<1.5,JSON.stringify({after,want}));
 assert.equal(target.data[3],0,'transparent pixels untouched');
 const big=colorShift({L:20,a:-40,b:40},{L:90,a:40,b:-40},1);assert.deepEqual(big,{L:14,a:12,b:-12});
 assert.deepEqual(colorShift({L:50,a:0,b:0},{L:60,a:4,b:-4},.5),{L:5,a:2,b:-2});
});
test('too few garment pixels is reported',()=>{assert.throws(()=>dominantLab(img(5,5,()=>[0,0,0,0])),/옷 영역/);});
