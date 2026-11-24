// 상품 단위 자동 보정 (지시서 010). Claude·Photoroom·BiRefNet·IOPaint 모두 모의 응답(비용 없음).
// - 무료 엔진이 꺼져 있으면 ‘IOPaint Start를 켜 주세요’ 안내, 시작 못 함
// - 시작 전 상품·컷 수, 예상 시간, Claude 예상 비용 → 시작
// - 처리 중 BiRefNet이 끊기면 그 컷이 ‘대기(PC 연결 끊김)’ → 다시 켜지면 같은 컷부터 이어서
// - 순서: 대표 정면 먼저, 1차 → 색감 통일 → 2차(Claude 적극 4타일 → IOPaint 한 번) → 최종, 비용 기록
// - 품질 안전장치: 수평 신뢰도 낮음·찾은 곳 0곳 → 확인 필요 목록
// - 다시 준비하면 이미 보정한 컷은 건너뜀, ‘다시 보정’이면 다시 / 유료 대체는 상한에서 멈춤
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import process from 'node:process';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let cut=null,cuts={},birOff=true,iopOff=true,dropNextRemove=false;const calls={remove:0,inpaint:0,defects:[],retouch:0,retouch2:0};
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='defects'){const b=r.request().postDataJSON();calls.defects.push(b);
   // 처리 순서상 5~8번째 호출 = 핑크 후드 후면(둘째 컷)의 4타일 → 0곳, 나머지는 타일마다 작은 얼룩 1곳
   const none=calls.defects.length>=5&&calls.defects.length<=8;
   return r.fulfill({json:{model:'claude-opus-5-5',level:b.level,usage:{input_tokens:2000,output_tokens:500,cache_read_input_tokens:0,cache_creation_input_tokens:0},regions:none?[]:[{type:'stain',x0:400,x1:430,y0:400,y1:420,confidence:.8,note:'얼룩'}]}});}
  if(a==='retouch'){calls.retouch++;return r.fulfill({json:{image:cut}});}
  if(a==='retouch2'){calls.retouch2++;return r.fulfill({json:{image:cut,ops:{iron:true,stains:false}}});}
  if(a==='credits')return r.fulfill({json:{available:600,subscription:1000}});
  return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:true}});});
 await page.route('http://127.0.0.1:8081/**',async r=>{const u=r.request().url();
  if(birOff)return r.abort();
  if(u.endsWith('/health'))return r.fulfill({json:{ready:true}});
  if(u.endsWith('/remove')){calls.remove++;if(dropNextRemove){dropNextRemove=false;birOff=true;return r.abort();}const out=cuts[r.request().postDataJSON().image]||cut;return r.fulfill({body:Buffer.from(out.split(',')[1],'base64'),contentType:'image/png'});}
  return r.fulfill({status:404,body:''});});
 await page.route('http://127.0.0.1:8080/**',async r=>{const u=r.request().url();
  if(iopOff)return r.abort();
  // REAL_IOPAINT=1: 이 환경에 설치한 진짜 IOPaint(LaMa)로 지우기(모의 응답 대신)
  if(process.env.REAL_IOPAINT){if(u.endsWith('/api/v1/inpaint'))calls.inpaint++;return r.continue();}
  if(u.endsWith('/api/v1/model'))return r.fulfill({json:{name:'lama'}});
  if(u.endsWith('/api/v1/inpaint')){calls.inpaint++;const img=r.request().postDataJSON().image;return r.fulfill({body:Buffer.from(img.split(',')[1],'base64'),contentType:'image/png'});}
  return r.fulfill({status:404,body:''});});
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const loaded=()=>page.waitForFunction(()=>{const n=document.querySelector('[aria-label="상품 이름"]'),e=document.querySelector('.studio-editor');return Boolean(n?.value)&&e&&!e.disabled;});
 const idle=(t=120000)=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled,null,{timeout:t});
 await loaded();
 // 사진: 벽 배경 + 옷(정면·측면 600×800, 후면은 폭이 좁은 400×800 → 모의 Claude가 0곳으로 답함)
 // 사진마다 옷 색을 조금씩 달리해 누끼 결과가 서로 다르게(같으면 저장된 결과를 재사용해 Claude를 다시 부르지 않음)
 const fx=await page.evaluate(()=>{const m=(w,bg,col)=>{const c=document.createElement('canvas');c.width=w;c.height=800;const g=c.getContext('2d');if(bg){g.fillStyle=bg;g.fillRect(0,0,w,800);}g.fillStyle=col;g.fillRect(w*.2,100,w*.6,600);return c.toDataURL('image/png');};
  const wall='rgb(220,215,205)',set=(w,col)=>({src:m(w,wall,col),cut:m(w,null,col)});
  return {hero:set(600,'rgb(170,120,100)'),back:set(400,'rgb(165,118,98)'),side:set(600,'rgb(185,120,100)'),navy:set(600,'rgb(60,70,120)')};});
 cut=fx.hero.cut;for(const k of Object.keys(fx))cuts[fx[k].src]=fx[k].cut;
 // 상품 2개를 이 브라우저 저장소에 바로 넣고 새로 고침(업로드 화면 조작 생략)
 await page.evaluate(async fx=>{
  const db=await new Promise((res,rej)=>{const q=indexedDB.open('fashion-studio',1);q.onsuccess=()=>res(q.result);q.onerror=rej;});
  const s=(id,label,source,conf=.9)=>({id,label,enabled:true,shown:true,source,image:source,status:'raw',versions:[null],vIndex:0,tone:{bright:20,vivid:30},level:{angle:0,auto:0,confidence:conf,manual:false},workSource:null});
  const tx=db.transaction('products','readwrite'),st=tx.objectStore('products'),t=Date.now();
  st.put({id:'pa',name:'핑크 후드',updatedAt:t+2,data:{slots:{hero:s('hero','정면',fx.hero.src),back:s('back','후면',fx.back.src),side:s('side','측면',fx.side.src,.1)}}});
  st.put({id:'pb',name:'네이비 니트',updatedAt:t+1,data:{slots:{hero:s('hero','정면',fx.navy.src)}}});
  await new Promise(r=>tx.oncomplete=r);
 },fx);
 await page.reload();await loaded();
 const panel=page.locator('.auto-fix');
 await panel.locator('summary',{hasText:'자동 보정할 상품 고르기'}).click();
 await panel.getByLabel('자동 보정 핑크 후드').check();await panel.getByLabel('자동 보정 네이비 니트').check();

 // 1) 무료 엔진이 꺼져 있으면 시작 못 함
 await panel.getByRole('button',{name:'자동 보정 준비 (예상 보기)'}).click();
 await panel.getByText('무료 엔진: BiRefNet ⛔ 꺼짐').waitFor();
 assert.match(await panel.locator('[role=alert]').innerText(),/IOPaint Start’를 켜 주세요/);
 assert.equal(await panel.getByRole('button',{name:'시작',exact:true}).isDisabled(),true);
 // 2) 켜면 시작 전 계획: 상품 2 · 컷 4 · 예상 시간 · Claude 예상 비용
 birOff=false;iopOff=false;
 await panel.getByRole('button',{name:'자동 보정 준비 (예상 보기)'}).click();
 await panel.getByText('무료 엔진: BiRefNet ✅ 연결됨 · IOPaint ✅ 연결됨').waitFor();
 const plan=await panel.locator('.auto-plan').innerText();
 assert.match(plan,/상품 2개 · 컷 4개/);assert.match(plan,/예상 시간: 약 4분 \(BiRefNet 장당 약 30초/);assert.match(plan,/예상 Claude 비용:\s*약 \$0\.11~\$0\.64/);assert.match(plan,/유료 대체 꺼짐/);
 assert.equal(calls.defects.length,0,'시작 전에는 호출 없음');
 // 3) 시작 → 둘째 사진 누끼 중 BiRefNet 끊김 → 대기 → 다시 켜면 같은 컷부터
 dropNextRemove=false;
 const startAt=Date.now();
 await page.evaluate(()=>{window.__seen=[];new MutationObserver(()=>{for(const e of document.querySelectorAll('.cut-chip.st-waiting'))window.__seen.push(e.textContent);}).observe(document.body,{subtree:true,childList:true,characterData:true});});
 const removeBefore=calls.remove;
 page.on('request',q=>{if(q.url().endsWith(':8081/remove')&&calls.remove===removeBefore+1&&!dropNextRemove&&!page.__dropped){page.__dropped=true;dropNextRemove=true;}});
 await panel.getByRole('button',{name:'시작',exact:true}).click();
 await panel.locator('.cut-chip.st-waiting').waitFor({timeout:60000});
 assert.match(await panel.locator('.cut-chip.st-waiting').innerText(),/대기\(PC 연결 끊김\)/);
 const waitingLabel=await panel.locator('.cut-chip.st-waiting').innerText();
 assert.match(await panel.locator('.import-counts').innerText(),/대기\(PC 연결 끊김\) 1/);
 const removesWhileDown=calls.remove;await page.waitForTimeout(1500);assert.equal(calls.remove,removesWhileDown,'끊긴 동안 다음 컷으로 넘어가지 않음');
 birOff=false;
 await idle(180000);
 assert.ok(waitingLabel.startsWith('후면'),`대기한 컷 = 둘째 컷(후면): ${waitingLabel}`);
 // 4) 결과: 4컷 처리(1차 4, Claude 4컷×4타일, IOPaint는 찾은 곳이 있는 3컷)
 assert.equal(calls.defects.length,16,'적극 = 컷당 4타일');assert.ok(calls.defects.every(d=>d.level==='aggressive'&&d.tile));
 assert.equal(calls.inpaint,3,'찾은 곳 0곳인 후면은 IOPaint 생략');assert.equal(calls.retouch+calls.retouch2,0,'유료 호출 없음');
 const done=await panel.locator('.auto-summary').innerText();
 assert.match(done,/끝났습니다 · 완료 2 · 확인 필요 2 · 실패 0 · 쓴 비용: Claude 약 \$0\.29/);// 16타일 × $0.018 = $0.288
 const reviews=await panel.locator('.auto-summary .review-list').innerText();
 assert.match(reviews,/핑크 후드\s+후면\s+Claude가 수정할 곳을 찾지 못함\(0곳\)/);
 assert.match(reviews,/핑크 후드\s+측면\s+자동 수평 신뢰도 낮음\(10%\)/);
 // 010 요약 뒤 자동으로 이어서: 완성본 저장 + 상세페이지(기본 켬, 드라이브 미연결 → 브라우저 보관). 확인 필요 컷이 있는 핑크 후드는 초안
 await page.waitForFunction(()=>/저장됨 2/.test(document.querySelector('.save-progress .import-counts')?.innerText||''),null,{timeout:120000});await idle();
 assert.match(await panel.locator('[data-save="pa"]').innerText(),/핑크 후드\s*초안[\s\S]*상세페이지_초안\.png/);
 assert.match(await panel.locator('[data-save="pb"]').innerText(),/네이비 니트\s+저장됨 · 브라우저 보관\s+상세페이지\.png/);
 // 순서: 핑크 후드 정면 → 후면 → 측면 누끼, 그다음 네이비 니트
 const saved=await page.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('fashion-studio',1);q.onsuccess=()=>r(q.result);});
  const get=id=>new Promise(r=>{const q=db.transaction('products').objectStore('products').get(id);q.onsuccess=()=>r(q.result);});
  const a=await get('pa'),b=await get('pb');const f=s=>({stage1:Boolean(s.stage1),stage2:Boolean(s.stage2),status:s.status,versions:s.versions.length});
  return {a:Object.fromEntries(Object.entries(a.data.slots).filter(([,s])=>s.source).map(([k,s])=>[k,f(s)])),b:f(b.data.slots.hero),ref:a.data.color?.ref?.label};});
 assert.deepEqual(saved.a.hero,{stage1:true,stage2:true,status:'done',versions:3},'정면: 원본 + 1차 + 2차 (색감 기준이라 색감 통일 없음)');
 assert.deepEqual(saved.a.side,{stage1:true,stage2:true,status:'done',versions:4},'측면: 원본 + 1차 → 색감 통일 → 2차');
 assert.deepEqual(saved.a.back,{stage1:true,stage2:false,status:'done',versions:3},'후면(원본 + 1차 + 색감 통일): 찾은 곳 0곳 → 2차 없음(1차가 최종)');
 assert.equal(saved.ref,'정면','대표 정면이 색감 기준');
 // 비용 기록: 수정할 곳 찾기 4줄
 await page.locator('.cost-panel summary').click();
 assert.equal((await page.locator('.cost-log tbody tr').allInnerTexts()).filter(r=>/수정할 곳 찾기/.test(r)).length,4);
 // 5) 다시 준비: 이미 보정한 컷은 건너뜀 → 시작 못 함 / ‘다시 보정’이면 4컷
 await panel.getByRole('button',{name:'자동 보정 준비 (예상 보기)'}).click();
 await panel.getByText(/이미 보정한 컷 \d개 건너뜀/).waitFor();
 assert.match(await panel.locator('.auto-plan').innerText(),/상품 0개 · 컷 0개 · 이미 보정한 컷 4개 건너뜀/,'찾은 곳 0곳으로 끝난 후면도 이미 보정으로 봄(Claude 재호출 없음)');
 assert.equal(await panel.getByRole('button',{name:'시작',exact:true}).isDisabled(),true);
 await panel.getByLabel('이미 보정한 컷도 다시 보정').check();
 await panel.getByRole('button',{name:'자동 보정 준비 (예상 보기)'}).click();
 await panel.getByText('상품 2개 · 컷 4개').waitFor();
 // 6) 유료 대체: 무료 엔진 꺼짐 + 유료 켜고 상한 $0.15. 1차는 저장된 누끼를 다시 써서 무료, 2차는 Photoroom 다림질 1번($0.10) 뒤 둘째 컷에서 상한에 닿아 멈춤
 birOff=true;iopOff=true;
 await panel.getByLabel('무료 엔진이 안 될 때 유료로 대신 처리').check();await panel.getByLabel('유료 상한').fill('0.15');
 await panel.getByRole('button',{name:'자동 보정 준비 (예상 보기)'}).click();
 await panel.getByText(/유료 대체 상한: \$0\.15/).waitFor();
 assert.match(await panel.locator('.auto-plan').innerText(),/무료 엔진이 꺼져 있어 시작하면 유료\(Photoroom\)로 대신 처리합니다/);
 await panel.getByRole('button',{name:'시작',exact:true}).click();await idle();
 assert.equal(calls.retouch,0,'1차는 저장된 누끼 재사용(과금 없음)');assert.equal(calls.retouch2,1,'2차 유료 1번만');
 assert.match(await page.locator('[role=alert].studio-error').innerText(),/유료 상한\(\$0\.15\)에 닿아 멈췄습니다/);
 assert.match(await panel.getByRole('button',{name:/이어서 하기/}).innerText(),/남은 컷 4개/,'정면 2차는 저장됐지만 최종 확정은 상품 단위라 아직 남음(이어서 하면 2차는 다시 안 함)');
 assert.deepEqual(errors,[]);
 console.log(`PASS: engines off → 'IOPaint Start를 켜 주세요' and no start; plan shows 2 products / 4 cuts / time / Claude estimate; BiRefNet drop mid-run → that cut waits (no next cut) and resumes after reconnect; hero first, color matched to hero, 16 aggressive tiles, IOPaint 3×, 0-box and low-level cuts in the review list, cost logged; re-plan skips corrected cuts, redo re-plans 4; paid fallback stops at the $0.15 cap after one Photoroom call. (${Math.round((Date.now()-startAt)/1000)} s)`);
}finally{await browser.close();}
