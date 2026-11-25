// 2차 보정(013): 구김은 '지우기'가 아니라 '그림자 펴기', 얼룩만 IOPaint로 지우기. 브라우저 계산, 무료.
//
// 왜: 넓은 구김을 LaMa로 지우면 니트 결 대신 흐린 평균색(회색빛)이 채워지고 후드 끈 같은 실제 부분까지 지워졌습니다(보고서 013).
// 구김은 대부분 밝기(그림자)의 완만한 변화입니다. 그래서
//  - 밝기(Lab의 L)를 큰 반경으로 흐린 '저주파'와 나머지 '고주파(니트 결·실 모양)'로 나누고(frequency separation),
//  - 표시한 곳 안의 저주파만 주변 옷의 저주파에 맞춰 평평하게 한 뒤 고주파를 그대로 다시 더합니다.
//  - 색(a·b)은 건드리지 않으므로 회색이 들어갈 수 없습니다. 마스크 경계는 부드럽게 섞습니다.
//  - 옷 색과 많이 다른 픽셀(마네킹 목·꼭지, 단추 등)은 바꾸지 않습니다.
// 고친 뒤에는 곳마다 전·후의 채도와 결 세기를 비교해, 회색으로 바랬거나 결이 사라졌으면 그곳만 원래대로 되돌립니다.
import {rgbToLab, labToRgb} from './colorMatch.js';

// 처리 방식 나누기 기준
export const SKIP_TYPES=['mannequin_mark','wall_mark'];          // 마네킹·벽: 2차 보정에서 제외(사장님 결정: 마네킹은 남김)
export const FLATTEN_TYPES=['wrinkle'];                          // 구김: 그림자 펴기
export const SPOT_MAX_SIDE=120;   // 얼룩 상자 한 변 상한(0~1000, 사진의 12%). 넘으면 넓은 얼룩 → 자동으로 지우지 않음
export const MAX_DELTA_L=18;      // 밝기를 옮기는 최대량(L 단위). 진한 그림자를 억지로 밝혀 색이 날아가지 않게
// 저주파 반경: 사진 긴 변의 0.3%(1500px에서 약 4.5px). 니트 코(약 6~8px)는 남고, 구김 그림자 줄(10~30px)은 저주파로 들어갑니다.
// 실제 분홍 니트로 1.2%(18px)·0.47%(7px)·0.27%(4px)를 비교해 가장 작은 쪽이 구김을 가장 잘 폈습니다(보고서 013).
export const SIGMA_LOW=.003;
export const SIGMA_REF=.027;      // 주변 밝기를 고르는 반경(긴 변의 2.7%)
// 결과 검사 기준(보고서 013 실험값 근거)
export const CHECK={chromaRatio:.9,blockChroma:.85,grayBlockShare:.1,hfRatio:.75,minChroma:6,block:16};

// 표시한 곳 나누기: {flatten:[구김], spot:[작은 얼룩·먼지·실밥], skipped:[{region,reason,review}]}
export function planFixes(regions) {
  const out={flatten:[],spot:[],skipped:[]};
  for(const r of regions){
    // 사장님이 직접 표시한 곳은 종류·크기와 상관없이 지우기(직접 고른 것이므로). 구김으로 표시했으면 그림자 펴기.
    if(r.manual){(FLATTEN_TYPES.includes(r.type)?out.flatten:out.spot).push(r);continue;}
    if(SKIP_TYPES.includes(r.type)){out.skipped.push({region:r,reason:'마네킹·벽은 2차 보정에서 제외',review:false});continue;}
    if(FLATTEN_TYPES.includes(r.type)){out.flatten.push(r);continue;}
    const w=r.x1-r.x0,h=r.y1-r.y0;
    if(r.shape!=='stroke'&&(w>SPOT_MAX_SIDE||h>SPOT_MAX_SIDE)){out.skipped.push({region:r,reason:'넓은 얼룩은 자동으로 지우지 않음',review:true});continue;}
    out.spot.push(r);
  }
  return out;
}

