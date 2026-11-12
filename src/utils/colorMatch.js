// 색감 통일: 기준 컷 옷의 '대표 색'(가장 넓게 차지하는 색)을 찾고,
// 다른 컷 전체를 그 색에 맞게 밝기(L)·색조(a,b)를 같은 양만큼 옮깁니다(CIE Lab).
// 브라우저에서만 계산하므로 API 비용이 없습니다. 투명 배경(누끼) 픽셀은 계산에서 뺍니다.

const lin=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
const gam=c=>255*(c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055);
const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;
const fi=t=>t**3>216/24389?t**3:(116*t-16)/(24389/27);
const LUT=new Float64Array(256).map((_,i)=>lin(i));

export function rgbToLab(r,g,b) {
  const R=LUT[r],G=LUT[g],B=LUT[b];
  const x=f((.4124564*R+.3575761*G+.1804375*B)/.95047),y=f(.2126729*R+.7151522*G+.072175*B),z=f((.0193339*R+.119192*G+.9503041*B)/1.08883);
  return [116*y-16,500*(x-y),200*(y-z)];
}
export function labToRgb(L,a,b) {
  const y=(L+16)/116,x=a/500+y,z=y-b/200;
  const X=fi(x)*.95047,Y=fi(y),Z=fi(z)*1.08883;
  const c=v=>Math.max(0,Math.min(255,Math.round(gam(v))));
  return [c(3.2404542*X-1.5371385*Y-.4985314*Z),c(-.969266*X+1.8760108*Y+.041556*Z),c(.0556434*X-.2040259*Y+1.0572252*Z)];
}

// 대표 색: 불투명 픽셀을 Lab 칸으로 나눠 가장 많은 칸(과 주변 칸)의 평균.
// 마네킹·흰 배경처럼 매우 밝고 무채색인 픽셀은 옷이 흰색이 아닌 한 제외합니다.
export function dominantLab({data,width,height}) {
  const step=Math.max(1,Math.floor(Math.sqrt(width*height/250000)));
  const bins=new Map(),samples=[];
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
    const i=(y*width+x)*4;if(data[i+3]<200)continue;
    const lab=rgbToLab(data[i],data[i+1],data[i+2]);samples.push(lab);
  }
  if(samples.length<50)throw new Error('색을 계산할 옷 영역이 부족합니다. 누끼·보정된 사진인지 확인하세요.');
  const neutralBright=l=>l[0]>86&&Math.hypot(l[1],l[2])<7;
  const colored=samples.filter(l=>!neutralBright(l));
  const pool=colored.length>=samples.length*.15?colored:samples;
  const key=l=>`${Math.floor(l[0]/8)},${Math.floor(l[1]/6)},${Math.floor(l[2]/6)}`;
  for(const l of pool){const k=key(l);bins.set(k,(bins.get(k)||0)+1);}
  let best=null,count=-1;for(const [k,n] of bins)if(n>count){best=k;count=n;}
  const [bl,ba,bb]=best.split(',').map(Number);let sum=[0,0,0],n=0;
  for(const l of pool){
    if(Math.abs(Math.floor(l[0]/8)-bl)<=1&&Math.abs(Math.floor(l[1]/6)-ba)<=1&&Math.abs(Math.floor(l[2]/6)-bb)<=1){sum[0]+=l[0];sum[1]+=l[1];sum[2]+=l[2];n++;}
  }
  return {L:sum[0]/n,a:sum[1]/n,b:sum[2]/n,share:n/pool.length};
}

export const MAX_SHIFT={L:14,ab:12};
export function colorShift(from,to,strength=1) {
  const k=Math.max(0,Math.min(1,strength)),clip=(v,m)=>Math.max(-m,Math.min(m,v));
  return {L:clip((to.L-from.L)*k,MAX_SHIFT.L),a:clip((to.a-from.a)*k,MAX_SHIFT.ab),b:clip((to.b-from.b)*k,MAX_SHIFT.ab)};
}

// 픽셀마다 같은 Lab 이동을 적용합니다. 투명도는 그대로 둡니다.
// 밝기 이동은 아주 밝거나 어두운 부분에서 줄여(하이라이트·그림자 보호) 날아가지 않게 합니다.
export function applyShift({data},shift) {
  const cache=new Map();
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]===0)continue;
    const k=(data[i]<<16)|(data[i+1]<<8)|data[i+2];
    let out=cache.get(k);
    if(!out){
      const [L,a,b]=rgbToLab(data[i],data[i+1],data[i+2]);
      const room=Math.min(1,Math.max(0,L/20),Math.max(0,(100-L)/20));
      out=labToRgb(L+shift.L*room,a+shift.a,b+shift.b);
      if(cache.size<200000)cache.set(k,out);
    }
    data[i]=out[0];data[i+1]=out[1];data[i+2]=out[2];
  }
}

export const labCss=({L,a,b})=>{const [r,g,bl]=labToRgb(L,a,b);return `rgb(${r},${g},${bl})`;};
