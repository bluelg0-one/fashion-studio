// 색감 통일: 기준 컷 지정 → 다른 컷 맞추기 → 되돌리기. API 호출 없이 동작하는지 검사합니다.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 // 투명 배경 위 옷 모양. 대표=진한 카키, 디테일=밝고 노란 카키(조명 차이)
 const make=color=>page.evaluate(c=>{const k=document.createElement('canvas');k.width=200;k.height=300;const x=k.getContext('2d');x.fillStyle=c;x.fillRect(40,40,120,220);x.fillStyle='#efece6';x.fillRect(60,10,80,30);return k.toDataURL();},color);
 const dark=await make('#565e3e'),light=await make('#727a46');
 const calls=[];
 await page.route('**/api/studio?*',r=>{const a=new URL(r.request().url()).searchParams.get('action');calls.push(a);
  if(a==='retouch'){const n=calls.filter(c=>c==='retouch').length;return r.fulfill({json:{image:n===1?dark:light}});}
  return r.fulfill({json:{configured:true,openai:true,photoroom:true}});});
 await page.reload();
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);await idle();
 const file=d=>({name:'a.png',mimeType:'image/png',buffer:Buffer.from(d.split(',')[1],'base64')});
 for(const [id,d] of [['hero',dark],['frontTop',light]]){if(id!=='hero')await page.getByLabel(`${id} 컷 추가`).click();await page.getByLabel(`${id} 사진 선택`,{exact:true}).setInputFiles(file(d));await idle();await page.locator(`[data-slot="${id}"]`).getByRole('button',{name:'이 사진 누끼·보정',exact:true}).click();await idle();}
 const center=id=>page.locator(`[data-slot="${id}"] .final-zone img`).evaluate(im=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d');x.drawImage(im,0,0);return [...x.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data].slice(0,3);});
 const heroColor=await center('hero'),before=await center('frontTop');
 const dist=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
 assert.ok(dist(before,heroColor)>25,'시작할 때 색이 다름');
 const retouches=calls.filter(c=>c==='retouch').length;
 await page.getByLabel('hero 색감 기준 최종').click();await idle();
 assert.equal(await page.locator('[data-slot="hero"] .color-ref-check.on').count(),1);
 await page.getByLabel('색감 맞추는 강도').fill('100');
 await page.getByRole('button',{name:'기준 색감으로 다른 컷 지금 맞추기'}).click();await idle();
 const after=await center('frontTop');
 assert.ok(dist(after,heroColor)<6,`맞춘 뒤 색 차이 ${dist(after,heroColor).toFixed(1)} (${after} vs ${heroColor})`);
 assert.deepEqual(await center('hero'),heroColor,'기준 컷은 그대로');
 assert.equal(calls.filter(c=>c==='retouch').length,retouches,'색감 통일은 API를 호출하지 않음');
 await page.getByLabel('frontTop 이전으로 되돌리기').click();await idle();
 // 되돌리면 Photoroom 원래 결과(#727a46)로 돌아갑니다. 색감 기준이 있으면 대표 사진 밝기 자동 맞춤은 꺼집니다.
 const undone=await center('frontTop');assert.ok(dist(undone,[0x72,0x7a,0x46])<2,`되돌리기로 원래 색 복원 ${undone}`);
 assert.match(await page.locator('[role=status]').innerText(),/API 사용 없음/);
 // 저장 후 새로고침해도 기준 색이 유지됨
 await page.waitForFunction(()=>document.querySelector('.save-state')?.textContent==='자동 저장됨');
 await page.reload();await idle();assert.equal(await page.locator('[data-slot="hero"] .color-ref-check.on').count(),1);
 assert.deepEqual(errors,[]);
 console.log(`PASS: reference color set, detail shot matched (diff ${dist(after,heroColor).toFixed(1)} from ${dist(before,heroColor).toFixed(1)}), no API calls, undo restores, reference survives reload.`);
}finally{await browser.close();}
