import test from 'node:test';
import assert from 'node:assert/strict';
import {fillTransparent} from '../src/utils/flatten.js';
import {removedMask, restoreMask, restoreHanger, inspectRestore} from '../src/utils/hangerRestore.js';
// 020 옷걸이 자리 복원(합성, IOPaint는 모의). 앞판: 목 구멍(투명) 양옆 어깨 위에 옷걸이 바가 옷을 덮고 있음 → 지우면 어깨가 바 모양으로 패임.
// 뒷판: 고리 줄기가 뒷목 천 안쪽까지 내려와 있음 → 지우면 뒷목에 구멍. 바 끝은 어깨 밖으로 튀어나옴(채우면 안 됨).
const IVORY=[236,228,212],SILVER=[170,170,175],BROWN=[120,80,45];
function shot({back=false}={}){const W=600,H=800,img={width:W,height:H,data:new Uint8ClampedArray(W*H*4)};
 const rect=(x0,y0,x1,y1,c)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)img.data.set([...c,255],(y*W+x)*4);};
 const clear=(x0,y0,x1,y1)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)img.data[(y*W+x)*4+3]=0;};
 rect(297,30,302,back?140:111,SILVER);                       // 고리 줄기(뒷판은 뒷목 천 안쪽 140까지)
 rect(140,112,460,760,IVORY);
 if(!back)clear(251,112,349,160);                             // 앞판: 목 구멍(넥라인)
 else rect(297,112,302,140,SILVER);                           // 뒷판: 뒷목 천 위로 보이는 고리 줄기
 rect(190,104,250,122,BROWN);rect(350,104,410,122,BROWN);     // 어깨 위 옷걸이 바(옷 위를 덮음)
 rect(128,114,139,122,BROWN);rect(461,114,472,122,BROWN);     // 어깨 밖으로 나온 바 끝
 return img;}
