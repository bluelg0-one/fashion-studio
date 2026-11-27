import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLibrary, migratedPicks, addModel, renameModel, deleteModel, modelsFor, pickFor, setPick, mergeLibrary, driveIndex} from '../src/utils/modelLibrary.js';
// 019 모델 보관함(계산만, 드라이브·FASHN 호출 없음)
test('019 018 data moves into the list as the first model of each composition, and becomes that composition default (no loss)',()=>{
 const lib=migrateLibrary({top:'data:T',dress:'data:D',at:5});
 assert.deepEqual(lib.models.map(m=>[m.slot,m.name,m.image]),[['top','모델 1','data:T'],['dress','모델 1','data:D']]);
 const picks=migratedPicks(lib);assert.equal(pickFor(picks,lib,'p1','top').image,'data:T');assert.equal(pickFor(picks,lib,'p1','bottom'),null);
 assert.deepEqual(migrateLibrary({}).models,[]);assert.deepEqual(migrateLibrary(lib),lib,'이미 옮긴 목록은 그대로');
});
test('019 save with a name (default 모델 N per composition), rename, delete',()=>{
 let lib=migrateLibrary({});
 let r=addModel(lib,{slot:'top',image:'A',now:1});lib=r.lib;assert.equal(r.model.name,'모델 1');
 r=addModel(lib,{slot:'top',image:'B',name:'  봄 모델 ',now:2});lib=r.lib;assert.equal(r.model.name,'봄 모델');
 r=addModel(lib,{slot:'bottom',image:'C',now:3});lib=r.lib;assert.equal(r.model.name,'모델 1','구도별 번호');
 const b=modelsFor(lib,'top')[1].id;
 lib=renameModel(lib,b,'여름 모델',4);assert.equal(modelsFor(lib,'top')[1].name,'여름 모델');assert.equal(renameModel(lib,b,'  ',5),lib,'빈 이름은 무시');
 lib=deleteModel(lib,b,6);assert.deepEqual(modelsFor(lib,'top').map(m=>m.image),['A']);assert.equal(lib.deleted[b],6);
});
test('019 pick: first pick becomes the composition default, each product remembers its last pick, "none" = create a new model, deleted model falls back',()=>{
 let lib=migrateLibrary({});let r=addModel(lib,{slot:'top',image:'A',now:1});lib=r.lib;const a=r.model.id;r=addModel(lib,{slot:'top',image:'B',now:2});lib=r.lib;const b=r.model.id;
 let picks=setPick({},'p1','top',b);
 assert.equal(pickFor(picks,lib,'p1','top').id,b);assert.equal(pickFor(picks,lib,'p2','top').id,b,'다른 상품은 기본값(처음 고른 모델)');
 picks=setPick(picks,'p2','top',a);assert.equal(pickFor(picks,lib,'p2','top').id,a);assert.equal(pickFor(picks,lib,'p1','top').id,b,'상품마다 기억');assert.equal(picks.default.top,b,'기본값은 처음 고른 것');
 picks=setPick(picks,'p3','top','none');assert.equal(pickFor(picks,lib,'p3','top'),null,'새 모델 생성');
 lib=deleteModel(lib,b,3);assert.equal(pickFor(picks,lib,'p1','top'),null,'지운 모델은 선택에서 빠짐');assert.equal(pickFor(picks,lib,'p2','top').id,a);
});
test('019 merge between this browser and Drive: newer edit wins, deletions stick, photos/file ids are joined; Drive index has no photos',()=>{
 const local={v:2,at:10,models:[{id:'x',name:'로컬',slot:'top',image:'IMG-x',at:10},{id:'y',name:'y',slot:'top',image:'IMG-y',at:3}],deleted:{}};
 const remote={v:2,at:20,models:[{id:'x',name:'드라이브',slot:'top',fileId:'F-x',at:8},{id:'z',name:'z',slot:'dress',fileId:'F-z',at:15}],deleted:{y:12}};
 const m=mergeLibrary(local,remote);
 assert.deepEqual(m.models.map(x=>x.id),['x','z'],'y는 드라이브에서 지움');
 const x=m.models[0];assert.equal(x.name,'로컬','나중에 바꾼 쪽');assert.equal(x.image,'IMG-x');assert.equal(x.fileId,'F-x','파일 ID 이어 붙임');
 assert.equal(m.models[1].image,undefined,'드라이브에만 있는 모델은 사진을 받아야 함');assert.equal(m.at,20);
 const again=mergeLibrary({...local,models:[...local.models,{id:'y',name:'y2',slot:'top',image:'IMG-y',at:30}]},remote);
 assert.ok(again.models.some(v=>v.id==='y'),'지운 뒤 다시 저장(더 나중)하면 남음');
 const idx=driveIndex(m);assert.ok(idx.models.every(v=>!('image' in v)));assert.equal(idx.deleted.y,12);
 assert.deepEqual(mergeLibrary({top:'T',at:1},null).models.map(v=>v.id),['m-018-top'],'018 형식도 병합');
});
import {syncLibrary} from '../src/utils/modelLibrary.js';
const fakeDrive=(index)=>{const log={saved:[],uploaded:[],trashed:[],downloaded:[]};let n=0;
 return {log,d:{loadIndex:async()=>index&&structuredClone(index),saveIndex:async v=>{log.saved.push(v);index=v;},folder:async()=>'FOLDER',
  upload:async(f,m)=>{log.uploaded.push([f,m.id]);return 'F-'+(++n);},download:async id=>{log.downloaded.push(id);return 'data:from-'+id;},trash:async id=>{log.trashed.push(id);}}};};
