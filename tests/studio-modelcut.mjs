// AI모델컷 탭 검사: 키 상태 표시, 유료 확인 창, 같은 설정 재사용(중복 과금 방지), 원본 비교 보기.
// /api/modelshot은 모의 응답입니다. 실제 FASHN을 호출하지 않습니다.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let key=false,runs=0,configCalls=0;const dialogs=[];let accept=true;
 await page.route('**/api/studio?*',r=>r.fulfill({json:{configured:true,openai:false,photoroom:false}}));
 await page.route('**/api/instagram?*',r=>r.fulfill({json:{ready:false,token:false,storage:false,password:false}}));
 const out='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40"><rect width="30" height="40" fill="#c33"/></svg>').toString('base64');
 await page.route('**/api/modelshot',async r=>{const b=r.request().postDataJSON();
  if(b.action==='config'){configCalls++;return r.fulfill({json:{fashn:key,styleroom:false}});}
  if(b.action==='run'){runs++;return r.fulfill({json:{id:'job-'+runs}});}
  if(b.action==='status')return r.fulfill({json:{status:'completed',output:[out]}});
  return r.fulfill({status:400,json:{error:'unexpected'}});});
 page.on('dialog',d=>{dialogs.push(d.message());accept?d.accept():d.dismiss();});
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 await page.waitForTimeout(500);
 assert.equal(configCalls,0,'탭을 열기 전에는 상태도 묻지 않음');
 await page.getByRole('tab',{name:'AI모델컷',exact:true}).click();
 // 키가 없으면: 실제 상태 표시, 생성 버튼 꺼짐
 await page.getByText('키 없음 (서버 설정 필요)').waitFor();
 const gen=page.getByRole('button',{name:/FASHN 유료 · 4장 생성/});
 assert.equal(await gen.isDisabled(),true);
 await page.getByText('서버에 FASHN_API_KEY가 없어').waitFor();
 // 키가 있으면(다시 열기)
 key=true;await page.reload();await page.getByRole('tab',{name:'AI모델컷',exact:true}).click();
 await page.getByText('키 설정됨 · 유료').waitFor();
 assert.equal(await gen.isDisabled(),false);
 assert.ok(await page.getByText('FASHN 크레딧 차감(단가 미확인)').first().isVisible());
 // 의류 사진 올리기
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=60;c.height=80;const x=c.getContext('2d');x.fillStyle='#246';x.fillRect(0,0,60,80);return c.toDataURL('image/png').split(',')[1];});
 const garmentInput=page.getByLabel('모델컷 의류 사진 선택');
 await garmentInput.setInputFiles({name:'garment.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 // 확인 창에서 취소하면 호출 없음
 accept=false;await gen.click();await page.waitForTimeout(300);
 assert.equal(runs,0);assert.match(dialogs.at(-1),/모델컷 4장을 새로 만듭니다/);assert.match(dialogs.at(-1),/FASHN 크레딧 차감\(단가 미확인\) · 4장 분량/);assert.match(dialogs.at(-1),/얼굴 고정 없음/);
 // 확인하면 장면 4개 호출
 accept=true;await gen.click();
 await page.getByText('생성된 모델컷 (4장)').waitFor({timeout:20000});
 assert.equal(runs,4);
 // 같은 설정으로 다시 누르면 재호출 없이 저장된 결과 재사용
 const before=dialogs.length;await gen.click();
 await page.getByText('생성된 모델컷 (8장)').waitFor({timeout:10000});
 assert.equal(runs,4,'같은 설정은 다시 호출하지 않음');
 assert.equal(dialogs.length,before,'재사용만 할 때는 비용 확인 창 없음');
 assert.equal(await page.getByText('저장된 결과 재사용 · 추가 비용 없음').count(),4);
 // 새로고침 후에도 재사용(브라우저에 저장)
 await page.reload();await page.getByRole('tab',{name:'AI모델컷',exact:true}).click();await page.getByText('키 설정됨 · 유료').waitFor();
 // 021: 새로고침해도 만든 결과가 그대로 보임(이미지째 보관) → 확인 뒤 목록 비우기(확인 창)
 await page.getByText('생성된 모델컷 (8장)').waitFor({timeout:10000});
 await page.getByRole('button',{name:'목록 비우기'}).click();await page.waitForTimeout(300);
 await page.getByLabel('모델컷 의류 사진 선택').setInputFiles({name:'garment.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await gen.click();await page.getByText('생성된 모델컷 (4장)').waitFor({timeout:10000});
 assert.equal(runs,4,'새로고침 후에도 재사용');
 // 설정을 바꾸면(장면당 2장) 새로 호출하고 확인 창이 뜸
 await page.getByRole('button',{name:'2장',exact:true}).click();
 await page.getByRole('button',{name:/FASHN 유료 · 8장 생성/}).click();
 await page.getByText('생성된 모델컷 (8장)').waitFor({timeout:20000});
 assert.equal(runs,8);assert.match(dialogs.at(-1),/모델컷 8장을 새로 만듭니다 \(장면 4개 × 2장\)/);
 // 원본과 나란히 보기
 await page.getByRole('button',{name:/원본과 나란히 보기/}).first().click();
 const dlg=page.getByRole('dialog',{name:'원본과 비교'});await dlg.waitFor();
 const srcs=await dlg.locator('img').evaluateAll(els=>els.map(e=>e.getAttribute('src')));
 assert.equal(srcs.length,2);assert.match(srcs[0],/^data:image\/png/);assert.equal(srcs[1],out);
 assert.ok(await dlg.getByText('AI 생성 결과 (실제 착용 사진 아님)').isVisible());
 await page.keyboard.press('Escape');await dlg.waitFor({state:'detached'});
 assert.deepEqual(errors,[]);
 console.log(`PASS: key status (no key → disabled), paid confirm (cancel → 0 calls), 4 calls then reuse with 0 calls (also after reload), changed settings → new calls (${runs} total), side-by-side compare.`);
}finally{await browser.close();}
