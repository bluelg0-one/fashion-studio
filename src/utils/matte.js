// 1차 보정 도구 (브라우저 계산, 무료)
// - 배경 직접 수정: 붓으로 칠한 곳을 '되살리기'(원본 픽셀 복원) / '배경색만 지우기'(주변 배경과 비슷한 색만 투명) / '모두 지우기'
// - 색상 보정: 밝기·화사함(채도)
import {rgbToLab} from './colorMatch.js';

// 붓 자국(점들)을 원형으로 이어 칠한 마스크. 가장자리 2px은 부드럽게.
export function strokeMask(width,height,points,radius) {
  const r=Math.max(1,radius);
  let x0=width,y0=height,x1=0,y1=0;
  for(const p of points){x0=Math.min(x0,p.x-r);y0=Math.min(y0,p.y-r);x1=Math.max(x1,p.x+r);y1=Math.max(y1,p.y+r);}
  x0=Math.max(0,Math.floor(x0));y0=Math.max(0,Math.floor(y0));x1=Math.min(width-1,Math.ceil(x1));y1=Math.min(height-1,Math.ceil(y1));
  if(x1<x0||y1<y0)return null;
  const w=x1-x0+1,h=y1-y0+1,m=new Float32Array(w*h);
  // 점 사이를 반지름의 1/3 간격으로 채워 끊기지 않게
  const dense=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[i+1]||a,d=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(d/(r/3)));
    for(let k=0;k<n;k++)dense.push({x:a.x+(b.x-a.x)*k/n,y:a.y+(b.y-a.y)*k/n});
  }
  if(points.length)dense.push(points[points.length-1]);
  for(const p of dense){
    const px0=Math.max(x0,Math.floor(p.x-r)),px1=Math.min(x1,Math.ceil(p.x+r)),py0=Math.max(y0,Math.floor(p.y-r)),py1=Math.min(y1,Math.ceil(p.y+r));
    for(let y=py0;y<=py1;y++)for(let x=px0;x<=px1;x++){
      const v=Math.max(0,Math.min(1,(r-Math.hypot(x-p.x,y-p.y))/2));
      const i=(y-y0)*w+(x-x0);if(v>m[i])m[i]=v;
    }
  }
  return {x0,y0,w,h,m};
}

const dE=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

// 붓 주변(반지름의 3배 안)에서 이미 지워진 곳의 원본 색 = 이 부근 배경색
function localBackground(matte,source,mask,radius) {
  const {width,height}=matte,pad=Math.round(radius*3),sum=[0,0,0];let n=0;
  const xa=Math.max(0,mask.x0-pad),xb=Math.min(width-1,mask.x0+mask.w+pad),ya=Math.max(0,mask.y0-pad),yb=Math.min(height-1,mask.y0+mask.h+pad);
  const step=Math.max(1,Math.floor(Math.sqrt((xb-xa+1)*(yb-ya+1)/40000)));
  for(let y=ya;y<=yb;y+=step)for(let x=xa;x<=xb;x+=step){
    const i=(y*width+x)*4;if(matte.data[i+3]>10)continue;
    const l=rgbToLab(source.data[i],source.data[i+1],source.data[i+2]);sum[0]+=l[0];sum[1]+=l[1];sum[2]+=l[2];n++;
  }
  return n>=20?sum.map(v=>v/n):null;
}

// mode: 'restore' | 'eraseBg' | 'erase'. matte·source는 같은 크기의 ImageData(원본과 위치가 맞아야 함). 바뀐 픽셀 수를 돌려줍니다.
export function applyBrush({matte,source,points,radius,mode,tolerance=18}) {
  const mask=strokeMask(matte.width,matte.height,points,radius);if(!mask)return 0;
  const d=matte.data,s=source?.data,{x0,y0,w,h,m}=mask;
  let bg=null;
  if(mode==='eraseBg'){
    if(!s)throw new Error('원본과 위치가 맞지 않아 배경색만 지우기를 쓸 수 없습니다. ‘모두 지우기’를 쓰세요.');
    bg=localBackground(matte,source,mask,radius);
    if(!bg)throw new Error('붓 주변에 이미 지워진 배경이 없어 배경색을 알 수 없습니다. 배경과 맞닿은 곳부터 칠하세요.');
  }
  if(mode==='restore'&&!s)throw new Error('원본과 위치가 맞지 않아 되살리기를 쓸 수 없습니다.');
  let changed=0;
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
    const k=m[yy*w+xx];if(!k)continue;
    const i=((y0+yy)*matte.width+(x0+xx))*4,a=d[i+3];
    let next=a;
    if(mode==='restore'){
      next=Math.max(a,Math.round(255*k));
      if(next!==a||d[i]!==s[i]){d[i]=s[i];d[i+1]=s[i+1];d[i+2]=s[i+2];}
    } else if(mode==='erase'){
      next=Math.round(a*(1-k));
    } else {
      const e=dE(rgbToLab(s[i],s[i+1],s[i+2]),bg);
      // 배경과 비슷할수록 지움(경계 부근은 반쯤)
      const f=e<=tolerance?1:e>=tolerance*1.5?0:(tolerance*1.5-e)/(tolerance*.5);
      next=Math.round(a*(1-f*k));
    }
    if(next!==a){d[i+3]=next;changed++;}
  }
  return changed;
}

// 색상 보정: bright -30~30 (%), vivid -20~40 (%). 투명 픽셀은 건너뜀.
export function applyTone({data},{bright=0,vivid=0}={}) {
  if(!bright&&!vivid)return;
  const b=bright/100,v=1+vivid/100,lut=new Map();
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]===0)continue;
    const key=(data[i]<<16)|(data[i+1]<<8)|data[i+2];
    let o=lut.get(key);
    if(!o){
      let r=data[i],g=data[i+1],bl=data[i+2];
      const y=.299*r+.587*g+.114*bl;
      r=y+(r-y)*v;g=y+(g-y)*v;bl=y+(bl-y)*v;
      const lift=c=>b>=0?c+(255-c)*b:c*(1+b);
      o=[r,g,bl].map(c=>Math.max(0,Math.min(255,Math.round(lift(c)))));
      if(lut.size<200000)lut.set(key,o);
    }
    data[i]=o[0];data[i+1]=o[1];data[i+2]=o[2];
  }
}
