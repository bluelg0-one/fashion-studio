// 실제 BiRefNet 서버(public/iopaint/birefnet_server.py, 기본 http://127.0.0.1:8081)와 연동 검사.
// PHOTO_PATH: 배경이 있는 원본 JPG. Photoroom(서버 retouch)은 호출되면 안 됩니다.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const photo=fs.readFileSync(process.env.PHOTO_PATH);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=[];
 await page.route('**/api/studio?*',r=>{const a=new URL(r.request().url()).searchParams.get('action');calls.push(a);
  if(a==='retouch')return r.fulfill({status:500,json:{error:'Photoroom이 호출되면 안 됩니다'}});
  // Photoroom 키가 없어도 BiRefNet으로는 누끼가 되어야 합니다.
  return r.fulfill({json:{configured:false,openai:false,photoroom:false,claude:false}});});
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const idle=(timeout=30000)=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled,null,{timeout});await idle();
 await page.waitForFunction(()=>/BiRefNet\(내 PC\) ✅/.test(document.querySelector('.tools-panel summary').textContent),null,{timeout:10000});
 await page.locator('.tools-panel summary').click();
 assert.match(await page.locator('.tools-panel').innerText(),/BiRefNet/);
 await page.getByLabel('배경 지우기 엔진',{exact:true}).selectOption('birefnet');
 assert.equal(await page.locator('.retouch-settings details.advanced').count(),0,'BiRefNet이면 Photoroom 생성형 편집은 숨김');
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.jpg',mimeType:'image/jpeg',buffer:photo});await idle();
 const btn=page.locator('[data-slot="hero"] .btn-with-cost').filter({hasText:'이 사진 누끼·보정'});
 assert.match(await btn.innerText(),/BiRefNet · 무료/);
 const t=Date.now();
 await btn.getByRole('button').click();await idle(600000);
 const secs=((Date.now()-t)/1000).toFixed(1);
 assert.deepEqual(await page.locator('[role=alert]').allInnerTexts(),[]);
 assert.match(await page.locator('[role=status]').innerText(),/완료/);
 const res=await page.evaluate(async()=>{
  const img=document.querySelector('[data-slot="hero"] .final-zone img');
  const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=img.src;});
  const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.drawImage(im,0,0);
  const px=(x,y)=>Array.from(g.getImageData(x,y,1,1).data);
  return {w:c.width,h:c.height,corner:px(5,5),side:px(Math.round(c.width*.06),Math.round(c.height*.5)),center:px(Math.round(c.width/2),Math.round(c.height*.45))};
 });
 console.log('pixels',JSON.stringify(res));
 assert.deepEqual(res.corner.slice(0,3),[255,255,255],'배경이 흰색으로');
 assert.deepEqual(res.side.slice(0,3),[255,255,255],'옷 바깥 벽도 흰색으로');
 assert.ok(Math.max(...res.center.slice(0,3))<200,'옷(가운데)은 남아 있음');
 assert.ok(!calls.includes('retouch'),'Photoroom 호출 없음');
 // 같은 사진·같은 설정으로 다시 누르면 저장된 결과를 써서 즉시 끝남
 const t2=Date.now();await btn.getByRole('button').click();await idle();
 assert.ok(Date.now()-t2<5000,'재사용');
 // 받침대 기둥: 켜짐(기본) vs 꺼짐 결과의 옷 영역 비율 비교. 꺼도 BiRefNet을 다시 돌리지 않아야 함.
 const shape=()=>page.evaluate(async()=>{
  const img=document.querySelector('[data-slot="hero"] .final-zone img');
  const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=img.src;});
  const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.drawImage(im,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data;let t=c.height,b=0,l=c.width,r=0;
  for(let y=0;y<c.height;y+=2)for(let x=0;x<c.width;x+=2){const i=(y*c.width+x)*4;if(d[i]+d[i+1]+d[i+2]<720){if(y<t)t=y;if(y>b)b=y;if(x<l)l=x;if(x>r)r=x;}}
  return {t,b,l,r,ratio:(b-t)/(r-l)};
 });
 const withoutPole=await shape();
 assert.ok(await page.getByLabel('받침대 기둥 지우기',{exact:true}).isChecked(),'기본으로 켜짐');
 await page.getByLabel('받침대 기둥 지우기',{exact:true}).uncheck();
 const t3=Date.now();await btn.getByRole('button').click();await idle();
 assert.ok(Date.now()-t3<5000,'기둥 설정만 바꾸면 BiRefNet을 다시 돌리지 않음');
 const withPole=await shape();
 console.log('shape',JSON.stringify({withoutPole,withPole}));
 if(process.env.EXPECT_POLE)assert.ok(withPole.ratio>withoutPole.ratio*1.03,'기둥을 지우면 옷 영역이 덜 길쭉해짐(기둥이 빠짐)');
 assert.deepEqual(errors,[]);
 console.log(`PASS: BiRefNet (local server) cut out the photo in ${secs}s (${res.w}x${res.h}), white background, no Photoroom call, re-run reuses the result.`);
}finally{await browser.close();}
