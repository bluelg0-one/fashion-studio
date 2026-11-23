// 07 채널별 내보내기 검사: 채널별 폴더·파일 이름·규격 크기·용량·흰 배경·같은 여백 가운데 배치·옷 안 자름.
// 브라우저 계산만 씁니다(API는 상태 확인 모의 응답만, 비용 없음).
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});const page=await context.newPage();
 const errors=[],paid=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/studio?*',r=>{const a=new URL(r.request().url()).searchParams.get('action');if(a!=='status')paid.push(a);return r.fulfill({json:{configured:true,openai:false,photoroom:false}});});
 await page.route('**/api/instagram?*',r=>r.fulfill({json:{ready:false,token:false,storage:false,password:false}}));
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);await idle();
 const make=(w,h,draw)=>page.evaluate(([w,h,draw])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');new Function('x','w','h',draw)(x,w,h);return c.toDataURL('image/png').split(',')[1];},[w,h,draw]);
 // 대표: 흰 배경 위 옷(가운데에서 벗어나 있음) · 측면: 가장자리까지 꽉 찬 접사
 const hero=await make(600,900,"x.fillStyle='#fff';x.fillRect(0,0,w,h);x.fillStyle='#2a3f66';x.fillRect(60,120,240,600);");
 const close=await make(800,600,"x.fillStyle='#8a5a3c';x.fillRect(0,0,w,h);x.fillStyle='#d9b38c';for(let i=0;i<w;i+=20)x.fillRect(i,0,6,h);");
 const file=b=>({name:'a.png',mimeType:'image/png',buffer:Buffer.from(b,'base64')});
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles(file(hero));await idle();
 await page.getByLabel('side 컷 추가').click();await page.getByLabel('side 사진 선택',{exact:true}).setInputFiles(file(close));await idle();
 await page.getByLabel('상품 제목',{exact:true}).fill('골지 라운드 티');
 const panel=page.locator('.channel-panel');
 await panel.scrollIntoViewIfNeeded();
 // 규격 표시: 미확인 배지, 장수 요약
 assert.ok(await panel.getByText('미확인 · 보수적 기본값').first().isVisible());
 await panel.getByText(/사진 2장.*만들 파일 9장/).waitFor();
 // 상품명: 저장된 상품 이름을 씁니다
 const productName=await page.evaluate(()=>document.querySelector('.product-bar input')?.value||'');
 const [dl]=await Promise.all([page.waitForEvent('download'),panel.getByRole('button',{name:'채널별 묶음 다운로드 (ZIP)'}).click()]);
 await idle();
 const zip=await JSZip.loadAsync(await fs.readFile(await dl.path()));
 const files=Object.keys(zip.files).filter(n=>!zip.files[n].dir).sort();
 const base=files[0].split('/')[0];
 assert.match(dl.suggestedFilename(),/^[A-Za-z0-9-]+_channels_\d{8}\.zip$/);
 if(productName)assert.equal(base,productName);
 const rel=files.map(f=>f.slice(base.length+1));
 assert.deepEqual(rel,[
  `coupang/${base}_coupang_01.jpg`,`coupang/${base}_coupang_02.jpg`,
  `instagram/${base}_instagram_01.jpg`,`instagram/${base}_instagram_02.jpg`,
  `mall/${base}_mall-detail_01.jpg`,`mall/${base}_mall-detail_02.jpg`,`mall/${base}_mall-thumb_01.jpg`,
  `smartstore/${base}_smartstore_01.jpg`,`smartstore/${base}_smartstore_02.jpg`,
  '목록.txt'].sort());
 const list=await zip.file(`${base}/목록.txt`).async('string');
 assert.match(list,/developers\.coupangcorp\.com/);assert.match(list,/\[네이버 스마트스토어\]/);
 // 이미지 검사(브라우저에서 디코딩)
 const inspect=async name=>{const b64=(await zip.file(`${base}/${name}`).async('nodebuffer')).toString('base64');
  const size=Buffer.from(b64,'base64').length;
  const r=await page.evaluate(async b64=>{const im=new Image();im.src='data:image/jpeg;base64,'+b64;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(0,0,c.width,c.height).data;
   let l=c.width,t=c.height,r=-1,b=-1;for(let y=0;y<c.height;y++)for(let X=0;X<c.width;X++){const i=(y*c.width+X)*4;if(!(d[i]>235&&d[i+1]>235&&d[i+2]>235)){if(X<l)l=X;if(X>r)r=X;if(y<t)t=y;if(y>b)b=y;}}
   const px=(X,Y)=>Array.from(d.slice((Y*c.width+X)*4,(Y*c.width+X)*4+3));
   return {w:c.width,h:c.height,box:{l,t,r,b},corner:px(1,1)};},b64);
  return {...r,size};};
 const near=(a,b,tol=6)=>Math.abs(a-b)<=tol;
 for(const [name,w,h] of [[`smartstore/${base}_smartstore_01.jpg`,1000,1000],[`coupang/${base}_coupang_01.jpg`,1000,1000],[`instagram/${base}_instagram_01.jpg`,1080,1350],[`mall/${base}_mall-detail_01.jpg`,1500,2000],[`mall/${base}_mall-thumb_01.jpg`,1000,1000]]){
  const r=await inspect(name);
  assert.equal(r.w,w,name);assert.equal(r.h,h,name);assert.ok(r.size<=2*1024*1024,name+' 2MB 이하');
  assert.ok(r.corner.every(v=>v>245),name+' 흰 배경');
  // 옷(240×600)을 6% 여백으로 가운데: 긴 쪽(세로)이 정확히 여백만 남기고, 좌우는 대칭
  const {l,t,r:R,b}=r.box,m=Math.round(Math.min(w*.88/240,h*.88/600)*600);
  assert.ok(near(b-t+1,m,8),`${name} 옷 높이 ${b-t+1} ≈ ${m}`);
  assert.ok(near(l,w-1-R,4)&&near(t,h-1-b,4),`${name} 가운데 배치 (${l},${t},${R},${b})`);
 }
 // 꽉 찬 접사는 자르지 않음: 1:1에 가로 전체가 들어가고 위아래만 흰 여백
 const c=await inspect(`smartstore/${base}_smartstore_02.jpg`);
 assert.ok(c.box.l<=1&&c.box.r>=998,'접사 가로 전체 유지');assert.ok(near(c.box.t,125,3)&&near(c.box.b,874,3),`접사 위아래 흰 여백 (${c.box.t},${c.box.b})`);
 // 채널 선택은 기억되고, 뺀 채널은 ZIP에 없음
 await page.getByLabel('인스타그램 피드 내보내기').uncheck();await page.getByLabel('자사몰 내보내기').uncheck();
 await panel.getByText(/만들 파일 4장/).waitFor();
 await page.reload();await idle();
 assert.equal(await page.getByLabel('인스타그램 피드 내보내기').isChecked(),false);
 const [dl2]=await Promise.all([page.waitForEvent('download'),page.locator('.channel-panel').getByRole('button',{name:'채널별 묶음 다운로드 (ZIP)'}).click()]);
 const zip2=await JSZip.loadAsync(await fs.readFile(await dl2.path()));
 const dirs=[...new Set(Object.keys(zip2.files).filter(n=>!zip2.files[n].dir&&n.endsWith('.jpg')).map(n=>n.split('/')[1]))].sort();
 assert.deepEqual(dirs,['coupang','smartstore']);
 assert.deepEqual(paid,[],'유료 API 호출 없음');assert.deepEqual(errors,[]);
 console.log(`PASS: 4 channel folders, 상품명_채널_순번 names (${base}), sizes 1000²/1080×1350/1500×2000, ≤2MB, white bg, same-margin centering, full-bleed close-up not cropped, channel choice remembered, 0 API calls.`);
}finally{await browser.close();}
