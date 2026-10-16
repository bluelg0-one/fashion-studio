import test from 'node:test';
import assert from 'node:assert/strict';
import {GARMENTS,initialSlots,sizeFields,newSizeRow,guideSvg,documentBlocks,documentHtml} from '../src/utils/studioDocument.js';
const texts={headline:'상품',description:'설명',product:'',fitTitle:'Fit guide',fitDescription:'키는 직접 입력',detailTitle:'Detail',sizeTitle:'Size',sizeNote:'단위 cm'};
const picture=(slots,id)=>{slots[id]={...slots[id],image:`data:image/png;base64,${id}`};};
test('document places hero first and sizes after enabled real detail images',()=>{
 const slots=initialSlots();for(const id of ['hero','frontZoom','side','back'])picture(slots,id);
 slots.back.enabled=false;
 const blocks=documentBlocks({slots,fitEnabled:true,texts,garment:'long-top',rows:[newSizeRow()]});
 assert.equal(blocks[0].src,slots.hero.image);
 assert.ok(!blocks.some(b=>b.value==='Fit guide'));
 assert.deepEqual(blocks.filter(b=>b.kind==='image'&&!b.guide).map(b=>b.label),['대표 정면샷','정면 확대컷','옆면컷']);
 assert.ok(blocks.findIndex(b=>b.value==='Size')>blocks.findIndex(b=>b.src===slots.side.image));
 assert.deepEqual(blocks.find(b=>b.kind==='table').rows,[['—','—','—']]);
});
test('model section requires a photo, enabled slot, and user selection',()=>{
 const slots=initialSlots();picture(slots,'fit');
 const build=fitEnabled=>documentBlocks({slots,fitEnabled,texts,garment:'vest',rows:[newSizeRow()]});
 assert.ok(!build(false).some(b=>b.value==='Fit guide'));
 assert.ok(build(true).some(b=>b.value==='Fit guide'));
 slots.fit.enabled=false;assert.ok(!build(true).some(b=>b.value==='Fit guide'));
});
test('all six garment guides are distinct and bottoms get the full measurement table',()=>{
 assert.equal(new Set(GARMENTS.map(g=>guideSvg(g.id))).size,6);
 for(const g of GARMENTS)assert.equal(sizeFields(g.id).length,g.id.endsWith('pants')?7:3);
 const row={...newSizeRow(),size:'M',waist:'32',rise:'28',hip:'45',thigh:'24',hem:'18',length:'95'};
 const table=documentBlocks({slots:initialSlots(),fitEnabled:false,texts,garment:'long-pants',rows:[row]}).find(b=>b.kind==='table');
 assert.deepEqual(table.rows,[['M','32','28','45','24','18','95']]);
});
test('all editable text is escaped in standalone HTML exports',()=>{
 const blocks=[{kind:'text',value:'<script>alert(1)</script>',size:24},{kind:'table',headers:['사이즈'],rows:[['<img src=x onerror=alert(1)>']]}];
 const html=documentHtml(blocks,'<상품>');assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;상품&gt;'));
});
