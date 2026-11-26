import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSlots,newSizeRow,documentBlocks,documentHtml} from '../src/utils/studioDocument.js';
import {THEMES,THEME_LIST,themeOf,themeUnits,themedHtml,NEW_PRODUCT_THEME,wrap} from '../src/utils/detailThemes.js';
const texts={headline:'<b>상품</b>',description:'설명',product:'',fitTitle:'Fit guide',fitDescription:'모델 165cm',detailTitle:'Detail',sizeTitle:'Size',sizeNote:'단위 cm'};
const withPhotos=ids=>{const s=initialSlots(false);for(const id of ids)s[id]={...s[id],image:`data:image/png;base64,${id}`};return s;};
test('theme list: soft first, new products start soft, unknown/missing ids fall back to basic (old products keep their look)',()=>{
 assert.deepEqual(THEME_LIST.map(t=>t.id),['soft','minimal','magazine','basic']);assert.equal(NEW_PRODUCT_THEME,'soft');
 assert.equal(themeOf(undefined).id,'basic');assert.equal(themeOf('nope').id,'basic');
 for(const t of THEME_LIST.filter(t=>t.id!=='basic')){assert.match(t.google,/^family=/);for(const f of Object.values(t.fonts))assert.ok(f.family&&f.weight,t.id);}
});
test('basic HTML is unchanged by the theme roles',()=>{
 const blocks=documentBlocks({v2:false,slots:withPhotos(['hero','frontZoom']),fitEnabled:false,texts,garment:'long-top',rows:[newSizeRow()]});
 const plain=blocks.map(({role,section,...b})=>b);
 assert.equal(documentHtml(blocks,'t'),documentHtml(plain,'t'));
});
test('themed units keep the order: hero → text → fit → detail → size; magazine pairs details',()=>{
 const slots=withPhotos(['hero','fit','frontZoom','frontTop','fabric']);
 const blocks=documentBlocks({v2:false,slots,fitEnabled:true,texts,garment:'long-top',rows:[{...newSizeRow(),size:'M',chest:'50',length:'60'}]});
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
 for(const t of THEME_LIST.filter(t=>t.id!=='basic')){
  const html=themedHtml(blocks,'<상품>',t.id);
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;상품&gt;'));
  assert.ok(html.includes(`data-theme="${t.id}"`));
  const links=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(links.every(h=>/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(h)),links.join());
 }
});

// 휴대폰 가독성: 860px PNG가 폭 390px로 줄어든 상태 기준(×0.4535). 본문 14px·메모 12px 이상, 명암비 4.5:1 이상.
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
test('soft, minimal and magazine are readable on a phone: size and contrast',()=>{
 const phone=390/860;
 for(const id of ['soft','minimal','magazine']){
  const t=THEMES[id],bgs=[t.bg,t.card,t.accentSoft].filter(Boolean);
  assert.ok(t.body.size*phone>=14,`${id} 본문 ${t.body.size*phone}px`);
  for(const k of ['caption','note','product'])assert.ok(t[k].size*phone>=12,`${id} ${k}`);
  assert.ok(t.tag.size*phone>=11.5,`${id} 컷 이름`);assert.ok(t.table.size*phone>=12,`${id} 치수표`);
  for(const fg of [t.text,t.soft,t.muted])for(const bg of bgs)assert.ok(ratio(fg,bg)>=4.5,`${id} ${fg} on ${bg} = ${ratio(fg,bg).toFixed(2)}`);
  if(t.section.style==='pill')assert.ok(ratio('#ffffff',t.accent)>=4.5,`${id} 소제목 흰 글자 ${ratio('#ffffff',t.accent).toFixed(2)}`);
 }
});
test('theme text wraps at spaces, not in the middle of a word; only over-long words break by letter',()=>{
 const ctx={measureText:t=>({width:[...t].length})};
 assert.deepEqual(wrap(ctx,'부드러운 골지 짜임으로 몸에 편안하게 맞는 라운드 니트입니다.',24),['부드러운 골지 짜임으로 몸에 편안하게 맞는','라운드 니트입니다.']);
 assert.deepEqual(wrap(ctx,'아주아주아주긴낱말입니다아주아주아주긴낱말 다음',8),['아주아주아주긴낱','말입니다아주아주','아주긴낱말 다음']);
 assert.deepEqual(wrap(ctx,'a\n\nb',5),['a','','b']);
});
test('size guide text is larger in soft, minimal and magazine (about 12px on a phone); basic and Shopee guides are unchanged',async()=>{
 const {guideSvg}=await import('../src/utils/studioDocument.js');
 const blocks=documentBlocks({v2:false,slots:withPhotos(['hero']),fitEnabled:false,texts,garment:'long-pants',rows:[newSizeRow()]});
 const guideSrc=id=>themeUnits(blocks,THEMES[id]).find(u=>u.type==='guide').src;
 const svg=src=>decodeURIComponent(src.split(',')[1]);
 for(const id of ['soft','minimal','magazine']){
  const s=svg(guideSrc(id));assert.ok(s.includes('font-size="24"'),id);assert.ok(!s.includes('font-size="13"'),id);
  // 860px 문서에서 그림이 그려지는 폭(카드·여백 제외) → 폰 390px에서 보이는 글자 크기
  const t=THEMES[id],avail=860-t.pad*2-(t.photo.card?t.photo.card.pad*2:0),scale=Math.min(avail/640,620/456,1.6);
  assert.ok(24*scale*390/860>=11,`${id} ${(24*scale*390/860).toFixed(1)}px`);
 }
 for(const g of GARMENTS_ALL)for(const lang of ['ko','en']){const s=guideSvg(g,lang);assert.ok(s.includes('font-size="13"')&&!s.includes('font-size="24"'));assert.match(s,/height="420"/);}
});
const GARMENTS_ALL=['long-top','short-top','vest','dress','long-pants','short-pants'];