const A=(img,x,y)=>img.data[(y*img.width+x)*4+3];
// 옷걸이 지우기(016) 결과를 직접 만듭니다: 옷걸이 색으로 그린 픽셀을 투명하게(복원만 따로 검사).
const isHanger=(d,i)=>[SILVER,BROWN].some(c=>d[i]===c[0]&&d[i+1]===c[1]&&d[i+2]===c[2]);
const prep=o=>{const img=shot(o),before=new Uint8Array(img.width*img.height);for(let p=0;p<before.length;p++){before[p]=img.data[p*4+3];if(isHanger(img.data,p*4))img.data[p*4+3]=0;}return {img,removed:removedMask(before,img)};};
test('020 restore mask: shoulder dents next to the neckline are filled up to the shoulder line (bar area only), the neck hole and bar tips stay empty',()=>{
 const {img,removed}=prep();
 assert.equal(A(img,220,115),0,'지우면 어깨가 패임');
 const r=restoreMask(img,removed);
 assert.equal(r.dents.length,2,'양쪽 어깨');assert.ok(r.depth>=10,`패임 깊이 ${r.depth}`);
 const M=(x,y)=>r.mask[y*img.width+x];
 for(const [x,y] of [[200,112],[220,118],[249,122],[360,115],[405,122]])assert.equal(M(x,y),1,`어깨 패임 채움 ${x},${y}`);
 for(const [x,y,w] of [[220,106,'어깨선 위(바 윗부분)'],[300,130,'목 구멍'],[300,114,'목 구멍 위 바 자리'],[133,118,'왼쪽 바 끝'],[466,118,'오른쪽 바 끝']])assert.equal(M(x,y),0,w);
});
test('020 back view: the hook hole inside the back neck is filled; a hole not made by the hanger is left alone',()=>{
 const {img,removed}=prep({back:true});
 assert.equal(A(img,300,130),0,'뒷목 구멍');
 const r=restoreMask(img,removed);assert.equal(r.mask[130*600+300],1,'고리 자리(위로 열린 홈)는 패임으로 채움');assert.equal(r.mask[100*600+300],0,'옷 위로 나온 고리는 채우지 않음');
 const other=prep({back:true});for(let y=400;y<410;y++)for(let x=300;x<310;x++)other.img.data[(y*600+x)*4+3]=0;   // 원래 있던 구멍(단춧구멍 등)
 assert.equal(restoreMask(other.img,other.removed).mask[405*600+305],0,'옷걸이와 상관없는 구멍은 그대로');
});
test('020 fill with IOPaint (mock): filled pixels become opaque garment color and the remaining dent depth drops to ~0; a gray fill fails the check and is reverted; IOPaint off → 확인 필요',async()=>{
 const {img,removed}=prep();
 const lama=async(src,mask)=>{assert.ok(src.data.every((v,i)=>i%4!==3||v===255),'보내는 사진은 불투명');return src;};   // 모의 LaMa: 옷 색으로 채운 사진 그대로
 const ok=await restoreHanger(img,removed,{inpaintFn:lama,fill:fillTransparent});
 assert.equal(ok.status,'done',ok.reason);assert.equal(A(ok.image,220,118),255);
 const px=(i,x,y)=>[...i.data.slice((y*600+x)*4,(y*600+x)*4+3)];
 assert.ok(px(ok.image,220,118).every((v,k)=>Math.abs(v-IVORY[k])<6),'옷 색으로 채움');
 assert.ok(ok.depthBefore>=10&&ok.depthAfter<=1,`패임 ${ok.depthBefore}→${ok.depthAfter}`);
 assert.equal(A(ok.image,300,130),0,'목 구멍은 그대로');assert.equal(A(img,220,118),0,'원본은 안 바뀜');
 const pink=prep();for(let p=0;p<pink.img.width*pink.img.height;p++)if(pink.img.data[p*4+3])pink.img.data.set([190,95,115],p*4);
 const grayFill=async(src,mask)=>{const o={...src,data:new Uint8ClampedArray(src.data)};for(let p=0;p<mask.length;p++)if(mask[p])o.data.set([128,128,128],p*4);return o;};
 const bad=await restoreHanger(pink.img,pink.removed,{inpaintFn:grayFill,fill:fillTransparent});
 assert.equal(bad.status,'review');assert.match(bad.reason,/되돌림/);assert.equal(A(bad.image,220,118),0,'되돌림');
 const off=await restoreHanger(img,removed,{inpaintFn:async()=>{throw Object.assign(new Error('x'),{offline:true});},fill:fillTransparent});
 assert.equal(off.status,'review');assert.match(off.reason,/PC IOPaint 필요/);assert.ok(off.depthAfter>=10);
 const none=await restoreHanger(img,new Uint8Array(600*800),{inpaintFn:lama,fill:fillTransparent});assert.equal(none.status,'none');
});
test('020 a hole fully enclosed by fabric (bar seen through the neck, front with back panel) is filled as a hole',()=>{
 const W=600,H=800,img={width:W,height:H,data:new Uint8ClampedArray(W*H*4)},before=new Uint8Array(W*H);
 for(let y=112;y<=760;y++)for(let x=140;x<=460;x++)img.data.set([...IVORY,255],(y*W+x)*4);
 for(let p=0;p<W*H;p++)before[p]=img.data[p*4+3];
 for(let y=130;y<=140;y++)for(let x=260;x<=340;x++)img.data[(y*W+x)*4+3]=0;   // 목 안쪽 바 자리(천으로 둘러싸임)
 const r=restoreMask(img,removedMask(before,img));assert.equal(r.holes,1);assert.equal(r.mask[135*W+300],1);assert.equal(r.dents.length,0);
});
import {composeCrop} from '../src/utils/originalCrop.js';
import {checkCut} from '../src/utils/qaCheck.js';
test('020 original-resolution detail crop: restored pixels take the retouched (stage-1) color, not the hanger seen in the original photo',()=>{
 const W=4,H=1,mk=(arr)=>({width:W,height:H,data:Uint8ClampedArray.from(arr.flat())});
 const orig=mk([[236,228,212,255],[120,80,45,255],[236,228,212,255],[120,80,45,255]]);        // 원본: 2·4번째는 옷걸이(갈색)
 const alpha=mk([[236,228,212,255],[236,228,212,255],[236,228,212,255],[0,0,0,0]]);           // 누끼: 2번째는 복원(아이보리), 4번째는 지운 바 끝(투명)
 const s1=mk([[240,232,216,255],[240,232,216,255],[240,232,216,255],[0,0,0,0]]);
 const {image,restored}=composeCrop({orig,alpha,restored:{stage1:s1}});
 assert.equal(restored,1);assert.deepEqual([...image.data.slice(4,8)],[240,232,216,255],'복원 픽셀은 1차 보정본 색');
 assert.deepEqual([...image.data.slice(0,3)],[236,228,212],'나머지는 원본');assert.equal(image.data[15],0,'투명은 투명');
 const plain=composeCrop({orig:mk([[236,228,212,255],[120,80,45,255],[1,1,1,255],[1,1,1,255]]),alpha});assert.equal(plain.restored,0,'복원 표시 없으면 예전 그대로');
});
test('020 QA "옷걸이 자리 패임": remaining dent depth from the restore record (hold ≥1% of garment height, na without a record)',()=>{
 const {img}=prep();
 const keyOf=r=>checkCut({final:img,hanger:'remove',restore:r}).find(c=>c.key==='hanger_dent');
 assert.equal(keyOf({status:'done',depthAfter:0}).status,'pass');
 const h=keyOf({status:'review',reason:'확인 필요(PC IOPaint 필요) · 옷걸이 자리 복원을 건너뜀',depthAfter:18});assert.equal(h.status,'hold');assert.match(h.reason,/PC IOPaint 필요/);
 assert.equal(keyOf(null).status,'na');
 assert.ok(!checkCut({final:img}).some(c=>c.key==='hanger_dent'),'남기기 설정에는 없음');
});
