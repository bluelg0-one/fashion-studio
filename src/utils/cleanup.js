// 누끼 뒤 정리 (브라우저 계산, 무료): 떨어진 작은 조각, 옷걸이 고리, 마네킹 꼭지·목 받침.
// 모두 알파(투명도)만 바꾸고 옷의 색·무늬는 건드리지 않습니다.
import {rgbToLab, dominantLab} from './colorMatch.js';

const A=(d,i)=>d[i*4+3];

// 불투명(알파 128 이상) 픽셀을 이웃끼리 묶어 덩어리 번호를 매깁니다(4방향).
function components(data,width,height,th=128) {
  const n=width*height,label=new Int32Array(n).fill(-1),sizes=[],stack=new Int32Array(n);
  for(let s=0;s<n;s++){
    if(label[s]!==-1||A(data,s)<th)continue;
    const id=sizes.length;let top=0,size=0;stack[top++]=s;label[s]=id;
    while(top){
      const p=stack[--top];size++;const x=p%width,y=(p-x)/width;
      if(x>0&&label[p-1]===-1&&A(data,p-1)>=th){label[p-1]=id;stack[top++]=p-1;}
      if(x<width-1&&label[p+1]===-1&&A(data,p+1)>=th){label[p+1]=id;stack[top++]=p+1;}
      if(y>0&&label[p-width]===-1&&A(data,p-width)>=th){label[p-width]=id;stack[top++]=p-width;}
      if(y<height-1&&label[p+width]===-1&&A(data,p+width)>=th){label[p+width]=id;stack[top++]=p+width;}
    }
    sizes.push(size);
  }
  return {label,sizes};
}

// 본체와 이어지지 않은 작은 덩어리(전체 불투명 면적의 minShare 미만)를 지웁니다.
// 남은 덩어리 둘레 2px 밖의 반투명 찌꺼기도 함께 지웁니다. 지운 덩어리 수를 돌려줍니다.
export function removeIslands({data,width,height},{minShare=.004}={}) {
  const {label,sizes}=components(data,width,height);
  if(sizes.length<2)return 0;
  const total=sizes.reduce((a,b)=>a+b,0),biggest=Math.max(...sizes),keep=sizes.map(s=>s===biggest||s>=total*minShare);
  const removed=keep.filter(k=>!k).length;
  if(!removed)return 0;
  const kept=new Uint8Array(width*height);
  for(let p=0;p<label.length;p++){const id=label[p];if(id<0)continue;if(keep[id])kept[p]=1;else data[p*4+3]=0;}
  // 반투명 픽셀: 남은 덩어리에서 2px 안쪽만 둡니다.
  const near=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){if(!kept[y*width+x])continue;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<width&&yy<height)near[yy*width+xx]=1;}}
  for(let p=0;p<width*height;p++){const a=data[p*4+3];if(a>0&&a<128&&!near[p])data[p*4+3]=0;}
  return removed;
}

// '어깨선': 위에서부터 내려오며 불투명 폭이 전체 폭의 35% 이상이 되는 첫 줄. 그 위가 옷걸이 고리·마네킹 꼭지 영역입니다.
function shoulderRow(data,width,height) {
  let x0=width,x1=-1,top=height;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>=128){if(x<x0)x0=x;if(x>x1)x1=x;if(y<top)top=y;}
  if(x1<x0)return null;
  const need=(x1-x0+1)*.35;
  for(let y=top;y<height;y++){let c=0;for(let x=x0;x<=x1;x++)if(data[(y*width+x)*4+3]>=128)c++;if(c>=need)return {top,row:y,x0,x1};}
  return null;
}

// 옷걸이 고리 선명하게: 어깨선 위의 '가는 선'(폭이 사진 폭의 3% 이하)에서 반쯤 투명해진 픽셀을 진하게 합니다.
// 은색 고리처럼 얇고 반짝이는 부분이 배경으로 반쯤 지워져 끊겨 보이는 것을 막습니다. 바꾼 픽셀 수를 돌려줍니다.
export function solidifyThin({data,width,height}) {
  const sh=shoulderRow(data,width,height);if(!sh)return 0;
  const maxW=Math.max(3,Math.round(width*.03));let changed=0;
  for(let y=Math.max(0,sh.top-Math.round(height*.05));y<sh.row;y++){
    let start=-1;
    for(let x=0;x<=width;x++){
      const on=x<width&&data[(y*width+x)*4+3]>=30;
      if(on&&start<0)start=x;
      if(!on&&start>=0){
        if(x-start<=maxW)for(let k=start;k<x;k++){const i=(y*width+k)*4+3,a=data[i],na=Math.min(255,Math.round((a-30)*3+30));if(na>a){data[i]=na;changed++;}}
        start=-1;
      }
    }
  }
  return changed;
}

const isNeutral=(r,g,b)=>{const l=rgbToLab(r,g,b);return {neutral:Math.hypot(l[1],l[2])<14,gold:l[0]>35&&l[2]>18&&l[1]<14,dark:l[0]<40&&Math.hypot(l[1],l[2])<20};};
// 옷 색조 판별기: 옷의 대표 색(잘라낸 평균)과 색조(hue)가 비슷하고 채도가 충분하면 '옷'.
// 마네킹(크림색)·금색 꼭지·은색 고리·검은 옷걸이는 색조가 달라 빠집니다. 옷이 무채색이면 null(구분 불가).
function garmentTest(img) {
  let ref;try{ref=dominantLab(img);}catch{return null;}
  const rc=Math.hypot(ref.a,ref.b);if(rc<12)return null;
  const rh=Math.atan2(ref.b,ref.a),minC=Math.max(8,rc*.4),cache=new Map();
  return (r,g,b)=>{const k=(r<<16)|(g<<8)|b;let v=cache.get(k);if(v===undefined){const l=rgbToLab(r,g,b),c=Math.hypot(l[1],l[2]);let dh=Math.abs(Math.atan2(l[2],l[1])-rh);if(dh>Math.PI)dh=2*Math.PI-dh;v=c>=minC&&dh<=.55;if(cache.size<300000)cache.set(k,v);}return v;};
}

