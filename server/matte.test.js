import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBrush, applyTone, strokeMask} from '../src/utils/matte.js';

// 200x200: 원본 = 베이지 벽(230,220,205) 위에 비슷한 색의 마네킹(220,205,190) 원 + 진한 옷 사각형
function scene(){
  const w=200,h=200,src=new Uint8ClampedArray(w*h*4),matte=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,mann=Math.hypot(x-100,y-60)<30,cloth=x>=60&&x<140&&y>=90&&y<180;
    const c=cloth?[60,70,50]:mann?[218,204,188]:[232,222,206];
    src.set([...c,255],i);
    // 자동 누끼가 옷만 남기고 마네킹 일부를 지워 버린 상황
    if(cloth||(mann&&y>60))matte.set([...c,255],i);
  }
  return {source:{data:src,width:w,height:h},matte:{data:matte,width:w,height:h}};
}
const A=(img,x,y)=>img.data[(y*img.width+x)*4+3];

test('되살리기: 칠한 곳만 원본에서 되살린다',()=>{
  const {source,matte}=scene();
  assert.equal(A(matte,100,45),0);
  applyBrush({matte,source,points:[{x:100,y:45}],radius:8,mode:'restore'});
  assert.equal(A(matte,100,45),255);
  assert.deepEqual([...matte.data.slice((45*200+100)*4,(45*200+100)*4+3)],[218,204,188]);
  assert.equal(A(matte,100,20),0,'칠하지 않은 곳은 그대로');
});

test('배경색만 지우기: 대충 칠해도 배경색만 지우고 옷은 남긴다',()=>{
  const {source,matte}=scene();
  // 옷 왼쪽 테두리에 배경이 남은 상황
  for(let y=100;y<170;y++)for(let x=50;x<60;x++)matte.data.set([232,222,206,255],(y*200+x)*4);
  applyBrush({matte,source,points:[{x:58,y:110},{x:58,y:160}],radius:10,mode:'eraseBg',tolerance:18});
  assert.equal(A(matte,55,130),0,'남은 배경 지움');
  assert.equal(A(matte,64,130),255,'붓이 닿은 옷은 남음');
});

test('모두 지우기와 붓 마스크',()=>{
  const {source,matte}=scene();
  applyBrush({matte,source:null,points:[{x:100,y:130}],radius:5,mode:'erase'});
  assert.equal(A(matte,100,130),0);assert.equal(A(matte,120,130),255);
  const m=strokeMask(200,200,[{x:10,y:10},{x:60,y:10}],4);
  assert.ok(m.m[(10-m.y0)*m.w+(35-m.x0)]>0,'점 사이도 이어서 칠함');
  assert.throws(()=>applyBrush({matte,source:null,points:[{x:5,y:5}],radius:4,mode:'restore'}),/위치가 맞지 않아/);
});

test('색상 보정: 밝게·화사하게, 투명은 그대로',()=>{
  const data=new Uint8ClampedArray([100,80,60,255, 10,20,30,0]);
  applyTone({data},{bright:20,vivid:30});
  assert.ok(data[0]>100&&data[0]-data[2]>40,'밝아지고 채도 증가');
  assert.deepEqual([...data.slice(4)],[10,20,30,0]);
});
