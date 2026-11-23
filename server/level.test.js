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
