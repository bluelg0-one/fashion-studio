import test from 'node:test';
import assert from 'node:assert/strict';
import {CHANNELS, SAFE_DEFAULT, VERIFIED_LABEL} from '../src/utils/channelSpecs.js';
import {plan} from '../src/utils/channelExport.js';
test('channel specs stay conservative: white JPG, 2MB or less, at least 1000px, ratio matches size',()=>{
 for(const c of CHANNELS){
  assert.ok(VERIFIED_LABEL[c.verified],c.id);
  if(c.verified==='search'||c.verified==='official')assert.ok(c.sources.length>0,`${c.id}: 확인한 값에는 출처가 있어야 함`);
  for(const s of c.images){
   assert.equal(s.format,'image/jpeg');assert.equal(s.background,'#ffffff');
   assert.ok(s.maxBytes<=2*1024*1024,`${c.id}/${s.role} 2MB 이하`);
   assert.ok(Math.min(...s.size)>=1000,`${c.id}/${s.role} 1000px 이상`);
   assert.equal(s.size[0]*s.ratio[1],s.size[1]*s.ratio[0],`${c.id}/${s.role} 비율과 크기 일치`);
  }
 }
 assert.deepEqual(SAFE_DEFAULT.ratio,[1,1]);
});
test('channel plan: main/thumb take the first photo, extra the rest, counts capped',()=>{
 const photos=Array.from({length:12},(_,i)=>({id:'p'+i}));
 const byId=Object.fromEntries(CHANNELS.map(c=>[c.id,plan(c,photos)]));
 assert.deepEqual(byId.smartstore.filter(x=>x.spec.role==='main').map(x=>x.photo.id),['p0']);
 assert.equal(byId.smartstore.filter(x=>x.spec.role==='extra').length,9);
 assert.equal(byId.smartstore.find(x=>x.spec.role==='extra').photo.id,'p1');
 assert.equal(byId.instagram.length,10);
 assert.equal(byId.mall.filter(x=>x.spec.role==='detail').length,12);
 assert.deepEqual(byId.mall.filter(x=>x.spec.role==='thumb').map(x=>x.photo.id),['p0']);
 assert.deepEqual(plan(CHANNELS[0],[]),[]);
});
