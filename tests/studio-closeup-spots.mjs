// 확대 컷 얼룩 검사(013-C): 원단 디테일 같은 확대 컷에서 Claude가 표시한 얼룩은 IOPaint로 보내지 않고 '확인 필요'로 남깁니다
// (LaMa가 넓은 픽셀을 결 대신 회색으로 채움 — 원단 디테일 단추 사이 회색 얼룩). 구김은 그림자 펴기로 고칩니다. 같은 표시를 정면 컷에서는 IOPaint로 보냅니다.
// Claude·IOPaint 모두 모의 응답(비용 없음).
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let cut=null;const inpaints=[];
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='retouch')return r.fulfill({json:{image:cut}});
  if(a==='defects')return r.fulfill({json:{regions:[{type:'stain',x0:450,x1:480,y0:450,y1:480,confidence:.9,note:'얼룩'},{type:'wrinkle',x0:300,x1:600,y0:600,y1:700,confidence:.9,note:'구김'}]}});
  return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:true}});});
 await page.route('http://127.0.0.1:8080/**',async r=>{const u=r.request().url();
  if(u.endsWith('/api/v1/model'))return r.fulfill({json:{name:'lama'}});
  if(u.endsWith('/api/v1/inpaint')){inpaints.push(1);const img=r.request().postDataJSON().image;return r.fulfill({body:Buffer.from(img.split(',')[1],'base64'),contentType:'image/png'});}
  return r.fulfill({status:404,body:''});});
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 await page.waitForFunction(()=>{const n=document.querySelector('[aria-label="상품 이름"]'),e=document.querySelector('.studio-editor');return Boolean(n?.value)&&e&&!e.disabled;});
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 const fx=await page.evaluate(()=>{const m=bg=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');if(bg){g.fillStyle=bg;g.fillRect(0,0,600,800);}g.fillStyle='rgb(200,120,140)';g.fillRect(60,60,480,680);for(let y=60;y<740;y+=4)for(let x=60;x<540;x+=4){g.fillStyle=(x+y)%8?'rgb(190,112,132)':'rgb(208,128,148)';g.fillRect(x,y,2,2);}return c.toDataURL('image/png');};return {src:m('rgb(220,215,205)'),cut:m(null)};});
 cut=fx.cut;
 const run=async id=>{
  await page.getByLabel(`${id} 사진 선택`,{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:Buffer.from(fx.src.split(',')[1],'base64')});await idle();
  const slot=page.locator(`[data-slot="${id}"]`);
  await slot.getByRole('button',{name:'이 사진 누끼·보정',exact:true}).click();await idle();
  await page.getByLabel(`${id} 찾기 민감도`).selectOption('normal');
  await slot.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).click();await idle();
  await slot.getByRole('button',{name:/선택한 곳 고치기/}).click();await idle();
  return page.locator('[role=status]').innerText();
 };
 await page.locator('.tools-panel summary').click();await page.getByRole('button',{name:'다시 확인'}).click();
 await page.getByLabel('fabric 컷 추가').click();
 const fabric=await run('fabric');
 assert.equal(inpaints.length,0,'확대 컷 얼룩은 IOPaint로 보내지 않음');
 assert.match(fabric,/구김 1곳 그림자 펴기/);assert.match(fabric,/확대 컷은 얼룩을 IOPaint로 자동 지우지 않음/);
 const hero=await run('hero');
 assert.equal(inpaints.length,1,'정면 컷은 같은 얼룩을 IOPaint로');assert.match(hero,/얼룩 1곳 IOPaint로 지우기/);
 assert.deepEqual(errors,[]);
 console.log('PASS: fabric close-up: stain not sent to IOPaint (확인 필요), wrinkle flattened; same marks on the front cut send the stain to IOPaint once.');
}finally{await browser.close();}