// 옷걸이 지우기: 맨 위에서 시작하는 '어두운 무채색 또는 가는 선' 덩어리(옷걸이 몸통+고리)를 지웁니다.
// 옷 색이 어두운 무채색(검정·진회색)이면 옷과 구분할 수 없어 아무것도 하지 않습니다. 지운 픽셀 수를 돌려줍니다.
export function removeHanger({data,width,height}) {
  const sh=shoulderRow(data,width,height);if(!sh)return 0;
  const isG=garmentTest({data,width,height});if(!isG)return 0;
  const n=width*height,cand=new Uint8Array(n);let garment=0,opaque=0;
  for(let p=0;p<n;p++){const a=data[p*4+3];if(a<30)continue;const g=isG(data[p*4],data[p*4+1],data[p*4+2]);
    if(a>=128){opaque++;if(g)garment++;}
    // 옷걸이 후보 = 옷 색조가 아닌 어두운 픽셀, 또는 어깨선 위의 옷 아닌 픽셀(고리)
    const y=Math.floor(p/width),c=isNeutral(data[p*4],data[p*4+1],data[p*4+2]);if(!g&&(c.dark||y<sh.row))cand[p]=1;}
  if(!opaque||garment<opaque*.5)return 0;
  // 맨 위 불투명 줄의 후보 픽셀에서 시작해 이어진 후보만
  const seen=new Uint8Array(n),stack=[];
  for(let y=sh.top;y<Math.min(height,sh.top+4);y++)for(let x=0;x<width;x++){const p=y*width+x;if(cand[p]){seen[p]=1;stack.push(p);}}
  const region=[];
  while(stack.length){const p=stack.pop();region.push(p);const x=p%width,y=(p-x)/width;
    for(const q of [x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1])if(q>=0&&!seen[q]&&cand[q]){seen[q]=1;stack.push(q);}}
  if(!region.length||region.length>opaque*.08)return 0;
  for(const p of region)data[p*4+3]=0;
  return region.length;
}

// 마네킹 꼭지·목 받침 지우기: 세로줄마다 '옷이 시작하는 높이'를 찾아, 그 위에 있는 마네킹 색(무채색·금색) 픽셀을 지웁니다.
// 후드를 올린 사진처럼 마네킹이 옷 안쪽에 있으면 그 줄의 옷이 더 위에서 시작하므로 남습니다.
// 옷이 무채색(흰·회·검정)이면 마네킹과 구분할 수 없어 아무것도 하지 않습니다. 지운 픽셀 수를 돌려줍니다.
export function removeMannequinTop({data,width,height}) {
  const isG=garmentTest({data,width,height});if(!isG)return 0;
  const n=width*height,kind=new Uint8Array(n);let opaque=0,garment=0;
  for(let p=0;p<n;p++){const a=data[p*4+3];if(a<30)continue;
    kind[p]=isG(data[p*4],data[p*4+1],data[p*4+2])?1:2;if(a>=128){opaque++;if(kind[p]===1)garment++;}}
  if(!opaque||garment<opaque*.4)return 0;
  // 세로줄마다 옷(유채색) 픽셀이 연달아 4개 이상 나오는 첫 높이 = 옷 시작
  const topG=new Int32Array(width).fill(height);
  for(let x=0;x<width;x++){let run=0;for(let y=0;y<height;y++){const p=y*width+x;if(kind[p]===1&&data[p*4+3]>=128){if(++run>=4){topG[x]=y-3;break;}}else run=0;}}
  // 옷 시작 높이를 양옆 1% 범위의 최소값으로 다듬어(올 사이 틈 때문에 튀는 것 방지)
  const r=Math.max(2,Math.round(width*.01)),smooth=new Int32Array(width);
  for(let x=0;x<width;x++){let m=height;for(let k=Math.max(0,x-r);k<=Math.min(width-1,x+r);k++)m=Math.min(m,topG[k]);smooth[x]=m;}
  let changed=0;const stack=[],seen=new Uint8Array(n);
  for(let x=0;x<width;x++)for(let y=0;y<smooth[x];y++){const p=y*width+x;if(kind[p]===2){data[p*4+3]=0;changed++;seen[p]=1;stack.push(p);}}
  // 지운 곳과 이어진 마네킹 색 픽셀(목선 안쪽으로 내려온 목·가슴, 남은 가는 조각)도 함께. 옷 색조 픽셀에서 멈춥니다.
  const extra=[];
  while(stack.length){const p=stack.pop(),x=p%width,y=(p-x)/width;
    for(const q of [x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1]){
      if(q<0||seen[q])continue;seen[q]=1;if(kind[q]===2&&data[q*4+3]>=30){extra.push(q);stack.push(q);}}}
  if(extra.length<=opaque*.25){for(const p of extra)data[p*4+3]=0;changed+=extra.length;}
  return changed;
}
