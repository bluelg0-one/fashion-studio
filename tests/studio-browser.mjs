const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=600;const ctx=c.getContext('2d');ctx.fillStyle='#78767a';ctx.fillRect(100,100,200,450);for(let y=150;y<550;y+=16){ctx.fillStyle='#dfdfdf';ctx.fillRect(100,y,200,3);}return c.toDataURL();});
 let edits=0,analyses=0;
 await page.route('**/api/studio?*',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action');
  if(action==='edit'){edits++;return route.fulfill({json:{image:fixture}});}
  if(action==='analyze'){analyses++;return route.fulfill({json:{headline:'스트라이프 티셔츠',description:'확인된 상품 설명',points:['원본 무늬']}});}
  return route.fulfill({json:{configured:true}});
 });
 await page.reload();
 const slot=id=>page.locator(`[data-slot="${id}"]`);
 const file={name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(fixture.split(',')[1],'base64')};
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 const download=async(name)=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).first().click();const d=await pending;assert.equal(await d.failure(),null);return fs.readFile(await d.path());};
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles(file);await idle();
 await page.getByLabel('상품 정보',{exact:true}).fill('확인된 정보 <면 추정 금지>');
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();
 await idle();assert.equal(edits,1);assert.equal(analyses,1);
 for(const id of ['frontZoom','frontTop','frontBottom','fabric'])assert.equal(await slot(id).locator('.paste-zone img').count(),1);
 assert.equal(await slot('side').locator('.paste-zone img').count(),0);
 await page.getByLabel('1행 사이즈',{exact:true}).fill('M');await page.getByLabel('1행 가슴단면',{exact:true}).fill('48');await page.getByLabel('1행 총장',{exact:true}).fill('62');
 let html=(await download('HTML 다운로드')).toString();
 assert.ok(html.indexOf('alt="대표 정면샷"')<html.indexOf('스트라이프 티셔츠',html.indexOf('<main>')));
 assert.ok(!html.includes('Fit guide'));assert.ok(!html.includes('alt="옆면컷"'));assert.ok(html.includes('<td>48</td>'));assert.ok(html.includes('&lt;면 추정 금지&gt;'));
 // Missing model image never creates an empty section.
 await page.getByLabel('모델컷 적용',{exact:true}).check();
 html=(await download('HTML 다운로드')).toString();assert.ok(!html.includes('Fit guide'));
 // Clipboard image replacement, no external image CORS.
 await slot('fit').locator('.paste-zone').evaluate(async(el,url)=>{const blob=await(await fetch(url)).blob();const dt=new DataTransfer();dt.items.add(new File([blob],'model.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},fixture);
 await idle();assert.equal(await slot('fit').locator('.paste-zone img').count(),1);
 await page.getByLabel('모델 설명',{exact:true}).fill('모델 165cm / M 착용');
 html=(await download('HTML 다운로드')).toString();assert.ok(html.includes('Fit guide'));assert.ok(html.includes('모델 165cm'));
 await page.getByLabel('모델컷 적용',{exact:true}).uncheck();html=(await download('HTML 다운로드')).toString();assert.ok(!html.includes('Fit guide'));
 // Crop changes affect the saved white-background image.
 await slot('frontTop').locator('.crop-controls summary').click();
 const before=await slot('frontTop').locator('.paste-zone img').getAttribute('src');
 await page.getByRole('slider',{name:'frontTop 가로 위치',exact:true}).fill('0');
 const after=await slot('frontTop').locator('.paste-zone img').getAttribute('src');assert.notEqual(before,after);
 const pixel=await slot('frontTop').locator('.paste-zone img').evaluate(im=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return [...ctx.getImageData(0,0,1,1).data];});assert.deepEqual(pixel,[255,255,255,255]);
 await slot('frontBottom').getByLabel('상세페이지에 포함',{exact:true}).uncheck();
 html=(await download('HTML 다운로드')).toString();assert.ok(!html.includes('alt="정면 하단컷"'));assert.ok(html.includes(after));
 // Imported close-up must survive the automatic crop reset.
 await page.getByLabel('fabric 사진 선택',{exact:true}).setInputFiles(file);await idle();
 const imported=await slot('fabric').locator('.paste-zone img').getAttribute('src');
 await page.getByRole('button',{name:'옷 종류 기준으로 자동 확대 위치 초기화',exact:true}).click();await idle();
 assert.equal(await slot('fabric').locator('.paste-zone img').getAttribute('src'),imported);
 // All six silhouettes and garment-specific measurements; switching restores entries.
 const guides=[];
 for(const type of ['long-top','short-top','vest','dress','long-pants','short-pants']){
  await page.getByLabel('옷 종류',{exact:true}).selectOption(type);await idle();guides.push(await page.locator('.size-guide').getAttribute('src'));
  assert.equal(await page.locator('.size-editor tbody tr').first().locator('input').count(),type.endsWith('pants')?7:3);
 }
 assert.equal(new Set(guides).size,6);
 await page.getByLabel('옷 종류',{exact:true}).selectOption('long-pants');await idle();
 for(const [name,value] of [['사이즈','L'],['허리단면','34'],['밑위','28'],['엉덩이 단면','49'],['허벅지 단면','28'],['밑단단면','20'],['총장','98']])await page.getByLabel(`1행 ${name}`,{exact:true}).fill(value);
 await page.getByRole('button',{name:'사이즈 행 추가',exact:true}).click();await page.getByLabel('2행 사이즈',{exact:true}).fill('XL');
 html=(await download('HTML 다운로드')).toString();assert.ok(html.includes('허리단면'));assert.ok(html.includes('<td>34</td>'));assert.ok(html.includes('<td>XL</td>'));
 await page.getByLabel('옷 종류',{exact:true}).selectOption('long-top');await idle();assert.equal(await page.getByLabel('1행 가슴단면',{exact:true}).inputValue(),'48');
 // Side/back and arbitrary extras are opt-in actual photographs.
 await page.getByLabel('side 사진 선택',{exact:true}).setInputFiles(file);await idle();
 await page.getByLabel('back 사진 선택',{exact:true}).setInputFiles(file);await idle();
 await page.getByRole('button',{name:'특정 디테일컷 추가',exact:true}).click();assert.equal(await page.locator('[data-slot^="extra-"]').count(),1);
 await page.getByRole('button',{name:'사진 일괄 누끼·보정 및 문구 제작',exact:true}).click();await idle();assert.equal(edits,1,'same image reuses successful processing');
 html=(await download('HTML 다운로드')).toString();assert.ok(html.includes('alt="옆면컷"'));assert.ok(html.includes('alt="후면컷"'));assert.ok(!html.includes('alt="추가 디테일컷"'));
 const png=await download('상세페이지 전체 PNG 저장');assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),860);assert.ok(png.readUInt32BE(20)>3000);
 await page.locator('img[alt="완성 상세페이지 미리보기"]').waitFor();
 await page.screenshot({path:'/tmp/fashion-editor-desktop.png',fullPage:false});
 // Individual download uses exactly the current edited image.
 const pending=page.waitForEvent('download');await slot('frontTop').getByRole('button',{name:'개별 PNG 저장',exact:true}).click();const d=await pending;const individual=await fs.readFile(await d.path());assert.equal(individual.subarray(1,4).toString(),'PNG');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/fashion-editor-mobile.png',fullPage:false});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'mobile must not overflow');
 assert.deepEqual(errors,[]);
 console.log('PASS: white backgrounds, 4 crops, crop controls, uploaded detail preservation, clipboard/model toggles, six guides, garment-specific sizes, optional images, caching, HTML and whole/individual PNG, mobile layout.');
 console.log('Whole PNG dimensions: '+png.readUInt32BE(16)+'x'+png.readUInt32BE(20));
}finally{await browser.close();}
