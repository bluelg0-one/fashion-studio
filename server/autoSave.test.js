import test from 'node:test';
import assert from 'node:assert/strict';
import {planSave, runSave, saveCounts, isDraft, reviewCuts, sizeMissing, needsCopy, fileNames, AUTO_CHANNELS} from '../src/utils/autoSave.js';
import {newSizeRow} from '../src/utils/studioDocument.js';
import {CHANNELS} from '../src/utils/channelSpecs.js';
// 완성본 저장 + 상세페이지 흐름 검사: 드라이브·OpenAI 대신 모의 함수(비용 없음).

const slot=(label,flags)=>({id:label,label,source:'x',...(flags?{auto:{at:1,flags}}:{})});
const products=()=>[
 {id:'a',name:'핑크 후드',data:{slots:{hero:slot('정면',[]),back:slot('후면',['Claude가 수정할 곳을 찾지 못함(0곳)'])},texts:{headline:'',description:''}}},
 {id:'b',name:'네이비 니트',data:{slots:{hero:slot('정면',[])},texts:{headline:'니트',description:'설명'},detailApproved:false}},
];
function deps(log,opts={}) {
 const db=new Map(products().map(p=>[p.id,structuredClone(p)]));
 return {db,loadProduct:async id=>structuredClone(db.get(id)),saveProduct:async p=>{db.set(p.id,structuredClone(p));log.push(`save:${p.id}`);},
  writeCopy:async p=>{log.push(`copy:${p.id}`);return {...p,data:{...p.data,texts:{...p.data.texts,headline:'AI 제목',description:'AI 설명'}}};},
  build:async(p,{draft})=>{log.push(`build:${p.id}:${draft}`);if(opts.fail===p.id)throw new Error('그리기 실패');const n=fileNames(draft);return {files:[{kind:'detail-png',name:n.png},{kind:'detail-html',name:n.html},{kind:'channels-zip',name:n.zip}],photos:[{slotId:'hero'}],notes:['사이즈 입력 필요']};},
  store:async(p,{draft})=>{log.push(`store:${p.id}:${draft}`);return {where:opts.drive?'drive':'browser'};}};
}

test('each product: (optional copy) → build → store; review cuts make a draft (_초안), notes include size and review cuts',async()=>{
 const log=[],d=deps(log),job=planSave(products(),{copy:false});
 assert.deepEqual(job.products.map(p=>p.draft),[true,false]);
 const c=await runSave(job,d);
 assert.deepEqual(log,['build:a:true','store:a:true','build:b:false','store:b:false'],'문구 자동 작성 꺼짐(기본) → OpenAI 호출 없음');
 assert.equal(c.done,2);assert.equal(c.drafts,1);assert.ok(job.finished);
 assert.deepEqual(job.products[0].files,['상세페이지_초안.png','상세페이지_초안.html','채널별_묶음.zip']);
 assert.deepEqual(job.products[0].notes,['사이즈 입력 필요','확인 필요 컷: 후면 (Claude가 수정할 곳을 찾지 못함(0곳))']);
 assert.equal(job.products[0].where,'browser');
});

test('copy option on: only products with empty texts call OpenAI once; approved product is no longer a draft',async()=>{
 const log=[],d=deps(log,{drive:true});
 const job=planSave(products(),{copy:true});
 await runSave(job,d);
 assert.deepEqual(log.filter(x=>x.startsWith('copy')),['copy:a']);
 assert.equal(d.db.get('a').data.texts.headline,'AI 제목');assert.equal(job.products[1].where,'drive');
 // 사장님이 확인 → 정식 저장
 const a={...d.db.get('a')};a.data.detailApproved=true;assert.equal(isDraft(a.data),false);
 const again=planSave([a]);d.db.set('a',a);await runSave(again,d);
 assert.deepEqual(again.products[0].files.slice(0,2),['상세페이지.png','상세페이지.html']);
 assert.equal(log.filter(x=>x.startsWith('copy')).length,1,'다시 저장해도 문구는 다시 쓰지 않음(이미 채워짐)');
});

test('stop and resume: finished products are not rebuilt; a failed product does not stop the others',async()=>{
 const log=[],d=deps(log,{fail:'a'}),ctrl=new AbortController(),job=planSave(products());
 const first={...d,store:async(p,o)=>{const r=await d.store(p,o);ctrl.abort();return r;}};
 await runSave(job,{...first,signal:ctrl.signal}).catch(()=>{});
 assert.equal(job.products[0].status,'failed');assert.match(job.products[0].error,/그리기 실패/);
 const n=log.length;await runSave(job,{...d,fail:null});
 assert.ok(log.slice(n).every(x=>!x.endsWith(':b:false')||x.startsWith('build:b')||x.startsWith('store:b')));
 assert.equal(saveCounts(job).failed,1);
});

test('helpers: size table empty, copy needed, review cuts, channels saved automatically (no Shopee)',()=>{
 assert.ok(sizeMissing([newSizeRow()]));assert.ok(sizeMissing([]));assert.ok(!sizeMissing([{...newSizeRow(),length:'60'}]));
 assert.ok(needsCopy({headline:'',description:'x'}));assert.ok(!needsCopy({headline:'a',description:'b'}));
 assert.deepEqual(reviewCuts(products()[0].data).map(c=>c.label),['후면']);
 assert.deepEqual(AUTO_CHANNELS,CHANNELS.map(c=>c.id).filter(id=>AUTO_CHANNELS.includes(id)));
 assert.ok(!AUTO_CHANNELS.includes('shopee'));
 assert.deepEqual(fileNames(true),{png:'상세페이지_초안.png',html:'상세페이지_초안.html',zip:'채널별_묶음.zip'});
});
import {isDraft as draftOf} from '../src/utils/autoSave.js';
test('014-2: a product left for owner review by QA is saved as a draft until approved',()=>{
 assert.equal(draftOf({slots:{},qa:{status:'fail',owner:true}}),true);
 assert.equal(draftOf({slots:{},qa:{status:'fail',owner:true},detailApproved:true}),false);
 assert.equal(draftOf({slots:{},qa:{status:'pass',owner:false}}),false);
});
