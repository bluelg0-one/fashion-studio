import test from 'node:test';
import assert from 'node:assert/strict';
import {removeIslands, solidifyThin, removeHanger, removeMannequinTop} from '../src/utils/cleanup.js';

const PINK=[190,95,115],CREAM=[232,224,210],GOLD=[200,160,60],BLACK=[25,25,28],SILVER=[170,170,175];
function canvas(w=300,h=400){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};}
function rect(img,x0,y0,x1,y1,c,a=255){for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)img.data.set([...c,a],(y*img.width+x)*4);}
const A=(img,x,y)=>img.data[(y*img.width+x)*4+3];
// 마네킹 정면: 금색 꼭지(위) → 크림색 목 → 분홍 옷(어깨부터)
function mannequinShot(){const img=canvas();rect(img,135,20,165,60,GOLD);rect(img,125,61,175,120,CREAM);rect(img,60,110,240,360,PINK);return img;}

test('떨어진 작은 조각은 지우고 본체·큰 부분은 남긴다',()=>{
 const img=canvas();rect(img,60,60,240,360,PINK);rect(img,10,10,14,14,PINK);rect(img,250,300,290,390,PINK);
 assert.equal(removeIslands(img),1);
 assert.equal(A(img,12,12),0,'작은 조각');assert.equal(A(img,150,200),255,'본체');assert.equal(A(img,270,350),255,'큰 부분(면적 기준 이상)');
});

test('마네킹 꼭지·목 받침: 옷 목선 위로 나온 부분만 지운다',()=>{
 const img=mannequinShot();assert.ok(removeMannequinTop(img)>0);
 assert.equal(A(img,150,30),0,'금색 꼭지');assert.equal(A(img,150,90),0,'목 받침');
 assert.equal(A(img,150,200),255,'옷');assert.equal(A(img,70,115),255,'어깨');
});

test('후드를 올린 사진(마네킹이 옷 안쪽)은 마네킹을 남긴다',()=>{
 const img=canvas();rect(img,90,10,210,360,PINK);rect(img,130,40,170,110,CREAM);rect(img,140,20,160,39,GOLD);
 // 후드 안쪽 구멍으로 보이는 마네킹: 그 세로줄들의 옷은 맨 위(후드)부터 시작
 assert.equal(removeMannequinTop(img),0);assert.equal(A(img,150,80),255);
});

test('흰·회색 옷은 마네킹과 구분할 수 없어 건너뛴다',()=>{
 const img=canvas();rect(img,135,20,165,60,GOLD);rect(img,125,61,175,120,CREAM);rect(img,60,110,240,360,[200,200,198]);
 assert.equal(removeMannequinTop(img),0);assert.equal(A(img,150,90),255);
});

function hangerShot(){const img=canvas();
 for(let y=20;y<70;y++)rect(img,149,y,152,y,SILVER,y<45?90:200); // 반쯤 투명한 은색 고리
 rect(img,148,70,153,90,BLACK);rect(img,90,90,210,100,BLACK);       // 검은 옷걸이 몸통
 rect(img,60,100,240,360,PINK);return img;}

test('옷걸이 남기기: 반투명해진 고리를 선명하게(옷은 그대로)',()=>{
 const img=hangerShot();assert.ok(solidifyThin(img)>0);
 assert.ok(A(img,150,30)>=200,'고리 진해짐');assert.equal(A(img,150,200),255);
 assert.deepEqual([...img.data.slice((200*300+150)*4,(200*300+150)*4+3)],PINK,'옷 색 그대로');
});

test('옷걸이 지우기: 고리·몸통은 지우고 옷 어깨선은 남긴다',()=>{
 const img=hangerShot();assert.ok(removeHanger(img)>0);
 assert.equal(A(img,150,30),0,'고리');assert.equal(A(img,150,80),0,'목');assert.equal(A(img,120,95),0,'몸통');
 assert.equal(A(img,62,102),255,'어깨');assert.equal(A(img,150,200),255,'옷');
});

test('검은 옷이면 옷걸이 몸통을 옷과 구분할 수 없어 남기고, 가는 고리만 모양으로 지운다(016)',()=>{
 const img=hangerShot();rect(img,60,100,240,360,BLACK);
 assert.ok(removeHanger(img)>0);assert.equal(A(img,150,30),0,'고리');assert.ok(A(img,120,95)>0,'몸통(옷과 같은 색)은 남김');assert.equal(A(img,150,200),255,'옷');
});

