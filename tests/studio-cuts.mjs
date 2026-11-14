// 새 화면: 컷 숨김/추가, 컷 한 줄(원본→1차→2차→최종), 색감 기준 체크(다른 컷 잠김·자동 적용), 배경 직접 수정 붓, 색상 보정.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 // 원본(벽 위 옷)과 누끼(투명 위 옷): 컷마다 옷 색이 다름
 const fx=await page.evaluate(()=>{const make=(col,cut)=>{const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');if(!cut){g.fillStyle='rgb(225,220,210)';g.fillRect(0,0,300,400);}g.fillStyle=col;g.fillRect(90,80,120,260);return c.toDataURL('image/png');};
  return {srcA:make('rgb(70,90,60)'),cutA:make('rgb(70,90,60)',1),srcB:make('rgb(120,140,110)'),cutB:make('rgb(120,140,110)',1)};});
 let calls=0;
 await page.route('**/api/studio?*',r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='retouch'){const body=JSON.parse(r.request().postData());assert.equal(body.options.center,false,'정렬은 브라우저에서');calls++;return r.fulfill({json:{image:calls===1?fx.cutA:fx.cutB}});}
  return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:false}});});
 await page.route('http://127.0.0.1:808*/**',r=>r.abort());
 await page.reload();
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);await idle();
 const buf=u=>Buffer.from(u.split(',')[1],'base64');
 // 1) 처음엔 정면만 보이고, 나머지는 '+ 컷 추가'에 숨어 있음
 assert.deepEqual(await page.locator('.cut-row').evaluateAll(n=>n.map(e=>e.dataset.slot)),['hero']);
 assert.equal(await page.locator('.add-cuts button').count(),11,'10가지 컷 + 직접 이름');
 assert.match(await page.locator('.add-cuts').innerText(),/정면 확대[\s\S]*원단 및 디테일[\s\S]*디테일 3[\s\S]*포인트 2/);
 await page.getByLabel('side 컷 추가').click();
 assert.equal(await page.locator('[data-slot="side"]').count(),1);
 await page.getByLabel('side 칸 숨기기').click();assert.equal(await page.locator('[data-slot="side"]').count(),0);
 await page.getByLabel('side 컷 추가').click();
 // 2) 두 컷 넣고 정면 1차 보정
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:buf(fx.srcA)});await idle();
 await page.getByLabel('side 사진 선택',{exact:true}).setInputFiles({name:'b.png',mimeType:'image/png',buffer:buf(fx.srcB)});await idle();
 const hero=page.locator('[data-slot="hero"]'),side=page.locator('[data-slot="side"]');
 await hero.getByRole('button',{name:'이 사진 누끼·보정',exact:true}).click();await idle();
 for(const sel of ['.stage1-img','.stage2-img','.final-zone img'])assert.equal(await hero.locator(sel).count(),1,sel);
 const color=(loc)=>loc.evaluate(async im=>{await im.decode?.();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.drawImage(im,0,0);const d=g.getImageData(c.width/2-5,c.height/2-5,10,10).data;let s=[0,0,0,0];for(let i=0;i<d.length;i+=4)for(let k=0;k<4;k++)s[k]+=d[i+k];return s.map(v=>Math.round(v/(d.length/4)));});
 // 3) 정면 1차 색감을 기준으로 → 측면의 체크칸은 잠김 → 측면을 보정하면 자동으로 정면 색감에 맞춰짐
 await page.getByLabel('hero 색감 기준 1차').click();await idle();
 assert.ok(await page.getByLabel('hero 색감 기준 1차').isChecked());
 assert.ok(await page.getByLabel('side 색감 기준 1차').isDisabled(),'다른 컷은 잠김');
 await side.getByRole('button',{name:'이 사진 누끼·보정',exact:true}).click();await idle();
 const heroC=await color(hero.locator('.stage1-img')),sideC=await color(side.locator('.stage1-img'));
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 assert.ok(dist(heroC,sideC)<dist(heroC,[120,140,110])-20,`측면이 정면 색감 쪽으로 (${heroC} / ${sideC})`);
 // 4) 배경 직접 수정: 옷 가운데를 '모두 지우기' → 최종 가운데 흰색, '되살리기'로 다시 살림
 await hero.getByRole('button',{name:'✏️ 배경 직접 수정'}).click();
 const stage=page.getByTestId('hero-matte-stage'),canvas=page.getByLabel('hero 배경 수정 화면');await canvas.scrollIntoViewIfNeeded();
 const strokeAt=async()=>{const b=await canvas.boundingBox();const x=b.x+b.width/2,y=b.y+b.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+3,y+3,{steps:3});await page.mouse.up();};
 await page.getByLabel('hero 붓 크기').fill('12');await page.getByLabel('hero 모두 지우기').check();await strokeAt();
 await stage.locator('..').getByRole('button',{name:'수정 적용'}).click();await idle();
 assert.deepEqual((await color(hero.locator('.final-zone img'))).slice(0,3),[255,255,255],'지운 곳은 흰 배경');
 await hero.getByRole('button',{name:'✏️ 배경 직접 수정'}).click();await canvas.scrollIntoViewIfNeeded();
 await page.getByLabel('hero 붓 크기').fill('12');await page.getByLabel('hero 되살리기').check();await strokeAt();
 await page.getByTestId('hero-matte-stage').locator('..').getByRole('button',{name:'수정 적용'}).click();await idle();
 assert.ok(dist((await color(hero.locator('.final-zone img'))).slice(0,3),[70,90,60])<12,'원본에서 되살림');
 // 5) 색상 보정: 밝게
 const before=await color(hero.locator('.stage1-img'));
 await page.getByLabel('hero 밝기').fill('25');await hero.getByRole('button',{name:'색상 보정 적용'}).click();await idle();
 const after=await color(hero.locator('.stage1-img'));
 assert.ok(after[0]+after[1]+after[2]>before[0]+before[1]+before[2]+40,`밝아짐 ${before}→${after}`);
 // 되돌리기는 무료, API 호출은 컷당 1번뿐
 await page.getByLabel('hero 이전으로 되돌리기').click();await idle();
 assert.deepEqual(await color(hero.locator('.stage1-img')),before);
 assert.equal(calls,2);
 assert.deepEqual(errors,[]);
 console.log(`PASS: hidden cuts + add/hide, 4-stage row, color reference locks other cuts and auto-applies (${heroC} vs ${sideC}), brush erase/restore on aligned matte, tone, free undo; ${calls} Photoroom calls.`);
}finally{await browser.close();}