// ---- 마스크(DOM 없이 계산: 서버 검사에서도 씀) ----
// 영역(0~1000) → 픽셀 마스크(Uint8Array 0/1). 상자는 조금 넓힌 타원, 붓 자국은 굵은 선(iopaint.js의 maskFromRegions와 같은 모양).
export function regionMask(width,height,r,pad=.25) {
  const m=new Uint8Array(width*height);
  if(r.shape==='stroke'){
    const pts=(r.points||[]).map(p=>[p.x/1000*width,p.y/1000*height]),rad=Math.max(2,r.r/1000*width*(1+pad*.4));
    if(!pts.length)return m;
    const segs=pts.length===1?[[pts[0],pts[0]]]:pts.slice(1).map((p,k)=>[pts[k],p]);
    for(const [a,b] of segs){
      const x0=Math.max(0,Math.floor(Math.min(a[0],b[0])-rad)),x1=Math.min(width-1,Math.ceil(Math.max(a[0],b[0])+rad));
      const y0=Math.max(0,Math.floor(Math.min(a[1],b[1])-rad)),y1=Math.min(height-1,Math.ceil(Math.max(a[1],b[1])+rad));
      const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const t=len?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/len)):0,px=a[0]+t*dx-x,py=a[1]+t*dy-y;
        if(px*px+py*py<=rad*rad)m[y*width+x]=1;
      }
    }
    return m;
  }
  const x0=r.x0/1000*width,x1=r.x1/1000*width,y0=r.y0/1000*height,y1=r.y1/1000*height;
  const rx=Math.max(6,(x1-x0)/2*(1+pad)),ry=Math.max(6,(y1-y0)/2*(1+pad)),cx=(x0+x1)/2,cy=(y0+y1)/2;
  for(let y=Math.max(0,Math.floor(cy-ry));y<=Math.min(height-1,Math.ceil(cy+ry));y++)
    for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(width-1,Math.ceil(cx+rx));x++){
      const u=(x+.5-cx)/rx,v=(y+.5-cy)/ry;if(u*u+v*v<=1)m[y*width+x]=1;
    }
  return m;
}
// 마스크가 닿는 범위(픽셀) + 여유 margin
function boundsOf(m,width,height,margin) {
  let l=width,t=height,r=-1,b=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(m[y*width+x]){if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y;}
  if(r<0)return null;
  return {x:Math.max(0,l-margin),y:Math.max(0,t-margin),x1:Math.min(width-1,r+margin),y1:Math.min(height-1,b+margin)};
}

// ---- 흐림(가우시안 근사: 상자 흐림 3번, 크기와 상관없이 빠름) ----
function boxPass(src,dst,w,h,r,horizontal) {
  const n=horizontal?w:h,lines=horizontal?h:w,step=horizontal?1:w,lineStep=horizontal?w:1,inv=1/(2*r+1);
  for(let l=0;l<lines;l++){
    const base=l*lineStep;let acc=0;
    for(let k=-r;k<=r;k++)acc+=src[base+Math.max(0,Math.min(n-1,k))*step];
    for(let i=0;i<n;i++){
      dst[base+i*step]=acc*inv;
      acc+=src[base+Math.min(n-1,i+r+1)*step]-src[base+Math.max(0,i-r)*step];
    }
  }
}
export function blur(f,w,h,sigma) {
  if(sigma<.5)return Float32Array.from(f);
  const r=Math.max(1,Math.round(Math.sqrt(12*sigma*sigma/3+1)/2-.5));
  let a=Float32Array.from(f),b=new Float32Array(f.length);
  for(let k=0;k<3;k++){boxPass(a,b,w,h,r,true);boxPass(b,a,w,h,r,false);}
  return a;
}
// 가중 흐림: weight가 0인 픽셀(투명 배경·마스크 안)은 평균에 넣지 않음
function weightedBlur(f,wt,w,h,sigma) {
  const fw=new Float32Array(f.length);for(let i=0;i<f.length;i++)fw[i]=f[i]*wt[i];
  const a=blur(fw,w,h,sigma),b=blur(wt,w,h,sigma),out=new Float32Array(f.length);
  for(let i=0;i<f.length;i++)out[i]=b[i]>1e-4?a[i]/b[i]:NaN;
  return {value:out,weight:b};
}