// ---- 013-B ----
import {clearAboveFinial, restoreHook, clearWallPockets} from '../src/utils/cleanup.js';
const WALL=[205,198,186],GLASS=[180,182,185];
test('013-B: parts above the gold finial are cleared, mannequin and finial stay',()=>{
 const img=mannequinShot();rect(img,140,2,160,12,GLASS);rect(img,60,25,100,35,GLASS);   // 꼭지 위 걸이 부품 + 꼭지 높이 옆 회색 부품
 assert.ok(clearAboveFinial(img)>0);
 assert.equal(A(img,150,5),0,'꼭지 위 부품');assert.equal(A(img,80,30),0,'꼭지 옆 멀리 떨어진 회색 부품');
 assert.equal(A(img,150,30),255,'꼭지');assert.equal(A(img,150,90),255,'마네킹 목');assert.equal(A(img,150,200),255,'옷');
});
test('013-B: no finial (hanger shot) or a gold garment → nothing changes',()=>{
 const img=canvas();rect(img,60,110,240,360,PINK);rect(img,148,20,152,109,BLACK);assert.equal(clearAboveFinial(img),0);
 const g=canvas();rect(g,60,40,240,360,GOLD);rect(g,140,10,160,39,GOLD);assert.equal(clearAboveFinial(g),0);
});
test('013-B: a mannequin neck separated from the garment in a close-up is kept',()=>{
 const img=canvas();rect(img,0,150,299,399,PINK);rect(img,120,40,180,130,CREAM);   // 옷과 떨어진 마네킹 목(전체의 약 6%)
 rect(img,10,10,13,13,PINK);
 removeIslands(img,{minShare:.2});
 assert.equal(A(img,150,80),255,'마네킹 목 유지');assert.equal(A(img,11,11),0,'작은 분홍 조각은 지움');
});
test('013-B: hanger hook tip is restored from the original photo (thin line only)',()=>{
 const src=canvas();rect(src,0,0,299,399,WALL);rect(src,148,20,151,60,SILVER);rect(src,60,110,240,360,PINK);
 const img=canvas();rect(img,148,45,151,60,SILVER);rect(img,60,110,240,360,PINK);   // 고리 위쪽 끝(20~44)이 지워진 누끼
 for(let p=0;p<src.width*src.height;p++)src.data[p*4+3]=255;
 assert.ok(restoreHook(img,src,`rgb(${WALL})`)>0);assert.equal(A(img,149,25),255,'고리 끝 복원');assert.equal(A(img,30,30),0,'벽은 그대로 투명');
 // 벽돌 줄처럼 넓게 퍼지는 것은 복원하지 않음
 const src2=canvas();rect(src2,0,0,299,399,WALL);rect(src2,148,20,151,60,SILVER);rect(src2,0,30,299,33,SILVER);rect(src2,60,110,240,360,PINK);for(let p=0;p<src2.width*src2.height;p++)src2.data[p*4+3]=255;
 const img2=canvas();rect(img2,148,45,151,60,SILVER);rect(img2,60,110,240,360,PINK);
 assert.equal(restoreHook(img2,src2,`rgb(${WALL})`),0);
});
test('013-B: wall left in the closed gap between hanger and garment is cleared',()=>{
 const img=canvas();rect(img,60,110,240,360,PINK);rect(img,100,60,200,64,BLACK);rect(img,100,60,104,110,BLACK);rect(img,196,60,200,110,BLACK);
 rect(img,105,65,195,109,WALL);                 // 옷걸이 삼각(사각)과 옷 사이에 남은 벽
 assert.ok(clearWallPockets(img,`rgb(${WALL})`)>0);
 assert.equal(A(img,150,90),0,'틈의 벽');assert.equal(A(img,150,200),255,'옷');assert.equal(A(img,102,80),255,'옷걸이');
});

