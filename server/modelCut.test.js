import test from 'node:test';
import assert from 'node:assert/strict';
import {compositionOf, COMPOSITIONS, faceCrop, cropInfo, modelCutRow, baseSlotOf} from '../src/utils/modelCut.js';
// 017 모델컷 구도·자동 자르기(합성 이미지). FASHN·Google 호출 없음.
const SKIN=[224,172,140],TOP=[60,80,140],PANTS=[40,40,45];
function person({W=600,H=800,face=true,faceTo=.22,neckTo=.28}={}){
 const data=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,cx=x-W/2;let c=[255,255,255];
  if(face&&y>=H*.04&&y<H*faceTo&&Math.abs(cx)<W*.12)c=SKIN;            // 얼굴
  else if(face&&y>=H*faceTo&&y<H*neckTo&&Math.abs(cx)<W*.05)c=SKIN;    // 목
  else if(y>=H*neckTo&&y<H*.6&&Math.abs(cx)<W*.25)c=TOP;               // 상의
  else if(y>=H*.6&&Math.abs(cx)<W*.2)c=PANTS;                           // 바지
  data.set([...c,255],i);}
 return {width:W,height:H,data};
}
test('017 composition from garment type: tops → upper body without face, pants → lower body, shorts → to the knee, dress → shoulders to hem',()=>{
 assert.deepEqual(['long-top','short-top','vest','long-pants','short-pants','dress'].map(compositionOf),['top','top','top','bottom','shorts','dress']);
 for(const c of ['top','bottom','shorts','dress']){assert.match(COMPOSITIONS[c].prompt,/no face/);assert.equal(COMPOSITIONS[c].face,false);}
 assert.match(COMPOSITIONS.top.prompt,/below the chin/);assert.match(COMPOSITIONS.bottom.prompt,/waist down to the ankles/);assert.match(COMPOSITIONS.shorts.prompt,/below the knees/);assert.match(COMPOSITIONS.dress.prompt,/shoulders down/);
 assert.equal(baseSlotOf('shorts'),'bottom');assert.equal(baseSlotOf('dress'),'dress');
});
test('017 auto crop: a face at the top is cut just below the chin (top/dress) or below the upper body (bottom); no face → no crop',()=>{
 const p=person(),H=p.height;
 const t=faceCrop(p,'top');assert.ok(t.face&&t.review);
 assert.ok(t.cropTop>=H*.18&&t.cropTop<=H*.27,`상반신 자르는 높이 ${t.cropTop/H}`);   // 얼굴 끝(22%)~목 끝(28%) 근처
 const d=faceCrop(p,'dress');assert.equal(d.cropTop,t.cropTop);
 const b=faceCrop(p,'bottom');assert.ok(b.cropTop>=H*.42,`하반신 ${b.cropTop/H}`);
 const none=faceCrop(person({face:false}),'top');assert.deepEqual([none.face,none.cropTop,none.review],[false,0,false]);
 const full=faceCrop(p,'full');assert.equal(full.cropTop,0,'전신 구도는 자르지 않음');
});
test('017 crop size: aspect after cropping and a low-resolution warning under 1000px long side',()=>{
 const a=cropInfo(1536,2048,512);assert.deepEqual([a.width,a.height,a.lowRes],[1536,1536,false]);
 const b=cropInfo(768,1024,400);assert.equal(b.height,624);assert.ok(b.lowRes);assert.match(b.note,/해상도 부족/);
});
test('017 model cut cost row (estimated unit price per engine; reuse costs nothing)',()=>{
 const f=modelCutRow({engine:'fashn',product:'니트',cut:'정면',images:2}),g=modelCutRow({engine:'google',images:1}),c=modelCutRow({engine:'google',cached:true});
 assert.equal(f.feature,'modelcut');assert.equal(f.cost_usd,0.15);assert.equal(g.cost_usd,0.06);assert.equal(c.cost_usd,0);assert.equal(c.calls,0);
});
import {fashnMode, tryonInputs, newerBase, TRYON_CATEGORY} from '../src/utils/modelCut.js';
test('018 fixed model: a base photo for the composition → FASHN try-on (person + garment, category by composition); none → create a new model',()=>{
 const base={top:'data:image/jpeg;base64,P'};
 assert.equal(fashnMode(base,'top'),'fixed');assert.equal(fashnMode(base,'bottom'),'create');assert.equal(fashnMode({bottom:'x'},'shorts'),'fixed','반바지는 하반신 칸');
 assert.deepEqual(tryonInputs({person:'P',garment:'G',composition:'dress',samples:9}),{model_image:'P',garment_image:'G',category:'one-pieces',num_samples:4,output_format:'jpeg'});
 assert.equal(tryonInputs({person:'P',garment:'G',composition:'top'}).category,'tops');assert.equal(TRYON_CATEGORY.shorts,'bottoms');
 assert.ok(!('face_reference' in tryonInputs({person:'P',garment:'G',composition:'top'})),'얼굴 고정 없음');
});
test('018 base photos sync: the side changed last (at) wins between this browser and Drive',()=>{
 const local={top:'L',at:100},remote={top:'R',bottom:'R2',at:200};
 assert.deepEqual(newerBase(local,remote),{top:'R',bottom:'R2',dress:undefined,at:200});
 assert.equal(newerBase({top:'L',at:300},remote).top,'L');assert.equal(newerBase(local,null),local);
});
