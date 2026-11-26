import test from 'node:test';
import assert from 'node:assert/strict';
import {checkProduct, checkCut, retryPlan, qaCsv, QA_COLUMNS, grayBlocks} from '../src/utils/qaCheck.js';
// 014-2 자동 점검: 합성 '옷걸이에 걸린 가디건'(고리·소매·단추)으로 통과·보류·불합격과 다시 편집 설정을 검사합니다.
function hanger({k=1,buttons=true}={}) {
  const W=Math.round(1200*k),H=Math.round(1600*k),data=new Uint8ClampedArray(W*H*4),K=v=>Math.round(v*k);
  const btn=buttons?[400,600,800,1000].map(y=>[K(600),K(y)]):[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const hook=x>=K(592)&&x<=K(608)&&y>=K(60)&&y<K(160),body=x>=K(300)&&x<K(900)&&y>=K(160)&&y<K(1450),sleeve=(y>=K(220)&&y<K(1350)&&((x>=K(180)&&x<K(270))||(x>=K(930)&&x<K(1020))))||(y>=K(220)&&y<K(300)&&x>=K(180)&&x<K(1020));// 어깨에서 몸판과 이어짐
    if(!(hook||body||sleeve))continue;
    const st=((x>>1)+(y>>2))%2?9:-9;let rgb=[214+st,170+st,190+st];
    for(const [bx,by] of btn){const r=Math.hypot(x-bx,y-by);if(r<=K(18))rgb=r>K(14)?[150,110,125]:[236,226,230];}
    if(hook)rgb=[160,160,160];
    const i=(y*W+x)*4;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
  }
  return {width:W,height:H,data};
}
const copy=img=>({...img,data:new Uint8ClampedArray(img.data)});
const paint=(img,x0,y0,x1,y1,f)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*img.width+x)*4;f(img.data,i);}return img;};
const gray=(d,i)=>{const m=(d[i]+d[i+1]+d[i+2])/3;d[i]=d[i+1]=d[i+2]=m;};
const cut=img=>({matte:img,stage1:img,final:img});
const byKey=(r,key,c='front')=>r.checks.find(x=>x.key===key&&x.cut===c);

test('014-2: a clean front/back passes every automatic check (color, gray, buttons, hook, edges, islands, channel size)',()=>{
  const f=hanger({k:1.15}),b=hanger({k:1.15,buttons:false});
  const r=checkProduct({front:cut(f),back:cut(b),details:{items:[{id:'neckline'}],skipped:[{id:'fabric',label:'소재',reason:'해상도 부족(…)',review:false}]}});
  assert.equal(r.status,'pass',JSON.stringify(r.reasons));
  assert.equal(byKey(r,'buttons').status,'pass');assert.equal(byKey(r,'hanger_hook').status,'pass');
  assert.ok(byKey(r,'resolution_instagram').status==='pass');
  assert.match(r.checks.find(c=>c.key==='details_resolution').reason,/참고/);
  assert.equal(retryPlan(r,1),null);
});
test('014-2: gray blotch → fail → retry 1 = shadow flattening only, retry 2 = keep 1차 as final',()=>{
  const f=hanger(),bad=paint(copy(f),420,700,560,860,gray);
  assert.ok(grayBlocks(f,bad)>=4);
  const r=checkProduct({front:{matte:f,stage1:f,final:bad},back:cut(hanger({buttons:false}))});
  assert.equal(r.status,'fail');assert.equal(byKey(r,'gray_blotch').status,'fail');assert.match(r.reasons.join(),/회색으로 바랜 칸/);
  const p1=retryPlan(r,1),p2=retryPlan(r,2);
  assert.deepEqual(p1.stage2,{front:'gentle'});assert.deepEqual(p2.stage2,{front:'skip'});assert.match(p1.label,/그림자 펴기만/);assert.match(p2.label,/1차를 최종으로/);
});
test('014-2: an erased button and a lost hanger hook are failures; an island is a hold; edge cut has no automatic fix',()=>{
  const f=hanger(),K=v=>Math.round(v);
  const noBtn=paint(copy(f),K(600)-K(22),K(1000)-K(22),K(600)+K(22),K(1000)+K(22),(d,i)=>{d[i]=214;d[i+1]=170;d[i+2]=190;});
  const r=checkCut({matte:f,stage1:f,final:noBtn});assert.equal(r.find(c=>c.key==='buttons').status,'fail');assert.match(r.find(c=>c.key==='buttons').reason,/잃음 1/);
  const noHook=paint(copy(f),0,0,f.width,K(160),(d,i)=>{d[i+3]=0;});
  const hc=checkCut({matte:f,stage1:f,final:noHook}),h=hc.find(c=>c.key==='hanger_hook');assert.equal(h.status,'fail');assert.equal(h.fix,'hook');
  assert.deepEqual(retryPlan({checks:hc},1).stage1,{front:{cleanIslands:false}},'고리: 떨어진 조각 지우기 끄고 1차 다시');
  const isl=paint(copy(f),40,1500,90,1550,(d,i)=>{d[i]=200;d[i+1]=190;d[i+2]=180;d[i+3]=255;});
  const ri=checkProduct({front:{matte:f,stage1:f,final:isl}});assert.equal(byKey(ri,'islands').status,'hold');
  assert.equal(byKey(ri,'back_missing','back').status,'hold');
  assert.equal(retryPlan(ri,1),null,'떨어진 조각은 자동으로 지우지 않고 사장님 확인');
  const edge=paint(copy(f),0,900,f.width,1100,(d,i)=>{d[i]=214;d[i+1]=170;d[i+2]=190;d[i+3]=255;});
  const re=checkProduct({front:{matte:f,stage1:f,final:edge},back:cut(hanger({buttons:false}))});
  assert.equal(byKey(re,'edge').status,'fail');
  assert.equal(retryPlan({checks:re.checks.filter(c=>c.key==='edge')},1),null,'가장자리 잘림은 설정으로 못 고침');
});
test('014-2: small source photo → channel size hold (no fix); color difference front/back → hold with color retry',()=>{
  const s=hanger({k:.6}),r=checkCut({final:s,matte:s});
  assert.equal(r.find(c=>c.key==='resolution_instagram').status,'hold');assert.equal(r.find(c=>c.key==='resolution_instagram').fix,null);
  const f=hanger(),b=paint(copy(hanger({buttons:false})),0,0,1200,1600,(d,i)=>{if(d[i+3]){d[i]=Math.max(0,d[i]-60);d[i+2]=Math.min(255,d[i+2]+30);}});
  const rp=checkProduct({front:cut(f),back:cut(b)});const c=rp.checks.find(x=>x.key==='color_pair');
  assert.equal(c.status,'hold');assert.equal(retryPlan(rp,1).color,true);
});
test('014-2: QA report CSV has fixed English columns, one row per check, escaped text',()=>{
  const f=hanger(),r=checkProduct({front:cut(f)});
  const csv=qaCsv({id:'p1',name:'아이보리, "가디건"'},{...r,attempts:2,owner:true,at:Date.UTC(2026,10,26)});
  const lines=csv.replace(/^﻿/,'').trim().split('\r\n');
  assert.equal(lines[0],QA_COLUMNS.join(','));assert.equal(lines.length,r.checks.length+1);
  assert.match(lines[1],/^p1,"아이보리, ""가디건""",2026-11-26T00:00:00.000Z,hold,2,yes,front,area,pass,/);
});