// ---- 잘라 낸 범위의 Lab ----
function cropLab(img,box) {
  const {data,width}=img,w=box.x1-box.x+1,h=box.y1-box.y+1,L=new Float32Array(w*h),A=new Float32Array(w*h),B=new Float32Array(w*h),alpha=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=((box.y+y)*width+box.x+x)*4,p=y*w+x,[l,a,b]=rgbToLab(data[i],data[i+1],data[i+2]);
    L[p]=l;A[p]=a;B[p]=b;alpha[p]=data[i+3];
  }
  return {w,h,L,A,B,alpha};
}
const medianOf=arr=>{if(!arr.length)return 0;const s=Float64Array.from(arr).sort();return s[s.length>>1];};

// 결 세기(고주파 에너지): 밝기에서 작은 흐림(σ≈1.5px)을 뺀 값의 절댓값
function hfMap(L,w,h) {const b=blur(L,w,h,1.5),o=new Float32Array(L.length);for(let i=0;i<L.length;i++)o[i]=Math.abs(L[i]-b[i]);return o;}

// 고친 곳 검사: 마스크 안 옷 픽셀의 채도·결 세기 전후 비교 + 작은 칸마다 채도가 크게 떨어진 곳(회색 얼룩) 비율
export function inspectFix(before,after,mask,box,opts=CHECK) {
  const o={...CHECK,...opts},B=cropLab(before,box),Aft=cropLab(after,box),w=B.w,h=B.h;
  const hb=hfMap(B.L,w,h),ha=hfMap(Aft.L,w,h),{width}=before;
  let n=0,cb=0,ca=0,eb=0,ea=0;
  const blocks=new Map();
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;if(!mask[(box.y+y)*width+box.x+x]||B.alpha[p]<200)continue;
    const c0=Math.hypot(B.A[p],B.B[p]),c1=Math.hypot(Aft.A[p],Aft.B[p]);
    n++;cb+=c0;ca+=c1;eb+=hb[p];ea+=ha[p];
    const k=`${Math.floor(x/o.block)},${Math.floor(y/o.block)}`,s=blocks.get(k)||{n:0,c0:0,c1:0};s.n++;s.c0+=c0;s.c1+=c1;blocks.set(k,s);
  }
  if(!n)return {ok:true,pixels:0};
  const chromaBefore=cb/n,chromaAfter=ca/n,hfBefore=eb/n,hfAfter=ea/n;
  const full=[...blocks.values()].filter(s=>s.n>=o.block*o.block*.6),gray=full.filter(s=>s.c1<s.c0*o.blockChroma).length;
  const colorful=chromaBefore>=o.minChroma;   // 회색·흰·검정 옷은 채도 검사를 하지 않음
  const chromaRatio=chromaAfter/Math.max(1e-6,chromaBefore),hfRatio=hfAfter/Math.max(1e-6,hfBefore),grayShare=full.length?gray/full.length:0;
  const reasons=[];
  if(colorful&&chromaRatio<o.chromaRatio)reasons.push(`색이 바램(채도 ${Math.round(chromaRatio*100)}%)`);
  if(colorful&&full.length>=2&&grayShare>o.grayBlockShare)reasons.push(`회색 얼룩(${Math.round(grayShare*100)}%)`);
  if(hfBefore>.3&&hfRatio<o.hfRatio)reasons.push(`결이 흐려짐(${Math.round(hfRatio*100)}%)`);
  const r2=v=>Math.round(v*100)/100;
  return {ok:!reasons.length,reasons,pixels:n,chromaBefore:r2(chromaBefore),chromaAfter:r2(chromaAfter),chromaRatio:r2(chromaRatio),hfBefore:r2(hfBefore),hfAfter:r2(hfAfter),hfRatio:r2(hfRatio),grayShare:r2(grayShare)};
}

