// 구글 드라이브 저장: 모의 구글 로그인 + 모의 드라이브 API(메모리)로 컴퓨터 2대를 흉내 냅니다.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const png=fs.readFileSync(process.env.CUTOUT_PATH),cutout='data:image/png;base64,'+png.toString('base64');
const CLIENT='123456-test.apps.googleusercontent.com';
const drive={files:new Map(),sessions:new Map(),n:0,log:[]};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,OPTIONS','Access-Control-Expose-Headers':'Location'};
async function fakeDrive(route) {
  const req=route.request(),url=new URL(req.url()),m=req.method();
  if(m==='OPTIONS')return route.fulfill({status:204,headers:cors});
  if(req.headers().authorization!=='Bearer tok-1')return route.fulfill({status:401,headers:cors,json:{error:{}}});
  const json=(body,extra={})=>route.fulfill({headers:{...cors,...extra},json:body});
  const p=url.pathname;drive.log.push(`${m} ${p}`);
  if(p==='/drive/v3/files'&&m==='GET'){
    const q=url.searchParams.get('q');let list=[...drive.files.values()].filter(f=>!f.trashed);
    if(q.includes("value='folder'"))list=list.filter(f=>f.appProperties?.fashionStudio==='folder');
    else {const parent=q.match(/'([^']+)' in parents/)[1];list=list.filter(f=>f.appProperties?.fashionStudio==='product'&&f.parents?.includes(parent));}
    return json({files:list.map(({content,...f})=>({...f,size:String(content?.length||0)}))});
  }
  if(p==='/drive/v3/files'&&m==='POST'){const meta=JSON.parse(req.postData());const id='f'+(++drive.n);drive.files.set(id,{id,...meta,parents:['root'],modifiedTime:new Date().toISOString()});return json({id,name:meta.name});}
  let mm;
  if((mm=p.match(/^\/drive\/v3\/files\/([^/]+)$/))&&m==='GET'){
    const f=drive.files.get(mm[1]);if(!f)return route.fulfill({status:404,headers:cors,json:{}});
    if(url.searchParams.get('alt')==='media')return route.fulfill({headers:{...cors,'Content-Type':'application/json'},body:f.content});
    return json({id:f.id,name:f.name,trashed:false});
  }
  if(p==='/upload/drive/v3/files'||(mm=p.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/))){
    const sid='s'+(++drive.n);drive.sessions.set(sid,{meta:JSON.parse(req.postData()),fileId:mm?.[1]});
    return route.fulfill({status:200,headers:{...cors,Location:`https://www.googleapis.com/upload/session/${sid}`},body:''});
  }
  if((mm=p.match(/^\/upload\/session\/(.+)$/))&&m==='PUT'){
    const s=drive.sessions.get(mm[1]);const id=s.fileId||'f'+(++drive.n);const old=drive.files.get(id)||{};
    drive.files.set(id,{...old,id,...s.meta,parents:s.meta.parents||old.parents,appProperties:{...old.appProperties,...s.meta.appProperties},content:req.postData(),modifiedTime:new Date().toISOString()});
    return json({id});
  }
  return route.fulfill({status:500,headers:cors,body:'unexpected '+m+' '+p});
}
const GIS=`window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'tok-1',expires_in:3600}),10)}),revoke:()=>{}}}};`;

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
async function computer(){
  const ctx=await browser.newContext({viewport:{width:1400,height:1000}});const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/studio?*',r=>{const a=new URL(r.request().url()).searchParams.get('action');
    if(a==='retouch')return r.fulfill({json:{image:cutout}});
    return r.fulfill({json:{configured:true,openai:false,photoroom:true,claude:false,googleClientId:CLIENT}});});
  await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:GIS}));
  await page.route('https://www.googleapis.com/**',fakeDrive);
  await page.route('http://127.0.0.1:808*/**',r=>r.abort());
  await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
  const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);await idle();
  return {ctx,page,errors,idle,panel:page.locator('.drive-panel')};
}
try{
 // ---- 컴퓨터 A: 상품 만들고 드라이브 폴더 만들어 저장 ----
 const A=await computer();
 await A.page.getByLabel('상품 이름').fill('카키 브이넥');
 await A.page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:png});await A.idle();
 await A.page.locator('[data-slot="hero"]').getByRole('button',{name:'이 사진 누끼·보정',exact:true}).click();await A.idle();
 A.page.once('dialog',d=>{assert.equal(d.type(),'prompt');d.accept('두손 작업폴더');});
 await A.panel.getByRole('button',{name:'구글 드라이브 연결'}).click();await A.idle();
 assert.match(await A.panel.innerText(),/작업 폴더: 두손 작업폴더[\s\S]*연결됨/);
 await A.page.waitForTimeout(1200); // 이 컴퓨터 자동 저장 대기
 await A.panel.getByRole('button',{name:'이 상품 드라이브에 저장'}).click();await A.idle();
 assert.match(await A.page.locator('[role=status]').innerText(),/드라이브.*저장했습니다/);
 const products=[...drive.files.values()].filter(f=>f.appProperties?.fashionStudio==='product');
 assert.equal(products.length,1);const folder=[...drive.files.values()].find(f=>f.appProperties?.fashionStudio==='folder');
 assert.equal(folder.name,'두손 작업폴더');assert.deepEqual(products[0].parents,[folder.id],'작업 폴더 안에 저장');
 const saved=JSON.parse(products[0].content);
 assert.equal(saved.name,'카키 브이넥');assert.ok(saved.data.slots.hero.cutout.startsWith('data:image/png'));
 assert.ok(saved.data.slots.hero.versions.length<=2,'되돌리기 기록은 올리지 않음');
 // ---- 컴퓨터 B: 같은 계정으로 연결 → 폴더 자동 선택 → 불러오기 ----
 const B=await computer();
 await B.panel.getByRole('button',{name:'구글 드라이브 연결'}).click();await B.idle();
 assert.match(await B.panel.innerText(),/작업 폴더: 두손 작업폴더/,'다른 컴퓨터에서도 같은 폴더');
 await B.panel.getByRole('button',{name:'드라이브에서 불러오기'}).click();await B.idle();
 assert.match(await B.page.getByLabel('드라이브 상품 선택').innerText(),/카키 브이넥/);
 await B.panel.getByRole('button',{name:'불러오기',exact:true}).click();await B.idle();
 assert.equal(await B.page.getByLabel('상품 이름').inputValue(),'카키 브이넥');
 assert.match(await B.page.getByLabel('상품 선택').innerText(),/카키 브이넥/);
 assert.ok(await B.page.locator('[data-slot="hero"] .paste-zone img').count(),'사진도 불러옴');
 // B에서 고쳐서 저장
 await B.page.getByLabel('상품 이름').fill('카키 브이넥 (B 수정)');await B.page.waitForTimeout(1200);
 await B.panel.getByRole('button',{name:'이 상품 드라이브에 저장'}).click();await B.idle();
 assert.equal(JSON.parse([...drive.files.values()].find(f=>f.appProperties?.fashionStudio==='product').content).name,'카키 브이넥 (B 수정)');
 // ---- A가 옛 내용으로 저장하려 하면 확인을 받는다 (취소하면 B 내용 유지) ----
 let asked='';A.page.once('dialog',d=>{asked=d.message();d.dismiss();});
 await A.panel.getByRole('button',{name:'이 상품 드라이브에 저장'}).click();await A.idle();
 assert.match(asked,/다른 컴퓨터에서.*저장한/);
 assert.equal(JSON.parse([...drive.files.values()].find(f=>f.appProperties?.fashionStudio==='product').content).name,'카키 브이넥 (B 수정)','덮어쓰지 않음');
 assert.equal([...drive.files.values()].filter(f=>f.appProperties?.fashionStudio==='product').length,1,'파일은 1개 유지');
 assert.deepEqual([...A.errors,...B.errors],[]);
 console.log(`PASS: folder created by name and remembered, product saved inside it (${(products[0].content.length/1048576).toFixed(1)}MB), other computer finds the same folder and loads the product, overwrite of newer version asks first.`);
}finally{await browser.close();}
