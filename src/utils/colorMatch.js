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

// 대표 색 = 옷 픽셀의 '잘라낸 평균'(위·아래 20%를 버린 평균). (예전: 가장 많은 색 한 칸 → 니트처럼 올 사이 밝은 곳·그늘이 반반인
// 원단에서 컷마다 밝은 칸/그늘 칸을 번갈아 골라 색감 통일이 오히려 차이를 키웠습니다. 보고서 001 참고)
// - 마네킹·흰 배경처럼 매우 밝은 무채색, 받침대·옷걸이처럼 아주 어두운 무채색은 옷이 그 색이 아닌 한 뺍니다.
// - 1차 값에서 많이 먼 픽셀(금색 꼭지 등)을 한 번 더 빼고 다시 계산합니다.
// 잘라낸 평균: 위·아래 20%씩 버리고 평균(중앙값은 밝은 올·그늘이 반반이면 둘 중 하나로 튀므로)
const median=a=>{const s=Float64Array.from(a).sort(),cut=Math.floor(s.length*.2);let t=0;for(let i=cut;i<s.length-cut;i++)t+=s[i];return t/Math.max(1,s.length-2*cut);};
const centerOf=list=>[0,1,2].map(k=>median(list.map(l=>l[k])));
export function dominantLab({data,width,height}) {
  const step=Math.max(1,Math.floor(Math.sqrt(width*height/250000)));
  const samples=[];
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
    const i=(y*width+x)*4;if(data[i+3]<200)continue;
    samples.push(rgbToLab(data[i],data[i+1],data[i+2]));
  }
  if(samples.length<50)throw new Error('색을 계산할 옷 영역이 부족합니다. 누끼·보정된 사진인지 확인하세요.');
  const chroma=l=>Math.hypot(l[1],l[2]);
  const neutralBright=l=>l[0]>86&&chroma(l)<7,neutralDark=l=>l[0]<14&&chroma(l)<6;
  const kept=samples.filter(l=>!neutralBright(l)&&!neutralDark(l));
  const pool=kept.length>=samples.length*.15?kept:samples;
  let c=centerOf(pool);
  const near=pool.filter(l=>Math.hypot(l[0]-c[0],l[1]-c[1],l[2]-c[2])<25);
  if(near.length>=pool.length*.3)c=centerOf(near);
  return {L:c[0],a:c[1],b:c[2],share:(near.length>=pool.length*.3?near.length:pool.length)/samples.length};
}

export const MAX_SHIFT={L:14,ab:12};
// 기준과 이미 충분히 비슷하면(ΔE 3 이하) 건드리지 않습니다(불필요한 보정·실물과 달라짐 방지).
export const SAME_ENOUGH=3;
export function colorShift(from,to,strength=1) {
  const k=Math.max(0,Math.min(1,strength)),clip=(v,m)=>Math.max(-m,Math.min(m,v));
  if(Math.hypot(to.L-from.L,to.a-from.a,to.b-from.b)<=SAME_ENOUGH)return {L:0,a:0,b:0};
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

// ---- 흰·밝은 옷 맑게(013-B) ----
// 사장님: 흰 가디건 정면 상단을 '좀 더 화사하고 맑게(누런 기·탁함)' 원하셨습니다. 실물과 달라 보이지 않게 약하게만 합니다.
//  - 대상: 옷 픽셀의 밝기 중앙값 70 이상, 채도 중앙값 18 이하(흰색·아이보리·연회색). 아니면 아무것도 하지 않습니다.
//  - 누런 기: 옷의 밝은 쪽(밝기 상위 25%) 평균 a·b를 '낀 색'으로 보고 그 60%만, 최대 5(Lab)까지 덜어 냅니다.
//    아이보리(b 약 +14)는 b +9 정도로 아이보리가 남고, 탁한 흰색(b 약 +7)은 +3 정도로 맑아집니다.
//    밝고 무채색에 가까운 픽셀에만 적용(채도 30 이상인 무늬·단추, 어두운 곳은 그대로).
//  - 밝기: 밝은 부분(L 56~100)을 최대 +3만 올리고 L 97을 넘기지 않습니다(결이 하얗게 날아가지 않게).
export const CLEAR_WHITE={minL:70,maxC:18,keep:.4,maxShift:5,lift:3,maxL:97};
// given={a,b}: 이미 계산한 이동값을 그대로 씁니다(014: 원본 해상도 디테일컷에 보정본과 같은 값을 다시 적용).
export function clearWhite({data,width,height},given=null) {
  if(given)return applyWhite(data,given.a,given.b),{applied:true,shift:{a:given.a,b:given.b}};
  const Ls=[],Cs=[],px=[];
  const step=Math.max(1,Math.floor(Math.sqrt(width*height/200000)));
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){const i=(y*width+x)*4;if(data[i+3]<200)continue;const l=rgbToLab(data[i],data[i+1],data[i+2]);Ls.push(l[0]);Cs.push(Math.hypot(l[1],l[2]));px.push(l);}
  if(px.length<50)return {applied:false};
  const med=a=>Float64Array.from(a).sort()[a.length>>1],mL=med(Ls),mC=med(Cs);
  if(mL<CLEAR_WHITE.minL||mC>CLEAR_WHITE.maxC)return {applied:false,medianL:Math.round(mL),medianC:Math.round(mC)};
  const q=Float64Array.from(Ls).sort()[Math.floor(Ls.length*.75)],bright=px.filter(l=>l[0]>=q&&Math.hypot(l[1],l[2])<30);
  const ca=bright.reduce((s,l)=>s+l[1],0)/bright.length,cb=bright.reduce((s,l)=>s+l[2],0)/bright.length;
  let sa=-ca*(1-CLEAR_WHITE.keep),sb=-cb*(1-CLEAR_WHITE.keep);const m=Math.hypot(sa,sb);if(m>CLEAR_WHITE.maxShift){sa*=CLEAR_WHITE.maxShift/m;sb*=CLEAR_WHITE.maxShift/m;}
  applyWhite(data,sa,sb);
  const r1=v=>Math.round(v*10)/10;
  return {applied:true,medianL:r1(mL),medianC:r1(mC),castBefore:{a:r1(ca),b:r1(cb)},castAfter:{a:r1(ca+sa),b:r1(cb+sb)},shift:{a:sa,b:sb}};
}
function applyWhite(data,sa,sb) {
  const cache=new Map();
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]===0)continue;
    const k=(data[i]<<16)|(data[i+1]<<8)|data[i+2];let out=cache.get(k);
    if(!out){
      const [L,a,b]=rgbToLab(data[i],data[i+1],data[i+2]),C=Math.hypot(a,b);
      const w=Math.max(0,Math.min(1,(L-50)/30))*Math.max(0,Math.min(1,1-C/30));
      const t=(L-78)/22,lift=L>=56?Math.max(0,CLEAR_WHITE.lift*(1-t*t)):0;
      const L2=L>=CLEAR_WHITE.maxL?L:Math.min(CLEAR_WHITE.maxL,L+lift);
      out=w>0||L2!==L?labToRgb(L2,a+sa*w,b+sb*w):[data[i],data[i+1],data[i+2]];
      if(cache.size<200000)cache.set(k,out);
    }
    data[i]=out[0];data[i+1]=out[1];data[i+2]=out[2];
  }
}
