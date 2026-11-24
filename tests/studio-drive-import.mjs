// 드라이브 폴더에서 가져오기 + 묶음 자동 분류 (지시서 009). 구글 로그인·선택 창·드라이브·Claude 모두 모의 응답(비용 없음).
// - 폴더 선택 → 사진 목록(2쪽) → 예상 비용 → 분류 시작 → 20장씩 3묶음, 둘째 묶음부터 앞 옷 썸네일 함께 전송
// - 둘째 묶음 서버 오류로 멈춤 → ‘이어서 하기’는 남은 묶음만(사진 다시 받지 않음)
// - 옷 8벌 = 상품 8개, 묶음에 걸친 옷도 한 상품, 확인 필요 목록, HEIC 실패 표시, 비용 기록
// - 같은 폴더 다시 가져오기 = 이미 가져온 사진 건너뜀, 폴더 안을 못 읽으면 안내
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const CLIENT='123456-test.apps.googleusercontent.com',KEY='AIza'+'k'.repeat(35);
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,OPTIONS'};
const N=45,ids=Array.from({length:N},(_,i)=>`d${i}`),truth=id=>Math.floor(Number(id.slice(1))/6),shots=['front','back','side','fabric','frontTop','detail'];
const GIS=`window.google=window.google||{};window.google.accounts={oauth2:{initTokenClient:c=>({requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'tok-1',expires_in:3600}),10)}),revoke:()=>{}}};`;
const GAPI=`(()=>{const self=o=>new Proxy(o,{get:(t,k)=>k in t?t[k]:()=>self(t)});
 const P={ViewId:{DOCS:'all'},Feature:{MULTISELECT_ENABLED:'multi'},Action:{PICKED:'picked',CANCEL:'cancel'},
  DocsView:function(){return self({setMimeTypes:m=>{window.__mimes=m;return self({});}});},
  PickerBuilder:function(){const b={};const api=self({setOAuthToken:t=>{window.__tok=t;return api;},setDeveloperKey:k=>{window.__key=k;return api;},setAppId:a=>{window.__app=a;return api;},setCallback:c=>{b.c=c;return api;},
   build:()=>({setVisible:()=>setTimeout(()=>b.c(window.__pick?{action:'picked',docs:window.__pick}:{action:'cancel'}),10)})});return api;}};
 window.gapi={load:(n,o)=>setTimeout(()=>{window.google=window.google||{};window.google.picker=P;o.callback();},5)};})();`;

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let png=null,failBatch2=true;const classifyCalls=[],downloads=[],lists=[];
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='classify'){
   const {photos,references}=r.request().postDataJSON();classifyCalls.push({n:photos.length,refs:references.map(x=>x.description),refSize:references.map(x=>x.image.length)});
   if(classifyCalls.length===2&&failBatch2){failBatch2=false;return r.fulfill({status:502,json:{error:'Claude API 오류 (529). 잠시 후 다시 시도하세요.'}});}
   const garments=[],local={};
   const out=photos.map(p=>{const t=truth(p.id),ref=references.find(x=>x.description===`옷${t}`),shot=shots[Number(p.id.slice(1))%6];
    if(ref)return {id:p.id,garment:ref.id,reference:true,shot,confidence:.9,review:false,note:''};
    if(!local[t]){local[t]=`g${garments.length+1}`;garments.push({id:local[t],description:`옷${t}`});}
    const low=p.id==='d7';return {id:p.id,garment:local[t],shot,confidence:low?.4:.9,review:low,note:low?'비슷한 색 옷과 헷갈림':''};});
   return r.fulfill({json:{garments,photos:out,model:'claude-opus-5-5',usage:{input_tokens:6000,output_tokens:1500,cache_read_input_tokens:0,cache_creation_input_tokens:0}}});}
  return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:true,googleClientId:CLIENT,googlePicker:{apiKey:KEY,appId:'123456789'}}});});
 await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:GIS}));
 await page.route('https://apis.google.com/js/api.js',r=>r.fulfill({contentType:'text/javascript',body:GAPI}));
 await page.route('https://www.googleapis.com/**',async r=>{
  const u=new URL(r.request().url());if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:cors});
  if(r.request().headers().authorization!=='Bearer tok-1')return r.fulfill({status:401,headers:cors,json:{}});
  if(u.pathname==='/drive/v3/files'){const q=u.searchParams.get('q');lists.push(q);
   if(q.includes("'folder1' in parents")){const all=[...ids.map(id=>({id,name:`IMG_${String(Number(id.slice(1))+1).padStart(3,'0')}.jpg`,mimeType:'image/png'})),{id:'h1',name:'IMG_900.HEIC',mimeType:'image/heic'}];
    const p2=u.searchParams.get('pageToken')==='p2';return r.fulfill({headers:cors,json:p2?{files:all.slice(30)}:{files:all.slice(0,30),nextPageToken:'p2'}});}
   return r.fulfill({headers:cors,json:{files:[]}});}
  const m=u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  if(m&&u.searchParams.get('alt')==='media'){downloads.push(m[1]);if(m[1]==='h1')return r.fulfill({headers:{...cors,'Content-Type':'image/heic'},body:'not-an-image'});return r.fulfill({headers:{...cors,'Content-Type':'image/png'},body:png});}
  return r.fulfill({status:500,headers:cors,body:'unexpected'});});
 await page.route('http://127.0.0.1:808*/**',r=>r.abort());
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const loaded=()=>page.waitForFunction(()=>{const n=document.querySelector('[aria-label="상품 이름"]'),e=document.querySelector('.studio-editor');return Boolean(n?.value)&&e&&!e.disabled;});
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled,null,{timeout:120000});
 await loaded();
 png=Buffer.from((await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle='rgb(220,215,205)';g.fillRect(0,0,600,800);g.fillStyle='rgb(170,120,100)';g.fillRect(100,100,400,600);return c.toDataURL('image/png');})).split(',')[1],'base64');
 const panel=page.locator('.drive-import'),status=()=>page.locator('.auto-studio').innerText();
 const before=await page.getByLabel('상품 선택').locator('option').count();

 // 1) 폴더 고르기 → 계획(장 수·예상 비용)
 await page.evaluate(()=>{window.__pick=[{id:'folder1',name:'11월 신상',mimeType:'application/vnd.google-apps.folder'}];});
 await panel.getByRole('button',{name:'드라이브 폴더에서 가져오기 (자동 분류)'}).click();await idle();
 assert.equal(await page.evaluate(()=>[window.__tok,window.__key,window.__app].join('|')),`tok-1|${KEY}|123456789`,'선택 창에 로그인 토큰·키·앱 번호 전달');
 assert.match(await page.evaluate(()=>window.__mimes),/image\/jpeg.*image\/heic.*folder/);
 assert.equal(lists.length,2,'폴더 목록 2쪽을 모두 읽음');
 assert.match(await panel.innerText(),/새 사진 46장[\s\S]*예상 비용: 약 \$0\.\d\d~\$0\.\d\d \(Claude 분류 3번\)/);
 assert.equal(classifyCalls.length,0,'시작 전에는 호출 없음');

 // 2) 분류 시작 → 둘째 묶음에서 서버 오류로 멈춤
 await panel.getByRole('button',{name:'분류 시작'}).click();await idle();
 assert.match(await status(),/드라이브 가져오기가 멈췄습니다: Claude API 오류 \(529\)[\s\S]*이어서 합니다/);
 assert.deepEqual(classifyCalls.map(c=>c.n),[20,20]);
 assert.ok(classifyCalls[1].refs.includes('옷3'),'둘째 묶음에 앞 묶음 옷 썸네일 함께 전송');
 assert.ok(Math.max(...classifyCalls[1].refSize)<classifyCalls[1].refSize.length*60000,'참고 썸네일은 작게');
 const firstDownloads=downloads.length;assert.equal(firstDownloads,46,'분류용 썸네일 46장(HEIC 포함) 한 번씩');
 assert.match(await panel.locator('.import-counts').innerText(),/전체 46장 · 완료 0 · 실패 21/);// 둘째 묶음 20장 + HEIC 1장

 // 3) 이어서 하기: 남은 묶음만, 사진은 다시 받지 않음(상품용 큰 사진만 받음)
 await panel.getByRole('button',{name:/이어서 하기 \(남은 46장/}).click();await idle();
 assert.deepEqual(classifyCalls.map(c=>c.n),[20,20,20,5],'첫 묶음은 다시 분류하지 않음');
 const thumbAgain=downloads.slice(firstDownloads).filter(id=>id!=='h1');
 assert.equal(thumbAgain.length,45,'상품용 사진 45장만 새로 받음(분류용 썸네일은 다시 받지 않음)');
 const counts=await panel.locator('.import-counts').innerText();
 assert.match(counts,/전체 46장 · 완료 45 · 실패 1 · 확인 필요 1/);
 assert.match(await panel.innerText(),/실패한 사진 1장/);
 await panel.locator('summary',{hasText:'실패한 사진'}).click();assert.match(await panel.innerText(),/IMG_900\.HEIC — HEIC\(아이폰\) 사진은 이 브라우저에서 열 수 없습니다/);
 assert.match(await status(),/사진 46장 중 45장을 상품 8개에 넣었습니다 · 실패 1장[\s\S]*확인 필요 1장/);
 const options=await page.getByLabel('상품 선택').locator('option').allInnerTexts();
 assert.equal(options.length,before+8,'옷 8벌 = 상품 8개');
 for(let t=0;t<8;t++)assert.ok(options.includes(`옷${t}`),`옷${t} 상품`);
 // 지금 열린 상품 = 첫 옷: 정면이 대표 칸, 사진 6장
 assert.equal(await page.getByLabel('상품 이름').inputValue(),'옷0');
 // 묶음에 걸친 옷3(사진 18~23)도 한 상품에 6장
 await page.getByLabel('상품 선택').selectOption({label:'옷3'});await idle();
 assert.equal(await page.locator('[data-slot] img').first().count(),1);
 const filled=await page.evaluate(()=>[...document.querySelectorAll('[data-slot]')].filter(e=>e.querySelector('.cut-original img, img')).length);
 assert.ok(filled>=6,`옷3 사진 칸 ${filled}개`);
 // 확인 필요 목록 → 상품 열기
 assert.match(await panel.locator('.review-list').innerText(),/IMG_008\.jpg\s+옷1\s+후면\s+비슷한 색 옷과 헷갈림/);
 await panel.locator('.review-list').getByRole('button',{name:'상품 열기'}).click();await idle();
 assert.equal(await page.getByLabel('상품 이름').inputValue(),'옷1');
 // 비용 기록: 분류 3번(실패한 호출은 기록 없음)
 await page.locator('.cost-panel summary').click();
 const rows=await page.locator('.cost-log tbody tr').allInnerTexts();
 assert.equal(rows.filter(r=>/\(드라이브 가져오기\)/.test(r)).length,3);

 // 4) 같은 폴더 다시: 이미 가져온 45장 건너뜀(HEIC 1장만 새 사진)
 await panel.getByRole('button',{name:'드라이브 폴더에서 가져오기 (자동 분류)'}).click();await idle();
 assert.match(await panel.innerText(),/새 사진 1장 · 이미 가져온 사진 45장 건너뜀/);
 await panel.getByRole('button',{name:'취소'}).click();
 // 5) 안을 읽을 수 없는 폴더 → 사진을 직접 고르라는 안내
 await page.evaluate(()=>{window.__pick=[{id:'folderX',name:'권한 없는 폴더',mimeType:'application/vnd.google-apps.folder'}];});
 await panel.getByRole('button',{name:'드라이브 폴더에서 가져오기 (자동 분류)'}).click();await idle();
 assert.match(await panel.innerText(),/폴더 ‘권한 없는 폴더’ 안의 사진을 읽지 못했습니다[\s\S]*Ctrl\+A/);
 // 6) 취소하면 아무것도 안 함
 await page.evaluate(()=>{window.__pick=null;});
 await panel.getByRole('button',{name:'드라이브 폴더에서 가져오기 (자동 분류)'}).click();await idle();
 assert.match(await status(),/가져오기를 취소했습니다/);
 assert.equal(classifyCalls.length,4);
 assert.deepEqual(errors,[]);
 console.log('PASS: Drive folder (2 pages, 46 files) → plan with estimated cost → batches of 20 with earlier garments as references; stop on server error and resume only the remaining batches without re-downloading thumbnails; 8 garments = 8 products (garment split across batches kept together), review list opens the product, HEIC failure shown, 3 classify calls logged; already imported files skipped; unreadable folder shows Ctrl+A hint; cancel does nothing.');
}finally{await browser.close();}
