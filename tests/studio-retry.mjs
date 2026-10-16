const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=160;const ctx=c.getContext('2d');ctx.fillStyle='#567';ctx.fillRect(20,30,60,110);return c.toDataURL();});
 let edits=0,analyses=0;
 await page.route('**/api/studio?*',r=>{const action=new URL(r.request().url()).searchParams.get('action');if(action==='edit'){edits++;return r.fulfill({json:{image:fixture}});}if(action==='analyze'){analyses++;return analyses===1?r.fulfill({status:429,json:{error:'테스트 일시 제한'}}):r.fulfill({json:{headline:'재시도 결과',description:'보존됨',points:[]}});}return r.fulfill({json:{configured:true}});});
 await page.reload();
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'retry.png',mimeType:'image/png',buffer:Buffer.from(fixture.split(',')[1],'base64')});
 await page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();
 await page.getByRole('alert').waitFor();
 assert.ok(await page.locator('[data-slot="hero"] .paste-zone img').getAttribute('src'));
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 assert.equal(edits,1);assert.equal(analyses,2);assert.equal(await page.getByLabel('상품 제목',{exact:true}).inputValue(),'재시도 결과');
 await page.locator('[data-slot="hero"]').getByRole('button',{name:'사진 삭제',exact:true}).click();
 for(const id of ['hero','frontZoom','frontTop','frontBottom','fabric'])assert.equal(await page.locator(`[data-slot="${id}"] .paste-zone img`).count(),0);
 console.log('PASS: analysis failure preserves successful photos; retry does not charge for another edit; removing hero clears dependent crops.');
}finally{await browser.close();}
