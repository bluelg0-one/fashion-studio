// 여러 상품 자동 저장·복원과 쇼피 등록 묶음(ZIP) 검사. API는 모의 응답입니다.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
const jpegSize=buf=>{for(let i=2;i<buf.length;){const m=buf[i+1],len=buf.readUInt16BE(i+2);if(m>=0xc0&&m<=0xc3)return {h:buf.readUInt16BE(i+5),w:buf.readUInt16BE(i+7)};i+=2+len;}return null;};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
 const calls=[];
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');calls.push(a);
  if(a==='shopee')return r.fulfill({json:{title:"Women's Striped Long Sleeve Tee",description:'Classic stripes\nSlim fit'}});
  return r.fulfill({json:{configured:true,openai:true,photoroom:false}});});
 const url=process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001';
 await page.goto(url);
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 const saved=()=>page.waitForFunction(()=>document.querySelector('.save-state')?.textContent==='자동 저장됨');
 await idle();
 assert.equal(await page.getByLabel('상품 이름').inputValue(),'상품 1');
 const tall=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=900;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,600,900);x.fillStyle='#235';x.fillRect(150,100,300,700);return c.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:Buffer.from(tall,'base64')});await idle();
 await page.getByLabel('상품 제목',{exact:true}).fill('스트라이프 긴팔티');
 await page.getByLabel('상품 이름').fill('스트라이프 티');
 await page.getByLabel('1행 사이즈').fill('FREE');await page.getByLabel('1행 가슴단면').fill('48');await page.getByLabel('1행 총장').fill('62');
 await saved();
 // 새로고침해도 그대로
 await page.reload();await idle();
 assert.equal(await page.getByLabel('상품 이름').inputValue(),'스트라이프 티');
 assert.equal(await page.getByLabel('상품 제목',{exact:true}).inputValue(),'스트라이프 긴팔티');
 assert.equal(await page.locator('[data-slot="hero"] .paste-zone img').count(),1);
 assert.equal(await page.getByLabel('1행 가슴단면').inputValue(),'48');
 // 새 상품은 빈 상태, 다시 돌아오면 복원
 await page.getByRole('button',{name:'+ 새 상품'}).click();await idle();
 assert.equal(await page.getByLabel('상품 이름').inputValue(),'상품 2');
 assert.equal(await page.locator('[data-slot="hero"] .paste-zone img').count(),0);
 assert.equal(await page.getByLabel('상품 선택').locator('option').count(),2);
 const firstId=await page.getByLabel('상품 선택').locator('option',{hasText:'스트라이프 티'}).getAttribute('value');
 await page.getByLabel('상품 선택').selectOption(firstId);await idle();
 assert.equal(await page.getByLabel('상품 제목',{exact:true}).inputValue(),'스트라이프 긴팔티');
 // 쇼피 영문 문구 + ZIP
 await page.getByRole('button',{name:'영문 상품명·설명 자동 작성'}).click();await idle();
 assert.equal(await page.getByLabel('쇼피 영문 상품명').inputValue(),"Women's Striped Long Sleeve Tee");
 assert.ok(calls.includes('shopee'));
 const pending=page.waitForEvent('download');
 await page.getByRole('button',{name:'쇼피 등록 묶음 다운로드 (ZIP)'}).click();
 const dl=await pending;assert.equal(dl.suggestedFilename(),'Women-s-Striped-Long-Sleeve-Tee-shopee.zip');
 const zip=await JSZip.loadAsync(await fs.readFile(await dl.path()));
 const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir).sort();
 const images=names.filter(n=>n.endsWith('.jpg'));
 assert.ok(images.some(n=>n.endsWith('size-chart.jpg')),'size chart included');assert.equal(images[0].split('/').pop(),'01-main.jpg');
 for(const n of images){const buf=await zip.file(n).async('nodebuffer');const d=jpegSize(buf);assert.ok(buf.length<=2*1024*1024,n);assert.equal(d.w,d.h,`${n} square`);assert.ok(d.w>=800,`${n} >=800`);}
 const listing=await zip.file(names.find(n=>n.endsWith('listing.txt'))).async('string');
 assert.match(listing,/Women's Striped Long Sleeve Tee/);assert.match(listing,/Size \| Chest \(flat\) \| Length/);assert.match(listing,/FREE \| 48 \| 62/);
 // 삭제
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'상품 삭제'}).click();await idle();
 assert.equal(await page.getByLabel('상품 선택').locator('option').count(),1);
 console.log(`PASS: autosave & restore after reload, separate products, switch back, English copy, ZIP with ${images.length} square JPGs (<=2MB, >=800px) incl. size chart, listing.txt, delete.`);
}finally{await browser.close();}
