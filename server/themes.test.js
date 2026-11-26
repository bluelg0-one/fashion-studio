import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSlots,newSizeRow,documentBlocks,documentHtml} from '../src/utils/studioDocument.js';
import {THEMES,THEME_LIST,themeOf,themeUnits,themedHtml,NEW_PRODUCT_THEME,wrap,themeList,newProductTheme,layoutOf,colorColumns} from '../src/utils/detailThemes.js';
const texts={headline:'<b>상품</b>',description:'설명',product:'',fitTitle:'Fit guide',fitDescription:'모델 165cm',detailTitle:'Detail',sizeTitle:'Size',sizeNote:'단위 cm'};
const withPhotos=ids=>{const s=initialSlots(false);for(const id of ids)s[id]={...s[id],image:`data:image/png;base64,${id}`};return s;};
test('theme list: v2 puts 두손 베이직 first and starts new products with it; ?v1 keeps soft first; unknown/missing ids fall back to basic (old products keep their look)',()=>{
 assert.deepEqual(THEME_LIST.map(t=>t.id),['dooson','soft','minimal','magazine','basic']);assert.equal(NEW_PRODUCT_THEME,'dooson');
 assert.deepEqual(themeList(false).map(t=>t.id),['soft','minimal','magazine','basic']);assert.equal(newProductTheme(false),'soft');
 assert.equal(layoutOf('dooson'),'dooson');assert.equal(layoutOf('soft'),null);assert.equal(layoutOf(undefined),null);
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
test('dooson, soft, minimal and magazine are readable on a phone: size and contrast',()=>{
 const phone=390/860;
 for(const id of ['dooson','soft','minimal','magazine']){
  const t=THEMES[id],bgs=[t.bg,t.card,t.accentSoft].filter(Boolean);
  assert.ok(t.body.size*phone>=14,`${id} 본문 ${t.body.size*phone}px`);
  for(const k of ['caption','note','product'])assert.ok(t[k].size*phone>=12,`${id} ${k}`);
  assert.ok(t.tag.size*phone>=11.5,`${id} 컷 이름`);assert.ok(t.table.size*phone>=12,`${id} 치수표`);
  for(const fg of [t.text,t.soft,t.muted])for(const bg of bgs)assert.ok(ratio(fg,bg)>=4.5,`${id} ${fg} on ${bg} = ${ratio(fg,bg).toFixed(2)}`);
  for(const k of ['intro','tagline','brand'])if(t[k])assert.ok(t[k].size*phone>=12,`${id} ${k}`);
  if(t.colors)assert.ok(t.colors.name*phone>=12,`${id} 색 이름`);if(t.info)assert.ok(t.info.size*phone>=12,`${id} INFO`);
  if(t.section.style==='caps')assert.ok(t.section.size*phone>=13,`${id} 소제목`);
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

// ── 015 두손 베이직 ─────────────────────────────────────────
const v2Slots=()=>{const s=initialSlots(true);s.hero={...s.hero,image:'data:image/png;base64,F'};s.back={...s.back,image:'data:image/png;base64,B'};
 const d=(detail,label)=>({id:'d-'+detail,label,enabled:true,image:`data:image/png;base64,${detail}`,derived:{from:'hero',detail}});
 s['d-cuff']=d('cuff','소매');s['d-neckline']=d('neckline','넥라인');s['d-fabric']=d('fabric','소재');return s;};
const v2Texts={...texts,headline:'라운드 니트',intro:'',tagline:'',material:'면 100%',care:'',fitNote:'여유 있는 핏'};
test('015 두손 베이직 order: DOOSON → name → front → back → COLOR CHOICE → DETAIL(no captions, fixed order) → SIZE → INFO; model cut stays off',()=>{
 const colors=[{name:'아이보리',src:'data:image/png;base64,I',current:true},{name:'네이비',src:'data:image/png;base64,N'}];
 const blocks=documentBlocks({v2:true,layout:'dooson',slots:v2Slots(),texts:{...v2Texts,intro:'부드러운 니트',tagline:'Everyday knit'},garment:'long-top',rows:[newSizeRow()],colors});
 const units=themeUnits(blocks,THEMES.dooson);
 assert.deepEqual(units.map(u=>u.type),['brand','headline','intro','hero','tagline','photo','section','colors','section','photo','photo','photo','section','guide','table','note','section','info']);
 assert.equal(units[0].value,'DOOSON');
 assert.deepEqual(units.filter(u=>u.type==='section').map(u=>u.value),['Color choice','Detail','Size','Info']);
 assert.deepEqual(units.slice(9,12).map(u=>u.src.split(',')[1]),['neckline','fabric','cuff'],'넥라인 → 소재 → 소매');
 assert.ok(!units.some(u=>u.type==='label'),'디테일 설명 글 없음');
 assert.deepEqual(units.find(u=>u.type==='info').rows,[['소재','면 100%'],['핏','여유 있는 핏']],'입력한 칸만');
 const html=themedHtml(blocks,'t','dooson');
 assert.match(html,/text-transform:uppercase/);assert.match(html,/<figcaption>네이비<\/figcaption>/);assert.match(html,/<th scope="row">소재<\/th><td>면 100%<\/td>/);
 assert.ok(html.indexOf('class="hero"')<html.indexOf('class="tagline"'),'영문 문구는 사진 아래');
 assert.doesNotMatch(html,/border-radius/,'둥근 카드 없음');
});
test('015 두손 베이직: COLOR CHOICE only with 2+ colours, empty intro/tagline/info are left out, name falls back to the product name',()=>{
 const one=documentBlocks({v2:true,layout:'dooson',slots:v2Slots(),texts:{...v2Texts,headline:'',material:'',fitNote:''},garment:'long-top',rows:[newSizeRow()],colors:[{name:'아이보리',src:'x',current:true}],name:'상품 7'});
 const types=one.map(b=>b.role);
 assert.ok(!types.includes('colors')&&!types.includes('intro')&&!types.includes('tagline')&&!types.includes('info'),types.join());
 assert.equal(one.find(b=>b.role==='headline').value,'상품 7');
 assert.ok(!one.some(b=>b.section==='colors'||b.section==='info'));
 // 다른 테마·?v1은 예전 구성 그대로(DOOSON·COLOR CHOICE·INFO 없음)
 const soft=documentBlocks({v2:true,slots:v2Slots(),texts:v2Texts,garment:'long-top',rows:[newSizeRow()],colors:[{name:'a',src:'x'},{name:'b',src:'y'}]});
 assert.ok(!soft.some(b=>['brand','colors','info'].includes(b.role)));
 assert.equal(themeUnits([{kind:'text',value:'DOOSON',role:'brand'}],THEMES.soft).length,0,'브랜드 표기는 두손 베이직에서만');
 assert.deepEqual([1,2,3,4,5,6,7].map(n=>colorColumns(n)),[1,2,3,2,3,3,3]);
});
