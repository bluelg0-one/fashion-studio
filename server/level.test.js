import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTilt} from '../src/utils/level.js';
// 합성 매장 사진: 벽돌 벽(가로 줄눈 + 엇갈린 세로 줄눈) + 검은 마네킹 기둥 + 옷(가운데 사각형, 니트 골지 세로줄).
// 장면을 canvas 기준 -t만큼 돌린 사진을 만들면(= 반시계 t) 추정값은 +t가 맞습니다.
function scene(t,{w=480,h=640,wall=true,noise=0}={}) {
 const data=new Uint8ClampedArray(w*h*4),c=Math.cos(t*Math.PI/180),s=Math.sin(t*Math.PI/180),cx=w/2,cy=h/2;
 let seed=7;const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  // 출력 픽셀이 보여 주는 원래 장면 좌표 = R(+t)·p
  const dx=x-cx,dy=y-cy,X=cx+dx*c-dy*s,Y=cy+dx*s+dy*c;
  let v=[205,198,186];
  if(wall){const row=Math.floor(Y/22),off=row%2?30:0;if(((Y%22)+22)%22<3||((((X+off)%60)+60)%60)<3)v=[150,140,128];}
  if(Math.abs(X-cx)<7&&Y>420)v=[25,25,25];                       // 받침대 기둥
  if(Math.abs(X-cx)<110&&Y>140&&Y<430)v=(((Math.floor(X/6))%2)?[175,60,70]:[160,52,62]); // 옷(골지)
  const n=noise?(rnd()-.5)*noise:0,i=(y*w+x)*4;
  data[i]=v[0]+n;data[i+1]=v[1]+n;data[i+2]=v[2]+n;data[i+3]=255;
 }
 return {data,width:w,height:h};
}
const cases=[-9,-6.3,-3.2,-1.1,-0.4,0,0.8,2.5,4.8,7.4];
test('auto level finds the tilt of a synthetic shop photo within 0.3°',()=>{
 const rows=[];
 for(const t of cases){const r=estimateTilt(scene(t,{noise:12}));rows.push([t,r.angle,Math.abs(r.angle-t).toFixed(2),r.confidence]);assert.ok(Math.abs(r.angle-t)<=.3,`기울기 ${t}° → 추정 ${r.angle}° (신뢰도 ${r.confidence})`);}
 const max=Math.max(...rows.map(r=>+r[2])),mean=rows.reduce((a,r)=>a+ +r[2],0)/rows.length;
 console.log('# tilt\testimate\terror\tconfidence\n'+rows.map(r=>'# '+r.join('\t')).join('\n')+`\n# mean error ${mean.toFixed(2)}°, max ${max.toFixed(2)}°`);
});
test('without the brick wall the pole and garment still give the tilt',()=>{
 for(const t of [-4,3.5]){const r=estimateTilt(scene(t,{wall:false,noise:8}));assert.ok(Math.abs(r.angle-t)<=.4,`${t} → ${r.angle}`);}
});
test('no straight lines (noise only) → low confidence, no rotation',()=>{
 const w=300,h=400,data=new Uint8ClampedArray(w*h*4);let seed=3;
 for(let i=0;i<data.length;i+=4){seed=(seed*1103515245+12345)&0x7fffffff;const v=100+(seed%120);data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}
 const r=estimateTilt({data,width:w,height:h});
 assert.equal(r.angle,0);assert.ok(r.confidence<.25,`신뢰도 ${r.confidence}`);
});
test('tilt beyond ±10° is not forced into range as a wrong answer with high confidence',()=>{
 const r=estimateTilt(scene(14,{noise:8}));
 assert.ok(r.angle===0||r.confidence<.6||Math.abs(r.angle)>=9.5,`14° → ${r.angle} (${r.confidence})`);
});

// ---- 013 자동 수평 안전장치 ----
import {decideLevel, coverScale, autoLevelAllowed, AUTO_LEVEL_MAX} from '../src/utils/level.js';
test('013: only full front/side/back cuts are auto-rotated (by shot type when classified)',()=>{
 for(const id of ['hero','side','back'])assert.equal(autoLevelAllowed(id),true,id);
 for(const id of ['frontZoom','frontTop','frontBottom','fabric','detail2','point1','fit'])assert.equal(autoLevelAllowed(id),false,id);
 assert.equal(autoLevelAllowed('extra-1','front'),true);assert.equal(autoLevelAllowed('hero','frontZoom'),false,'분류가 확대면 칸 이름과 상관없이 끔');
 assert.equal(autoLevelAllowed('extra-2','fabric'),false);assert.equal(autoLevelAllowed('hero','unknown'),true,'알 수 없음은 칸 이름으로');
});
test('013: rotate only when vertical and horizontal evidence agree and within ±4°',()=>{
 const est=(angle,v,h,confidence=.6)=>({angle,confidence,votes:{vertical:v,horizontal:h}});
 assert.deepEqual(decideLevel(est(2.1,2.0,2.3)),{angle:2.1,reason:null,review:false});
 assert.equal(decideLevel(est(2.1,2.0,null)).angle,0,'근거 하나뿐');
 assert.equal(decideLevel(est(2.1,2.4,-0.6)).angle,0,'방향이 반대');
 assert.equal(decideLevel(est(3,3.2,1.5)).angle,0,'각도 차 1° 초과');
 const steep=decideLevel(est(6.5,6.4,6.6));assert.equal(steep.angle,0);assert.equal(steep.review,true);assert.match(steep.reason,/최대 ±4°/);
 assert.equal(AUTO_LEVEL_MAX,4);
 assert.equal(decideLevel(est(0,null,null,.1)).reason,'곧은 선이 부족해 돌리지 않음');
});
test('013: synthetic shop photos within ±4° still level correctly through the new rule; 7° is refused',()=>{
 for(const t of [-3.2,-1.1,0.8,2.5,3.8]){const e=estimateTilt(scene(t,{noise:10})),d=decideLevel(e);assert.ok(Math.abs(d.angle-t)<=.3,`${t} → ${d.angle} (${d.reason}) votes ${JSON.stringify(e.votes)}`);}
 assert.equal(decideLevel(estimateTilt(scene(7,{noise:10}))).angle,0);
});
test('013: cover scale removes empty corners (3:4 photo, 2° → about 4.7% zoom)',()=>{
 assert.equal(coverScale(900,1200,0),1);
 const k=coverScale(900,1200,2);assert.ok(k>1.04&&k<1.06,String(k));
 assert.equal(coverScale(900,1200,-2),k);
});
