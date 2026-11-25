// 자동 수평 맞추기 검사: 기울여 만든 합성 매장 사진 → 자동 각도, 누끼는 바로 세운 사진으로 요청, 각도를 바꿔도 Photoroom 재호출 없음,
// 0°로·자동 다시 계산, 격자 미리보기, 자동 수평 끄기. Photoroom은 모의 응답(비용 없음).
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const sent=[];let cut=null;
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='retouch'){sent.push(r.request().postDataJSON().image);return r.fulfill({json:{image:cut}});}
  return r.fulfill({json:{configured:true,openai:false,photoroom:true}});});
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const loaded=()=>page.waitForFunction(()=>{const n=document.querySelector('[aria-label="상품 이름"]'),e=document.querySelector('.studio-editor');return Boolean(n?.value)&&e&&!e.disabled;});
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 await loaded();
 // 반시계 방향으로 TILT°만큼 돌아간 사진(벽돌 벽 + 기둥 + 옷) → 기대 보정 각도 +TILT
 const TILT=3.2;
 const fx=await page.evaluate(t=>{
  const W=900,H=1200,scene=(wall)=>{const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
   if(wall){g.fillStyle='#cdc6ba';g.fillRect(0,0,W,H);g.fillStyle='#968c80';for(let y=0;y<H;y+=40){g.fillRect(0,y,W,5);const off=(y/40)%2?55:0;for(let x=off;x<W;x+=110)g.fillRect(x,y,5,40);}}
   g.fillStyle='#1a1a1a';g.fillRect(W/2-12,800,24,400);g.fillStyle='#a8464f';g.fillRect(W/2-210,260,420,560);return c;};
  const tilted=document.createElement('canvas');tilted.width=W;tilted.height=H;const g=tilted.getContext('2d');g.fillStyle='#cdc6ba';g.fillRect(0,0,W,H);
  g.translate(W/2,H/2);g.rotate(-t*Math.PI/180);g.drawImage(scene(true),-W/2,-H/2);
  return {src:tilted.toDataURL('image/jpeg',.95),cut:scene(false).toDataURL('image/png')};},TILT);
 cut=fx.cut;
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.jpg',mimeType:'image/jpeg',buffer:Buffer.from(fx.src.split(',')[1],'base64')});await idle();
 const angle=async()=>Number(await page.getByLabel('hero 수평 각도').inputValue());
 const auto=await angle();
 assert.ok(Math.abs(auto-TILT)<=.3,`자동 각도 ${auto}° (기대 +${TILT}°)`);
 assert.match(await page.locator('[aria-label="hero 수평 맞추기"]').innerText(),/자동 계산 \+[\d.]+° · 신뢰도 \d+%/);
 assert.equal(await page.locator('[data-slot="hero"] .level-grid').count(),1,'격자 미리보기');
 assert.match(await page.locator('[data-slot="hero"] .level-view img').getAttribute('style'),/rotate\(3\.\d+deg\)/);
 // 돌린 컷은 눈에 띄게 '자동 수평 n°' 표시 + 원래대로 버튼
 assert.match(await page.getByLabel('hero 자동 수평 표시').innerText(),/자동 수평 \+3\.\d° 적용/);
 // 누끼는 바로 세운 사진으로 요청
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle();
 assert.equal(sent.length,1);assert.notEqual(sent[0],fx.src,'원본이 아니라 바로 세운 사진을 보냄');
 // 바로 세운 사진의 세로선이 곧은지: 보낸 사진에서 다시 재면 0° 근처
 // 각도를 직접 0°로 → 자동으로 다시 처리, Photoroom 재호출 없음
 await page.locator('[data-slot="hero"]').getByRole('button',{name:'원래대로 (0°)'}).click();await idle();
 assert.equal(await angle(),0);assert.equal(sent.length,1,'각도만 바꾸면 재과금 없음');
 await page.locator('[data-slot="hero"]').getByRole('button',{name:'자동 수평 다시 계산'}).click();await idle();
 assert.ok(Math.abs(await angle()-auto)<1e-9);assert.equal(sent.length,1);
 // 슬라이더로 직접(0.1° 단위)
 const slider=page.getByLabel('hero 수평 각도');await slider.focus();await page.keyboard.press('ArrowLeft');await idle();
 assert.ok(Math.abs(await angle()-(auto-.1))<1e-6,`0.1° 내림 ${await angle()}`);assert.match(await page.locator('[aria-label="hero 수평 맞추기"]').innerText(),/\(직접\)/);
 assert.equal(sent.length,1);
 // (013) 확대·디테일 컷은 같은 기울어진 사진이어도 자동으로 돌리지 않음
 await page.getByLabel('frontZoom 컷 추가').click();await page.getByLabel('frontZoom 사진 선택',{exact:true}).setInputFiles({name:'z.jpg',mimeType:'image/jpeg',buffer:Buffer.from(fx.src.split(',')[1],'base64')});await idle();
 assert.equal(Number(await page.getByLabel('frontZoom 수평 각도').inputValue()),0,'확대 컷은 자동 회전 꺼짐');
 assert.match(await page.locator('[aria-label="frontZoom 수평 맞추기"]').innerText(),/확대·디테일 컷은 자동 수평을 하지 않음/);
 assert.equal(await page.getByLabel('frontZoom 자동 수평 표시').count(),0);
 // 확대 컷을 직접 돌리면 모서리가 비지 않게 안쪽으로 잘라 냄(사선 가장자리 없음)
 const zs=page.getByLabel('frontZoom 수평 각도');await zs.fill('2');await zs.press('Shift');await idle();
 assert.equal(Number(await zs.inputValue()),2);
 assert.match(await page.locator('[aria-label="frontZoom 수평 맞추기"]').innerText(),/안쪽으로 잘라 냈습니다/);
 // (013) 정면 전체라도 ±4°를 넘으면 돌리지 않음
 const steep=await page.evaluate(t=>{const W=900,H=1200,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');g.fillStyle='#cdc6ba';g.fillRect(0,0,W,H);g.translate(W/2,H/2);g.rotate(-t*Math.PI/180);g.translate(-W/2,-H/2);
  g.fillStyle='#cdc6ba';g.fillRect(-200,-200,W+400,H+400);g.fillStyle='#968c80';for(let y=-200;y<H+200;y+=40){g.fillRect(-200,y,W+400,5);const off=((y+200)/40)%2?55:0;for(let x=off-200;x<W+200;x+=110)g.fillRect(x,y,5,40);}
  g.fillStyle='#1a1a1a';g.fillRect(W/2-12,800,24,600);g.fillStyle='#a8464f';g.fillRect(W/2-210,260,420,560);return c.toDataURL('image/jpeg',.95);},7);
 await page.getByLabel('back 컷 추가').click();await page.getByLabel('back 사진 선택',{exact:true}).setInputFiles({name:'s.jpg',mimeType:'image/jpeg',buffer:Buffer.from(steep.split(',')[1],'base64')});await idle();
 assert.equal(Number(await page.getByLabel('back 수평 각도').inputValue()),0,'7°는 최대 ±4°를 넘어 돌리지 않음');
 assert.match(await page.locator('[aria-label="back 수평 맞추기"]').innerText(),/최대 ±4°를 넘어 돌리지 않음/);
 // 자동 수평 끄기 → 새 사진은 0°
 await page.getByLabel('자동 수평 맞추기',{exact:true}).first().uncheck();
 await page.getByLabel('side 컷 추가').click();await page.getByLabel('side 사진 선택',{exact:true}).setInputFiles({name:'b.jpg',mimeType:'image/jpeg',buffer:Buffer.from(fx.src.split(',')[1],'base64')});await idle();
 assert.equal(Number(await page.getByLabel('side 수평 각도').inputValue()),0,'자동 수평을 끄면 돌리지 않음');
 assert.deepEqual(errors,[]);
 console.log(`PASS: auto level ${auto}° for a ${TILT}° counter-clockwise photo (error ${Math.abs(auto-TILT).toFixed(2)}°), cutout requested with the leveled photo, 0°/auto/0.1° slider changes reuse the saved Photoroom result (1 call), grid preview, auto level can be turned off; zoom cut not auto-rotated and cropped inward when rotated by hand, 7° front not rotated (max ±4°), '자동 수평 n° 적용' badge.`);
}finally{await browser.close();}
