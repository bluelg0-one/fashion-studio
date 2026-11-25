import test from 'node:test';
import assert from 'node:assert/strict';
import {removeStand} from '../src/utils/stand.js';

// 흰 배경(투명) 600x800에 도형을 칠한 가짜 누끼
function canvas(w=600,h=800){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};}
function rect(img,x0,y0,x1,y1,[r,g,b]){for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=(y*img.width+x)*4;img.data.set([r,g,b,255],i);}}
const alpha=(img,x,y)=>img.data[(y*img.width+x)*4+3];
// 옷(몸판): y 100~620, 가운데. 아래 끝은 오른쪽이 더 내려가는 사선.
function garment(img,color=[90,95,60]){
  for(let y=100;y<=640;y++){const x0=200,x1=400;for(let x=x0;x<=x1;x++){if(y>600&&y>600+(x-x0)*0.2)continue;const i=(y*img.width+x)*4;img.data.set([...color,255],i);}}
}

test('사진 아래에서 올라오는 검은 기둥만 지우고 옷은 그대로 둔다',()=>{
  const img=canvas();garment(img);rect(img,286,600,302,799,[10,10,12]);
  const res=removeStand(img);
  assert.ok(res,'기둥을 찾음');
  for(let y=650;y<800;y+=10)assert.equal(alpha(img,294,y),0,`기둥 y=${y} 지움`);
  assert.equal(alpha(img,294,500),255,'옷 가운데는 그대로');
  assert.equal(alpha(img,210,601),255,'옷 아래 왼쪽 테두리 그대로');
  assert.equal(alpha(img,395,630),255,'옷 아래 오른쪽 테두리 그대로');
});

test('검은 옷과 맞닿아 있어도 옷 안쪽에는 구멍을 내지 않는다',()=>{
  const img=canvas();garment(img,[20,20,22]);rect(img,286,600,302,799,[5,5,6]);
  removeStand(img);
  for(let y=200;y<=600;y+=20)assert.equal(alpha(img,294,y),255,`옷 y=${y}`);
  assert.equal(alpha(img,294,760),0);
});

test('아래까지 내려온 소매(폭이 바뀌거나 비스듬함)는 기둥으로 보지 않는다',()=>{
  const img=canvas();garment(img);
  // 왼쪽 소매: 아래로 갈수록 넓어지고 비스듬히
  for(let y=300;y<800;y++){const x0=120-Math.round((y-300)*.1),x1=170;rect(img,x0,y,x1,y,[90,95,60]);}
  const before=img.data.slice();
  assert.equal(removeStand(img),null);
  assert.deepEqual(img.data,before);
});

test('곧고 좁아도 색이 있는 끈(옷)은 지우지 않는다',()=>{
  const img=canvas();garment(img);rect(img,286,600,302,799,[200,40,60]);
  assert.equal(removeStand(img),null);
});

test('기둥이 없는 사진은 그대로',()=>{
  const img=canvas();garment(img);const before=img.data.slice();
  assert.equal(removeStand(img),null);assert.deepEqual(img.data,before);
});

test('살짝 기울어 찍힌 기둥도 끝까지 지운다 (진단 001 하단 컷)',()=>{
 const img=canvas();garment(img);
 // 아래(799)에서 위(600)로 갈수록 왼쪽으로 9px 기울어진 기둥
 for(let y=600;y<800;y++){const x0=Math.round(286-(799-y)*0.045);rect(img,x0,y,x0+16,y,[10,10,12]);}
 const res=removeStand(img);
 assert.ok(res,'기둥을 찾음');
 for(let y=650;y<800;y+=10){const x=Math.round(294-(799-y)*0.045);assert.equal(alpha(img,x,y),0,`기둥 y=${y}`);}
 assert.equal(alpha(img,294,500),255,'옷은 그대로');
});
test('너무 비스듬한 막대(약 8° 넘음)는 기둥으로 보지 않는다',()=>{
 const img=canvas();garment(img);
 for(let y=650;y<800;y++){const x0=Math.round(260+(799-y)*0.3);rect(img,x0,y,x0+14,y,[10,10,12]);}
 assert.equal(removeStand(img),null);
});

// ---- 013-C 후면 컷: 검은 봉이 남은 경우들 ----
const noPole=(img,x,y0,y1)=>{for(let y=y0;y<=y1;y+=5)if(alpha(img,x,y)!==0)return y;return null;};
test('013-C: a pole that stops above the bottom edge (cut short by the cutout) is still removed',()=>{
  const img=canvas();garment(img,[200,120,140]);rect(img,286,600,302,740,[10,10,12]);   // 아래 60줄은 이미 지워짐
  assert.ok(removeStand(img),'기둥을 찾음');assert.equal(noPole(img,294,660,740),null);assert.equal(alpha(img,294,500),255);
});
test('013-C: a pole standing on a wide dark base at the bottom is removed, base too',()=>{
  const img=canvas();garment(img,[200,120,140]);rect(img,286,600,302,770,[10,10,12]);rect(img,200,771,390,799,[15,15,18]);  // 받침 다리(넓음)
  assert.ok(removeStand(img),'기둥을 찾음');assert.equal(noPole(img,294,660,770),null);assert.equal(alpha(img,250,790),0,'받침도 지움');assert.equal(alpha(img,294,500),255);
});
test('013-C: a wider pole (close-up back shot, 5.5% of width) is removed',()=>{
  const img=canvas();garment(img,[200,120,140]);rect(img,278,600,310,799,[12,12,14]);
  assert.ok(removeStand(img));assert.equal(noPole(img,294,660,799),null);
});
test('013-C: a dark pole tinted by reflected pink light is still a pole; a pink strap is not',()=>{
  const img=canvas();garment(img,[200,120,140]);rect(img,286,600,302,799,[70,30,45]);
  assert.ok(removeStand(img));assert.equal(noPole(img,294,660,799),null);
  const s=canvas();garment(s,[200,120,140]);rect(s,286,600,302,799,[200,110,135]);assert.equal(removeStand(s),null,'분홍 끈(옷)은 그대로');
});
