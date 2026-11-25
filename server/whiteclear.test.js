import test from 'node:test';
import assert from 'node:assert/strict';
import {clearWhite, rgbToLab, labToRgb} from '../src/utils/colorMatch.js';
// 니트 결이 있는 옷(밝기 ±6) 합성. lab = 옷 바탕색
function garment(lab,{w=200,h=200,button=null}={}) {
  const data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(x<20){data[i+3]=0;continue;}
    const t=((x>>1)+(y>>2))%2?6:-6;let c=labToRgb(lab[0]+t,lab[1],lab[2]);
    if(button&&Math.hypot(x-100,y-100)<10)c=labToRgb(...button);
    data.set([...c,255],i);}
  return {width:w,height:h,data};
}
const meanLab=(img,pred=()=>true)=>{let s=[0,0,0],n=0;for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){const i=(y*img.width+x)*4;if(img.data[i+3]<200||!pred(x,y))continue;const l=rgbToLab(img.data[i],img.data[i+1],img.data[i+2]);s=s.map((v,k)=>v+l[k]);n++;}return s.map(v=>v/n);};
test('013-B: dingy white gets clearer (yellow cast reduced), ivory stays ivory, brightness lifted at most +3',()=>{
  const rows=[];
  for(const [name,lab] of [['탁한 흰색',[86,1,8]],['아이보리',[88,0,15]],['밝은 회색',[78,0,3]]]){
    const img=garment(lab),before=meanLab(img),r=clearWhite(img),after=meanLab(img);
    rows.push(`${name}: L ${before[0].toFixed(1)}→${after[0].toFixed(1)}, b ${before[2].toFixed(1)}→${after[2].toFixed(1)}`);
    assert.equal(r.applied,true,name);
    assert.ok(after[0]-before[0]<=3.2&&after[0]>=before[0],`${name} 밝기 ${before[0]}→${after[0]}`);
    assert.ok(Math.abs(after[2]-before[2])<=5.1,`${name} 색 이동은 최대 5`);
    if(name==='탁한 흰색')assert.ok(after[2]<before[2]-3,'누런 기가 줄어야 함');
    if(name==='아이보리')assert.ok(after[2]>9,`아이보리는 아이보리로 남음: b ${after[2]}`);
  }
  console.log('# '+rows.join(' | '));
});
test('013-B: colourful or dark garments are untouched; a coloured button on a white garment keeps its colour',()=>{
  for(const lab of [[52,40,7],[30,0,2],[70,-10,30]]){const img=garment(lab),copy=new Uint8ClampedArray(img.data);assert.equal(clearWhite(img).applied,false);assert.deepEqual(img.data,copy);}
  const img=garment([86,1,8],{button:[45,30,40]}),inside=(x,y)=>Math.hypot(x-100,y-100)<6,b0=meanLab(img,inside);clearWhite(img);const b1=meanLab(img,inside);
  assert.ok(Math.hypot(b1[1]-b0[1],b1[2]-b0[2])<.5,'갈색 단추 색 유지');
});
