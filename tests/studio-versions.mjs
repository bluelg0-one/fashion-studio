// 사진별 보정 설정과 되돌리기/다시 적용(무료) 검사. API는 모의 응답입니다.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const make=color=>page.evaluate(c=>{const k=document.createElement('canvas');k.width=100;k.height=160;const x=k.getContext('2d');x.fillStyle=c;x.fillRect(20,30,60,110);return k.toDataURL();},color);
 const red=await make('#c33'),blue=await make('#33c');
 const bodies=[];
 await page.route('**/api/studio?*',r=>{const action=new URL(r.request().url()).searchParams.get('action');
  if(action==='retouch'){const body=JSON.parse(r.request().postData());bodies.push(body.options);return r.fulfill({json:{image:bodies.length===1?red:blue}});}
  if(action==='credits')return r.fulfill({json:{available:5,subscription:10}});
  if(action==='analyze')return r.fulfill({json:{headline:'h',description:'d',points:[]}});
  return r.fulfill({json:{configured:true,openai:true,photoroom:true}});});
 await page.reload();
 await page.waitForFunction(()=>/남은 이미지 5\/10/.test(document.querySelector('.connection').textContent));
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:Buffer.from(red.split(',')[1],'base64')});
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 await idle();
 const hero=page.locator('[data-slot="hero"]'),img=()=>hero.locator('.paste-zone img').getAttribute('src');
 const original=await img();
 // 1차: 기본 설정으로 보정
 await hero.getByRole('button',{name:'이 사진 누끼·보정'}).click();await idle();
 assert.equal(bodies.length,1);assert.deepEqual(bodies[0].presets,[]);
 const v1=await img();assert.notEqual(v1,original);
 // 이 사진만 개별 설정: 다림질 체크 후 2차 보정
 await hero.locator('.slot-retouch summary').click();
 await page.getByLabel('hero 개별 설정 사용').check();
 await page.getByLabel('hero 원단 구김·접힌 부분 다림질한 듯 펴기 (Photoroom AI 다림질)').check();
 await hero.getByRole('button',{name:'이 사진 누끼·보정'}).click();await idle();
 assert.equal(bodies.length,2);assert.deepEqual(bodies[1].presets,['iron']);
 const v2=await img();assert.notEqual(v2,v1);
 assert.match(await hero.locator('.version-bar span').innerText(),/보정 2/);
 // 되돌리기 2번 → 원본, 다시 적용 2번 → 보정 2. API 호출 수는 그대로.
 await page.getByLabel('hero 이전으로 되돌리기').click();await idle();assert.equal(await img(),v1);
 await page.getByLabel('hero 이전으로 되돌리기').click();await idle();assert.equal(await img(),original);
 assert.ok(await page.getByLabel('hero 이전으로 되돌리기').isDisabled());
 assert.equal(await page.locator('[data-slot="frontZoom"] .paste-zone img').count(),0,'원본 상태에서는 자동 크롭을 비웁니다');
 await page.getByLabel('hero 다시 적용').click();await idle();assert.equal(await img(),v1);
 assert.equal(await page.locator('[data-slot="frontZoom"] .paste-zone img').count(),1,'보정본으로 돌아오면 자동 크롭 복원');
 await page.getByLabel('hero 다시 적용').click();await idle();assert.equal(await img(),v2);
 assert.equal(bodies.length,2,'되돌리기·다시 적용은 API를 호출하지 않습니다');
 // 같은 설정으로 다시 누르면 저장된 결과 재사용 (과금 없음, 버전 증가 없음)
 await hero.getByRole('button',{name:'이 사진 누끼·보정'}).click();await idle();
 assert.equal(bodies.length,2);assert.match(await hero.locator('.version-bar span').innerText(),/\(3\/3\)/);
 console.log('PASS: per-photo settings, free undo/redo across 3 versions, dependent crops follow hero version, cache reuse without new versions, credits shown.');
}finally{await browser.close();}