// 한 곳의 그림자 펴기(밝기만). img를 직접 바꾸고, 바꾼 픽셀 범위와 무게(되돌리기용)를 돌려줍니다.
function flattenOne(img,mask,opts) {
  const {width,height,data}=img,side=Math.max(width,height);
  const sLow=opts.sigmaLow??Math.max(3,side*SIGMA_LOW),sRef=opts.sigmaRef??Math.max(12,side*SIGMA_REF),sFeather=opts.sigmaFeather??Math.max(2,side*.006);
  const box=boundsOf(mask,width,height,Math.ceil(3*sRef));if(!box)return null;
  const C=cropLab(img,box),{w,h}=C,n=w*h,m=new Float32Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)m[y*w+x]=mask[(box.y+y)*width+box.x+x];
  // 주변 옷 색(마스크 밖 고리의 a·b 중앙값). 이 색과 많이 다른 픽셀(마네킹·단추 등)은 계산에도, 변경에도 넣지 않음
  const ring=blur(m,w,h,sRef*.5),ra=[],rb=[];
  for(let p=0;p<n;p++)if(!m[p]&&ring[p]>.02&&C.alpha[p]>=200){ra.push(C.A[p]);rb.push(C.B[p]);}
  if(ra.length<20)return null;
  const a0=medianOf(ra),b0=medianOf(rb),tol=Math.max(10,.4*Math.hypot(a0,b0));
  const same=new Float32Array(n);for(let p=0;p<n;p++)same[p]=C.alpha[p]>=200&&Math.hypot(C.A[p]-a0,C.B[p]-b0)<=tol?1:0;
  const low=weightedBlur(C.L,same,w,h,sLow).value;
  const out=new Float32Array(n);for(let p=0;p<n;p++)out[p]=same[p]&&!m[p]?1:0;
  const ref=weightedBlur(low.map(v=>Number.isFinite(v)?v:0),out,w,h,sRef);
  let fallback=0,fc=0;for(let p=0;p<n;p++)if(out[p]){fallback+=low[p];fc++;}fallback=fc?fallback/fc:0;
  const feather=blur(m,w,h,sFeather),sameSoft=blur(same,w,h,1),weight=new Float32Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;if(C.alpha[p]<200||!Number.isFinite(low[p]))continue;
    const f=Math.min(1,feather[p]*1.6)*sameSoft[p];if(f<.01)continue;
    const target=Number.isFinite(ref.value[p])&&ref.weight[p]>.02?ref.value[p]:fallback;
    const d=Math.max(-opts.maxDelta,Math.min(opts.maxDelta,target-low[p]));
    // 새 밝기 = 원래 밝기 + (주변 저주파 − 내 저주파) → 고주파(결)는 그대로, 색(a·b)은 그대로
    const [r,g,b]=labToRgb(Math.max(0,Math.min(100,C.L[p]+d*f)),C.A[p],C.B[p]),i=((box.y+y)*width+box.x+x)*4;
    data[i]=r;data[i+1]=g;data[i+2]=b;weight[p]=f;
  }
  return {box,weight};
}

const copyImage=img=>({width:img.width,height:img.height,data:new Uint8ClampedArray(img.data)});
// 검사에서 떨어진 곳을 원래대로(무게만큼 섞어서 경계가 티 나지 않게)
function restore(img,orig,box,weight) {
  const {width}=img,w=box.x1-box.x+1,h=box.y1-box.y+1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const f=weight?weight[y*w+x]:1;if(!f)continue;const i=((box.y+y)*width+box.x+x)*4;
    for(let k=0;k<3;k++)img.data[i+k]=orig.data[i+k];
  }
}

// 구김 여러 곳 펴기 + 곳마다 검사. 반환 {image, results:[{region, ok, reasons, ...}]}
export function flattenShadows(img,regions,opts={}) {
  const o={maxDelta:MAX_DELTA_L,...opts},out=copyImage(img),results=[];
  for(const r of regions){
    const mask=regionMask(img.width,img.height,r);
    const before=copyImage(out),done=flattenOne(out,mask,o);
    if(!done){results.push({region:r,ok:true,skipped:true,reasons:['주변 옷 색을 찾지 못해 건너뜀']});continue;}
    const check=inspectFix(before,out,mask,done.box);
    // 단추 검사: 밝기만 바꾸므로 단추가 새로 생길 수는 없고, 테두리가 뚜렷한 단추가 흐려졌는지만 봅니다.
    // (약한 후보는 구김 그림자 덩어리도 섞여 있어, 그림자를 펴면 "흐려짐"으로 잘못 걸림. 색이 다른 단추는 색을 안 바꾸므로 남음)
    if(check.ok&&o.buttons!==false){const lost=buttonsLost(before,out,findButtons(before,done.box,{strong:true}));if(lost){check.ok=false;check.reasons=[...check.reasons,`단추가 흐려짐(${lost}개)`];}}
    if(!check.ok)restore(out,before,done.box,done.weight);
    results.push({region:r,method:'flatten',...check,reverted:!check.ok});
  }
  return {image:out,results};
}

