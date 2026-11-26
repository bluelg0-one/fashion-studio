// 옷걸이 v2(014): 디테일컷을 업로드한 원본(줄이기 전) 해상도에서 잘라 냅니다(브라우저 계산, 무료).
// 보정본과 같은 결과가 되도록:
//  - 1차의 전체 보정(색상 밝기·화사하게, 흰 옷 맑게, 색감 이동)은 기록해 둔 같은 값(ops)으로 잘라 낸 원본에 다시 적용합니다.
//  - 누끼 알파와 2차 보정이 바꾼 픽셀은 보정본을 원본 크기로 늘려 씁니다(경계·배경이 보이는 컷의 테두리, 2차가 고친 곳만).
import {applyTone} from './matte.js';
import {clearWhite, applyShift} from './colorMatch.js';
import {garmentFrame} from './detailCrops.js';

export const DETAIL_MAX_SIDE=2000;// 원본에서 자른 디테일컷의 긴 변 최대(이보다 크면 줄임, 키우지는 않음)
export function applyOps(img,ops=[]) {
  for(const o of ops||[]){
    if(o.op==='tone')applyTone(img,{bright:o.bright,vivid:o.vivid});
    else if(o.op==='white')clearWhite(img,{a:o.a,b:o.b});
    else if(o.op==='shift')applyShift(img,{L:o.L||0,a:o.a||0,b:o.b||0});
  }
  return img;
}
// 보정본(최종) 좌표 → 누끼(원본과 같은 위치, 줄인 크기) 좌표 변환. 1차의 가운데 정렬은 같은 비율 확대 + 이동이므로 옷 범위로 구합니다.
export function frameMap(matte,final) {
  const m=garmentFrame(matte),f=garmentFrame(final);if(!m||!f)return null;
  const sx=(f.x1-f.x0+1)/(m.x1-m.x0+1);
  return {sx,toMatte:(x,y)=>[m.x0+(x-f.x0)/sx,m.y0+(y-f.y0)/sx]};
}
// 최종 좌표의 상자 → 원본 좌표의 상자. ratio = 원본 폭 / 누끼 폭
export function originalBox(box,map,ratio,W,H) {
  const [x,y]=map.toMatte(box.x,box.y),w=box.w/map.sx*ratio,h=box.h/map.sx*ratio;
  const ox=Math.max(0,Math.min(W-w,x*ratio)),oy=Math.max(0,Math.min(H-h,y*ratio));
  return {x:Math.round(ox),y:Math.round(oy),w:Math.round(Math.min(w,W)),h:Math.round(Math.min(h,H))};
}
// 합치기(모두 같은 크기의 ImageData): orig = 원본 조각(불투명), alpha = 늘린 누끼, s1·s2 = 늘린 1차·최종(2차).
// 원본 조각에 ops를 다시 적용 → 2차가 바꾼 픽셀(1차와 tol 넘게 다른 곳)은 늘린 최종 픽셀로 → 알파는 늘린 누끼 알파.
export function composeCrop({orig,alpha,s1=null,s2=null,ops=[],tol=6}) {
  applyOps(orig,ops);
  const d=orig.data,A=alpha.data;let changed=0;
  for(let i=0;i<d.length;i+=4){
    if(s1&&s2){const a=s1.data,b=s2.data;if(Math.abs(a[i]-b[i])>tol||Math.abs(a[i+1]-b[i+1])>tol||Math.abs(a[i+2]-b[i+2])>tol){d[i]=b[i];d[i+1]=b[i+1];d[i+2]=b[i+2];changed++;}}
    d[i+3]=A[i+3];
  }
  return {image:orig,changed:changed/(d.length/4)};
}
