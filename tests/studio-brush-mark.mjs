// 넓은 구김용 '붓으로 칠하기' 표시: 칠한 길을 따라 IOPaint 마스크가 만들어지는지(길 밖은 그대로).
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

 await panel.getByRole('button',{name:/직접 표시하기/}).click();
 await page.getByLabel('hero 직접 표시 종류').selectOption('stain');
 await page.getByLabel('hero 표시 방법').selectOption('brush');
 await page.getByLabel('hero 표시 붓 크기').fill('30');
 const img=panel.locator(".defect-preview");await img.waitFor();await img.scrollIntoViewIfNeeded();
 const b=await img.boundingBox(),pt=(fx,fy)=>[b.x+b.width*fx,b.y+b.height*fy];
 // 비스듬한 구김을 따라 (30%,50%) → (70%,62%)
 await page.mouse.move(...pt(.30,.50));await page.mouse.down();for(let k=1;k<=12;k++)await page.mouse.move(...pt(.30+.4*k/12,.50+.12*k/12));await page.mouse.up();
 await panel.locator('.defect-list li').first().waitFor();
 assert.equal(await panel.locator('.defect-list li').count(),1);
 assert.match(await panel.locator('.defect-list li').first().innerText(),/얼룩 · 직접 칠함/);
 await page.locator('.tools-panel summary').click();await page.getByRole('button',{name:'다시 확인'}).click();
 await panel.getByRole('button',{name:'선택한 곳 고치기 (1곳)'}).click();await idle();
 const m=await page.evaluate(async src=>{const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);const at=(fx,fy)=>g.getImageData(Math.round(fx*c.width),Math.round(fy*c.height),1,1).data[0];return {start:at(.30,.50),mid:at(.50,.56),end:at(.70,.62),above:at(.50,.40),below:at(.50,.75)};},mask);
 assert.deepEqual(m,{start:255,mid:255,end:255,above:0,below:0},JSON.stringify(m));
 assert.deepEqual(errors,[]);
 console.log('PASS: brush marking along a diagonal wrinkle → IOPaint mask follows the painted path only.');
}finally{await browser.close();}