// ---- 얼룩(IOPaint) 준비·마무리 ----
// 투명한 곳을 '가까운 옷 색'으로 채운 사진(LaMa가 흰·검정 배경을 끌어오지 않게). 알파는 그대로 둡니다.
export function fillTransparent(img) {
  const {width:w,height:h,data}=img,n=w*h,out=copyImage(img),wt=new Float32Array(n),ch=[0,1,2].map(()=>new Float32Array(n));
  for(let p=0;p<n;p++)if(data[p*4+3]>=200){wt[p]=1;for(let k=0;k<3;k++)ch[k][p]=data[p*4+k];}
  if(!wt.some(Boolean))return out;
  const filled=new Uint8Array(n);for(let p=0;p<n;p++)filled[p]=wt[p]?1:0;
  for(const s of [4,16,48,Math.max(w,h)/4]){
    const b=blur(wt,w,h,s),vals=ch.map(c=>{const t=new Float32Array(n);for(let p=0;p<n;p++)t[p]=c[p]*wt[p];return blur(t,w,h,s);});
    for(let p=0;p<n;p++)if(!filled[p]&&b[p]>1e-3){for(let k=0;k<3;k++)out.data[p*4+k]=vals[k][p]/b[p];filled[p]=1;}
    if(filled.every(Boolean))break;
  }
  return out;
}
// IOPaint 결과를 원래 사진에 붙이기: 표시한 곳(부드러운 경계) 안의 색만 쓰고, 알파(누끼)는 원래 것을 다시 씌움.
// 곳마다 검사해서 떨어지면 그곳은 원래대로. 반환 {image, results}
export function mergeSpots(orig,inpainted,regions,opts={}) {
  const {width,height}=orig,side=Math.max(width,height),out=copyImage(orig),results=[];
  for(const r of regions){
    const mask=regionMask(width,height,r),box=boundsOf(mask,width,height,Math.ceil(side*.01));if(!box)continue;
    const w=box.x1-box.x+1,h=box.y1-box.y+1,m=new Float32Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)m[y*w+x]=mask[(box.y+y)*width+box.x+x];
    const f=blur(m,w,h,opts.sigmaFeather??Math.max(1.5,side*.003)),before=copyImage(out),weight=new Float32Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const p=y*w+x,v=Math.min(1,f[p]*1.5),i=((box.y+y)*width+box.x+x)*4;if(v<.01||orig.data[i+3]===0)continue;
      for(let k=0;k<3;k++)out.data[i+k]=Math.round(out.data[i+k]*(1-v)+inpainted.data[i+k]*v);
      weight[p]=v;
    }
    const check=inspectFix(before,out,mask,box,{...opts,hfRatio:opts.hfRatio??.6});
    if(check.ok&&opts.buttons!==false){
      const side2=Math.ceil(Math.max(width,height)*.03),bb={x:Math.max(0,box.x-side2),y:Math.max(0,box.y-side2),x1:Math.min(width-1,box.x1+side2),y1:Math.min(height-1,box.y1+side2)};
      // 표시한 상자 안에 중심이 있는 '단추 후보'는 지우려는 얼룩 자체(둥근 얼룩)로 봅니다. 진짜 단추에 닿는 표시는 처음부터 IOPaint로 보내지 않습니다(nearButtons).
      const inBox=bt=>bt.x>=r.x0/1000*width&&bt.x<=r.x1/1000*width&&bt.y>=r.y0/1000*height&&bt.y<=r.y1/1000*height;
      // 새로 생긴 단추(LaMa가 주변 단추를 복제)는 상자 안이어도 셉니다.
      const was=findButtons(before,bb),lost=buttonsLost(before,out,was.filter(bt=>!inBox(bt))),now=findButtons(out,bb),added=now.filter(p=>!was.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<=Math.max(p.r,q.r)*1.5)).length;
      if(lost||added){check.ok=false;check.reasons=[...check.reasons,`단추 수가 바뀜(없어짐 ${lost}·생김 ${added})`];}
    }
    if(!check.ok)restore(out,before,box,weight);
    results.push({region:r,method:'spot',...check,reverted:!check.ok});
  }
  return {image:out,results};
}

