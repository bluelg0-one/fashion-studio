// 1차 보정 기본 색감: 새로 넣은 사진은 밝기 +20·화사하게 +30이 자동 적용, 예전에 저장한 사진(색감 값 없음)은 0 그대로. 모의 응답(비용 없음).
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let cut=null;
 await page.route('**/api/studio?*',r=>{const a=new URL(r.request().url()).searchParams.get('action');if(a==='retouch')return r.fulfill({json:{image:cut}});return r.fulfill({json:{configured:true,openai:false,photoroom:true}});});
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const loaded=()=>page.waitForFunction(()=>{const n=document.querySelector('[aria-label="상품 이름"]'),e=document.querySelector('.studio-editor');return Boolean(n?.value)&&e&&!e.disabled;});
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 await loaded();
 const fx=await page.evaluate(()=>{const m=bg=>{const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');if(bg){g.fillStyle=bg;g.fillRect(0,0,300,400);}g.fillStyle='rgb(70,90,60)';g.fillRect(90,80,120,260);return c.toDataURL('image/png');};return {src:m('rgb(225,220,210)'),cut:m(null)};});
 cut=fx.cut;
 const color=()=>page.locator('[data-slot="hero"] .stage1-img').evaluate(async im=>{await im.decode?.();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.drawImage(im,0,0);return [...g.getImageData(c.width/2,c.height/2,1,1).data].slice(0,3);});
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 // 1) 새 사진: 기본 색감 자동 적용
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:Buffer.from(fx.src.split(',')[1],'base64')});await idle();
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle();
 assert.equal(await page.getByLabel('hero 밝기').inputValue(),'20');assert.equal(await page.getByLabel('hero 화사하게').inputValue(),'30');
 const toned=await color();assert.ok(dist(toned,[70,90,60])>30,`새 사진은 밝고 화사하게 ${toned}`);
 // 2) 예전에 저장한 상품(색감 값 없음)은 0 그대로
 await page.evaluate(([src,cut])=>new Promise((res,rej)=>{const r=indexedDB.open('fashion-studio',1);r.onsuccess=()=>{const tx=r.result.transaction('products','readwrite');
  const slot={id:'hero',label:'정면',enabled:true,source:src,image:src,cutout:null,crop:null,status:'raw'};
  tx.objectStore('products').put({id:'p-old',name:'예전 상품',data:{slots:{hero:slot}},updatedAt:Date.now()+1e9});tx.oncomplete=()=>{r.result.close();res();};tx.onerror=()=>rej(tx.error);};}),[fx.src,fx.cut]);
 await page.reload();await loaded();
 assert.equal(await page.getByLabel('상품 이름').inputValue(),'예전 상품');
 await page.locator('[data-slot="hero"]').getByRole('button',{name:'이 사진 누끼·보정',exact:true}).click();await idle();
 assert.equal(await page.getByLabel('hero 밝기').inputValue(),'0');assert.equal(await page.getByLabel('hero 화사하게').inputValue(),'0');
 const plain=await color();assert.ok(dist(plain,[70,90,60])<4,`예전 사진은 원래 색 ${plain}`);
 assert.deepEqual(errors,[]);
 console.log(`PASS: new photos get bright +20 / vivid +30 by default (${toned}); legacy saved photos keep 0 (${plain}).`);
}finally{await browser.close();}
