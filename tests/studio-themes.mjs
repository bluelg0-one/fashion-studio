// 상세페이지 디자인 테마 검사: 테마 전환 → 미리보기·PNG·HTML이 같은 테마, 상품에 저장, 기본 테마는 예전 그대로,
// 테마 글꼴(Google Fonts)이 PNG에 실제로 들어가는지(글꼴을 막으면 결과가 달라지고 안내가 뜨는지). API 비용 없음.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
const url=process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001';
const hash=b=>crypto.createHash('sha1').update(b).digest('hex');
async function open(blockFonts=false) {
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});const page=await context.newPage();
 const errors=[],paid=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/studio?*',r=>{const a=new URL(r.request().url()).searchParams.get('action');if(a!=='status')paid.push(a);return r.fulfill({json:{configured:true,openai:false,photoroom:false}});});
 await page.route('**/api/instagram?*',r=>r.fulfill({json:{ready:false}}));
 if(blockFonts)await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await page.goto(url);
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);await idle();
 const hero=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,600,800);x.fillStyle='#c9b18f';x.fillRect(150,100,300,600);return c.toDataURL('image/png').split(',')[1];});
 const file={name:'a.png',mimeType:'image/png',buffer:Buffer.from(hero,'base64')};
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles(file);await idle();
 for(const id of ['frontTop','fabric']){await page.getByLabel(`${id} 컷 추가`).click();await page.getByLabel(`${id} 사진 선택`,{exact:true}).setInputFiles(file);await idle();}
 await page.getByLabel('상품 제목',{exact:true}).fill('소프트 골지 라운드 니트');
 await page.getByLabel('1행 사이즈',{exact:true}).fill('FREE');await page.getByLabel('1행 가슴단면',{exact:true}).fill('52');await page.getByLabel('1행 총장',{exact:true}).fill('61');
 const download=async name=>{const [d]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name,exact:true}).click()]);await idle();return fs.readFile(await d.path());};
 const step=()=>page.locator('.auto-studio').innerText();
 return {context,page,idle,download,step,errors,paid};
}
try{
 const {context,page,idle,download,step,errors,paid}=await open();
 const pick=page.getByLabel('상세페이지 디자인 테마');
 assert.equal(await pick.inputValue(),'soft','새 상품은 소프트 무드로 시작');
 assert.deepEqual(await pick.locator('option').allTextContents(),['소프트 무드','미니멀 화이트','매거진','기본']);
 const png={},html={};
 for(const id of ['basic','minimal','soft','magazine']){
  await pick.selectOption(id);
  png[id]=await download('상세페이지 전체 PNG 저장');
  assert.equal(png[id].subarray(1,4).toString(),'PNG');assert.equal(png[id].readUInt32BE(16),860,id+' 폭 860');
  html[id]=(await download('HTML 다운로드')).toString();
  if(id!=='basic'){
   assert.match(await step(),new RegExp(`전체 PNG 저장 완료 · 테마: `));
   assert.ok(!(await step()).includes('기본 글꼴로 그렸습니다'),id+' 테마 글꼴을 받아서 그림');
   assert.ok(html[id].includes(`data-theme="${id}"`));assert.ok(html[id].includes('fonts.googleapis.com/css2?'));
  }
  // 미리보기도 같은 테마(저장 PNG와 같은 그림)
  await page.getByRole('button',{name:'전체 미리보기',exact:true}).first().click();await idle();
  const prev=await page.locator('.studio-preview img').evaluate(async im=>{const b=await (await fetch(im.src)).arrayBuffer();return Array.from(new Uint8Array(b));});
  const pv=Buffer.from(prev);assert.equal(hash(pv),hash(png[id]),id+' 미리보기 = PNG');
  // 순서 유지: 제목 → Detail → Size, 치수표 값
  const h=html[id];assert.ok(h.indexOf('소프트 골지')<h.indexOf('Detail')&&h.indexOf('Detail')<h.indexOf('Size'));assert.ok(h.includes('<td>52</td>'));
 }
 assert.equal(new Set(Object.values(png).map(hash)).size,4,'테마마다 다른 PNG');
 assert.ok(!html.basic.includes('data-theme'),'기본 HTML은 예전 그대로');
 // 매거진: 디테일 두 장 나란히
 assert.ok(html.magazine.includes('class="pair u"'));
 // 테마는 상품에 저장되고 새로고침 후 복원
 await pick.selectOption('soft');await page.waitForTimeout(300);await page.waitForFunction(()=>document.querySelector('.save-state')?.textContent==='자동 저장됨');
 await page.reload();await idle();
 assert.equal(await page.getByLabel('상세페이지 디자인 테마').inputValue(),'soft');
 // 테마 글꼴이 PNG에 실제로 들어가는지 확인: 매거진 제목 글꼴 사용 여부
 assert.ok(await page.evaluate(()=>document.fonts.check('900 76px "Playfair Display"')&&document.fonts.check('700 44px "Noto Serif KR"','소프트')));
 // 테마 정보가 없는 예전 상품은 '기본'으로 열림(이미 만든 상세페이지가 바뀌지 않음)
 await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('fashion-studio',1);r.onsuccess=()=>{const tx=r.result.transaction('products','readwrite');tx.objectStore('products').put({id:'p-legacy',name:'예전 상품',data:{texts:{headline:'예전 상품'}},updatedAt:Date.now()+1e9});tx.oncomplete=()=>{r.result.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);}));
 await page.reload();await idle();
 assert.equal(await page.getByLabel('상품 이름').inputValue(),'예전 상품');
 assert.equal(await page.getByLabel('상세페이지 디자인 테마').inputValue(),'basic','예전 상품은 기본');
 // 새 상품 버튼으로 만든 상품은 소프트 무드
 await page.getByRole('button',{name:/새 상품/}).first().click();await idle();
 assert.equal(await page.getByLabel('상세페이지 디자인 테마').inputValue(),'soft','새 상품은 소프트 무드');
 assert.deepEqual(paid,[]);assert.deepEqual(errors,[]);
 await context.close();
 // 글꼴을 막으면: 시스템 글꼴로 그려 결과가 달라지고, 화면에 안내
 const blocked=await open(true);
 await blocked.page.getByLabel('상세페이지 디자인 테마').selectOption('magazine');
 const fallback=await blocked.download('상세페이지 전체 PNG 저장');
 assert.match(await blocked.step(),/기본 글꼴로 그렸습니다/);
 assert.notEqual(hash(fallback),hash(png.magazine),'글꼴이 있을 때와 없을 때 PNG가 다름 = 글꼴이 실제로 들어감');
 await blocked.context.close();
 console.log(`PASS: soft first & default for new products, legacy products stay basic, 4 themes (basic unchanged), preview = PNG per theme, HTML same theme + Google Fonts link, order/table kept, magazine pairs, theme saved per product, fonts embedded in PNG (blocked fonts → different PNG + notice), 0 API calls.`);
}finally{await browser.close();}
