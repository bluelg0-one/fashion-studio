// 017 옷걸이 v2 3개 탭: [원본 보정] [모델컷] [상세페이지] — 탭 이동·상태 유지, 모델컷(FASHN·Google 모의) → 얼굴 자동 자르기 → 상품에 저장 → 상세페이지 'AI 모델 컷'.
// 비용 없음(모든 API 모의). 키 없음 안내도 확인합니다.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
const URL0=process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001';
async function open(config){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('about:blank');
 const fx=await page.evaluate(()=>{
  const draw=(W,H,paint)=>{const c=document.createElement('canvas');c.width=W;c.height=H;paint(c.getContext('2d'),W,H);return c.toDataURL('image/png');};
  const knit=(g,wall)=>(c,W,H)=>{if(wall){c.fillStyle='#d9d2c4';c.fillRect(0,0,W,H);}c.fillStyle='#9a9a9a';c.fillRect(W/2-8,30,16,80);c.fillStyle=g;c.fillRect(W*.25,110,W*.5,H*.8);c.fillRect(W*.15,140,W*.08,H*.7);c.fillRect(W*.77,140,W*.08,H*.7);};
  // 생성 결과(모의): 얼굴이 나온 모델 사진(위 4~22% 얼굴, 22~28% 목, 그 아래 상의)
  const person=draw(1536,2048,(c,W,H)=>{c.fillStyle='#fff';c.fillRect(0,0,W,H);c.fillStyle='rgb(224,172,140)';c.fillRect(W*.38,H*.04,W*.24,H*.18);c.fillRect(W*.45,H*.22,W*.1,H*.06);c.fillStyle='#3c508c';c.fillRect(W*.25,H*.28,W*.5,H*.32);c.fillStyle='#28282d';c.fillRect(W*.3,H*.6,W*.4,H*.38);});
  const base=draw(768,1024,(c,W,H)=>{c.fillStyle='#eee';c.fillRect(0,0,W,H);c.fillStyle='#3c508c';c.fillRect(W*.25,0,W*.5,H);});
  return {front:draw(1200,1600,knit('#d6bec8',true)),frontCut:draw(1200,1600,knit('#d6bec8',false)),back:draw(1200,1600,knit('#cdb5bf',true)),backCut:draw(1200,1600,knit('#cdb5bf',false)),person,base};
 });
 const queue=[],shots=[];
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='retouch')return r.fulfill({json:{image:queue.shift()}});
  return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:true}});});
 await page.route('http://127.0.0.1:808*/**',r=>r.abort());
 await page.route('https://cdn.fashn.test/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from(fx.person.split(',')[1],'base64')}));
 await page.route('**/api/modelshot',async r=>{const b=JSON.parse(r.request().postData()||'{}');shots.push(b);
  if(b.action==='config')return r.fulfill({json:config});
  if(b.action==='run'&&b.provider==='fashn')return r.fulfill({json:{id:'job-'+shots.length}});
  if(b.action==='status')return r.fulfill({json:{status:'completed',output:['https://cdn.fashn.test/out-'+b.id+'.png']}});
  if(b.action==='fetch')return r.fulfill({json:{dataUrl:fx.person}});
  if(b.action==='run'&&b.provider==='google')return r.fulfill({json:{id:'google-1',status:'completed',output:[fx.person]}});
  return r.fulfill({status:400,json:{error:'unexpected'}});});
 await page.goto(URL0);
 const idle=()=>page.waitForFunction(()=>{const e=document.querySelector('.studio-editor')||document.querySelector('.product-bar');return e&&!document.querySelector('fieldset.cut-section:disabled')&&document.querySelector('[aria-label="상품 이름"]')?.value;});
 await idle();
 return {ctx,page,errors,fx,queue,shots,idle};
}
const tab=(page,name)=>page.getByRole('tab',{name,exact:true}).click();
try{
 const {page,errors,fx,queue,shots,idle}=await open({fashn:true,google:true,styleroom:false});
 const dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 assert.deepEqual(await page.getByRole('tab').allInnerTexts(),['원본 보정','모델컷','상세페이지']);
 // ① 원본 보정: 사진·보정 칸만, 상세페이지 편집은 없음
 assert.equal(await page.getByRole('tab',{name:'원본 보정'}).getAttribute('aria-selected'),'true');
 assert.ok(await page.getByLabel('컷별 보정').isVisible());assert.equal(await page.getByLabel('상세페이지 디자인 테마').count(),0);
 assert.ok(await page.getByLabel('사진 한꺼번에 올리기').count());
 const put=async(id,url)=>{await page.getByLabel(`${id} 사진 선택`,{exact:true}).setInputFiles({name:id+'.png',mimeType:'image/png',buffer:Buffer.from(url.split(',')[1],'base64')});await idle();};
 await put('hero',fx.front);await put('back',fx.back);queue.push(fx.frontCut,fx.backCut);
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle();
 await page.getByLabel('상품 이름').fill('탭 시험 니트');
 // ② 상세페이지: 같은 상품, 편집 칸, 사진 칸은 없음
 await tab(page,'상세페이지');
 assert.equal(await page.getByLabel('상품 이름').inputValue(),'탭 시험 니트');
 assert.ok(await page.getByLabel('상세페이지 디자인 테마').isVisible());assert.equal(await page.getByLabel('컷별 보정').count(),0);
 assert.equal(await page.getByLabel('사진 한꺼번에 올리기').count(),0);
 await page.getByLabel('상품 제목').fill('라운드 니트');
 assert.match(await page.getByLabel('AI 모델 컷 목록').innerText(),/저장한 모델컷이 없습니다/);
 // ③ 모델컷: 정면 보정본이 기본, 구도는 옷 종류(긴팔) → 상반신 얼굴 없음, 얼굴 고정 기본 꺼짐
 await tab(page,'모델컷');
 assert.equal(await page.getByLabel('의류 옷걸이 정면').getAttribute('aria-pressed'),'true');
 assert.equal(await page.getByLabel('모델컷 구도').inputValue(),'top');
 assert.equal(await page.getByRole('alert').filter({hasText:'FASHN_API_KEY'}).count(),0,'키 있으면 안내 없음');
 await page.getByRole('button',{name:/FASHN 유료 · 4장 생성/}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='이 상품 모델컷으로 저장'));
 const conf=dialogs.find(m=>/FASHN으로 모델컷/.test(m));assert.ok(conf,'확인 창');assert.match(conf,/구도: 상반신 · 얼굴 없음/);assert.match(conf,/예상 약 \$0\.30/);
 const runs=shots.filter(b=>b.action==='run');assert.equal(runs.length,4,'장면 4개');
 for(const r of runs){assert.match(r.inputs.prompt,/^cropped upper body shot from just below the chin/);assert.match(r.inputs.prompt,/no face/);assert.doesNotMatch(r.inputs.prompt,/full body shot/);assert.equal(r.inputs.face_reference,undefined,'얼굴 고정 없음');}
 // 결과 → 이 상품 모델컷으로 저장: 얼굴 자동 자르기(확인 필요) + 원본 나란히
 await page.getByRole('button',{name:'이 상품 모델컷으로 저장'}).first().click();
 const dlg=page.getByRole('dialog',{name:'모델컷 저장'});await dlg.getByRole('status').waitFor();
 await page.waitForFunction(()=>/확인 필요/.test(document.querySelector('[aria-label="모델컷 저장"] [role=status]')?.textContent||''));
 const pct=Number(await dlg.getByLabel('위쪽 자르기').inputValue());assert.ok(pct>=18&&pct<=27,`자른 비율 ${pct}%`);
 assert.ok(await dlg.getByAltText('원본 의류 사진').isVisible());
 assert.match(await dlg.innerText(),/자른 뒤 1536×1\d{3}px/);
 await dlg.getByRole('button',{name:'이 상품 모델컷으로 저장'}).click();
 assert.equal(await dlg.count(),0);
 // 같은 설정 다시 누르면 재사용(추가 호출 없음)
 const before=shots.filter(b=>b.action==='run').length;
 await page.getByRole('button',{name:/FASHN 유료 · 4장 생성/}).click();await page.waitForTimeout(300);
 assert.equal(shots.filter(b=>b.action==='run').length,before,'같은 설정은 다시 호출하지 않음');
 // Google: 기본 모델 사진이 없으면 안내 → 넣고 생성(사람 사진 + 옷)
 await page.getByRole('button',{name:'엔진 Google 가상 피팅'}).click();
 await page.getByRole('button',{name:/Google 가상 피팅 유료 · 1장 생성/}).click();
 assert.ok(dialogs.some(m=>/기본 모델 사진을 넣어 주세요/.test(m)));
 await page.getByLabel('상반신 (얼굴 없음) 기본 모델 사진 선택').setInputFiles({name:'base.png',mimeType:'image/png',buffer:Buffer.from(fx.base.split(',')[1],'base64')});
 await page.getByAltText('상반신 (얼굴 없음) 기본 모델').waitFor();
 await page.getByRole('button',{name:/Google 가상 피팅 유료 · 1장 생성/}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('div')].some(d=>d.textContent.startsWith('👕 가상 피팅 1')));
 const g=shots.find(b=>b.action==='run'&&b.provider==='google');assert.ok(g.inputs.person_image.startsWith('data:image/jpeg'));assert.ok(g.inputs.product_image.startsWith('data:image/jpeg'));assert.equal(g.inputs.sample_count,1);
 assert.ok(dialogs.some(m=>/Google 가상 피팅으로 모델컷 1장/.test(m)&&/\$0\.06/.test(m)));
 // ④ 상세페이지에 반영: 포함·순서·AI 모델 컷 표시
 await tab(page,'상세페이지');
 assert.equal(await page.getByLabel('상품 제목').inputValue(),'라운드 니트','탭을 옮겨도 입력 유지');
 const list=page.getByLabel('AI 모델 컷 목록');assert.match(await list.innerText(),/AI 모델 컷 1/);assert.match(await list.innerText(),/자동 자르기/);
 assert.equal(await page.getByLabel('AI 모델 컷 1 상세페이지에 포함').isChecked(),true);
 const html=async()=>{const [dl]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'HTML 다운로드'}).click()]);return readFile(await dl.path(),'utf8');};
 let h=await html();assert.match(h,/<h2>Model<\/h2>/);assert.match(h,/AI 모델 컷<\/p>/);assert.ok(h.indexOf('AI 모델 컷</p>')>h.indexOf('<h2>Model</h2>'));
 await page.getByLabel('AI 모델 컷 1 상세페이지에 포함').uncheck();
 h=await html();assert.doesNotMatch(h,/<h2>Model<\/h2>/,'포함 끄면 빠짐');
 await page.getByLabel('AI 모델 컷 1 상세페이지에 포함').check();
 // ⑤ 원본 보정으로 돌아가도 보정본 유지, 다시 열어도 모델컷 저장됨
 await tab(page,'원본 보정');assert.ok(await page.locator('[data-slot="hero"] img').first().isVisible());
 await page.waitForTimeout(1200);await page.reload();await idle();
 await tab(page,'상세페이지');assert.match(await page.getByLabel('AI 모델 컷 목록').innerText(),/AI 모델 컷 1/,'다시 열어도 저장됨');
 assert.deepEqual(errors,[]);
 // ⑥ 키 없음: 안내 + 생성 버튼 꺼짐 + Google 선택 불가
 const b2=await open({fashn:false,google:false,styleroom:false});
 await tab(b2.page,'모델컷');
 await b2.page.getByRole('alert').filter({hasText:'모델컷을 만들려면 Vercel에 FASHN_API_KEY가 필요합니다'}).waitFor();
 assert.equal(await b2.page.getByRole('button',{name:/FASHN 유료/}).isDisabled(),true);
 assert.equal(await b2.page.getByRole('button',{name:'엔진 Google 가상 피팅'}).getAttribute('aria-disabled'),'true');
 assert.match(await b2.page.locator('body').innerText(),/GOOGLE_VTO_CREDENTIALS/);
 console.log('PASS: 3 tabs keep one product/state; model cut tab uses the retouched front, top composition prompt (no face, no face lock), auto face crop + slider + side-by-side, reuse, Google with base photo; saved cut shows in the page with "AI 모델 컷" and include/exclude; persisted; missing keys disable generation.');
}finally{await browser.close();}