// ---- 016: 옷걸이 지우기 기본값 ----
import {findHook, hangerResidue} from '../src/utils/cleanup.js';
import {hanging} from './fixtures/hanging.js';
for(const [name,color] of [['분홍',PINK],['아이보리',[236,228,212]],['흰색',[246,246,244]],['검정',BLACK]])
test(`016: ${name} 옷 — 고리·목 안쪽 바·어깨 끝 바는 지우고(채우지 않음), 어깨선·넥라인·라벨·끈은 남김, 검은 점은 떨어진 조각 지우기로 정리`,()=>{
 const img=hanging(color);
 assert.ok(findHook(img).height>=80,'고리 찾음');
 removeHanger(img);removeIslands(img);
 for(const [x,y,what] of [[285,18,'고리 꼭대기'],[272,45,'고리 끝'],[300,80,'줄기'],[300,119,'목 안쪽 바(가운데)'],[256,119,'목 안쪽 바(왼쪽)'],[133,119,'왼쪽 어깨 끝 바'],[466,119,'오른쪽 어깨 끝 바'],[201,95,'검은 점']])assert.equal(A(img,x,y),0,what);
 for(const [x,y,what] of [[145,113,'왼쪽 어깨선'],[455,113,'오른쪽 어깨선'],[200,112,'어깨 위 끝'],[260,160,'넥라인 안쪽 뒤판'],[300,138,'라벨'],[292,142,'라벨 글자'],[331,785,'끈'],[300,400,'몸판']])assert.equal(A(img,x,y),255,what);
 assert.equal(hangerResidue(img),0,'남은 고리 없음');
});
test('016: 옷걸이 색이 옷과 같으면(검정 옷 + 검정 옷걸이) 고리만 지우고 바는 남김 — 옷을 지우지 않음',()=>{
 const img=hanging(BLACK,{bar:BLACK});removeHanger(img);
 assert.equal(A(img,300,80),0,'고리 줄기');assert.equal(A(img,300,400),255,'옷');assert.equal(A(img,145,113),255,'어깨선');
});
test('016: 캐미솔 끈(고리 옆의 가는 줄)은 고리로 보지 않음; 남은 고리 비율',()=>{
 const img=hanging(PINK);rect(img,180,60,183,111,PINK);rect(img,417,60,420,111,PINK);   // 어깨 위로 올라간 끈 2개
 removeHanger(img);assert.equal(A(img,181,80),255,'왼쪽 끈');assert.equal(A(img,418,80),255,'오른쪽 끈');assert.equal(A(img,300,80),0,'고리');
 const kept=hanging(PINK);const r=hangerResidue(kept);assert.ok(r>.1&&r<.2,`고리 높이 비율 ${r}`);
});
test('016: 고리 없는 옷(둥근 옷깃 꼭대기)은 고리로 보지 않아 아무것도 지우지 않음',()=>{
 const img=canvas(600,800);
 for(let y=60;y<=760;y++)for(let x=140;x<=460;x++){const top=60+Math.round(((x-300)/160)**2*52);if(y>=top)rect(img,x,y,x,y,[236,228,212]);}
 const before=img.data.slice();
 assert.equal(findHook(img),null);assert.equal(removeHanger(img),0);assert.deepEqual(img.data,before);
});
test('016: 옷걸이 바가 안 보이는 사진(후면 등)에서도 고리 아래 라벨은 지우지 않음',()=>{
 const img=hanging(PINK,{bar:PINK});removeHanger(img);removeIslands(img);
 assert.equal(A(img,300,80),0,'고리');assert.equal(A(img,300,138),255,'라벨');assert.equal(A(img,292,142),255,'라벨 글자');
});
import {keepSavedHanger, DEFAULT_RETOUCH, DEFAULT_RETOUCH_V1} from '../src/utils/retouchPresets.js';
test('016: v2 new products remove the hanger; products with saved settings keep theirs (old saved settings without the value stay "keep"); ?v1 default unchanged',()=>{
 assert.equal(DEFAULT_RETOUCH.hangerMode,'remove');assert.equal(DEFAULT_RETOUCH_V1.hangerMode,'keep');
 assert.equal(keepSavedHanger(undefined).hangerMode,'remove','새 상품');
 assert.equal(keepSavedHanger({hangerMode:'keep',cutout:'birefnet'}).hangerMode,'keep','저장된 남기기');
 assert.equal(keepSavedHanger({cutout:'birefnet'}).hangerMode,'keep','값 없이 저장된 예전 설정');
 assert.equal(keepSavedHanger({hangerMode:'remove'}).hangerMode,'remove');
 assert.equal(keepSavedHanger({cutout:'birefnet'}).cutout,'birefnet');
});
