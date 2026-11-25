// 수정할 곳 자동 찾기(민감도·타일) 검사: 호출 수(보통 1·적극 4·최대 9)와 비용 표시, 타일 좌표 합치기·중복 제거,
// 같은 사진·같은 민감도 재호출 없음, 넓은 상자 분할 후 IOPaint에 한 마스크로 1번 전송. Claude·IOPaint 모두 모의 응답(비용 없음).
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let cut=null;const defectCalls=[],inpaints=[];
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='retouch')return r.fulfill({json:{image:cut}});
  if(a==='defects'){const b=r.request().postDataJSON();defectCalls.push(b);
   // 적극(2×2) 타일: 옷 영역 x 92~506, y 92~706(누끼 600×800 기준) → 타일 크기 약 230.6×341.7, 시작점은 아래 순서.
   // 네 타일이 모두 겹치는 곳(사진 기준 x 280~300, y 370~385)의 같은 구김을 각 타일이 자기 좌표로 알려 줌 → 하나로 합쳐져야 함.
   // 작은 얼룩은 타일마다 다른 곳(타일 기준 100~120) → 따로 남아야 함. 기대: 8개 → 5개.
   const i=defectCalls.filter(c=>c.tile&&c.level===b.level).length-1,o=[[92,92],[276,92],[92,365],[276,365]][i%4]||[0,0],tw=230.6,th=341.7;
   const T=(v,o0,sz)=>Math.round((v-o0)/sz*1000);
   const wr=b.tile?{type:'wrinkle',x0:T(280,o[0],tw),x1:T(300,o[0],tw),y0:T(370,o[1],th),y1:T(385,o[1],th),confidence:.6,note:'구김'}:{type:'wrinkle',x0:200,x1:700,y0:400,y1:600,confidence:.6,note:'넓은 구김'};
   return r.fulfill({json:{regions:[wr,{type:'stain',x0:100,x1:120,y0:100,y1:115,confidence:.9,note:'얼룩'}]}});}
  return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:true}});});
 await page.route('http://127.0.0.1:8080/**',async r=>{const u=r.request().url();
  if(u.endsWith('/api/v1/model'))return r.fulfill({json:{name:'lama'}});
  if(u.endsWith('/api/v1/inpaint')){inpaints.push(r.request().postDataJSON());const img=inpaints.at(-1).image;return r.fulfill({body:Buffer.from(img.split(',')[1],'base64'),contentType:'image/png'});}
  return r.fulfill({status:404,body:''});});
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const loaded=()=>page.waitForFunction(()=>{const n=document.querySelector('[aria-label="상품 이름"]'),e=document.querySelector('.studio-editor');return Boolean(n?.value)&&e&&!e.disabled;});
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 await loaded();
 const fx=await page.evaluate(()=>{const m=bg=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');if(bg){g.fillStyle=bg;g.fillRect(0,0,600,800);}g.fillStyle='rgb(170,120,100)';g.fillRect(100,100,400,600);return c.toDataURL('image/png');};return {src:m('rgb(220,215,205)'),cut:m(null)};});
 cut=fx.cut;
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:Buffer.from(fx.src.split(',')[1],'base64')});await idle();
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle();
 const hero=page.locator('[data-slot="hero"]'),level=page.getByLabel('hero 찾기 민감도');
 // 기본 = 적극(4회), 비용 표시도 4회 기준
 assert.equal(await level.inputValue(),'aggressive');
 assert.match(await hero.locator('.cost-claudeDefects').innerText(),/약 \$0\.04~0\.16 \(4회\)/);
 await hero.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).click();await idle();
 assert.equal(defectCalls.length,4,'적극: 타일 4번');
 assert.ok(defectCalls.every(c=>c.level==='aggressive'&&c.tile===true));
 // 타일마다 같은 자리의 넓은 구김은 하나로 합쳐지지 않고 각 타일 위치로 옮겨짐 → 서로 다른 곳이면 따로, 겹치면 합침
 const step=await page.locator('.auto-studio').innerText();
 const m=step.match(/수정할 곳 (\d+)곳을 표시/);assert.ok(m,'표시 개수 안내');const found=Number(m[1]);
 assert.equal(found,5,`겹치는 타일의 같은 구김은 하나로 합쳐짐 (8개 → ${found}개)`);
 // 같은 사진·같은 민감도: 다시 눌러도 호출 없음
 await hero.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).click();await idle();
 assert.equal(defectCalls.length,4,'같은 사진은 재호출 없음');assert.match(await page.locator('.auto-studio').innerText(),/저장된 결과 재사용·추가 비용 없음/);
 // 보통 1회, 최대 9회
 await level.selectOption('normal');assert.match(await hero.locator('.cost-claudeDefects').innerText(),/\(1회\)/);
 await hero.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).click();await idle();
 assert.equal(defectCalls.length,5);assert.equal(defectCalls[4].level,'normal');assert.ok(!defectCalls[4].tile);
 await level.selectOption('max');assert.match(await hero.locator('.cost-claudeDefects').innerText(),/약 \$0\.09~0\.36 \(9회\)/);
 await hero.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).click();await idle();
 assert.equal(defectCalls.length,14,'최대: 타일 9번');
 // 고치기(013): 넓은 구김은 IOPaint로 보내지 않고 브라우저에서 그림자 펴기, 작은 얼룩만 IOPaint로(마스크에 얼룩만).
 await level.selectOption('normal');await hero.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).click();await idle();assert.equal(defectCalls.length,14);
 await hero.getByRole('button',{name:/선택한 곳 고치기/}).click();await idle();
 assert.equal(inpaints.length,1,'작은 얼룩만 IOPaint로 1번');
 const mk=await page.evaluate(async src=>{const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);const at=(fx,fy)=>g.getImageData(Math.round(fx*c.width),Math.round(fy*c.height),1,1).data[0];return {wrinkle:at(.45,.5),stain:at(.11,.107)};},inpaints[0].mask);
 assert.deepEqual(mk,{wrinkle:0,stain:255},'마스크에는 얼룩만, 넓은 구김은 없음 '+JSON.stringify(mk));
 assert.match(await page.locator('.auto-studio').innerText(),/구김 1곳 그림자 펴기 · 얼룩 1곳 IOPaint로 지우기/);
 assert.deepEqual(errors,[]);
 console.log(`PASS: aggressive (default) = 4 tile calls with cost '약 $0.04~0.16 (4회)', overlapping tiles merged (8 → ${found}), same photo reuses result, normal = 1 call, max = 9 calls, wide wrinkle flattened in the browser (not in the IOPaint mask), only the small stain sent to IOPaint.`);
}finally{await browser.close();}
