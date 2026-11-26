// 옷걸이 v2(014) 컷 구성: 옷걸이 정면·후면 2칸만, 마네킹 전용 칸·옵션(컷 추가·받침대·꼭지·자동 수평·생성형 편집)·모델컷 탭·Fit guide는 숨김.
// ?v1 주소에서는 예전 마네킹 화면이 그대로 보임. API는 모의 응답(비용 없음).
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
const base=(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001').replace(/\/?(\?.*)?$/,'');
try{
 const open=async url=>{const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/studio?*',r=>r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:true}}));
  await page.route('http://127.0.0.1:808*/**',r=>r.abort());
  await page.goto(url);await page.waitForFunction(()=>{const e=document.querySelector('.studio-editor');return e&&!e.disabled&&document.querySelector('[aria-label="상품 이름"]')?.value;});return {page,errors};};
 const {page,errors}=await open(base+'/');
 assert.deepEqual(await page.locator('.cut-row').evaluateAll(n=>n.map(e=>e.dataset.slot)),['hero','back'],'옷걸이 정면·후면 2칸');
 assert.equal(await page.getByLabel('hero 사진 제목').inputValue(),'옷걸이 정면');assert.equal(await page.getByLabel('back 사진 제목').inputValue(),'옷걸이 후면');
 assert.equal(await page.getByLabel('back 칸 숨기기').count(),0,'필수 컷은 숨길 수 없음');
 assert.equal(await page.locator('.add-cuts').count(),0,'컷 추가 숨김');
 assert.equal(await page.getByRole('button',{name:'AI모델컷'}).count(),0,'모델컷 탭 숨김');
 assert.equal(await page.getByText('02 · Fit guide').count(),0,'Fit guide 숨김');
 for(const l of ['자동 수평 (실험)','받침대 기둥 지우기','마네킹 꼭지·목 받침 지우기','마네킹 처리'])assert.equal(await page.getByLabel(l,{exact:true}).count(),0,`${l} 숨김`);
 assert.equal(await page.getByLabel('옷걸이',{exact:true}).first().inputValue(),'keep','옷걸이 남기기');
 assert.equal(await page.getByLabel('흰 옷 맑게',{exact:true}).first().isChecked(),true);
 assert.match(await page.locator('h1').innerText(),/옷걸이 v2/);
 assert.deepEqual(errors,[]);
 // 예전 화면(?v1)은 그대로
 const v1=await open(base+'/?v1');
 assert.deepEqual(await v1.page.locator('.cut-row').evaluateAll(n=>n.map(e=>e.dataset.slot)),['hero']);
 assert.equal(await v1.page.locator('.add-cuts button').count(),11);
 assert.equal(await v1.page.getByRole('button',{name:'AI모델컷'}).count(),1);
 assert.equal(await v1.page.getByLabel('받침대 기둥 지우기',{exact:true}).count(),1);
 assert.deepEqual(v1.errors,[]);
 console.log('PASS: v2 shows only 옷걸이 정면·후면, hides add-cut/model tab/Fit guide/stand/finial/auto-level/mannequin options, keeps hanger + white clear; ?v1 shows the old mannequin screen.');
}finally{await browser.close();}
