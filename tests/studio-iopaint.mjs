// 실제 IOPaint 서버(기본 http://127.0.0.1:8080)와 연동 검사. Claude 표시는 모의 응답(얼룩 좌표).
// 실행 전 IOPaint가 켜져 있어야 합니다. CUTOUT_PATH: 투명 누끼 PNG, STAIN: "x0,y0,x1,y1" (0~1000 비율)
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const cutout='data:image/png;base64,'+fs.readFileSync(process.env.CUTOUT_PATH).toString('base64');
const [x0,y0,x1,y1]=(process.env.STAIN||'465,172,508,196').split(',').map(Number);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=[];
 await page.route('**/api/studio?*',r=>{const a=new URL(r.request().url()).searchParams.get('action');calls.push(a);
  if(a==='retouch')return r.fulfill({json:{image:cutout}});
  if(a==='defects'){const b=JSON.parse(r.request().postData());assert.ok(b.width<=1024&&b.image.startsWith('data:image/jpeg'));return r.fulfill({json:{regions:[{type:'mannequin_mark',x0,y0,x1,y1,confidence:.92,note:'마네킹 목 얼룩'},{type:'wrinkle',x0:600,y0:900,x1:640,y1:930,confidence:.3,note:'애매한 주름'}]}});}
  return r.fulfill({json:{configured:true,openai:true,photoroom:true,claude:true}});});
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);await idle();
 await page.waitForFunction(()=>/IOPaint\(내 PC\) ✅/.test(document.querySelector('.tools-panel summary').textContent),null,{timeout:10000});
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:Buffer.from(cutout.split(',')[1],'base64')});await idle();
 await page.locator('[data-slot="hero"]').getByRole('button',{name:'이 사진 누끼·보정',exact:true}).click();await idle();
 const panel=page.locator('[data-slot="hero"] .defect-panel');
 await panel.locator('summary').click();
 await panel.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).click();await idle();
 assert.equal(await panel.locator('.defect-list li').count(),2);
 assert.ok(await page.getByLabel('hero 수정 1').isChecked(),'확신 높은 곳은 기본 선택');assert.ok(!(await page.getByLabel('hero 수정 2').isChecked()),'애매한 곳은 기본 해제');
 await panel.locator('.defect-preview').waitFor();
 const t=Date.now();
 await panel.getByRole('button',{name:'IOPaint로 지우기 (1곳)'}).click();await idle();
 const secs=((Date.now()-t)/1000).toFixed(1);
 assert.match(await page.locator('[role=status]').innerText(),/IOPaint로 1곳을 지웠습니다/,await page.locator('[role=alert]').allInnerTexts().then(a=>a.join()));
 // 결과: 얼룩 자리 색이 주변(마네킹 크림색)과 비슷해졌는지, 투명 배경 유지
 const res=await page.evaluate(async([src,box])=>{
  const slotImg=document.querySelector('[data-slot="hero"] .paste-zone img');
  const load=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=s;});
  const before=await load(src),after=await load(slotImg.src);
  const px=(im,x,y,r=5)=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.drawImage(im,0,0);const d=g.getImageData(x-r,y-r,2*r+1,2*r+1).data;const s=[0,0,0,0];for(let i=0;i<d.length;i+=4)for(let k=0;k<4;k++)s[k]+=d[i+k];return s.map(v=>Math.round(v/(d.length/4)));};
  const cx=Math.round((box[0]+box[2])/2000*before.naturalWidth),cy=Math.round((box[1]+box[3])/2000*before.naturalHeight);
  return {stainBefore:px(before,cx,cy),stainAfter:px(after,cx,cy),ref:px(before,cx,cy-45),corner:px(after,3,3,2)};
 },[cutout,[x0,y0,x1,y1]]);
 const dist=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
 console.log('pixels',JSON.stringify(res));
 assert.ok(dist(res.stainBefore,res.ref)>25,'원래 얼룩은 주변과 다른 색');
 assert.ok(dist(res.stainAfter,res.ref)<15,`지운 뒤 주변 색과 비슷 (${dist(res.stainAfter,res.ref).toFixed(1)})`);
 assert.deepEqual(res.corner.slice(0,3),[255,255,255],'흰 배경 유지');
 await page.getByLabel('hero 이전으로 되돌리기').click();await idle();
 assert.equal(calls.filter(c=>c==='defects').length,1);
 assert.deepEqual(errors,[]);
 console.log(`PASS: Claude marks (mock) → real IOPaint erased the stain in ${secs}s (diff to surroundings ${dist(res.stainBefore,res.ref).toFixed(0)} → ${dist(res.stainAfter,res.ref).toFixed(0)}), white background kept, undo works.`);
}finally{await browser.close();}
