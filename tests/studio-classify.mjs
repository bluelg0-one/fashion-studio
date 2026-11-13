// 한꺼번에 올리기(Claude 분류 모의) → 옷별 상품·컷별 칸 배치 → 확인 필요 표시·자리 이동 → 일관성 맞추기.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3001');
 const make=(color,w,h,box)=>page.evaluate(([c,w,h,box])=>{const k=document.createElement('canvas');k.width=w;k.height=h;const x=k.getContext('2d');if(box){x.fillStyle=c;x.fillRect(...box);}else{x.fillStyle=c;x.fillRect(0,0,w,h);}return k.toDataURL();},[color,w,h,box]);
 const khakiCut=await make('#565e3e',400,600,[100,80,200,420]),khakiCut2=await make('#6e7648',300,500,[40,60,150,300]);
 let sentPhotos=null;const calls=[];
 await page.route('**/api/studio?*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');calls.push(a);
  if(a==='classify'){sentPhotos=JSON.parse(r.request().postData()).photos;return r.fulfill({json:{garments:[{id:'g1',description:'카키 브이넥 긴팔티'},{id:'g2',description:'네이비 니트'}],photos:[
   {id:'p0',garment:'g1',shot:'front',confidence:.97,review:false,note:''},
   {id:'p1',garment:'g1',shot:'back',confidence:.9,review:false,note:''},
   {id:'p2',garment:'g1',shot:'fabric',confidence:.45,review:true,note:'네이비 니트 원단일 수도 있습니다.'},
   {id:'p3',garment:'g2',shot:'front',confidence:.93,review:false,note:''}]}});}
  if(a==='retouch'){const n=calls.filter(c=>c==='retouch').length;return r.fulfill({json:{image:n===1?khakiCut:khakiCut2}});}
  return r.fulfill({json:{configured:true,openai:true,photoroom:true,claude:true}});});
 await page.reload();
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.studio-editor').disabled);await idle();
 const photo=async(c,i)=>({name:`IMG_${i}.png`,mimeType:'image/png',buffer:Buffer.from((await make(c,600,800)).split(',')[1],'base64')});
 await page.getByLabel('사진 한꺼번에 올리기').setInputFiles([await photo('#567',0),await photo('#678',1),await photo('#789',2),await photo('#235',3)]);
 await page.waitForFunction(()=>/분류 완료/.test(document.querySelector('[role=status]').textContent));await idle();
 assert.equal(sentPhotos.length,4);assert.ok(sentPhotos.every(p=>p.image.startsWith('data:image/jpeg')&&p.image.length<400000),'작은 JPG로 보냄');
 assert.equal(await page.getByLabel('상품 선택').locator('option').count(),2,'옷 2벌 → 상품 2개');
 assert.equal(await page.getByLabel('상품 이름').inputValue(),'카키 브이넥 긴팔티');
 const has=id=>page.locator(`[data-slot="${id}"] .paste-zone img`).count();
 assert.equal(await has('hero'),1);assert.equal(await has('back'),1);assert.equal(await has('fabric'),1);assert.equal(await has('side'),0);
 assert.match(await page.locator('[data-slot="fabric"] .ai-badge').innerText(),/확인 필요/);
 assert.match(await page.locator('[role=status]').innerText(),/확인 필요 1장/);
 // 자리 이동: 원단 → 측면
 await page.getByLabel('fabric 자리 이동').selectOption('side');
 assert.equal(await has('fabric'),0);assert.equal(await has('side'),1);
 assert.doesNotMatch(await page.locator('[data-slot="side"] .ai-badge').innerText(),/확인 필요/,'옮기면 확인 완료로 처리');
 // 두 번째 옷 상품
 const g2=await page.getByLabel('상품 선택').locator('option',{hasText:'네이비 니트'}).getAttribute('value');
 await page.getByLabel('상품 선택').selectOption(g2);await idle();assert.equal(await has('hero'),1);assert.equal(await has('back'),0);
 // 일관성 맞추기: 첫 상품에서 두 컷 보정 후
 const g1=await page.getByLabel('상품 선택').locator('option',{hasText:'카키'}).getAttribute('value');
 await page.getByLabel('상품 선택').selectOption(g1);await idle();
 for(const id of ['hero','back']){await page.locator(`[data-slot="${id}"]`).getByRole('button',{name:'이 사진 누끼·보정',exact:true}).click();await idle();}
 await page.getByRole('button',{name:'모든 컷 일관성 맞추기 (색감·밝기·크기·여백·중앙)'}).click();await idle();
 assert.match(await page.locator('[role=status]').innerText(),/일관성 맞추기 완료/);
 const info=id=>page.locator(`[data-slot="${id}"] .paste-zone img`).evaluate(im=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let l=c.width,r=0,t=c.height,b=0;for(let y=0;y<c.height;y+=4)for(let X=0;X<c.width;X+=4){const i=(y*c.width+X)*4;if(d[i]<240||d[i+1]<240||d[i+2]<240){l=Math.min(l,X);r=Math.max(r,X);t=Math.min(t,y);b=Math.max(b,y);}}return {w:c.width,h:c.height,cx:(l+r)/2/c.width,cy:(t+b)/2/c.height,fill:Math.max((r-l)/c.width,(b-t)/c.height),mid:[...x.getImageData(c.width/2|0,c.height/2|0,1,1).data].slice(0,3)};});
 const A=await info('hero'),B=await info('back');
 assert.deepEqual([A.w,A.h],[1500,2000]);assert.deepEqual([B.w,B.h],[1500,2000],'같은 크기');
 for(const v of [A,B]){assert.ok(Math.abs(v.cx-.5)<.02&&Math.abs(v.cy-.5)<.02,'가운데 정렬');}
 assert.ok(Math.abs(A.fill-B.fill)<.03,`같은 여백 ${A.fill} ${B.fill}`);
 // 기본 강도 80%: 원래 차이(약 35)의 80%를 줄임
 assert.ok(Math.hypot(A.mid[0]-B.mid[0],A.mid[1]-B.mid[1],A.mid[2]-B.mid[2])<10,`색감 통일 ${A.mid} ${B.mid}`);
 assert.deepEqual(errors,[]);
 console.log(`PASS: bulk upload → 2 products by garment, shots placed, review flagged, move clears review, one-click consistency (1500x2000, centered, same margin, colors ${A.mid}/${B.mid}).`);
}finally{await browser.close();}
