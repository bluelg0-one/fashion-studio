import test from 'node:test';
import assert from 'node:assert/strict';
import {isOpaque, alphaFromWhite} from '../src/utils/alpha.js';
import {removeStand} from '../src/utils/stand.js';
// 흰 배경 위 옷(가운데 사각형, 안에 흰 무늬) + 아래에서 올라오는 검은 기둥
function photo(w=300,h=400) {
 const data=new Uint8ClampedArray(w*h*4).fill(255);
 const set=(x,y,[r,g,b])=>{const i=(y*w+x)*4;data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=255;};
 for(let y=40;y<280;y++)for(let x=80;x<220;x++)set(x,y,[180,60,70]);
 for(let y=120;y<140;y++)for(let x=130;x<170;x++)set(x,y,[255,255,255]); // 옷 안의 흰 무늬(가장자리와 안 이어짐)
 for(let y=280;y<h;y++)for(let x=146;x<154;x++)set(x,y,[25,25,25]);   // 받침대 기둥
 return {data,width:w,height:h};
}
const a=(p,x,y)=>p.data[(y*p.width+x)*4+3];
test('white-background cutout gets its alpha back; white inside the garment stays',()=>{
 const p=photo();assert.equal(isOpaque(p),true);
 assert.ok(alphaFromWhite(p)>0);assert.equal(isOpaque(p),false);
 assert.equal(a(p,2,2),0);assert.equal(a(p,150,130),255,'옷 안 흰 무늬 유지');assert.equal(a(p,150,200),255);
 assert.ok(a(p,80,150)<=200,'옷 가장자리는 부드럽게');
});
test('after restoring alpha the stand pole can be removed like a BiRefNet cutout',()=>{
 const p=photo();alphaFromWhite(p);
 assert.ok(removeStand(p));assert.equal(a(p,150,380),0,'기둥 지움');assert.equal(a(p,150,200),255,'옷은 유지');
});
test('does nothing when white background would swallow almost everything (white garment touching edges)',()=>{
 const w=50,h=50,p={data:new Uint8ClampedArray(w*h*4).fill(255),width:w,height:h};
 assert.equal(alphaFromWhite(p),0);assert.equal(isOpaque(p),true);
});