// 마네킹·다른 색 부분 위의 표시인지: 표시 '주변'(표시 밖 고리)의 옷 픽셀 중 대표 옷 색(a·b)과 가까운 비율.
// 얼룩 자체는 원래 색이 다르므로 표시 안이 아니라 주변을 봅니다. 절반 미만이면 마네킹·다른 부분으로 보고 건너뜁니다.
export const GARMENT_SHARE_MIN=.5;
export function garmentShare(img,r,lab) {
  const {width,height,data}=img,inner=regionMask(width,height,r),outer=regionMask(width,height,r,.8),tol=Math.max(10,.4*Math.hypot(lab.a,lab.b));
  let n=0,near=0;
  for(let p=0;p<inner.length;p++){if(!outer[p]||inner[p]||data[p*4+3]<200)continue;n++;const [,a,b]=rgbToLab(data[p*4],data[p*4+1],data[p*4+2]);if(Math.hypot(a-lab.a,b-lab.b)<=tol)near++;}
  return n?near/n:0;
}

// ---- 단추·부자재 보호(013-B) ----
// 사장님 2차 시험: 흰 가디건에서 지우기 과정 중 단추가 사라지고(정면 확대), 없던 단추가 희미하게 생겼습니다(정면 하단, LaMa가 주변 단추를 복제).
// 단추 후보 = 옷 위의 '둥근 테두리'. 밝기 경계마다 기울기 방향(안·밖 두 쪽)으로 반지름 r만큼 떨어진 곳에 표를 던져,
// 둘레의 많은 부분이 같은 중심을 가리키면 원(단추)으로 봅니다(허프 원 찾기). 색이 옷과 같은 단추(분홍 니트의 분홍 단추)도 테두리로 찾습니다.
//  - 반지름: 사진 긴 변의 0.6~2.3%(니트 코보다 크고 단추 크기 범위). 계산은 긴 변 800px로 줄여서 합니다.
export const BUTTON={rMin:.006,rMax:.023,ring:.6,ringWeak:.35,smooth:.8,dE:6,edge:6};
export function findButtons(img,box=null,opts={}) {
  const o={...BUTTON,...opts},{width,height}=img,side=Math.max(width,height),s=Math.min(1,(opts.maxSide||1600)/side);
  const b=box||{x:0,y:0,x1:width-1,y1:height-1};
  // 줄인 밝기(투명은 제외)
  const bw=Math.max(3,Math.round((b.x1-b.x+1)*s)),bh=Math.max(3,Math.round((b.y1-b.y+1)*s)),n=bw*bh,L=new Float32Array(n),A=new Float32Array(n),B=new Float32Array(n),al=new Uint8Array(n);
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
    const sx=Math.min(width-1,Math.round(b.x+(x+.5)/s-.5)),sy=Math.min(height-1,Math.round(b.y+(y+.5)/s-.5)),i=(sy*width+sx)*4;
    const lab=rgbToLab(img.data[i],img.data[i+1],img.data[i+2]);L[y*bw+x]=lab[0];A[y*bw+x]=lab[1];B[y*bw+x]=lab[2];al[y*bw+x]=img.data[i+3]>=200?1:0;
  }
  const Ls=blur(L,bw,bh,1),gx=new Float32Array(n),gy=new Float32Array(n),edges=[];
  for(let y=1;y<bh-1;y++)for(let x=1;x<bw-1;x++){
    const p=y*bw+x;if(!al[p])continue;
    const X=(Ls[p-bw+1]+2*Ls[p+1]+Ls[p+bw+1])-(Ls[p-bw-1]+2*Ls[p-1]+Ls[p+bw-1]),Y=(Ls[p+bw-1]+2*Ls[p+bw]+Ls[p+bw+1])-(Ls[p-bw-1]+2*Ls[p-bw]+Ls[p-bw+1]);
    const m=Math.hypot(X,Y)/4;if(m>o.edge)edges.push(x,y,X/(4*m),Y/(4*m));
  }
  const rMin=Math.max(3,Math.round(side*o.rMin*s)),rMax=Math.max(rMin+1,Math.round(side*o.rMax*s)),acc=new Float32Array(n),cand=[];
  const isEdge=new Uint8Array(n),ex=new Float32Array(n),ey=new Float32Array(n);
  for(let k=0;k<edges.length;k+=4){const p=edges[k+1]*bw+edges[k];isEdge[p]=1;ex[p]=edges[k+2];ey[p]=edges[k+3];}
  for(let r=rMin;r<=rMax;r++){
    acc.fill(0);
    for(let k=0;k<edges.length;k+=4)for(const sg of [1,-1]){const cx=Math.round(edges[k]+sg*r*edges[k+2]),cy=Math.round(edges[k+1]+sg*r*edges[k+3]);if(cx>=0&&cy>=0&&cx<bw&&cy<bh)acc[cy*bw+cx]++;}
    const sum=blur(acc,bw,bh,1),need=Math.PI*r*.5/9;   // 3×3 정도로 모은 표(반올림 흩어짐 보정). 둘레의 절반쯤이 가리키면 후보
    for(let y=r;y<bh-r;y++)for(let x=r;x<bw-r;x++){
      const p=y*bw+x;if(!al[p]||sum[p]<need)continue;
      let peak=true;for(let dy=-2;dy<=2&&peak;dy++)for(let dx=-2;dx<=2;dx++)if((dx||dy)&&sum[p+dy*bw+dx]>sum[p]){peak=false;break;}
      if(peak)cand.push({x,y,r});
    }
  }
  // 확인(둘 중 하나):
  //  ① 둘레 24방향 중 60% 이상에 둥근 테두리 (흰 옷의 흰 단추처럼 색 차이가 없어도 테두리가 뚜렷한 단추)
  //  ② 둘레 35% 이상 + 안쪽이 바깥 고리보다 매끈(결 80% 미만) + 안·밖 평균 색 차이 ΔE 6 이상
  //     (실제 분홍 니트의 분홍 단추: 테두리 0.38~0.58, 안쪽 채도 36~41 vs 니트 28~31)
  const found=[],dirs=24;
  const stat=(cx,cy,r0,r1)=>{let sl=0,sa=0,sb=0,sq=0,c=0;for(let y=Math.floor(cy-r1);y<=cy+r1;y++)for(let x=Math.floor(cx-r1);x<=cx+r1;x++){if(x<0||y<0||x>=bw||y>=bh)continue;const d=Math.hypot(x-cx,y-cy);if(d<r0||d>r1)continue;const p=y*bw+x;if(!al[p])continue;const v=L[p]-Ls[p];sq+=v*v;sl+=L[p];sa+=A[p];sb+=B[p];c++;}return c?{L:sl/c,a:sa/c,b:sb/c,tex:Math.sqrt(sq/c)}:null;};
  for(const c of cand){
    let hit=0;
    for(let k=0;k<dirs;k++){
      const t=2*Math.PI*k/dirs,ux=Math.cos(t),uy=Math.sin(t);let ok=false;
      for(const dr of [-1,0,1]){const x=Math.round(c.x+(c.r+dr)*ux),y=Math.round(c.y+(c.r+dr)*uy);if(x<0||y<0||x>=bw||y>=bh)continue;const p=y*bw+x;if(isEdge[p]&&Math.abs(ex[p]*ux+ey[p]*uy)>.75){ok=true;break;}}
      if(ok)hit++;
    }
    const ring=hit/dirs;if(ring<o.ringWeak)continue;
    const inner=stat(c.x,c.y,0,c.r*.6),outer=stat(c.x,c.y,c.r*1.4,c.r*2.2);if(!inner||!outer)continue;
    const dE=Math.hypot(inner.L-outer.L,inner.a-outer.a,inner.b-outer.b),smooth=inner.tex<outer.tex*o.smooth;
    if(o.debug)o.debug.push({x:b.x+(c.x+.5)/s,y:b.y+(c.y+.5)/s,r:c.r/s,ring,dE,smooth});
    if(!(ring>=o.ring||(smooth&&dE>=o.dE)))continue;
    found.push({...c,sc:ring});
  }
  found.sort((p,q)=>q.sc-p.sc);const keep=[];
  for(const f of found)if(!keep.some(k=>Math.hypot(k.x-f.x,k.y-f.y)<Math.max(k.r,f.r)))keep.push(f);
  return keep.filter(k=>!o.strong||k.sc>=o.ring).map(k=>({x:b.x+(k.x+.5)/s-.5,y:b.y+(k.y+.5)/s-.5,r:k.r/s,score:Math.round(k.sc*100)/100}));
}
// 단추 둘레 보호 마스크(단추 반지름 + 여유)
export function buttonGuard(width,height,buttons,margin=null) {
  const m=new Uint8Array(width*height),side=Math.max(width,height),pad=margin??Math.max(4,side*.006);
  for(const bt of buttons){const R=bt.r+pad;for(let y=Math.max(0,Math.floor(bt.y-R));y<=Math.min(height-1,Math.ceil(bt.y+R));y++)for(let x=Math.max(0,Math.floor(bt.x-R));x<=Math.min(width-1,Math.ceil(bt.x+R));x++)if((x-bt.x)**2+(y-bt.y)**2<=R*R)m[y*width+x]=1;}
  return m;
}
// 전·후 단추 비교: 사라졌거나 새로 생긴 단추 수. strong: 테두리가 뚜렷한 후보만(약한 후보는 밝기만 바꿔도 흔들려서 구김 펴기 검사에는 쓰지 않음)
export function buttonChange(before,after,box,{strong=false}={}) {
  const a=findButtons(before,box,{strong}),b=findButtons(after,box,{strong}),match=(p,list)=>list.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<=Math.max(p.r,q.r)*1.5);
  return {before:a.length,after:b.length,lost:a.filter(p=>!match(p,b)).length,added:b.filter(p=>!match(p,a)).length};
}
// 단추가 남아 있는지: 전에 찾은 단추마다 안쪽·바깥 고리의 평균 색 차이(ΔE)가 전의 60% 이상 남았는지(다시 찾기보다 안정적).
export function buttonsLost(before,after,buttons) {
  const {width,height}=before;
  const meanLab=(img,bt,r0,r1)=>{let l=0,a=0,b=0,c=0;for(let y=Math.max(0,Math.floor(bt.y-r1));y<=Math.min(height-1,bt.y+r1);y++)for(let x=Math.max(0,Math.floor(bt.x-r1));x<=Math.min(width-1,bt.x+r1);x++){const d=Math.hypot(x-bt.x,y-bt.y);if(d<r0||d>r1)continue;const i=(y*width+x)*4;if(img.data[i+3]<200)continue;const v=rgbToLab(img.data[i],img.data[i+1],img.data[i+2]);l+=v[0];a+=v[1];b+=v[2];c++;}return c?[l/c,a/c,b/c]:null;};
  const dE=(img,bt)=>{const i=meanLab(img,bt,0,bt.r*.6),o=meanLab(img,bt,bt.r*1.4,bt.r*2.2);return i&&o?Math.hypot(i[0]-o[0],i[1]-o[1],i[2]-o[2]):0;};
  return buttons.filter(bt=>{const d0=dE(before,bt);return d0>=3&&dE(after,bt)<d0*.6;}).length;
}
// 얼룩 표시 중 단추(후보) 둘레에 닿는 것: IOPaint(LaMa)는 주변 단추를 지우거나 복제하므로 보내지 않음
export function nearButtons(img,regions,buttons) {
  const {width,height}=img,guard=buttonGuard(width,height,buttons);
  return regions.map(r=>{const m=regionMask(width,height,r);for(let p=0;p<m.length;p++)if(m[p]&&guard[p])return true;return false;});
}
