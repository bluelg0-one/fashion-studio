// 비용 기록·통계 검사 (008-6): Claude·Photoroom·구글 드라이브 모두 모의 응답(비용 없음).
// - Photoroom 누끼 1회 = $0.10, 수정할 곳 찾기(적극 4타일) = 모의 usage로 계산, 재사용 = $0
// - 오늘 합계($·원), 민감도별, $1당 찾은 곳, 30일 막대, CSV 다운로드(영문 고정 열)
// - 월 예산 80% 노랑 / 100% 빨강 + ‘민감도를 보통으로 낮추기’ (호출은 막지 않음)
// - 상품을 지워도·새로 고쳐도 기록 유지, 드라이브 연결 시 ‘두손_앱_비용기록.csv’에 밀린 기록을 올리고 이후 덧붙임
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const CLIENT='123456-test.apps.googleusercontent.com';
const drive={files:new Map(),sessions:new Map(),n:0};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,OPTIONS','Access-Control-Expose-Headers':'Location'};
async function fakeDrive(route) {
  const req=route.request(),url=new URL(req.url()),m=req.method(),p=url.pathname;
  if(m==='OPTIONS')return route.fulfill({status:204,headers:cors});
  const json=body=>route.fulfill({headers:cors,json:body});
  if(p==='/drive/v3/files'&&m==='GET'){
    const q=url.searchParams.get('q'),kind=q.match(/key='fashionStudio' and value='(\w+)'/)?.[1],parent=q.match(/'([^']+)' in parents/)?.[1];
    return json({files:[...drive.files.values()].filter(f=>f.appProperties?.fashionStudio===kind&&(!parent||f.parents?.includes(parent))).map(({content,...f})=>f)});
  }
  if(p==='/drive/v3/files'&&m==='POST'){const meta=JSON.parse(req.postData()),id='f'+(++drive.n);drive.files.set(id,{id,...meta,parents:meta.parents||['root']});return json({id,name:meta.name});}
  let mm;
  if((mm=p.match(/^\/drive\/v3\/files\/([^/]+)$/))&&m==='GET'){const f=drive.files.get(mm[1]);if(url.searchParams.get('alt')==='media')return route.fulfill({headers:{...cors,'Content-Type':'text/csv'},body:f.content});return json({id:f.id,name:f.name,trashed:false});}
  if(p==='/upload/drive/v3/files'||(mm=p.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/))){
    const sid='s'+(++drive.n);drive.sessions.set(sid,{meta:JSON.parse(req.postData()),fileId:mm?.[1]});
    return route.fulfill({status:200,headers:{...cors,Location:`https://www.googleapis.com/upload/session/${sid}`},body:''});
  }
  if((mm=p.match(/^\/upload\/session\/(.+)$/))&&m==='PUT'){
    const s=drive.sessions.get(mm[1]),id=s.fileId||'f'+(++drive.n),old=drive.files.get(id)||{};
    drive.files.set(id,{...old,id,...s.meta,parents:s.meta.parents||old.parents,content:req.postDataBuffer().toString('utf8')});
    return json({id});
  }
  return route.fulfill({status:500,headers:cors,body:'unexpected '+m+' '+p});
}
const GIS=`window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'tok-1',expires_in:3600}),10)}),revoke:()=>{}}}};`;
// 모의 usage: 타일 1번 = 입력 2,000 + 출력 500 → 2,000×$4 + 500×$20 = $0.018 (100만 토큰당)
const USAGE={input_tokens:2000,output_tokens:500,cache_read_input_tokens:0,cache_creation_input_tokens:0};

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let cut=null;const calls={retouch:0,defects:0};
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='retouch'){calls.retouch++;return r.fulfill({json:{image:cut}});}
  if(a==='defects'){calls.defects++;return r.fulfill({json:{model:'claude-opus-5-5',level:'aggressive',usage:USAGE,regions:[{type:'stain',x0:100+calls.defects*150,x1:120+calls.defects*150,y0:100,y1:115,confidence:.9,note:'얼룩'}]}});}
  if(a==='credits')return r.fulfill({json:{available:640,subscription:1000}});
  return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:true,googleClientId:CLIENT}});});
 await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:GIS}));
 await page.route('https://www.googleapis.com/**',fakeDrive);
 await page.route('http://127.0.0.1:808*/**',r=>r.request().url().endsWith('/api/v1/model')?r.fulfill({json:{name:'lama'}}):r.abort());
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const loaded=()=>page.waitForFunction(()=>{const n=document.querySelector('[aria-label="상품 이름"]'),e=document.querySelector('.studio-editor');return Boolean(n?.value)&&e&&!e.disabled;});
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 await loaded();
 const fx=await page.evaluate(()=>{const m=bg=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');if(bg){g.fillStyle=bg;g.fillRect(0,0,600,800);}g.fillStyle='rgb(170,120,100)';g.fillRect(100,100,400,600);return c.toDataURL('image/png');};return {src:m('rgb(220,215,205)'),cut:m(null)};});
 cut=fx.cut;
 await page.getByLabel('상품 이름').fill('핑크 후드 니트');
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:Buffer.from(fx.src.split(',')[1],'base64')});await idle();
 const hero=page.locator('[data-slot="hero"]');
 await hero.getByRole('button',{name:'이 사진 누끼·보정',exact:true}).click();await idle();
 assert.equal(calls.retouch,1);
 await hero.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).click();await idle();
 assert.equal(calls.defects,4,'적극(기본) = 타일 4번');
 await hero.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).click();await idle();
 assert.equal(calls.defects,4,'같은 사진은 재사용');

 const panel=page.locator('.cost-panel');
 // 요약: 오늘 = $0.10 + 4×$0.018 = $0.172 → 1,400원(가정) 기준 241원
 await page.waitForFunction(()=>/오늘 \$0\.1720/.test(document.querySelector('.cost-panel summary')?.innerText||''));
 assert.match(await panel.locator('summary').innerText(),/이번 달 \$0\.1720 \(241원\)/);
 await panel.locator('summary').click();
 const text=await panel.innerText();
 assert.match(text,/1,400원\(가정\)/);
 assert.match(await panel.locator('[data-period="오늘"]').innerText(),/\$0\.1720[\s\S]*241원[\s\S]*호출 5회[\s\S]*재사용 1회/);
 assert.match(await panel.locator('[data-group="defects"]').innerText(),/2 \(재사용 1\)\s+4\s+\$0\.0720/);
 assert.match(await panel.locator('[data-level="aggressive"]').innerText(),/적극\s+1 \(4회\)\s+\$0\.0720[\s\S]*\$0\.0720\s+4\s+56곳/);// 4곳 ÷ $0.072 = 55.6
 assert.match(text,/기타 · Photoroom 누끼\s+1\s+1\s+\$0\.1000/);
 assert.equal(await panel.locator('.cost-bars span').count(),30);assert.equal(await panel.locator('.cost-bars span.on').count(),1);
 const log=panel.locator('.cost-log tbody tr');assert.equal(await log.count(),3);
 assert.match(await log.nth(0).innerText(),/핑크 후드 니트\s+정면\s+수정할 곳 찾기\s+Claude Opus 5\.5\s+적극\s+0\s+-\s+\$0\.00\s+4\s+재사용/);
 assert.match(await log.nth(1).innerText(),/수정할 곳 찾기\s+Claude Opus 5\.5\s+적극\s+4\s+8,000 \/ 2,000\s+\$0\.0720\s+4/);

 // 환율 바꾸면 원화 다시 계산
 await panel.getByLabel('환율').fill('1500');assert.match(await panel.locator('summary').innerText(),/\(258원\)/);
 await panel.getByLabel('환율').fill('1400');
 // 월 예산: 300원 → 80% 넘음(노랑), 200원 → 넘음(빨강 + 민감도 낮추기)
 assert.equal(await page.locator('.budget-alert').count(),0,'예산 비우면 경고 없음');
 await panel.getByLabel('월 예산').fill('300');
 assert.match(await page.locator('.budget-alert.budget-warn').innerText(),/80%를 넘었습니다[\s\S]*80%\)/);
 assert.equal(await page.getByRole('button',{name:'민감도를 보통으로 낮추기'}).count(),0);
 await panel.getByLabel('월 예산').fill('200');
 assert.match(await page.locator('.budget-alert.budget-over').innerText(),/예산을 넘었습니다[\s\S]*120%[\s\S]*호출은 막지 않습니다/);
 await page.getByRole('button',{name:'민감도를 보통으로 낮추기'}).click();
 assert.equal(await page.getByLabel('hero 찾기 민감도').inputValue(),'normal');
 assert.match(await page.locator('.budget-alert').innerText(),/이미 ‘보통’/);
 // 예산을 넘어도 호출은 됨(보통 = 1번)
 await hero.getByRole('button',{name:'🤖 수정할 곳 자동 찾기'}).click();await idle();assert.equal(calls.defects,5);

 // CSV 다운로드: 영문 고정 열, 4줄
 const [dl]=await Promise.all([page.waitForEvent('download'),panel.getByRole('button',{name:'CSV 다운로드'}).click()]);
 const csv=fs.readFileSync(await dl.path(),'utf8').replace(/^﻿/,'').trim().split('\n');
 assert.equal(csv[0],'timestamp,product,cut,feature,model,sensitivity,calls,input_tokens,output_tokens,cost_usd,boxes,cached');
 assert.equal(csv.length,5);
 assert.match(csv[1],/,핑크 후드 니트,정면,photoroom_cutout,Photoroom,,1,0,0,0\.100000,,false$/);
 assert.match(csv[2],/,defects,Claude Opus 5\.5,aggressive,4,8000,2000,0\.072000,4,false$/);
 assert.match(csv[3],/,defects,Claude Opus 5\.5,aggressive,0,0,0,0\.000000,4,true$/);
 assert.match(csv[4],/,defects,Claude Opus 5\.5,normal,1,2000,500,0\.018000,1,false$/);

 // 상품을 지우고 새로 고쳐도 기록은 남음
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'상품 삭제'}).click();await idle();
 await page.reload();await loaded();
 await page.locator('.cost-panel summary').click();
 await page.waitForFunction(()=>document.querySelectorAll('.cost-log tbody tr').length===4);
 assert.match(await page.locator('.cost-panel summary').innerText(),/\$0\.1900/);
 assert.match(await page.locator('.cost-panel').innerText(),/아직 올리지 않은 기록 4건/);

 // 드라이브 연결 → 밀린 4건을 ‘두손_앱_비용기록.csv’로 올림
 page.once('dialog',d=>d.accept('두손 작업폴더'));
 await page.locator('.drive-panel').getByRole('button',{name:'구글 드라이브 연결'}).click();await idle();
 await page.waitForFunction(()=>/모든 기록을 작업 폴더/.test(document.querySelector('.cost-panel').innerText));
 const folder=[...drive.files.values()].find(f=>f.appProperties?.fashionStudio==='folder');
 let file=[...drive.files.values()].find(f=>f.appProperties?.fashionStudio==='costlog');
 assert.equal(file.name,'두손_앱_비용기록.csv');assert.deepEqual(file.parents,[folder.id]);
 let lines=file.content.replace(/^﻿/,'').trim().split('\n');
 assert.equal(lines[0],csv[0]);assert.equal(lines.length,5);
 // 이후 호출은 같은 파일에 덧붙임(새 파일을 만들지 않음)
 const before=[...drive.files.values()].length;
 await page.getByLabel('상품 이름').fill('두 번째 상품');
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'b.png',mimeType:'image/png',buffer:Buffer.from(fx.src.split(',')[1],'base64')});await idle();
 await hero.getByRole('button',{name:'이 사진 누끼·보정',exact:true}).click();await idle();
 await page.waitForFunction(()=>/모든 기록을 작업 폴더/.test(document.querySelector('.cost-panel').innerText)&&document.querySelectorAll('.cost-log tbody tr').length===5);
 file=drive.files.get(file.id);lines=file.content.replace(/^﻿/,'').trim().split('\n');
 assert.equal(lines.length,6);assert.match(lines[5],/,두 번째 상품,정면,photoroom_cutout,/);
 assert.equal([...drive.files.values()].filter(f=>f.appProperties?.fashionStudio==='costlog').length,1);
 assert.ok([...drive.files.values()].length>=before);
 assert.deepEqual(errors,[]);
 console.log('PASS: Photoroom $0.10 and Claude tiles logged from mock usage ($0.172 → 241원 at 1,400원 assumed), cache hit $0, per-sensitivity and $1-per-box stats, 30 daily bars, budget yellow at 80% / red at 100% with lower-sensitivity button (calls not blocked), CSV columns, log survives product delete + reload, Drive backlog uploaded to 두손_앱_비용기록.csv then appended.');
}finally{await browser.close();}
