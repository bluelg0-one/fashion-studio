import test from 'node:test';
import assert from 'node:assert/strict';
import {GARMENTS,initialSlots,sizeFields,newSizeRow,guideSvg,documentBlocks,documentHtml} from '../src/utils/studioDocument.js';
const texts={headline:'상품',description:'설명',product:'',fitTitle:'Fit guide',fitDescription:'키는 직접 입력',detailTitle:'Detail',sizeTitle:'Size',sizeNote:'단위 cm'};
const picture=(slots,id)=>{slots[id]={...slots[id],image:`data:image/png;base64,${id}`};};
test('document places hero first and sizes after enabled real detail images',()=>{
 const slots=initialSlots(false);for(const id of ['hero','frontZoom','side','back'])picture(slots,id);
 slots.back.enabled=false;
 const blocks=documentBlocks({v2:false,slots,fitEnabled:true,texts,garment:'long-top',rows:[newSizeRow()]});
 assert.equal(blocks[0].src,slots.hero.image);
 assert.ok(!blocks.some(b=>b.value==='Fit guide'));
 assert.deepEqual(blocks.filter(b=>b.kind==='image'&&!b.guide).map(b=>b.label),['정면','정면 확대','측면']);
 assert.ok(blocks.findIndex(b=>b.value==='Size')>blocks.findIndex(b=>b.src===slots.side.image));
 assert.deepEqual(blocks.find(b=>b.kind==='table').rows,[['—','—','—']]);
});
test('model section requires a photo, enabled slot, and user selection',()=>{
 const slots=initialSlots(false);picture(slots,'fit');
 const build=fitEnabled=>documentBlocks({v2:false,slots,fitEnabled,texts,garment:'vest',rows:[newSizeRow()]});
 assert.ok(!build(false).some(b=>b.value==='Fit guide'));
 assert.ok(build(true).some(b=>b.value==='Fit guide'));
 slots.fit.enabled=false;assert.ok(!build(true).some(b=>b.value==='Fit guide'));
});
test('all six garment guides are distinct and bottoms get the full measurement table',()=>{
 assert.equal(new Set(GARMENTS.map(g=>guideSvg(g.id))).size,6);
 for(const g of GARMENTS)assert.equal(sizeFields(g.id).length,g.id.endsWith('pants')?7:3);
 const row={...newSizeRow(),size:'M',waist:'32',rise:'28',hip:'45',thigh:'24',hem:'18',length:'95'};
 const table=documentBlocks({v2:false,slots:initialSlots(false),fitEnabled:false,texts,garment:'long-pants',rows:[row]}).find(b=>b.kind==='table');
 assert.deepEqual(table.rows,[['M','32','28','45','24','18','95']]);
});
test('all editable text is escaped in standalone HTML exports',()=>{
 const blocks=[{kind:'text',value:'<script>alert(1)</script>',size:24},{kind:'table',headers:['사이즈'],rows:[['<img src=x onerror=alert(1)>']]}];
 const html=documentHtml(blocks,'<상품>');assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;상품&gt;'));
});
test('014 hanger v2 order: front → texts → back → details in fixed order (only included ones) → no model block → size',()=>{
 const slots=initialSlots();
 assert.deepEqual(Object.keys(slots),['hero','back','fit'],'v2 칸');
 slots.hero={...slots.hero,image:'data:image/png;base64,H'};slots.back={...slots.back,image:'data:image/png;base64,B'};
 const d=(id,label,extra={})=>({id:'d-'+id,label,enabled:true,image:`data:image/png;base64,${id}`,derived:{from:'hero',detail:id},...extra});
 slots['d-hem']=d('hem','밑단');slots['d-neckline']=d('neckline','넥라인');slots['d-cuff']=d('cuff','소매 끝',{enabled:false});slots['d-fabric']=d('fabric','소재(원단 결)');
 slots.fit={...slots.fit,image:'data:image/png;base64,F',enabled:true};
 const texts={headline:'아이보리 가디건',description:'',product:'',backTitle:'Back',fitTitle:'Fit guide',fitDescription:'',detailTitle:'Detail',sizeTitle:'Size',sizeNote:''};
 const b=documentBlocks({slots,fitEnabled:true,texts,garment:'long-top',rows:[newSizeRow()]});
 const seq=b.map(x=>x.kind==='image'?(x.guide?'guide':x.src.split(',')[1]):x.kind==='table'?'table':x.value);
 assert.deepEqual(seq,['H','아이보리 가디건','Back','B','Detail','넥라인','neckline','소재(원단 결)','fabric','밑단','hem','Size','guide','table']);
 assert.ok(!seq.includes('F'),'모델컷(Fit)은 v2에서 쓰지 않음');
 const on=documentBlocks({slots,fitEnabled:false,texts,garment:'long-top',rows:[newSizeRow()],modelCut:{enabled:true,label:'AI 모델 컷',slot:{enabled:true,image:'data:image/png;base64,M'}}});
 const s2=on.map(x=>x.kind==='image'?(x.guide?'guide':x.src.split(',')[1]):x.kind==='table'?'table':x.value);
 assert.deepEqual(s2.slice(s2.indexOf('hem')+1,s2.indexOf('Size')),['Model','M','AI 모델 컷'],'켜면 디테일 다음·사이즈 앞, AI 모델 컷 표시');
});
test('017 model cuts: included cuts in the chosen order, each with a small "AI 모델 컷" mark under the photo; excluded/none → no Model section',()=>{
 const slots=initialSlots(true);slots.hero={...slots.hero,image:'data:image/png;base64,H'};
 const texts={headline:'t',description:'',product:'',detailTitle:'Detail',sizeTitle:'Size',sizeNote:''};
 const cuts=[{id:'a',src:'data:image/jpeg;base64,A',enabled:true},{id:'b',src:'data:image/jpeg;base64,B',enabled:false},{id:'c',src:'data:image/jpeg;base64,C',enabled:true}];
 for(const layout of [null,'dooson']){
  const b=documentBlocks({v2:true,layout,slots,texts,garment:'long-top',rows:[newSizeRow()],modelCuts:cuts});
  const seq=b.map(x=>x.kind==='image'?(x.guide?'guide':x.src.split(',')[1]):x.kind==='table'?'table':x.value);
  const i=seq.indexOf('Model');assert.ok(i>0,String(layout));
  assert.deepEqual(seq.slice(i,i+5),['Model','A','AI 모델 컷','C','AI 모델 컷'],`${layout}: 순서·표시`);
  assert.ok(!seq.includes('B'),'포함 안 한 컷 빠짐');
  assert.ok(b.filter(x=>x.ai&&x.kind==='image').every(x=>x.label==='AI 모델 컷'));
  if(layout==='dooson')assert.ok(i>seq.indexOf('Size'),'두손 베이직: INFO·SIZE 뒤');else assert.ok(i<seq.indexOf('Size'),'다른 테마: 사이즈 앞');
 }
 const none=documentBlocks({v2:true,slots,texts,garment:'long-top',rows:[newSizeRow()],modelCuts:[{src:'x',enabled:false}]});
 assert.ok(!none.some(x=>x.section==='model'));
});
