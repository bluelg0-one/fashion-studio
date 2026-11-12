// 개별 PNG 저장이 2MB 이하 PNG로 압축되는지 검사합니다 (API 사용 없음).
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true});
 await page.route('**/api/studio?*',r=>r.fulfill({json:{configured:true,openai:true,photoroom:true}}));
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const save=async(name,b64)=>{
  await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name,mimeType:'image/png',buffer:Buffer.from(b64,'base64')});
  await page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
  const pending=page.waitForEvent('download');
  await page.locator('[data-slot="hero"]').getByRole('button',{name:'개별 PNG 저장',exact:true}).click();
  const file=await fs.readFile(await (await pending).path());
  await page.waitForFunction(()=>/개별 PNG 저장 완료/.test(document.querySelector('[role=status]').textContent));
  return file;
 };
 // 잡음이 많은 1600px 사진: 압축 전 PNG는 2MB를 훨씬 넘습니다.
 const noisy=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1600;c.height=1600;const x=c.getContext('2d');const d=x.createImageData(1600,1600);for(let i=0;i<d.data.length;i+=4){d.data[i]=Math.random()*255;d.data[i+1]=Math.random()*255;d.data[i+2]=Math.random()*255;d.data[i+3]=255;}x.putImageData(d,0,0);return c.toDataURL('image/png').split(',')[1];});
 const big=await save('noisy.png',noisy);
 assert.equal(big.subarray(1,4).toString(),'PNG');assert.ok(big.length<=2*1024*1024,`size ${big.length}`);assert.ok(big.length>1.2*1024*1024,'2MB 가까이 유지');
 assert.ok(big.readUInt32BE(16)<1600,'큰 사진은 픽셀 크기를 줄임');
 // 작은 사진은 그대로 저장
 const small=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=400;const x=c.getContext('2d');x.fillStyle='#456';x.fillRect(50,50,200,300);return c.toDataURL('image/png').split(',')[1];});
 const kept=await save('small.png',small);
 assert.equal(kept.readUInt32BE(16),300);assert.equal(kept.readUInt32BE(20),400);
 console.log(`PASS: noisy photo saved as ${(big.length/1048576).toFixed(2)}MB PNG at ${big.readUInt32BE(16)}px wide; small photo kept at original size.`);
}finally{await browser.close();}
