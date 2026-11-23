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

test('검은 옷이면 옷걸이를 옷과 구분할 수 없어 건너뛴다',()=>{
 const img=hangerShot();rect(img,60,100,240,360,BLACK);
 assert.equal(removeHanger(img),0);assert.ok(A(img,120,95)>0);
});
