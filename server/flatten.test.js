import test from 'node:test';
import assert from 'node:assert/strict';
import {planFixes, flattenShadows, inspectFix, mergeSpots, fillTransparent, regionMask, garmentShare} from '../src/utils/flatten.js';
import {rgbToLab} from '../src/utils/colorMatch.js';

// 합성 니트: 분홍 옷(코 무늬 4px 주기) + 가운데에 비스듬한 어두운 구김 그림자 + 위쪽 가운데 흰 마네킹 목 + 바깥은 투명
const W=300,H=300;
function knit({shadow=22}={}) {
  const data=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=(y*W+x)*4;
    if(x<30||x>=270||y>=285){data[i+3]=0;continue;}
    const neck=Math.abs(x-150)<25&&y<45;
    let rgb=neck?[226,222,214]:[214,120,140];
    const stitch=((x>>1)+(y>>2))%2?10:-10;               // 니트 코(고주파)
    const d=Math.abs((y-150)-(x-150)*.4)/8,s=neck?0:shadow*Math.exp(-d*d); // 구김 그림자(저주파 줄)
    rgb=rgb.map(v=>v+stitch-s);
    data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
  }
  return {width:W,height:H,data};
}
const box=(x0,y0,x1,y1,type='wrinkle')=>({type,x0,y0,x1,y1,confidence:.9});
const labAt=(img,x,y)=>{const i=(y*img.width+x)*4;return rgbToLab(img.data[i],img.data[i+1],img.data[i+2]);};
// 구김 줄 위·밖의 평균 밝기, 코 무늬의 세기(가로 이웃 차이)
function measure(img) {
  let on=0,off=0,no=0,nf=0,tex=0,nt=0;
  for(let y=110;y<190;y++)for(let x=110;x<190;x++){
    const L=labAt(img,x,y)[0],d=Math.abs((y-150)-(x-150)*.4);
    if(d<3){on+=L;no++;}else if(d>25){off+=L;nf++;}
    tex+=Math.abs(L-labAt(img,x+2,y)[0]);nt++;
  }
  return {shadow:off/nf-on/no,texture:tex/nt};
}

test('routing: wrinkles flatten, small stains go to IOPaint, mannequin/wall and wide stains are skipped',()=>{
  const p=planFixes([box(100,100,400,300),box(10,10,60,60,'stain'),box(0,0,300,300,'stain'),box(400,0,450,40,'mannequin_mark'),box(0,900,50,950,'wall_mark'),{type:'lint',shape:'stroke',points:[{x:10,y:10},{x:500,y:10}],r:8,x0:0,y0:0,x1:510,y1:20}]);
  assert.equal(p.flatten.length,1);
  assert.equal(p.spot.length,2,'작은 얼룩 + 붓 자국(먼지)');
  assert.deepEqual(p.skipped.map(s=>[s.region.type,s.review]),[['stain',true],['mannequin_mark',false],['wall_mark',false]]);
  // 사장님이 직접 표시한 곳은 마네킹·넓은 얼룩이라도 지우기, 직접 표시한 구김은 펴기
  const q=planFixes([{...box(400,0,450,40,'mannequin_mark'),manual:true},{...box(0,0,300,300,'stain'),manual:true},{...box(0,0,300,300),manual:true}]);
  assert.deepEqual([q.spot.length,q.flatten.length,q.skipped.length],[2,1,0]);
});

test('flattening lifts the wrinkle shadow, keeps the knit texture and the colour (no grey)',()=>{
  const img=knit(),before=measure(img);
  const {image,results}=flattenShadows(img,[box(330,330,670,670)]);
  const after=measure(image);
  console.log(`# shadow depth L ${before.shadow.toFixed(1)} → ${after.shadow.toFixed(1)}, texture ${before.texture.toFixed(2)} → ${after.texture.toFixed(2)}`,JSON.stringify(results[0].chromaRatio));
  assert.ok(before.shadow>5,'합성 구김이 보여야 함');
  assert.ok(after.shadow<before.shadow*.4,`그림자가 60% 이상 펴져야 함: ${after.shadow}`);
  assert.ok(after.texture>before.texture*.85,`니트 결 유지: ${after.texture}`);
  assert.equal(results[0].reverted,false);
  // 색(a·b)은 그대로: 구김 줄 위 픽셀의 a·b 차이가 거의 없음
  for(const [x,y] of [[150,150],[140,146],[170,158]]){const a=labAt(img,x,y),b=labAt(image,x,y);assert.ok(Math.hypot(a[1]-b[1],a[2]-b[2])<2.5,`${x},${y} 색 바뀜`);}
  // 투명 배경은 그대로
  for(let p=0;p<W*H;p++)assert.equal(image.data[p*4+3],img.data[p*4+3]);
});

