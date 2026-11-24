import test from 'node:test';
import assert from 'node:assert/strict';
import {planAuto, runAuto, autoCounts, estimateAuto, summary, remainingSeconds, PAID_STEP_COST} from '../src/utils/autoPipeline.js';
// 자동 보정 흐름 검사: 실제 엔진·Claude 대신 모의 단계 함수(비용 없음).

const slot=(label,extra={})=>({label,source:`src:${label}`,enabled:true,...extra});
function store(products) {
  const db=new Map(products.map(p=>[p.id,structuredClone(p)]));
  return {db,loadProduct:async id=>structuredClone(db.get(id)||null),saveProduct:async p=>{db.set(p.id,structuredClone(p));}};
}
function mockSteps(log,opts={}) {
  return {
    level:async s=>{log.push(`level:${s.label}`);return {slot:{...s,level:{angle:1,confidence:s.label==='측면'?.1:.9}},flags:s.label==='측면'?['자동 수평 신뢰도 낮음']:[]};},
    stage1:async(s,{paid})=>{
      if(opts.offline1&&opts.offline1()>0&&!paid){throw Object.assign(new Error('BiRefNet 꺼짐'),{offline:true});}
      log.push(`stage1:${s.label}${paid?':paid':''}`);return {slot:{...s,stage1:`s1:${s.label}`,cutout:`s1:${s.label}`},flags:[],cost:paid?{paid:PAID_STEP_COST}:null};},
    refLab:async s=>{log.push(`ref:${s.label}`);return {L:50,a:10,b:5};},
    color:async(s,lab)=>{log.push(`color:${s.label}`);return {slot:{...s,stage1:`c:${s.label}`},flags:s.label==='원단'?['색감 통일 후 차이 큼(ΔE 14)']:[]};},
    stage2:async(s,{paid})=>{
      if(opts.offline2&&opts.offline2()&&!paid)throw Object.assign(new Error('IOPaint 꺼짐'),{offline:true});
      if(s.label==='후면'&&opts.failBack)throw new Error('Claude API 오류 (529)');
      log.push(`stage2:${s.label}${paid?':paid':''}`);
      return {slot:{...s,stage2:`s2:${s.label}`},flags:s.label==='원단'?[]:s.label==='정면'?['수정할 곳 0개']:[],cost:paid?{paid:PAID_STEP_COST}:{claude:.03}};},
    final:async(p,ref)=>{log.push(`final:${p.name}:${ref?.label}`);return {...p,data:{...p.data,color:{ref}}};},
  };
}
const products=()=>[
  {id:'a',name:'핑크 후드',data:{slots:{back:slot('후면'),hero:slot('정면'),side:slot('측면'),fabric:slot('원단'),empty:{label:'빈 칸'}}}},
  {id:'b',name:'네이비 니트',data:{slots:{hero:slot('정면',{stage1:'old1',stage2:'old2'}),back:slot('후면',{stage1:'old1'})}}},
];

test('order per product: hero first → level+1차 → color (hero is the reference) → 2차 → final; already corrected cuts are skipped, half-done ones continue',async()=>{
 const s=store(products()),log=[],job=planAuto(products());
 assert.deepEqual(job.products[0].cuts.map(c=>c.slotId),['hero','back','side','fabric'],'대표 정면 먼저, 사진 없는 칸 제외');
 assert.deepEqual(job.products[1].cuts.map(c=>[c.slotId,c.status,c.step]),[['hero','skipped','done'],['back','pending','color']]);
 const r=await runAuto(job,{...s,steps:mockSteps(log)});
 assert.deepEqual(log,['level:정면','stage1:정면','level:후면','stage1:후면','level:측면','stage1:측면','level:원단','stage1:원단','ref:정면','color:후면','color:측면','color:원단','stage2:정면','stage2:후면','stage2:측면','stage2:원단','final:핑크 후드:정면',
  'ref:정면','color:후면','stage2:후면','final:네이비 니트:정면']);
 const c=autoCounts(job);assert.equal(c.done,2);assert.equal(c.review,3);assert.equal(c.skipped,1);assert.equal(c.failed,0);
 assert.deepEqual(r.reviews.map(x=>[x.label,x.flags.join()]),[['정면','수정할 곳 0개'],['측면','자동 수평 신뢰도 낮음'],['원단','색감 통일 후 차이 큼(ΔE 14)']]);
 assert.ok(Math.abs(r.claude-.15)<1e-9,'Claude 비용 합계(5컷 × $0.03)');
 assert.equal(s.db.get('a').data.slots.back.stage2,'s2:후면');assert.equal(s.db.get('a').data.color.ref.label,'정면');
 // 다시 보정: 이미 보정한 컷도 처음부터
 const redo=planAuto([s.db.get('b')],{redo:true});assert.deepEqual(redo.products[0].cuts.map(c=>[c.status,c.step]),[['pending','level'],['pending','level']]);
});

