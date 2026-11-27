// 021 모델컷 결과 보존: 생성 → 진행 중 탭 이동·새로고침 → 작업 ID로 이어 받아 완료(다시 과금 없음) → 결과(이미지째) 남음 → 새로고침해도 남음
// → 상세페이지 정식 저장 기록 뒤 '○일 뒤 자동 삭제' 안내·보관 연장 → 3일 경과(시계 흉내) 정리, '이 상품 모델컷으로 저장'한 컷은 남음. 모든 API 모의, 비용 없음.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
const URL0=process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001';
const D=86400000;
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 const state={done:false,runs:0,status:0};let fx=null;
 const setup=async page=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
   if(a==='retouch')return r.fulfill({json:{image:fx.cut}});
   return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:true}});});
  await page.route('http://127.0.0.1:808*/**',r=>r.abort());
  await page.route('https://cdn.fashn.test/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from(fx.person.split(',')[1],'base64')}));
  await page.route('**/api/modelshot',async r=>{const b=JSON.parse(r.request().postData()||'{}');
   if(b.action==='config')return r.fulfill({json:{fashn:true,google:false,styleroom:false}});
   if(b.action==='run'){state.runs++;return r.fulfill({json:{id:'remote-'+state.runs}});}
   if(b.action==='status'){state.status++;return r.fulfill({json:state.done?{status:'completed',output:['https://cdn.fashn.test/'+b.id+'.png']}:{status:'processing'}});}
   if(b.action==='fetch')return r.fulfill({json:{dataUrl:fx.person}});
   return r.fulfill({status:400,json:{error:'unexpected'}});});
  return errors;
 };
 let page=await ctx.newPage();let errors=await setup(page);
 await page.goto('about:blank');
 fx=await page.evaluate(()=>{const draw=(W,H,f)=>{const c=document.createElement('canvas');c.width=W;c.height=H;f(c.getContext('2d'),W,H);return c.toDataURL('image/png');};
  const knit=wall=>(c,W,H)=>{if(wall){c.fillStyle='#d9d2c4';c.fillRect(0,0,W,H);}c.fillStyle='#d6bec8';c.fillRect(W*.25,110,W*.5,H*.8);};
  return {raw:draw(1200,1600,knit(true)),cut:draw(1200,1600,knit(false)),person:draw(768,1024,(c,W,H)=>{c.fillStyle='#fff';c.fillRect(0,0,W,H);c.fillStyle='#3c508c';c.fillRect(W*.25,H*.1,W*.5,H*.8);})};});
 await page.goto(URL0);
 const idle=p=>p.waitForFunction(()=>document.querySelector('[aria-label="상품 이름"]')?.value&&!document.querySelector('fieldset.cut-section:disabled'));
 const tab=(p,n)=>p.getByRole('tab',{name:n,exact:true}).click();
 await idle(page);
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'h.png',mimeType:'image/png',buffer:Buffer.from(fx.raw.split(',')[1],'base64')});await idle(page);
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle(page);
 const pid=await page.getByLabel('상품 선택').inputValue();
 // ① 생성 시작(장면 4개) → 진행 중에 다른 탭 → 돌아와도 진행 카드가 그대로
 await tab(page,'모델컷');
 await page.getByRole('button',{name:/FASHN 유료 · 4장 생성/}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('div')].filter(d=>/^생성 중/.test(d.textContent)).length>=1);
 await page.waitForFunction(()=>true);await page.waitForTimeout(500);
 assert.equal(state.runs,3,'동시 3개, 4번째는 대기');
 await tab(page,'상세페이지');await tab(page,'원본 보정');await tab(page,'모델컷');
 assert.ok(await page.getByText(/생성 중\.\.\./).first().isVisible(),'탭 이동 후에도 진행 중 작업 보임');
 // ② 진행 중에 새로고침(브라우저 탭 정리와 같은 상황) → 작업 ID로 이어 받기, 새로 과금(run) 없음
 await page.waitForTimeout(800);   // 작업 ID 저장
 await page.reload();await idle(page);await tab(page,'모델컷');
 await page.waitForFunction(()=>[...document.querySelectorAll('div')].some(d=>/^생성 중/.test(d.textContent)));
 state.done=true;
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].filter(b=>b.textContent==='이 상품 모델컷으로 저장').length>=3,null,{timeout:30000});
 assert.equal(state.runs,3,'새로고침 뒤 다시 과금하지 않음(작업 ID로 이어 받음)');
 // 시작 전이던 4번째(작업 ID 없음, 과금 없음)는 '중단됨 · 다시 시도'
 assert.ok(await page.getByText(/중단됨\(아직 시작 전 · 과금 없음\)/).isVisible());
 await page.getByRole('button',{name:'다시 시도'}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].filter(b=>b.textContent==='이 상품 모델컷으로 저장').length>=4,null,{timeout:30000});
 assert.equal(state.runs,4,'다시 시도한 1개만 새로 생성');
 const srcs=async p=>p.evaluate(()=>[...document.querySelectorAll('img')].map(i=>i.getAttribute('src')).filter(s=>s&&s.startsWith('data:image')&&s.length>2000));
 // ③ 결과는 이미지째 보관 → 탭 이동·새로고침 뒤에도 남음(FASHN 주소가 만료돼도)
 await tab(page,'상세페이지');await tab(page,'모델컷');
 assert.equal(await page.getByRole('button',{name:'이 상품 모델컷으로 저장'}).count(),4,'탭 이동 뒤에도 4장');
 await page.waitForTimeout(500);
 await page.unroute('https://cdn.fashn.test/**');await page.route('https://cdn.fashn.test/**',r=>r.fulfill({status:410,body:'expired'}));
 await page.reload();await idle(page);await tab(page,'모델컷');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].filter(b=>b.textContent==='이 상품 모델컷으로 저장').length>=4);
 assert.ok((await srcs(page)).length>=4,'결과가 data URL(이미지 자체)로 보임 — 주소 만료와 상관없음');
 // 한 장은 '이 상품 모델컷으로 저장'(정리 대상 아님)
 await page.getByRole('button',{name:'이 상품 모델컷으로 저장'}).first().click();
 const dlg=page.getByRole('dialog',{name:'모델컷 저장'});await dlg.getByRole('button',{name:'이 상품 모델컷으로 저장'}).click();
 await page.waitForTimeout(1200);
 // ④ 상세페이지 정식 저장 기록(어제) → '2일 뒤 임시 모델컷 4장 자동 삭제' 안내 → 보관 연장 → 3일
 await page.evaluate(([pid,at])=>new Promise((res,rej)=>{const q=indexedDB.open('fashion-studio-modelcuts',1);q.onsuccess=()=>{const tx=q.result.transaction('meta','readwrite');tx.objectStore('meta').put({productId:pid,finalAt:at});tx.oncomplete=()=>res();tx.onerror=rej;};}),[pid,Date.now()-1*D]);
 await page.reload();await idle(page);await tab(page,'모델컷');
 const note=page.getByLabel('임시 모델컷 자동 삭제 안내');await note.waitFor();
 assert.match(await note.innerText(),/2일 뒤 임시 모델컷 4장 자동 삭제/);
 await note.getByRole('button',{name:'보관 연장 (다시 3일)'}).click();
 await page.waitForFunction(()=>/3일 뒤 임시 모델컷 4장/.test(document.querySelector('[aria-label="임시 모델컷 자동 삭제 안내"]')?.textContent||''));
 // ⑤ 시계를 4일 뒤로(앱을 다시 연 것과 같음) → 정리: 임시 결과 삭제, 저장한 모델컷은 남음
 await page.close();
 page=await ctx.newPage();errors=await setup(page);
 await page.clock.install({time:new Date(Date.now()+4*D)});
 await page.goto(URL0);await idle(page);await tab(page,'모델컷');
 await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(b=>b.textContent==='이 상품 모델컷으로 저장'),null,{timeout:15000});
 const left=await page.evaluate(()=>new Promise(res=>{const q=indexedDB.open('fashion-studio-modelcuts',1);q.onsuccess=()=>{const r=q.result.transaction('results').objectStore('results').getAll();r.onsuccess=()=>res(r.result.filter(x=>x.kind!=='candidate').length);};}));
 assert.equal(left,0,'임시 결과 정리됨');
 await tab(page,'상세페이지');assert.match(await page.getByLabel('AI 모델 컷 목록').innerText(),/AI 모델 컷 1/,'이 상품 모델컷으로 저장한 컷은 남음');
 assert.deepEqual(errors,[]);
 console.log(`PASS: model-cut results kept across tab switches and reloads (resumed by job id, runs=${state.runs}, no re-charge), stored as images, keep-longer notice, cleaned 3 days after final save (fake clock), saved cut kept.`);
}finally{await browser.close();}
