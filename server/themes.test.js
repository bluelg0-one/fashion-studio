import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSlots,newSizeRow,documentBlocks,documentHtml} from '../src/utils/studioDocument.js';
import {THEMES,THEME_LIST,themeOf,themeUnits,themedHtml} from '../src/utils/detailThemes.js';
const texts={headline:'<b>상품</b>',description:'설명',product:'',fitTitle:'Fit guide',fitDescription:'모델 165cm',detailTitle:'Detail',sizeTitle:'Size',sizeNote:'단위 cm'};
const withPhotos=ids=>{const s=initialSlots();for(const id of ids)s[id]={...s[id],image:`data:image/png;base64,${id}`};return s;};
test('theme list: basic first, unknown ids fall back to basic (old products keep their look)',()=>{
 assert.equal(THEME_LIST[0].id,'basic');assert.equal(THEME_LIST.length,4);
 assert.equal(themeOf(undefined).id,'basic');assert.equal(themeOf('nope').id,'basic');
 for(const t of THEME_LIST.slice(1)){assert.match(t.google,/^family=/);for(const f of Object.values(t.fonts))assert.ok(f.family&&f.weight,t.id);}
});
test('basic HTML is unchanged by the theme roles',()=>{
 const blocks=documentBlocks({slots:withPhotos(['hero','frontZoom']),fitEnabled:false,texts,garment:'long-top',rows:[newSizeRow()]});
 const plain=blocks.map(({role,section,...b})=>b);
 assert.equal(documentHtml(blocks,'t'),documentHtml(plain,'t'));
});
test('themed units keep the order: hero → text → fit → detail → size; magazine pairs details',()=>{
 const slots=withPhotos(['hero','fit','frontZoom','frontTop','fabric']);
 const blocks=documentBlocks({slots,fitEnabled:true,texts,garment:'long-top',rows:[{...newSizeRow(),size:'M',chest:'50',length:'60'}]});
 const minimal=themeUnits(blocks,THEMES.minimal).map(u=>u.type);
 assert.deepEqual(minimal,['hero','headline','body','section','photo','caption','section','label','photo','label','photo','label','photo','section','guide','table','note']);
 const mag=themeUnits(blocks,THEMES.magazine);
 assert.deepEqual(mag.map(u=>u.type),['hero','headline','body','section','photo','caption','section','pair','photo','section','guide','table','note']);
 assert.deepEqual(mag.find(u=>u.type==='pair').items.map(x=>x.label),['정면 확대','정면 상단']);
 assert.equal(mag.filter(u=>u.type==='section').map(u=>u.index).join(),'1,2,3');
 assert.deepEqual(mag.find(u=>u.type==='table').rows,[['M','50','60']]);
});
test('themed HTML escapes text, links only Google Fonts, and marks the theme',()=>{
 const blocks=[{kind:'text',value:'<script>alert(1)</script>',size:24,role:'headline'},{kind:'table',role:'table',headers:['<i>'],rows:[['<img src=x onerror=alert(1)>']]}];
 for(const t of THEME_LIST.slice(1)){
  const html=themedHtml(blocks,'<상품>',t.id);
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;상품&gt;'));
  assert.ok(html.includes(`data-theme="${t.id}"`));
  const links=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(links.every(h=>/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(h)),links.join());
 }
});