test('mannequin pixels inside a wrinkle box are not changed (different colour from the garment)',()=>{
  const img=knit(),{image}=flattenShadows(img,[box(380,0,620,200)]);
  let changed=0;
  for(let y=0;y<44;y++)for(let x=128;x<172;x++){const i=(y*W+x)*4;if(Math.abs(image.data[i]-img.data[i])>2)changed++;}
  assert.equal(changed,0,'마네킹 목 픽셀이 바뀌면 안 됨');
});

test('inspection flags a greyed or blurred fix and the spot merge reverts it',()=>{
  const img=knit({shadow:0}),r=box(400,400,520,520,'stain'),mask=regionMask(W,H,r);
  // 회색으로 바랜 결과(LaMa가 넓게 지울 때 생긴 모양을 흉내): 같은 밝기의 무채색 + 결 없음
  const grey={width:W,height:H,data:new Uint8ClampedArray(img.data)};
  for(let p=0;p<W*H;p++)if(mask[p]){const v=Math.round((img.data[p*4]*.3+img.data[p*4+1]*.59+img.data[p*4+2]*.11));grey.data[p*4]=grey.data[p*4+1]=grey.data[p*4+2]=v;}
  const bx={x:100,y:100,x1:180,y1:180},check=inspectFix(img,grey,mask,bx);
  assert.equal(check.ok,false);assert.match(check.reasons.join(' '),/색이 바램|회색 얼룩/);
  // 결만 사라진 결과(색은 그대로)
  const flat={width:W,height:H,data:new Uint8ClampedArray(img.data)};
  for(let p=0;p<W*H;p++)if(mask[p]){flat.data[p*4]=214;flat.data[p*4+1]=120;flat.data[p*4+2]=140;}
  const c2=inspectFix(img,flat,mask,bx);
  assert.equal(c2.ok,false);assert.match(c2.reasons.join(' '),/결이 흐려짐/);
  // mergeSpots: 회색 결과는 되돌리고(원래 픽셀), 결과의 알파 대신 원래 누끼 알파를 씀
  const bad={width:W,height:H,data:new Uint8ClampedArray(grey.data)};for(let p=0;p<W*H;p++)bad.data[p*4+3]=255;
  const m=mergeSpots(img,bad,[r]);
  assert.equal(m.results[0].reverted,true);
  assert.deepEqual([...m.image.data],[...img.data]);
});

test('a good spot fix (same colour, texture kept) is kept; transparent area is filled with garment colour for IOPaint',()=>{
  const img=knit({shadow:0}),r=box(400,400,520,520,'stain');
  const dirty={width:W,height:H,data:new Uint8ClampedArray(img.data)};
  for(let y=125;y<150;y++)for(let x=125;x<150;x++){const i=(y*W+x)*4;dirty.data[i]-=40;dirty.data[i+1]-=40;dirty.data[i+2]-=40;}
  const m=mergeSpots(dirty,img,[r]);   // IOPaint가 얼룩을 원래 니트로 되돌렸다고 가정
  assert.equal(m.results[0].reverted,false);
  const i=(137*W+137)*4;assert.ok(Math.abs(m.image.data[i]-img.data[i])<=2);
  const f=fillTransparent(img),edge=(150*W+5)*4,lab=rgbToLab(f.data[edge],f.data[edge+1],f.data[edge+2]);
  assert.ok(lab[1]>15,'투명 부분이 분홍 계열로 채워져야 함(흰·검정 아님)');
  assert.equal(f.data[edge+3],0,'알파는 그대로');
  const pink=rgbToLab(214,120,140),ref={a:pink[1],b:pink[2]};
  assert.ok(garmentShare(img,box(440,20,560,110,'stain'),ref)<.5,'마네킹 목 위 표시는 주변이 옷 색이 아님');
  assert.ok(garmentShare(dirty,box(400,400,520,520,'stain'),ref)>.8,'옷 위 얼룩은 주변이 옷 색');
});
