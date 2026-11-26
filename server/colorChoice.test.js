import test from 'node:test';
import assert from 'node:assert/strict';
import {colorChoice,colorMembers,colorSuggestions,linkColor,unlinkColor} from '../src/utils/colorChoice.js';
import {classifyPhotos} from '../server/classify.js';

// 메모리 저장소(IndexedDB 대신)
const memory=items=>{const db=new Map(items.map(p=>[p.id,structuredClone(p)]));
 return {db,get:async id=>structuredClone(db.get(id)),save:async p=>{db.set(p.id,structuredClone(p));},
  list:async()=>[...db.values()].map(({id,name,data})=>({id,name,colorGroup:data?.colorGroup||null,design:data?.design||'',colorName:data?.texts?.colorName||''}))};};
const prod=(id,name,extra={})=>({id,name,data:{slots:{hero:{image:`data:image/png;base64,${id}`}},texts:{colorName:extra.color||''},...extra.data}});

test('015 link: products join one colour group (a product from another group brings its group along); unlink removes only that product',async()=>{
 const st=memory([prod('a','니트 A',{color:'아이보리'}),prod('b','니트 B',{color:'네이비'}),prod('c','니트 C',{color:'블랙',data:{colorGroup:'old'}}),prod('d','니트 D',{data:{colorGroup:'old'}}),prod('e','다른 옷')]);
 const g=await linkColor({id:'a',group:null},'b',st);
 assert.match(g,/^cg-/);assert.equal(st.db.get('b').data.colorGroup,g);
 assert.equal(st.db.get('a').data.colorGroup,undefined,'지금 상품은 화면이 저장');
 await st.save({...st.db.get('a'),data:{...st.db.get('a').data,colorGroup:g}});
 assert.equal(await linkColor({id:'a',group:g},'c',st),g);
 assert.equal(st.db.get('c').data.colorGroup,g);assert.equal(st.db.get('d').data.colorGroup,g,'C의 예전 묶음(D)도 함께');
 assert.deepEqual(colorMembers(await st.list(),{id:'a',group:g}).map(p=>p.id).sort(),['b','c','d']);
 await unlinkColor('d',st);
 assert.equal(st.db.get('d').data.colorGroup,null);assert.equal(st.db.get('e').data.colorGroup,undefined,'관계없는 상품은 그대로');
 assert.equal(st.db.get('a').data.slots.hero.image,'data:image/png;base64,a','다른 값은 그대로');
});
test('015 COLOR CHOICE list: only products with a front final, sorted by colour name, current product uses the on-screen values; fewer than 2 → empty',async()=>{
 const st=memory([prod('a','니트 A',{data:{colorGroup:'g'}}),prod('b','니트 B',{color:'네이비',data:{colorGroup:'g'}}),{id:'c',name:'니트 C',data:{colorGroup:'g',slots:{hero:{image:null}},texts:{colorName:'블랙'}}},prod('x','다른',{color:'레드'})]);
 const shrunk=[];
 const items=await colorChoice({id:'a',group:'g',name:'니트 A',colorName:'아이보리',image:'data:image/png;base64,SCREEN'},{...st,shrink:async s=>{shrunk.push(s);return 'small:'+s.slice(-6);}});
 assert.deepEqual(items.map(x=>[x.name,x.current]),[['네이비',false],['아이보리',true]],'가나다순, 사진 없는 블랙 빠짐, 다른 묶음 빠짐');
 assert.equal(items[1].src,'small:SCREEN','지금 상품은 화면의 정면 최종본');assert.equal(shrunk.length,2);
 assert.deepEqual(await colorChoice({id:'a',group:null,image:'x'},st),[],'연결 없음');
 assert.deepEqual(await colorChoice({id:'x',group:'solo',image:'x'},st),[],'1색뿐');
 const fallback=await colorChoice({id:'a',group:'g',name:'니트 A',colorName:'',image:'s'},st);
 assert.ok(fallback.some(x=>x.name==='니트 A'),'색 이름이 없으면 상품 이름');
});
test('015 suggestions: same design id from the hanger classification, not yet in my group',()=>{
 const list=[{id:'a',design:'up-1-d1',colorGroup:null},{id:'b',design:'up-1-d1',colorGroup:null},{id:'c',design:'up-1-d2'},{id:'d',design:'up-1-d1',colorGroup:'g'}];
 assert.deepEqual(colorSuggestions(list,{id:'a',group:null,design:'up-1-d1'}).map(p=>p.id),['b','d']);
 assert.deepEqual(colorSuggestions(list,{id:'a',group:'g',design:'up-1-d1'}).map(p=>p.id),['b'],'이미 연결된 상품은 제안 안 함');
 assert.deepEqual(colorSuggestions(list,{id:'a',group:null,design:''}),[]);
});
test('015 hanger classification asks for design + colour and returns them (mock); mannequin mode unchanged',async()=>{
 const img='data:image/jpeg;base64,AAAA';
 const fake=out=>{const calls=[];return {calls,beta:{messages:{parse:async req=>{calls.push(req);return {stop_reason:'end_turn',parsed_output:structuredClone(out),usage:{input_tokens:1,output_tokens:1}};}}}};};
 const c=fake({garments:[{id:'g1',description:'아이보리 니트',design:'d1',color:'아이보리'},{id:'g2',description:'네이비 니트',design:'d1',color:'네이비'}],photos:[{index:1,garment:'g1',shot:'front',confidence:.9,review:false,note:''},{index:2,garment:'g2',shot:'front',confidence:.9,review:false,note:''}]});
 const r=await classifyPhotos({mode:'hanger',photos:[{id:'p1',image:img},{id:'p2',image:img}]},{},c);
 assert.deepEqual(r.garments.map(g=>[g.design,g.color]),[['d1','아이보리'],['d1','네이비']]);
 assert.match(c.calls[0].messages[0].content.at(-1).text,/design id/);
 const old=fake({garments:[{id:'g1',description:'x'}],photos:[]});await classifyPhotos({photos:[{id:'a',image:img}]},{},old);
 assert.doesNotMatch(old.calls[0].messages[0].content.at(-1).text,/design id/);
});