test('019 Drive sync (mock): 018 file is upgraded to a list with photos as JPGs in 모델보관함; Drive-only models get their photos; deletions trash the JPG; no rewrite when nothing changed',async()=>{
 // 다른 PC가 018 형식으로 올려 둔 파일
 let {log,d}=fakeDrive({top:'data:T',at:5});
 let lib=await syncLibrary(migrateLibrary({}),d);
 assert.deepEqual(lib.models.map(m=>[m.slot,m.name,m.fileId]),[['top','모델 1','F-1']]);assert.deepEqual(log.uploaded,[['FOLDER','m-018-top']]);
 assert.equal(log.saved.length,1);assert.equal(log.saved[0].v,2);assert.ok(log.saved[0].models.every(m=>!('image' in m)),'json에는 사진 없음');
 // 이 PC에서 모델 추가 → 업로드, 다른 PC(드라이브)에서 하나 추가돼 있음 → 사진 받아 옴
 const idx={...log.saved[0],at:50,models:[...log.saved[0].models,{id:'r1',name:'집 PC 모델',slot:'dress',fileId:'F-home',at:40}]};
 ({log,d}=fakeDrive(idx));
 const added=addModel(lib,{slot:'top',image:'data:new',now:30});
 lib=await syncLibrary(added.lib,d);
 assert.deepEqual(log.downloaded,['F-home']);assert.equal(lib.models.find(m=>m.id==='r1').image,'data:from-F-home');
 assert.equal(log.uploaded.length,1);assert.ok(lib.models.every(m=>m.fileId));
 // 삭제 → 묘비 + JPG 휴지통
 const before=log.saved.at(-1);({log,d}=fakeDrive(before));
 lib=await syncLibrary(deleteModel(lib,'r1',60),d);
 assert.deepEqual(log.trashed,['F-home']);assert.ok(!lib.models.some(m=>m.id==='r1'));assert.equal(log.saved.at(-1).deleted.r1,60);
 // 바뀐 것이 없으면 다시 쓰지 않음
 ({log,d}=fakeDrive(log.saved.at(-1)));await syncLibrary(lib,d);assert.equal(log.saved.length,0);assert.equal(log.uploaded.length,0);
});
