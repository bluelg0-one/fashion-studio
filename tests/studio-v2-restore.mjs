// 020 옷걸이 자리 복원: 합성 옷걸이 앞판(목 구멍 양옆 어깨 위를 옷걸이 바가 덮음, 바 끝은 어깨 밖) → 누끼(모의) → 옷걸이 지우기 → 복원(IOPaint)
// → 어깨 패임이 채워지고 목 구멍·바 끝은 비어 있음, 전·후 비교, 자동 점검 '옷걸이 자리 패임', 끄기, IOPaint 꺼짐 → 확인 필요, 넥라인 디테일컷에 옷걸이 없음.
// REAL_IOPAINT=1 이면 내 PC(127.0.0.1:8080)의 진짜 IOPaint(LaMa)를 씁니다. 아니면 모의(옷 색으로 채운 사진 그대로 돌려줌). 유료 호출 없음.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const REAL=process.env.REAL_IOPAINT==='1';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('about:blank');
 const K=2.6;
 const fx=await page.evaluate(K=>{
  const draw=wall=>{const W=Math.round(600*K),H=Math.round(800*K),c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d'),r=(x0,y0,x1,y1,col)=>{g.fillStyle=col;g.fillRect(Math.round(x0*K),Math.round(y0*K),Math.round((x1-x0+1)*K),Math.round((y1-y0+1)*K));};
   if(wall)r(0,0,599,799,'#d9d2c4');
   r(297,30,302,113,'#aaaaaf');                                  // 고리 줄기
   r(140,112,460,760,'#ece4d4');for(let y=112;y<760;y+=3)r(140,y,460,y,'#e2d9c6');   // 니트(결)
   if(wall)r(251,112,349,160,'#d9d2c4');else g.clearRect(Math.round(251*K),Math.round(112*K),Math.round(99*K),Math.round(49*K));   // 목 구멍
   r(190,104,410,122,'#78502d');                                 // 옷걸이 바(어깨 위·목 구멍을 가로지름)
   r(128,114,139,122,'#78502d');r(461,114,472,122,'#78502d');   // 어깨 밖 바 끝
   return c.toDataURL('image/png');};
  return {raw:draw(true),cut:draw(false)};
 },K);
 let retouches=0;
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='retouch'){retouches++;return r.fulfill({json:{image:fx.cut}});}
  return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:true}});});
 let iopaintOn=true,inpaints=0;
 await page.route('http://127.0.0.1:8081/**',r=>r.abort());
 await page.route('http://127.0.0.1:8080/**',async r=>{
  if(!iopaintOn)return r.abort();
  if(REAL)return r.continue();
  const u=new URL(r.request().url());
  if(u.pathname==='/api/v1/model')return r.fulfill({json:{name:'lama'}});
  if(u.pathname==='/api/v1/inpaint'){inpaints++;const b=JSON.parse(r.request().postData());return r.fulfill({contentType:'image/png',body:Buffer.from(b.image.split(',')[1],'base64')});}
  return r.fulfill({status:404,body:''});});
 if(REAL)page.on('request',q=>{if(q.url().endsWith('/api/v1/inpaint'))inpaints++;});
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const idle=()=>page.waitForFunction(()=>{const e=document.querySelector('.studio-editor');return e&&!e.disabled&&document.querySelector('[aria-label="상품 이름"]')?.value;},null,{timeout:240000});await idle();
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'hero.png',mimeType:'image/png',buffer:Buffer.from(fx.raw.split(',')[1],'base64')});await idle();
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle();
 const panel=page.locator('section.restore-panel');
 {const t=await panel.innerText();assert.match(t,/복원함/,t);}
 assert.ok(await panel.getByAltText('옷걸이 정면 복원 전').isVisible());assert.ok(await panel.getByAltText('옷걸이 정면 복원 후').isVisible());
 assert.ok(inpaints>=1,'IOPaint 호출');
 if(process.env.SAVE_COMPARE){const {writeFile}=await import('node:fs/promises');for(const [alt,name] of [['옷걸이 정면 복원 전','before'],['옷걸이 정면 복원 후','after']]){const u=await panel.getByAltText(alt).getAttribute('src');await writeFile(`${process.env.SAVE_COMPARE}-${name}.png`,Buffer.from(u.split(',')[1],'base64'));}}
 // 최종 사진에서: 어깨 패임은 채워짐(불투명·옷 색), 목 구멍·바 끝·바 윗부분(어깨선 위)은 비어 있음
 const probe=async()=>page.evaluate(async([K,pts])=>{const src=document.querySelector('[data-slot="hero"] .final-zone img').src;const im=new Image();im.src=src;await im.decode();
  const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.drawImage(im,0,0);
  // 최종(흰 배경) 대신 투명 누끼로 판단하려고 각 점의 색을 봅니다: 흰 배경(≥250)이면 빈 곳
  // 최종 사진은 여백·크기가 바뀔 수 있어, 옷 영역(흰 배경이 아닌 곳)의 테두리 상자에 맞춰 원래 좌표(옷 x 140~460, y 112~760)를 옮깁니다.
  const d=g.getImageData(0,0,c.width,c.height).data;let x0=c.width,x1=-1,y0=c.height,y1=-1;
  for(let y=0;y<c.height;y+=2)for(let x=0;x<c.width;x+=2){const i=(y*c.width+x)*4;if(d[i]<245||d[i+1]<245||d[i+2]<245){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
  const X=x=>Math.round(x0+(x-140)/320*(x1-x0)),Y=y=>Math.round(y0+(y-112)/648*(y1-y0));
  return pts.map(([x,y])=>[...g.getImageData(X(x),Y(y),1,1).data]);},[K,[[220,118],[380,118],[300,130],[133,118],[220,106]]]);
 const isBg=p=>p[0]>=250&&p[1]>=250&&p[2]>=250,isKnit=p=>!isBg(p)&&Math.abs(p[0]-236)<26&&Math.abs(p[2]-210)<30;
 let [dentL,dentR,neck,tip,above]=await probe();
 assert.ok(isKnit(dentL)&&isKnit(dentR),`어깨 패임 채움 ${dentL} ${dentR}`);
 assert.ok(isBg(neck),`목 구멍은 그대로 ${neck}`);assert.ok(isBg(tip),`바 끝은 비움 ${tip}`);assert.ok(isBg(above),`어깨선 위 바 자리는 비움 ${above}`);
 // 자동 점검: 옷걸이 자리 패임 통과
 await page.getByRole('button',{name:'이 상품 자동 점검'}).click();await idle();
 assert.match(await page.locator('.qa-panel [data-check="hanger_dent"]').first().textContent(),/통과/);
 // 넥라인 디테일컷: 옷걸이(갈색) 픽셀 없음
 await page.getByRole('button',{name:'디테일컷 자동 만들기'}).click();await idle();
 const brown=await page.evaluate(async()=>{const el=document.querySelector('.detail-grid [data-detail="neckline"] img');if(!el)return -1;const im=new Image();im.src=el.src;await im.decode();
  const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.drawImage(im,0,0);const d=g.getImageData(0,0,c.width,c.height).data;let n=0;
  for(let i=0;i<d.length;i+=4)if(d[i+3]>128&&Math.abs(d[i]-120)<30&&Math.abs(d[i+1]-80)<30&&Math.abs(d[i+2]-45)<30)n++;return n;});
 assert.equal(brown,0,'넥라인 디테일컷에 옷걸이 없음');
 // 끄기 → 1차 다시(누끼 재사용, retouch 추가 호출 없음) → 패임이 남고 점검 보류
 const before=retouches;
 await panel.getByLabel('옷걸이 정면 옷걸이 자리 복원').uncheck();await idle();
 assert.equal(retouches,before,'누끼 재사용');assert.match(await panel.innerText(),/꺼짐/);
 [dentL]=await probe();assert.ok(isBg(dentL),'끄면 패임 그대로');
 await page.getByRole('button',{name:'이 상품 자동 점검'}).click();await idle();
 assert.match(await page.locator('.qa-panel [data-check="hanger_dent"]').first().textContent(),/보류/);
 // IOPaint 꺼짐 → 건너뛰고 확인 필요(PC IOPaint 필요), 유료 대체 없음
 iopaintOn=false;
 await panel.getByLabel('옷걸이 정면 옷걸이 자리 복원').check();await idle();
 assert.match(await panel.innerText(),/확인 필요[\s\S]*PC IOPaint 필요/);
 assert.equal(retouches,before,'유료 호출 없음');
 assert.deepEqual(errors,[]);
 console.log(`PASS: hanger area restore (${REAL?'real IOPaint LaMa':'mock IOPaint'}) — shoulder dents filled, neck hole/bar tips empty, before/after shown, QA hanger_dent pass→hold when off, neckline crop has no hanger, IOPaint off → 확인 필요.`);
}finally{await browser.close();}
