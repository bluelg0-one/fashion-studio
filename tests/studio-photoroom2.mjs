// 2차 보정 유료 대체(Photoroom) 검사: IOPaint가 꺼져 있으면 Photoroom 대체 안내·$0.10 표시, 누를 때만 호출(Claude 찾기 없음),
// 같은 1차 결과·같은 설정은 재사용(새로고침 후에도), 얼룩 AI는 기본 꺼짐(켜면 위험 안내·같은 호출에 포함), 되돌리기 무료. 모의 응답(비용 없음).
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let cut=null,ironed=null;const r2=[],defects=[];
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='retouch')return r.fulfill({json:{image:cut}});
  if(a==='retouch2'){r2.push(r.request().postDataJSON().options);return r.fulfill({json:{image:ironed,...(r2.at(-1).stains?{lowResolution:true}:{})}});}
  if(a==='defects'){defects.push(1);return r.fulfill({json:{regions:[]}});}
  if(a==='credits')return r.fulfill({json:{credits:99}});
  return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:true}});});
 await page.route('http://127.0.0.1:8080/**',r=>r.abort());   // 사장님 PC의 IOPaint 꺼짐
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const loaded=()=>page.waitForFunction(()=>{const n=document.querySelector('[aria-label="상품 이름"]'),e=document.querySelector('.studio-editor');return Boolean(n?.value)&&e&&!e.disabled;});
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 await loaded();
 const fx=await page.evaluate(()=>{const m=(bg,col)=>{const c=document.createElement('canvas');c.width=400;c.height=500;const g=c.getContext('2d');if(bg){g.fillStyle=bg;g.fillRect(0,0,400,500);}g.fillStyle=col;g.fillRect(80,60,240,380);return c.toDataURL('image/png');};
  return {src:m('rgb(220,215,205)','rgb(170,120,100)'),cut:m(null,'rgb(170,120,100)'),ironed:m(null,'rgb(60,130,90)')};});
 cut=fx.cut;ironed=fx.ironed;
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:Buffer.from(fx.src.split(',')[1],'base64')});await idle();
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle();
 const hero=page.locator('[data-slot="hero"]'),panel=hero.locator('[aria-label="hero Photoroom 2차 보정"]');
 // IOPaint 꺼짐 → 대체 안내와 $0.10 표시, Claude 찾기는 숨김(구김은 옷 전체를 펴므로 필요 없음)
 await panel.getByText('무료 IOPaint에 연결할 수 없어 유료 Photoroom으로 대신 처리합니다').waitFor();
 assert.match(await panel.locator('.cost-photoroom').innerText(),/\$0\.10\/장/);
 assert.equal(await hero.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).count(),0);
 assert.equal(r2.length,0,'누르기 전에는 호출 없음');
 assert.equal(await page.getByLabel('hero 얼룩 AI 지우기').isChecked(),false,'얼룩 AI 기본 꺼짐');
 const color=()=>hero.locator('.stage2-img').evaluate(async im=>{await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.drawImage(im,0,0);return [...g.getImageData(c.width/2,c.height/2,1,1).data].slice(0,3);});
 const before=await color();
 await panel.getByRole('button',{name:/Photoroom으로 2차 보정/}).click();await idle();
 assert.equal(r2.length,1);assert.deepEqual(r2[0],{iron:true,stains:false});assert.equal(defects.length,0,'Claude 호출 없음');
 const after=await color();assert.ok(after[1]>after[0],`2차 결과 반영 ${before}→${after}`);
 assert.match(await page.locator('.auto-studio').innerText(),/Photoroom 2차 보정 완료 \(구김 펴기\(옷 전체\) · \$0\.10\)/);
 // 1차와 나란히(같은 줄에 1차·2차 칸), 되돌리기 무료
 assert.equal(await hero.locator('.stage1-img').count(),1);
 await page.getByLabel('hero 이전으로 되돌리기').click();await idle();
 assert.deepEqual(await color(),before,'되돌리기');assert.equal(r2.length,1);
 // 같은 설정 다시 → 재사용, 새로고침 후에도 재사용
 await panel.getByRole('button',{name:/Photoroom으로 2차 보정/}).click();await idle();
 assert.equal(r2.length,1);assert.match(await page.locator('.auto-studio').innerText(),/저장된 결과 재사용·추가 비용 없음/);
 await page.waitForTimeout(300);await page.waitForFunction(()=>document.querySelector('.save-state')?.textContent==='자동 저장됨');
 await page.reload();await loaded();
 await hero.locator('[aria-label="hero Photoroom 2차 보정"]').getByRole('button',{name:/Photoroom으로 2차 보정/}).click();await idle();
 assert.equal(r2.length,1,'새로고침 후에도 재과금 없음');
 // 얼룩 AI 켜기 → 위험 안내, 설정이 달라 새로 1번(다림질과 같은 호출에 포함)
 await page.getByLabel('hero 얼룩 AI 지우기').check();
 await hero.getByText('결과가 1K(1024px)로 줄어듭니다').waitFor();
 await hero.locator('[aria-label="hero Photoroom 2차 보정"]').getByRole('button',{name:/구김 전체 펴기 \+ 얼룩/}).click();await idle();
 assert.equal(r2.length,2);assert.deepEqual(r2[1],{iron:true,stains:true});
 // 엔진을 유료로 직접 고르면 IOPaint가 켜져 있어도 같은 버튼(대체 안내 없음)
 await page.getByLabel('hero 2차 보정 엔진').selectOption('photoroom');
 assert.equal(await hero.getByText('무료 IOPaint에 연결할 수 없어').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: IOPaint off → Photoroom fallback notice + $0.10, no Claude call, only on click (1 call), reuse on repeat and after reload, stain AI off by default (risk notice, same single call when on), free undo, engine choice.');
}finally{await browser.close();}
