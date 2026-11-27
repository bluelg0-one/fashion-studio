import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupPlan, deleteAtOf, recordsFromDrive, KEEP_MS} from '../src/utils/modelcutStore.js';
// 021 모델컷 임시 결과 정리(계산만, 시계는 숫자로 흉내)
const D=86400000,T0=Date.UTC(2026,10,27);
const res=(id,pid,status='completed',n=2)=>({id,productId:pid,status,outputs:Array.from({length:n},(_,i)=>({data:'d'+i}))});
test('021 cleanup: nothing before the final (non-draft) save; notice inside 3 days; delete after 3 days; running jobs are never deleted',()=>{
 const results=[res('a','p1'),res('b','p1','running'),res('c','p2')];
 assert.deepEqual(cleanupPlan(results,[],T0),{remove:[],notices:[]},'정식 저장 전에는 그대로');
 const metas=[{productId:'p1',finalAt:T0}];
 let r=cleanupPlan(results,metas,T0+D);
 assert.deepEqual(r.remove,[]);assert.deepEqual(r.notices.map(n=>[n.productId,n.days,n.images]),[['p1',2,2]],'2일 뒤 2장 삭제 안내(진행 중 제외)');
 r=cleanupPlan(results,metas,T0+3*D);assert.deepEqual(r.remove,['a'],'3일 지나면 임시 결과 삭제, 진행 중은 남김');
 assert.equal(deleteAtOf({finalAt:T0}),T0+KEEP_MS);assert.equal(deleteAtOf({}),null);
});
test('021 keep longer: "보관 연장" restarts the 3 days from that moment',()=>{
 const results=[res('a','p1')],metas=[{productId:'p1',finalAt:T0,keepFrom:T0+2.5*D}];
 assert.deepEqual(cleanupPlan(results,metas,T0+3*D).remove,[],'연장했으면 아직');
 assert.equal(cleanupPlan(results,metas,T0+3*D).notices[0].days,3);
 assert.deepEqual(cleanupPlan(results,metas,T0+5.6*D).remove,['a']);
});
test('021 results uploaded from another PC are rebuilt from Drive file properties (and not duplicated)',()=>{
 const files=[{id:'F1',resultId:'r9',productId:'p1',idx:'1',scene:'스튜디오'},{id:'F0',resultId:'r9',productId:'p1',idx:'0'},{id:'F2',resultId:'r1',productId:'p1',idx:'0'}];
 const existing=[{id:'r1',productId:'p1',driveIds:['F2']}];
 const recs=recordsFromDrive(files,existing);
 assert.equal(recs.length,1);assert.deepEqual(recs[0].driveIds,['F0','F1']);assert.equal(recs[0].status,'completed');
});
