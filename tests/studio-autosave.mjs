// 완성본 저장 + 상세페이지 자동 만들기 (지시서 011). 구글 로그인·드라이브·OpenAI 모두 모의 응답(비용 없음).
// - 드라이브 연결 전: 브라우저에 보관 + ‘드라이브 연결 후 한 번에 올리기’ 대기열, 내려받기
// - ‘확인 필요’ 컷이 있는 상품 = 상세페이지 초안(_초안), 사이즈 비면 ‘사이즈 입력 필요’
// - 문구 자동 작성(OpenAI)은 기본 꺼짐, 켜면 예상 표시 후 빈 상품만 1회·비용 기록
// - 드라이브 연결 → 대기열 올리기(상품 폴더: 완성 사진 JPG + 상세페이지 PNG·HTML + 채널 묶음 ZIP)
// - 확인 완료 → 정식 저장(같은 파일 이름만 바뀜), 다시 저장해도 바뀐 것 없으면 올리지 않음
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const CLIENT='123456-test.apps.googleusercontent.com';
const drive={files:new Map(),sessions:new Map(),n:0,puts:[]};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,OPTIONS','Access-Control-Expose-Headers':'Location'};
async function fakeDrive(route) {
  const req=route.request(),url=new URL(req.url()),m=req.method(),p=url.pathname;
  if(m==='OPTIONS')return route.fulfill({status:204,headers:cors});
  const json=body=>route.fulfill({headers:cors,json:body});
  if(p==='/drive/v3/files'&&m==='GET'){
    const q=url.searchParams.get('q'),kind=q.match(/key='fashionStudio' and value='(\w+)'/)?.[1],parent=q.match(/'([^']+)' in parents/)?.[1],pid=q.match(/key='productId' and value='([^']+)'/)?.[1],k=q.match(/key='kind' and value='([\w-]+)'/)?.[1];
    return json({files:[...drive.files.values()].filter(f=>!f.trashed&&f.appProperties?.fashionStudio===kind&&(!parent||f.parents?.includes(parent))&&(!pid||f.appProperties?.productId===pid)&&(!k||f.appProperties?.kind===k)).map(({content,...f})=>f)});
  }
  if(p==='/drive/v3/files'&&m==='POST'){const meta=JSON.parse(req.postData()),id='f'+(++drive.n);drive.files.set(id,{id,...meta,parents:meta.parents||['root']});return json({id,name:meta.name});}
  let mm;
  if((mm=p.match(/^\/drive\/v3\/files\/([^/]+)$/))&&m==='GET'){const f=drive.files.get(mm[1]);return json({id:f.id,name:f.name,trashed:false});}
  if((mm=p.match(/^\/drive\/v3\/files\/([^/]+)$/))&&m==='PATCH'){const f=drive.files.get(mm[1]);Object.assign(f,JSON.parse(req.postData()));return json({id:f.id});}
  if(p==='/upload/drive/v3/files'||(mm=p.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/))){
    const sid='s'+(++drive.n);drive.sessions.set(sid,{meta:JSON.parse(req.postData()),fileId:mm?.[1]});
    return route.fulfill({status:200,headers:{...cors,Location:`https://www.googleapis.com/upload/session/${sid}`},body:''});
  }
  if((mm=p.match(/^\/upload\/session\/(.+)$/))&&m==='PUT'){
    const s=drive.sessions.get(mm[1]),id=s.fileId||'f'+(++drive.n),old=drive.files.get(id)||{};
    drive.files.set(id,{...old,id,...s.meta,parents:s.meta.parents||old.parents,appProperties:{...old.appProperties,...s.meta.appProperties},bytes:req.postDataBuffer().length});
    drive.puts.push(s.meta.name);return json({id});
  }
  return route.fulfill({status:500,headers:cors,body:'unexpected '+m+' '+p});
}
const GIS=`window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'tok-1',expires_in:3600}),10)}),revoke:()=>{}}}};`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls={analyze:0};
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
  if(a==='analyze'){calls.analyze++;return r.fulfill({json:{headline:'핑크 후드 니트',description:'부드러운 니트 후드',points:['포켓'],model:'gpt-4.1-mini',usage:{input_tokens:900,output_tokens:120}}});}
  return r.fulfill({json:{configured:true,openai:true,photoroom:true,claude:true,googleClientId:CLIENT}});});
 await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:GIS}));
 await page.route('https://www.googleapis.com/**',fakeDrive);
 await page.route('http://127.0.0.1:808*/**',r=>r.abort());
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const loaded=()=>page.waitForFunction(()=>{const n=document.querySelector('[aria-label="상품 이름"]'),e=document.querySelector('.studio-editor');return Boolean(n?.value)&&e&&!e.disabled;});
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled,null,{timeout:180000});
 await loaded();
 // 보정이 끝난 상품 2개(핑크 후드: 후면이 ‘확인 필요’, 문구·사이즈 비어 있음 / 네이비 니트: 문구·사이즈 있음)
 await page.evaluate(async()=>{
  const m=col=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,600,800);g.fillStyle=col;g.fillRect(120,100,360,600);return c.toDataURL('image/png');};
  const s=(id,label,col,flags=[])=>{const img=m(col);return {id,label,enabled:true,shown:true,source:img,image:img,cutout:img,stage1:img,stage2:img,status:'done',versions:[null,{matte:img,stage1:img,stage2:img}],vIndex:1,auto:{at:1,flags}};};
  const db=await new Promise((res,rej)=>{const q=indexedDB.open('fashion-studio',1);q.onsuccess=()=>res(q.result);q.onerror=rej;});
  const tx=db.transaction('products','readwrite'),st=tx.objectStore('products'),t=Date.now();
  st.put({id:'pa',name:'핑크 후드',updatedAt:t+2,data:{docTheme:'soft',slots:{hero:s('hero','정면','rgb(220,150,170)'),back:s('back','후면','rgb(215,145,165)',['Claude가 수정할 곳을 찾지 못함(0곳)'])},texts:{headline:'',description:''}}});
  st.put({id:'pb',name:'네이비 니트',updatedAt:t+1,data:{docTheme:'soft',garment:'long-top',slots:{hero:s('hero','정면','rgb(60,70,120)')},texts:{headline:'네이비 니트',description:'따뜻한 니트'},sizeRows:{'long-top':[{size:'FREE',length:'62',chest:'54',shoulder:'48',sleeve:'58'}]}}});
  await new Promise(r=>tx.oncomplete=r);
 });
 await page.reload();await loaded();
 const panel=page.locator('.auto-fix');
 await panel.locator('summary',{hasText:'자동 보정할 상품 고르기'}).click();
 await panel.getByLabel('자동 보정 핑크 후드').check();await panel.getByLabel('자동 보정 네이비 니트').check();
 assert.equal(await panel.getByLabel('끝나면 완성본 저장 + 상세페이지 만들기').isChecked(),true,'기본 켬');
 assert.equal(await panel.getByLabel('비어 있는 문구 자동 작성 (OpenAI, 유료)').isChecked(),false,'문구 자동 작성 기본 꺼짐');

 // 1) 드라이브 연결 전: 브라우저 보관 + 대기열
 await panel.getByRole('button',{name:'완성본 저장 + 상세페이지만 만들기'}).click();
 const plan=await panel.locator('.save-plan').innerText();
 assert.match(plan,/상품 2개 · 만들 것: 완성 사진\(JPG\) · 상세페이지 PNG·HTML · 채널별 묶음\(스마트스토어·쿠팡·인스타 4:5·자사몰\) · 저장: 이 브라우저에 보관 → 드라이브 연결 후 한 번에 올리기/);
 assert.match(plan,/문구 자동 작성 없음\(비용 없음\) · ‘확인 필요’ 컷이 있는 상품 1개는 상세페이지를 초안\(_초안\)으로 저장/);
 await panel.getByRole('button',{name:'저장 시작'}).click();await idle();
 const rowA=panel.locator('[data-save="pa"]'),rowB=panel.locator('[data-save="pb"]');
 assert.match(await rowA.innerText(),/핑크 후드\s*초안\s+저장됨 · 브라우저 보관\s+상세페이지_초안\.png, 상세페이지_초안\.html, 채널별_묶음\.zip · 완성 사진 2장\s+사이즈 입력 필요[^\n]*· 상품 제목이 비어 있음 · 확인 필요 컷: 후면 \(Claude가 수정할 곳을 찾지 못함\(0곳\)\)/);
 assert.match(await rowB.innerText(),/네이비 니트\s+저장됨 · 브라우저 보관\s+상세페이지\.png, 상세페이지\.html, 채널별_묶음\.zip · 완성 사진 1장/);
 assert.doesNotMatch(await rowB.innerText(),/사이즈 입력 필요/);
 assert.equal(calls.analyze,0,'OpenAI 호출 없음');
 assert.match(await panel.locator('.outbox-note').innerText(),/드라이브에 아직 올리지 않은 상품 2개/);
 // 내려받기(브라우저 보관본)
 const names=[];page.on('download',d=>names.push(d.suggestedFilename()));
 await rowA.getByRole('button',{name:'내려받기'}).click();
 await page.waitForFunction(()=>true);for(let i=0;i<30&&names.length<3;i++)await page.waitForTimeout(100);
 assert.equal(names.length,3,`내려받기 3개: ${names}`);

 // 2) 문구 자동 작성 켜기: 빈 상품만 OpenAI 1번, 비용 기록
 await panel.getByLabel('비어 있는 문구 자동 작성 (OpenAI, 유료)').check();
 await panel.getByRole('button',{name:'완성본 저장 + 상세페이지만 만들기'}).click();
 assert.match(await panel.locator('.save-plan').innerText(),/문구 자동 작성: 상품 1개 × OpenAI 1회\s*단가 미확인 · 토큰만 기록/);
 await panel.getByRole('button',{name:'저장 시작'}).click();await idle();
 assert.equal(calls.analyze,1,'문구가 빈 핑크 후드만');
 assert.doesNotMatch(await rowA.innerText(),/상품 제목이 비어 있음/);
 await page.locator('.cost-panel summary').click();
 assert.ok((await page.locator('.cost-log tbody tr').allInnerTexts()).some(r=>/핑크 후드\s+정면\s+기타 · OpenAI 상품 문구/.test(r)),'비용 기록');

 // 3) 드라이브 연결 → 대기열 2개 상품 올리기
 page.once('dialog',d=>d.accept('두손 작업폴더'));
 await page.locator('.drive-panel').getByRole('button',{name:'구글 드라이브 연결'}).click();await idle();
 await page.waitForFunction(()=>/기다리던 완성본 2개 상품을 드라이브에 올렸습니다/.test(document.querySelector('.drive-panel').innerText),null,{timeout:60000});
 const outputs=()=>[...drive.files.values()].filter(f=>f.appProperties?.fashionStudio==='output'&&!f.trashed);
 const folderOf=pid=>[...drive.files.values()].find(f=>f.appProperties?.fashionStudio==='photos'&&f.appProperties.productId===pid);
 assert.deepEqual(outputs().filter(f=>f.appProperties.productId==='pa').map(f=>f.name).sort(),['상세페이지_초안.html','상세페이지_초안.png','채널별_묶음.zip']);
 assert.equal(folderOf('pa').name,'핑크 후드');assert.ok(outputs().every(f=>f.parents[0]===folderOf(f.appProperties.productId).id),'상품 폴더 안');
 const jpgs=[...drive.files.values()].filter(f=>f.appProperties?.fashionStudio==='photo');
 assert.deepEqual(jpgs.filter(f=>f.appProperties.productId==='pa').map(f=>f.name).sort(),['01 정면.jpg','02 후면.jpg']);
 assert.ok(jpgs.every(f=>f.bytes<=2*1024*1024),'JPG 2MB 이하');
 await panel.getByRole('button',{name:'목록 닫기'}).click().catch(()=>{});

 // 4) 확인 완료 → 정식 저장: 같은 파일의 이름만 바뀜(새 파일 없음), 연결돼 있으니 바로 올림
 await panel.getByRole('button',{name:'완성본 저장 + 상세페이지만 만들기'}).click();await panel.getByRole('button',{name:'저장 시작'}).click();await idle();
 const before=outputs().length,putsBefore=drive.puts.length;
 assert.equal(drive.puts.length,putsBefore);
 await rowA.getByRole('button',{name:'확인 완료 → 정식 저장'}).click();await idle();
 assert.deepEqual(outputs().filter(f=>f.appProperties.productId==='pa').map(f=>f.name).sort(),['상세페이지.html','상세페이지.png','채널별_묶음.zip']);
 assert.equal(outputs().length,before,'새 파일 없이 이름만 바뀜');
 assert.deepEqual(drive.puts.slice(putsBefore).sort(),['상세페이지.html','상세페이지.png'],'바뀐 것(이름)만 다시 올림 · 사진·묶음은 그대로');
 assert.match(await rowA.innerText(),/핑크 후드\s+저장됨 · 드라이브/);assert.doesNotMatch(await rowA.innerText(),/초안/);
 // 5) 다시 저장해도 바뀐 것 없으면 아무것도 다시 올리지 않음
 const p2=drive.puts.length;
 await panel.getByRole('button',{name:'완성본 저장 + 상세페이지만 만들기'}).click();await panel.getByRole('button',{name:'저장 시작'}).click();await idle();
 assert.deepEqual(drive.puts.slice(p2),[],'바뀐 것 없음 → 올리지 않음');
 assert.match(await panel.locator('.outbox-note').innerText(),/만들 때 이 브라우저에 먼저 보관하고/);
 assert.deepEqual(errors,[]);
 console.log('PASS: no Drive → kept in browser + queue (2), download 3 files; review cuts → _초안 + size/title notes; copy option off by default, on → OpenAI once for the empty product + cost log; Drive connect uploads the queue (photos JPG ≤2MB, detail PNG/HTML, channel ZIP into the product folder); approve → same files renamed (only 2 re-uploaded); re-save with no changes uploads nothing.');
}finally{await browser.close();}
