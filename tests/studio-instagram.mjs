// 인스타그램 게시 준비(캡션 틀·4:5 사진 묶음)와 바로 게시 흐름 검사. API는 모의 응답입니다.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
const jpegSize=buf=>{for(let i=2;i<buf.length;){const m=buf[i+1],len=buf.readUInt16BE(i+2);if(m>=0xc0&&m<=0xc3)return {h:buf.readUInt16BE(i+5),w:buf.readUInt16BE(i+7)};i+=2+len;}return null;};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
 let ready=false;const calls=[];
 await page.route('**/api/studio?*',r=>r.fulfill({json:{configured:true,openai:true,photoroom:false}}));
 await page.route('**/api/instagram?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action'),body=r.request().postDataJSON?.()||null;calls.push({a,body});
  if(a==='status')return r.fulfill({json:{ready,token:ready,storage:ready,password:ready}});
  if(body?.password!=='pw')return r.fulfill({status:401,json:{error:'게시 비밀번호가 맞지 않습니다.'}});
  if(a==='check')return r.fulfill({json:{username:'testshop',used:1,limit:50}});
  if(a==='upload')return r.fulfill({json:{url:`https://x.public.blob.vercel-storage.com/instagram/${calls.filter(c=>c.a==='upload').length}.jpg`}});
  return r.fulfill({json:{id:'1',permalink:'https://www.instagram.com/p/TEST/',username:'testshop',count:body.urls.length}});});
 const url=process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001';
 await page.goto(url);
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);
 // 방금 한 수정이 '저장 대기'로 바뀔 틈을 준 뒤 저장 완료를 기다립니다.
 const saved=async()=>{await page.waitForTimeout(200);await page.waitForFunction(()=>document.querySelector('.save-state')?.textContent==='자동 저장됨');};
 await idle();
 const panel=page.locator('.instagram-panel');
 const tall=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=900;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,600,900);x.fillStyle='#444';x.fillRect(150,100,300,700);return c.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('hero 사진 선택',{exact:true}).setInputFiles({name:'a.png',mimeType:'image/png',buffer:Buffer.from(tall,'base64')});await idle();
 await page.getByLabel('상품 제목',{exact:true}).fill('레이어드 골지 라운드 긴팔티');
 await page.getByLabel('1행 사이즈').fill('FREE');
 // 설정 전에는 바로 게시 대신 안내가 보이고, 묶음 다운로드는 쓸 수 있음
 await panel.getByText('아직 바로 게시를 쓸 수 없습니다').waitFor();
 assert.equal(await panel.getByRole('button',{name:'인스타그램에 지금 게시'}).count(),0);
 // 캡션 틀: 입력한 항목만 줄로 들어감
 await panel.getByRole('button',{name:'상세페이지의 제목·사이즈 가져오기'}).click();
 assert.equal(await page.getByLabel('인스타 상품명').inputValue(),'레이어드 골지 라운드 긴팔티');
 assert.equal(await page.getByLabel('인스타 사이즈').inputValue(),'FREE');
 await page.getByLabel('인스타 컬러').fill('차콜');await page.getByLabel('인스타 가격(원)').fill('6000');await page.getByLabel('인스타 수량(장)').fill('5');
 await page.getByLabel('인스타 해시태그').fill('#여성의류 #데일리룩 #긴팔티');
 const expected='레이어드 골지 라운드 긴팔티\n\n컬러 | 차콜\n사이즈 | FREE\n가격 | 6,000원 (무료배송)\n수량 | 5장 한정\n\n구매·문의는 DM 주세요 💌\n\n#여성의류 #데일리룩 #긴팔티';
 assert.equal(await page.getByLabel('인스타 캡션').inputValue(),expected);
 assert.match(await panel.locator('label',{hasText:'캡션'}).last().locator('small').textContent(),/해시태그 3\/30개/);
 await page.getByLabel('프로필 링크 구매 안내 넣기').check();
 assert.match(await page.getByLabel('인스타 캡션').inputValue(),/프로필 링크에서도 구매하실 수 있어요\./);
 await page.getByLabel('프로필 링크 구매 안내 넣기').uncheck();
 // ZIP: 1080×1350 JPG + caption.txt
 const [dl]=await Promise.all([page.waitForEvent('download'),panel.getByRole('button',{name:'사진·캡션 묶음 다운로드 (ZIP)'}).click()]);
 const zip=await JSZip.loadAsync(await fs.readFile(await dl.path()));
 const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir).map(n=>n.split('/').pop()).sort();
 assert.deepEqual(names,['01.jpg','caption.txt']);
 const jpg=await zip.file(/01\.jpg$/)[0].async('nodebuffer');
 assert.deepEqual(jpegSize(jpg),{w:1080,h:1350});assert.ok(jpg.length<3*1024*1024);
 assert.equal(await zip.file(/caption\.txt$/)[0].async('string'),expected);
 await idle();
 // 직접 고친 캡션은 유지되고, 되돌릴 수 있음
 await page.getByLabel('인스타 캡션').fill('직접 쓴 캡션 #우아샵');
 await page.getByLabel('인스타 컬러').fill('블랙');
 assert.equal(await page.getByLabel('인스타 캡션').inputValue(),'직접 쓴 캡션 #우아샵');
 await saved();await page.reload();await idle();
 assert.equal(await page.getByLabel('인스타 캡션').inputValue(),'직접 쓴 캡션 #우아샵');
 await panel.getByRole('button',{name:'입력값으로 캡션 다시 만들기'}).click();
 assert.equal(await page.getByLabel('인스타 캡션').inputValue(),expected.replace('차콜','블랙'));
 // 서버 설정이 끝난 뒤: 틀린 비밀번호는 실패, 맞으면 사진 올리고 게시
 ready=true;await saved();await page.reload();await idle();
 await page.getByLabel('인스타 게시 비밀번호').fill('wrong');
 page.once('dialog',d=>d.accept());
 await panel.getByRole('button',{name:'인스타그램에 지금 게시'}).click();await idle();
 await page.getByText('게시 비밀번호가 맞지 않습니다.').waitFor();
 assert.equal(calls.filter(c=>c.a==='publish').length,0);
 await page.getByLabel('인스타 게시 비밀번호').fill('pw');
 await panel.getByRole('button',{name:'연결 확인'}).click();await idle();
 await panel.getByText('연결된 계정: @testshop · 최근 24시간 게시 1/50회').waitFor();
 let message='';page.once('dialog',d=>{message=d.message();d.dismiss();});
 await panel.getByRole('button',{name:'인스타그램에 지금 게시'}).click();await idle();
 assert.match(message,/사진 1장과 캡션을 인스타그램 @testshop에 지금 바로 게시합니다/);
 assert.equal(calls.filter(c=>c.a==='publish').length,0,'취소하면 게시하지 않음');
 page.once('dialog',d=>d.accept());
 await panel.getByRole('button',{name:'인스타그램에 지금 게시'}).click();await idle();
 const uploads=calls.filter(c=>c.a==='upload'&&c.body.password==='pw'),publishes=calls.filter(c=>c.a==='publish');
 assert.equal(uploads.length,1);assert.match(uploads[0].body.image,/^data:image\/jpeg;base64,/);
 assert.deepEqual(jpegSize(Buffer.from(uploads[0].body.image.split(',')[1],'base64')),{w:1080,h:1350});
 assert.equal(publishes.length,1);assert.equal(publishes[0].body.caption,expected.replace('차콜','블랙'));assert.equal(publishes[0].body.urls.length,1);
 await panel.getByRole('link',{name:'게시물 보기'}).waitFor();
 // 게시 기록은 저장되고, 다시 누르면 중복 게시 경고
 await saved();await page.reload();await idle();
 await panel.getByText('이 상품은').first().waitFor();
 page.once('dialog',d=>{message=d.message();d.dismiss();});
 await panel.getByRole('button',{name:'인스타그램에 지금 게시'}).click();await idle();
 assert.match(message,/이미 게시했습니다/);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'모바일에서 가로 스크롤 없음');
 await panel.screenshot({path:process.env.SHOT||'/tmp/fashion-instagram-mobile.png'});
 console.log('instagram browser test ok');
}finally{await browser.close();}
