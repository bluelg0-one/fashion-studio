// Photoroom 결과에도 받침대 지우기·누끼 뒤 정리가 적용되는지, 정리 옵션을 바꿔도(새로고침 후에도) Photoroom을 다시 부르지 않는지 검사.
// Photoroom은 모의 응답입니다(비용 없음). 투명 배경 결과와 흰 배경(불투명) 결과 두 가지를 확인합니다.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
const url=process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001';
async function run(opaque) {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let retouch=0,cutout=null;
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='retouch'){retouch++;return r.fulfill({json:{image:cutout}});}
  if(a==='credits')return r.fulfill({json:{credits:100}});
  return r.fulfill({json:{configured:true,openai:false,photoroom:true}});});
 await page.goto(url);
 const loaded=()=>page.waitForFunction(()=>{const n=document.querySelector('[aria-label="상품 이름"]'),e=document.querySelector('.studio-editor');return Boolean(n?.value)&&e&&!e.disabled;});
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 await loaded();
 // 원본(벽 배경)과 Photoroom 모의 결과(옷 + 아래에서 올라오는 검은 기둥)
 const made=await page.evaluate(opaque=>{
  const W=600,H=800,draw=(bg)=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');if(bg){x.fillStyle=bg;x.fillRect(0,0,W,H);}
   x.fillStyle='#b04a55';x.fillRect(160,80,280,420);x.fillStyle='#1c1c1c';x.fillRect(292,500,16,300);return c.toDataURL('image/png');};
  return {source:draw('#9a8f80'),cut:draw(opaque?'#ffffff':null)};},opaque);
 cutout=made.cut;
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:Buffer.from(made.source.split(',')[1],'base64')});await idle();
 // 받침대 영역(사진 아래 가운데)에 어두운 픽셀이 있는지: 최종 사진에서 확인
 const pole=()=>page.locator('[data-slot="hero"] .final-zone img').evaluate(async im=>{await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d');x.drawImage(im,0,0);
  const d=x.getImageData(0,0,c.width,c.height).data;let dark=0;for(let y=Math.floor(c.height*.85);y<c.height;y++)for(let X=Math.floor(c.width*.4);X<c.width*.6;X++){const i=(y*c.width+X)*4;if(d[i]<80&&d[i+1]<80&&d[i+2]<80)dark++;}return dark;});
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle();
 assert.equal(retouch,1);
 assert.equal(await pole(),0,`${opaque?'흰 배경':'투명'} 결과: 받침대 기둥이 지워짐`);
 // 정리 옵션을 바꿔 다시 처리 → Photoroom 재호출 없음, 기둥은 남음
 const standBox=page.getByLabel('받침대 기둥 지우기',{exact:true}).first();
 await standBox.uncheck();
 await page.locator('[data-slot="hero"]').getByRole('button',{name:/이 사진 누끼·보정/}).first().click();await idle();
 assert.equal(retouch,1,'정리 옵션만 바꾸면 재과금 없음');
 assert.ok(await pole()>0,'받침대 지우기를 끄면 기둥이 남음');
 // 새로고침 후(메모리 캐시 없음)에도 저장된 Photoroom 결과를 다시 씀
 await standBox.check();await page.waitForTimeout(300);await page.waitForFunction(()=>document.querySelector('.save-state')?.textContent==='자동 저장됨');
 await page.reload();await loaded();
 await page.locator('[data-slot="hero"]').getByRole('button',{name:/이 사진 누끼·보정/}).first().click();await idle();
 assert.equal(retouch,1,'새로고침 후에도 재과금 없음');
 assert.equal(await pole(),0);
 assert.deepEqual(errors,[]);
 await context.close();
}
try{
 await run(false);await run(true);
 console.log('PASS: Photoroom cutouts (transparent and white-background) get the stand pole removed by default; toggling cleanup or reloading reuses the saved Photoroom result (1 call total each).');
}finally{await browser.close();}
