// 얼룩·구김 직접 표시: Claude 없이 상자 그리기, Claude 결과와 합치기, 삭제, IOPaint 마스크 위치 확인.
// Claude·IOPaint는 모의 응답. CUTOUT_PATH: 투명 누끼 PNG.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const png=fs.readFileSync(process.env.CUTOUT_PATH),cutout='data:image/png;base64,'+png.toString('base64');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=[];let mask=null;
 await page.route('**/api/studio?*',r=>{const a=new URL(r.request().url()).searchParams.get('action');calls.push(a);
  if(a==='retouch')return r.fulfill({json:{image:cutout}});
  if(a==='defects')return r.fulfill({json:{regions:[{type:'stain',x0:100,y0:100,x1:150,y1:140,confidence:.9,note:'목 얼룩'}]}});
  return r.fulfill({json:{configured:true,openai:true,photoroom:true,claude:true}});});
 await page.route('http://127.0.0.1:8080/**',r=>{
  if(r.request().url().endsWith('/api/v1/model'))return r.fulfill({json:{name:'lama'}});
  mask=JSON.parse(r.request().postData()).mask;return r.fulfill({body:png,contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'}});});
 await page.route('http://127.0.0.1:8081/**',r=>r.abort());
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);await idle();
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:png});await idle();
 await page.locator('[data-slot="hero"]').getByRole('button',{name:'이 사진 누끼·보정',exact:true}).click();await idle();
 const panel=page.locator('[data-slot="hero"] .defect-panel');
 await panel.locator('summary').click();
 // 1) Claude 없이 직접 표시
 await panel.getByRole('button',{name:/직접 표시하기/}).click();
 await page.getByLabel('hero 직접 표시 종류').selectOption('wrinkle');
 const img=panel.locator(".defect-preview");await img.waitFor();await img.scrollIntoViewIfNeeded();
 const b=await img.boundingBox();
 const pt=(fx,fy)=>[b.x+b.width*fx,b.y+b.height*fy];
 await page.mouse.move(...pt(.40,.50));await page.mouse.down();await page.mouse.move(...pt(.45,.53),{steps:4});await page.mouse.move(...pt(.50,.56),{steps:4});await page.mouse.up();
 await panel.locator('.defect-list li').first().waitFor();
 assert.equal(await panel.locator('.defect-list li').count(),1);
 assert.match(await panel.locator('.defect-list li').first().innerText(),/구김 · 직접 표시[\s\S]*\(직접\)/);
 assert.ok(await page.getByLabel('hero 수정 1').isChecked(),'직접 표시는 바로 선택됨');
 assert.ok(!calls.includes('defects'),'직접 표시는 Claude를 부르지 않음');
 // 너무 작은 클릭은 무시
 await page.mouse.click(...pt(.2,.2));
 assert.equal(await panel.locator('.defect-list li').count(),1);
 // 2) Claude 자동 찾기 → Claude 1곳 + 직접 1곳 유지
 await panel.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).click();await idle();
 assert.equal(await panel.locator('.defect-list li').count(),2);
 assert.match(await panel.locator('.defect-list li').nth(0).innerText(),/얼룩 · 목 얼룩/);
 assert.match(await panel.locator('.defect-list li').nth(1).innerText(),/직접/);
 assert.ok(await page.getByLabel('hero 수정 2').isChecked(),'직접 표시 선택 유지');
 // 3) Claude가 찾은 곳 삭제
 await page.getByLabel('hero 표시 1 삭제').click();
 assert.equal(await panel.locator('.defect-list li').count(),1);
 assert.match(await panel.locator('.defect-list li').first().innerText(),/직접/);
 // 4) IOPaint로 지우기 → 마스크가 그린 위치(가로 40~50%, 세로 50~56%)에만 칠해졌는지
 await page.locator('.tools-panel summary').click();await page.getByRole('button',{name:'다시 확인'}).click();
 await panel.getByRole('button',{name:'IOPaint로 지우기 (1곳)'}).click();await idle();
 assert.ok(mask,'IOPaint 요청');
 const m=await page.evaluate(async src=>{const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);const at=(fx,fy)=>g.getImageData(Math.round(fx*c.width),Math.round(fy*c.height),1,1).data[0];return {inside:at(.45,.53),outside:at(.2,.2),below:at(.45,.7)};},mask);
 assert.deepEqual(m,{inside:255,outside:0,below:0},JSON.stringify(m));
 assert.match(await page.locator('[role=status]').innerText(),/IOPaint로 1곳을 지웠습니다/);
 assert.deepEqual(errors,[]);
 console.log('PASS: manual boxes without Claude, merge with Claude results (manual kept), delete, mask matches the drawn box.');
}finally{await browser.close();}
