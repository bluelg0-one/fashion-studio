import test from 'node:test';
import assert from 'node:assert/strict';
import {newJob, runImport, counts, toClassify, reviewList, assignSlots, BATCH_SIZE} from '../src/utils/driveImport.js';
import {classifyEstimate} from '../src/utils/pricing.js';
// 가져오기 → 묶음 분류 → 상품 만들기 흐름 검사. 드라이브·Claude는 모의 함수(비용 없음).

// 사진 45장 = 옷 8벌(6장씩, 마지막 3장). 20장씩 묶으면 옷 4번(18~23번 사진)이 첫째·둘째 묶음에 걸칩니다.
const files=Array.from({length:45},(_,i)=>({id:`f${i}`,name:`IMG_${String(i+1).padStart(3,'0')}.jpg`,mimeType:'image/jpeg'}));
const truth=id=>Math.floor(Number(id.slice(1))/6);
const shots=['front','back','side','fabric','frontTop','detail'];
// 모의 Claude: 참고 옷(앞 묶음에서 찾은 옷) 설명이 같으면 그 id로, 아니면 새 옷 g1.. 로 답합니다.
function mockClassify(log) {
  return async({photos,references})=>{
    log.push({n:photos.length,refs:references.map(r=>r.description)});
    const garments=[],local={};
    const out=photos.map(p=>{
      const t=truth(p.id),desc=`옷${t}`,ref=references.find(r=>r.description===desc);
      if(ref)return {id:p.id,garment:ref.id,reference:true,shot:shots[Number(p.id.slice(1))%6],confidence:.9,review:false,note:''};
      if(!local[t]){local[t]=`g${garments.length+1}`;garments.push({id:local[t],description:desc});}
      const low=p.id==='f7';
      return {id:p.id,garment:local[t],shot:shots[Number(p.id.slice(1))%6],confidence:low?.4:.9,review:low,note:low?'비슷한 색 옷과 헷갈림':''};
    });
    return {garments,photos:out,model:'claude-opus-5-5',usage:{input_tokens:100,output_tokens:10}};
  };
}

test('45 photos are classified in batches of 20; a garment split across batches stays one product; cost is reported per batch',async()=>{
 const {job,skipped}=newJob([...files].reverse(),new Set());
 assert.equal(skipped,0);assert.equal(job.files[0].name,'IMG_001.jpg','파일 이름(촬영) 순서');
 const log=[],costs=[],products=[];
 const res=await runImport(job,{
  readThumb:async f=>`thumb:${f.id}`,classify:mockClassify(log),onClassified:(r,b)=>costs.push(b.length),
  createProduct:async({garmentId,description,items})=>{products.push({garmentId,description,ids:items.map(f=>f.id)});return `p-${garmentId}`;},
 });
 assert.deepEqual(log.map(l=>l.n),[20,20,5]);assert.equal(BATCH_SIZE,20);
 assert.deepEqual(log[0].refs,[]);assert.ok(log[1].refs.includes('옷3'),'둘째 묶음에 앞에서 찾은 옷3 썸네일을 함께 보냄');
 assert.deepEqual(costs,[20,20,5],'묶음마다 비용 기록');
 assert.equal(products.length,8,'옷 8벌 = 상품 8개');
 const p3=products.find(p=>p.description==='옷3');assert.deepEqual(p3.ids,['f18','f19','f20','f21','f22','f23'],'묶음에 걸친 옷도 한 상품');
 assert.equal(res.done,45);assert.equal(res.failed,0);
 assert.deepEqual(reviewList(job).map(r=>[r.name,r.garment,r.note]),[['IMG_008.jpg','옷1','비슷한 색 옷과 헷갈림']]);
});