test('stop in the middle → resume does not repeat finished steps; a failed cut does not stop the others',async()=>{
 const s=store(products()),log=[],ctrl=new AbortController(),job=planAuto(products());
 const steps=mockSteps(log,{failBack:true});
 const stopping={...steps,color:async(x,l)=>{const r=await steps.color(x,l);ctrl.abort();return r;}};
 await assert.rejects(runAuto(job,{...s,steps:stopping,signal:ctrl.signal}),{stopped:true});
 const before=log.length;
 await runAuto(job,{...s,steps});
 const again=log.slice(before);
 assert.ok(!again.some(x=>x.startsWith('stage1:')),'1차는 다시 하지 않음');
 assert.equal(again.filter(x=>x==='color:후면').length,1,'핑크 후드의 끝난 색감 통일은 다시 하지 않음(네이비 니트 후면만)');
 assert.ok(again.includes('stage2:원단'));
 const back=job.products[0].cuts.find(c=>c.slotId==='back');assert.equal(back.status,'failed');assert.match(back.error,/529/);
 assert.equal(summary(job).failures.length,2,'후면 2개 상품 모두 실패로 기록, 나머지는 계속');
 assert.ok(job.finished);
});

test('free engine disconnected: the cut waits (does not move on) until it is reconnected',async()=>{
 const s=store([products()[0]]),log=[],job=planAuto([products()[0]]);
 let down=2,checks=0,waits=0;const states=[];
 await runAuto(job,{...s,steps:mockSteps(log,{offline1:()=>down}),checkFree:async kind=>{checks++;assert.equal(kind,'birefnet');states.push(job.products[0].cuts[0].status);return --down<=0;},wait:async()=>{waits++;}});
 assert.equal(states[0],'waiting','끊기면 대기(PC 연결 끊김)');
 assert.equal(checks,2);assert.equal(waits,1);
 assert.equal(log[1],'stage1:정면','다시 연결된 뒤 같은 컷부터');assert.ok(!log.includes('level:후면')||log.indexOf('level:후면')>log.indexOf('stage1:정면'),'다음 컷으로 넘어가지 않음');
 assert.equal(job.spent.paid,0);
});

test('paid fallback (opt-in) replaces the free engine only within the cap, then stops',async()=>{
 const s=store([products()[0]]),log=[];
 const job=planAuto([products()[0]],{paid:true,paidCap:.25});
 await assert.rejects(runAuto(job,{...s,steps:mockSteps(log,{offline2:()=>true})}),{capReached:true});
 assert.equal(log.filter(x=>x.endsWith(':paid')).length,2,'$0.25 상한 → 유료 2번($0.20)까지');
 assert.ok(Math.abs(job.spent.paid-.2)<1e-9);
 assert.equal(job.products[0].cuts.filter(c=>c.paidFallback).length,2);
 // 상한을 올리고 이어서 하면 남은 것만
 job.options.paidCap=1;await runAuto(job,{...s,steps:mockSteps(log,{offline2:()=>true})});
 assert.equal(log.filter(x=>x.endsWith(':paid')).length,4);assert.ok(job.finished);
});

test('estimate before start: cuts, time (BiRefNet 30 s per photo basis) and Claude cost',()=>{
 const job=planAuto(products());
 const e=estimateAuto(job,[.04,.16]);
 assert.equal(e.products,2);assert.equal(e.cuts,5);
 assert.equal(e.seconds,4*(30+30+2)+1*(30+2));
 assert.deepEqual(e.claude.map(v=>Math.round(v*100)/100),[.2,.8]);
 assert.equal(remainingSeconds(job),e.seconds);
});

import {opaqueFraction, areaFlag, levelFlag, deltaE, colorFlag, regionsFlag} from '../src/utils/autoPipeline.js';
test('quality flags: cutout area, low level confidence, large ΔE after color matching, 0 or too many boxes',()=>{
 const px=n=>{const d=new Uint8ClampedArray(400);for(let i=0;i<n;i++)d[i*4+3]=255;return {data:d};};
 assert.equal(opaqueFraction(px(30)),.3);assert.equal(areaFlag(.3),null);
 assert.match(areaFlag(opaqueFraction(px(3))),/너무 작음\(3%\)/);assert.match(areaFlag(.9),/너무 큼\(90%\)/);
 assert.match(levelFlag({confidence:.1}),/신뢰도 낮음\(10%\)/);assert.equal(levelFlag({confidence:.6}),null);assert.equal(levelFlag({confidence:null}),null);
 assert.equal(deltaE({L:50,a:0,b:0},{L:53,a:4,b:0}),5);assert.equal(colorFlag(5),null);assert.match(colorFlag(12.34),/ΔE 12\.3/);
 assert.match(regionsFlag(0),/0곳/);assert.match(regionsFlag(40),/상한\(40곳\)/);assert.equal(regionsFlag(7),null);
});
test('a cut finished by auto correction without a 2nd stage (0 boxes) counts as corrected next time',async()=>{
 const p={id:'x',name:'x',data:{slots:{hero:slot('정면')}}},s=store([p]);
 const steps={...mockSteps([]),stage2:async sl=>({slot:sl,flags:['Claude가 수정할 곳을 찾지 못함(0곳)'],cost:{claude:.02}})};
 await runAuto(planAuto([p]),{...s,steps});
 const saved=s.db.get('x');assert.ok(!saved.data.slots.hero.stage2);assert.ok(saved.data.slots.hero.auto.at);
 assert.deepEqual(saved.data.slots.hero.auto.flags,['Claude가 수정할 곳을 찾지 못함(0곳)']);
 assert.equal(planAuto([saved]).products[0].cuts[0].status,'skipped');
});
