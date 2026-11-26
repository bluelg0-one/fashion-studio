// 옷걸이 v2(014) 디테일컷: 합성한 옷걸이 정면·후면(고리·소매·단추) → 누끼(모의) → '디테일컷 자동 만들기' → 넥라인·소재(후면)·단추·밑단·소매 끝.
// 상품을 다시 열어도 디테일컷이 남는지(점검 C-1), 상세페이지 포함 체크, 작은 사진은 '해상도 부족', Claude 위치 찾기(모의) 1회·재사용. 비용 없음.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fx=await (async()=>{await page.goto('about:blank');return page.evaluate(()=>{
  const draw=(k,{wall,buttons,gap=true})=>{const W=Math.round(1200*k),H=Math.round(1600*k),c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d'),K=v=>v*k;
   if(wall){g.fillStyle='#d9d2c4';g.fillRect(0,0,W,H);}
   g.fillStyle='#a0a0a0';g.fillRect(K(592),K(60),K(16),K(100));
   const knit=(x,y,w,h)=>{g.fillStyle='#d6bec8';g.fillRect(K(x),K(y),K(w),K(h));g.fillStyle='#cbb2bd';for(let yy=y;yy<y+h;yy+=4)g.fillRect(K(x),K(yy),K(w),K(1.5));};
   knit(300,160,600,1290);knit(180,220,gap?90:120,1130);knit(gap?930:900,220,gap?90:120,1130);
   if(buttons)for(const y of [400,600,800,1000]){g.beginPath();g.arc(K(600),K(y),K(16),0,7);g.fillStyle='#efe6ea';g.fill();g.lineWidth=K(5);g.strokeStyle='#8f6f7c';g.stroke();}
   return c.toDataURL('image/png');};
  return {front:draw(1.3,{wall:true,buttons:true}),frontCut:draw(1.3,{buttons:true}),back:draw(1.3,{wall:true,buttons:false}),backCut:draw(1.3,{buttons:false}),
   small:draw(.6,{wall:true,buttons:true}),smallCut:draw(.6,{buttons:true}),plain:draw(1.3,{wall:true,buttons:false,gap:false}),plainCut:draw(1.3,{buttons:false,gap:false})};});})();
 // 앱이 사진을 다시 저장해 보내므로(바이트가 달라짐) 누끼 모의 응답은 보낸 순서대로 줍니다.
 const queue=[];let details=0,qaStatus='';
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='retouch')return r.fulfill({json:{image:queue.shift()}});
  if(a==='details'){details++;return r.fulfill({json:{details:{placket:{present:false,note:'여밈 없음'},cuff:{present:true,x0:150,y0:780,x1:240,y1:860,note:'소매 끝'}},model:'claude-opus-5-5',usage:{input_tokens:1500,output_tokens:200}}});}
  return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:true}});});
 await page.route('http://127.0.0.1:808*/**',r=>r.abort());
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const idle=()=>page.waitForFunction(()=>{const e=document.querySelector('.studio-editor');return e&&!e.disabled&&document.querySelector('[aria-label="상품 이름"]')?.value;});await idle();
 const put=async(id,url)=>{await page.getByLabel(`${id} 사진 선택`,{exact:true}).setInputFiles({name:id+'.png',mimeType:'image/png',buffer:Buffer.from(url.split(',')[1],'base64')});await idle();};
 await put('hero',fx.front);await put('back',fx.back);queue.push(fx.frontCut,fx.backCut);
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle();
 await page.getByRole('button',{name:'디테일컷 자동 만들기'}).click();await idle();
 const shown=()=>page.locator('.detail-grid figure').evaluateAll(n=>n.map(e=>e.dataset.detail));
 assert.deepEqual(await shown(),['neckline','fabric','placket','hem','cuff'],await page.locator('[role=status]').innerText());
 assert.match(await page.locator('[data-detail="fabric"] figcaption').innerText(),/후면에서/);
 const sides=await page.locator('.detail-grid img').evaluateAll(n=>n.map(i=>Math.max(i.naturalWidth,i.naturalHeight)));
 assert.ok(sides.every(v=>v>=800),`긴 변 ${sides}`);
 assert.equal(details,0,'확신하면 Claude 안 부름');
 // 자동 점검(무료): 결과 상자와 항목별 결과
 await page.getByRole('button',{name:'이 상품 자동 점검'}).click();await idle();
 const qaText=await page.getByLabel('자동 점검 결과').innerText();assert.match(qaText,/통과|보류|불합격/);
 const keys=await page.locator('.qa-panel [data-check]').evaluateAll(n=>n.map(e=>e.dataset.check));
 for(const k of ['area','edge','islands','color_shift','gray_blotch','buttons','hanger_hook','resolution_smartstore','color_pair','details_review'])assert.ok(keys.includes(k),`점검 항목 ${k}`);
 const hook=await page.locator('.qa-panel [data-check="hanger_hook"]').first().textContent();assert.match(hook,/통과/,'고리 유지');
 qaStatus=qaText.split('\n')[0];
 // 상세페이지(소프트 테마): 정면 → 후면 → 디테일 순서로 그려짐
 await page.getByRole('button',{name:'전체 미리보기'}).first().click();await idle();
 assert.match(await page.locator('[role=status]').innerText(),/미리보기입니다 · 테마: 소프트/);
 const ph=await page.locator('.studio-preview img').first().evaluate(i=>i.naturalHeight);assert.ok(ph>3000,`상세페이지 높이 ${ph}`);
 // 상품 다시 열기 → 남아 있음
 await page.getByLabel('소매 끝 상세페이지에 포함').uncheck();await page.waitForTimeout(1200);
 await page.reload();await idle();
 assert.deepEqual(await shown(),['neckline','fabric','placket','hem','cuff'],'다시 열어도 디테일컷 유지');
 assert.equal(await page.getByLabel('소매 끝 상세페이지에 포함').isChecked(),false);
 // 단추 없는·소매 붙은 옷: 단추·소매 끝은 '위치 확인 필요' → Claude 켜면 1회, 같은 사진 다시 누르면 재사용
 await page.getByRole('button',{name:'+ 새 상품'}).click();await idle();
 await put('hero',fx.plain);queue.push(fx.plainCut);await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle();
 await page.getByRole('button',{name:'디테일컷 자동 만들기'}).click();await idle();
 assert.match(await page.getByLabel('빠진 디테일').innerText(),/단추·여밈: 단추·여밈을 찾지 못함[\s\S]*소매 끝: 소매가 몸판에 붙어/);
 await page.getByLabel('디테일 위치 Claude로 찾기').check();
 await page.getByRole('button',{name:'디테일컷 다시 만들기'}).click();await idle();
 assert.equal(details,1);assert.ok((await shown()).includes('cuff'),'Claude 상자로 소매 끝');assert.match(await page.getByLabel('빠진 디테일').innerText(),/Claude: 이 옷에는 없음/);
 await page.getByRole('button',{name:'디테일컷 다시 만들기'}).click();await idle();assert.equal(details,1,'같은 사진은 다시 부르지 않음');
 await page.getByLabel('디테일 위치 Claude로 찾기').uncheck();
 // 작은 사진 → 모두 해상도 부족(키우지 않음)
 await page.getByRole('button',{name:'+ 새 상품'}).click();await idle();
 await put('hero',fx.small);queue.push(fx.smallCut);await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle();
 await page.getByRole('button',{name:'디테일컷 자동 만들기'}).click();await idle();
 assert.equal((await shown()).length,0);assert.match(await page.getByLabel('빠진 디테일').innerText(),/넥라인: 해상도 부족/);
 assert.deepEqual(errors,[]);
 console.log(`PASS: hanger front/back → 5 detail crops (fabric from the back, long side ${Math.min(...sides)}px+), kept after reload with the include checkbox, unsure placket/cuff → review → Claude (mock) once and reused, small photo → 해상도 부족 (no upscaling); QA panel shows all automatic checks (${qaStatus}, hook kept).`);
}finally{await browser.close();}