test('stop in the middle, then run again: continues from the remaining photos without repeating finished batches',async()=>{
 const {job}=newJob(files);const log=[],ctrl=new AbortController();let saved=0;
 await assert.rejects(runImport(job,{readThumb:async f=>`t:${f.id}`,classify:async b=>{const r=await mockClassify(log)(b);ctrl.abort();return r;},createProduct:async()=>'p',save:async()=>{saved++;},signal:ctrl.signal}),{stopped:true});
 assert.equal(log.length,1,'첫 묶음 뒤 중단');assert.ok(saved>0);
 const c=counts(job);assert.equal(c.classified,20);assert.equal(c.read,25);assert.equal(toClassify(job),25);
 const reads=[];
 await runImport(job,{readThumb:async f=>{reads.push(f.id);return 't';},classify:mockClassify(log),createProduct:async({garmentId})=>`p-${garmentId}`});
 assert.deepEqual(reads,[],'이미 읽은 사진은 다시 받지 않음');
 assert.deepEqual(log.map(l=>l.n),[20,20,5],'남은 25장만 분류');
 assert.equal(counts(job).done,45);
});

test('already imported Drive files are skipped; unsupported files are counted; failures are retried on the next run',async()=>{
 const {job,skipped,unsupported}=newJob([...files.slice(0,6),{id:'x',name:'a.pdf',mimeType:'application/pdf'},{id:'f0',name:'dup',mimeType:'image/jpeg'}],new Set(['f1','f2']));
 assert.equal(skipped,2);assert.equal(unsupported,1);assert.equal(job.files.length,4);
 let fail=true;const log=[];
 await runImport(job,{readThumb:async f=>{if(f.id==='f3'&&fail)throw new Error('HEIC 사진은 열 수 없습니다');return 't';},classify:mockClassify(log),createProduct:async()=>'p1'});
 let c=counts(job);assert.equal(c.failed,1);assert.equal(c.done,3);assert.match(job.files.find(f=>f.id==='f3').error,/HEIC/);
 fail=false;
 await runImport(job,{readThumb:async()=>'t',classify:mockClassify(log),createProduct:async({existing})=>{assert.equal(existing,'p1','같은 옷이면 이미 만든 상품에 추가');return 'p1';}});
 c=counts(job);assert.equal(c.failed,0);assert.equal(c.done,4);
 // 분류 실패(서버 오류)는 멈추고, 다시 누르면 그 묶음부터
 const j2=newJob(files.slice(0,3)).job;
 await assert.rejects(runImport(j2,{readThumb:async()=>'t',classify:async()=>{throw new Error('Claude API 오류 (529)');},createProduct:async()=>'p'}),/529/);
 assert.equal(counts(j2).failed,3);
 await runImport(j2,{readThumb:async()=>{throw new Error('다시 읽으면 안 됨');},classify:mockClassify([]),createProduct:async()=>'p'});
 assert.equal(counts(j2).done,3);
});

test('slot placement follows the bulk-upload rules and respects slots already used',()=>{
 const it=(shot,confidence=.9)=>({shot,confidence});
 const r=assignSlots([it('front',.7),it('front',.95),it('fabric'),it('detail'),it('fabric'),it('unknown')],[],false);
 assert.deepEqual(r.map(x=>[x.item.shot,x.slotId]),[['front','hero'],['fabric','fabric'],['detail','detail2'],['fabric','detail3'],['unknown',null],['front',null]]);
 assert.deepEqual(assignSlots([it('front'),it('back')],['hero'],false).map(x=>x.slotId),[null,'back']);
});
test('hanger v2 placement: front → hero, back → back, anything else or a second front → review slot',()=>{
 const it=(shot,confidence=.9)=>({shot,confidence});
 const r=assignSlots([it('front',.7),it('back',.8),it('front',.95),it('unknown'),it('fabric')]);
 assert.deepEqual(r.map(x=>[x.item.shot,x.slotId]),[['front','hero'],['unknown',null],['fabric',null],['back','back'],['front',null]]);
 assert.deepEqual(assignSlots([it('back'),it('front')],['back']).map(x=>[x.item.shot,x.slotId]),[['back',null],['front','hero']]);
});

test('estimated classification cost depends on the number of photos',()=>{
 const e=classifyEstimate(100);assert.equal(e.batches,5);assert.ok(e.range[0]>0.2&&e.range[1]<0.6,JSON.stringify(e));
 assert.ok(classifyEstimate(300).range[1]>e.range[1]*2.5);
});
