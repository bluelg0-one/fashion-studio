// 자동 수평 맞추기 (브라우저 계산, 무료)
// 매장 사진은 마네킹 기둥·목 축(세로), 벽돌 줄·문틀(가로·세로)처럼 원래 곧은 선이 많습니다.
// 사진 속 경계선을 모아 -10°~+10°를 0.1° 간격으로 돌려 보며, 세로선은 같은 x에, 가로선은 같은 y에
// 가장 많이 모이는(선이 곧게 서는) 각도를 찾습니다(투영 프로파일 방식). 세로·가로 근거를 함께 쓰고,
// 뚜렷한 최고점이 없으면(신뢰도 낮음) 돌리지 않습니다.
//
// 각도 부호: canvas의 ctx.rotate(각도)와 같습니다(+는 화면에서 시계 방향). 반환한 angle만큼 돌리면 바로 섭니다.
// (원본이 반시계 방향으로 3° 돌아가 있으면 angle ≈ +3)

export const LEVEL_RANGE=10;          // ±10°
export const LEVEL_STEP=.1;           // 0.1° 단위
export const LEVEL_MIN_CONFIDENCE=.25; // 이보다 낮으면 돌리지 않음

const rad=d=>d*Math.PI/180;

// 밝기 → 소벨 경계 → 세로선 점(가로 방향 기울기가 큰 점)과 가로선 점
export function edgePoints({data,width,height},{maxPoints=40000}={}) {
  const lum=new Float32Array(width*height);
  for(let p=0,i=0;p<lum.length;p++,i+=4)lum[p]=data[i+3]<16?255:.299*data[i]+.587*data[i+1]+.114*data[i+2];
  const mags=[],cand=[];
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const p=y*width+x,a=lum[p-width-1],b=lum[p-width],c=lum[p-width+1],d=lum[p-1],f=lum[p+1],g=lum[p+width-1],h=lum[p+width],k=lum[p+width+1];
    const gx=(c+2*f+k)-(a+2*d+g),gy=(g+2*h+k)-(a+2*b+c),m=Math.abs(gx)+Math.abs(gy);
    if(m<40)continue;
    // 세로선: 가로 기울기가 세로보다 훨씬 큼(±~20° 안쪽) / 가로선: 반대
    if(Math.abs(gx)>2.5*Math.abs(gy))cand.push(x,y,0,m);
    else if(Math.abs(gy)>2.5*Math.abs(gx))cand.push(x,y,1,m);
    else continue;
    mags.push(m);
  }
  if(!mags.length)return {v:[],h:[]};
  // 강한 경계만(상위 약 40%) · 너무 많으면 고르게 줄이기
  const sorted=[...mags].sort((p,q)=>p-q),th=sorted[Math.floor(sorted.length*.6)];
  const v=[],h=[],n=cand.length/4,keep=Math.max(1,Math.ceil(n/maxPoints));
  for(let i=0,j=0;i<cand.length;i+=4,j++){
    if(cand[i+3]<th||j%keep)continue;
    (cand[i+2]?h:v).push(cand[i],cand[i+1]);
  }
  return {v,h};
}

// 각도 a에서 점들을 돌렸을 때 세로선 점의 x(가로선은 y)가 얼마나 같은 자리에 모이는지(제곱합)
function sharpness(pts,axis,a,cx,cy) {
  if(!pts.length)return 0;
  const cos=Math.cos(rad(a)),sin=Math.sin(rad(a)),bins=new Map();
  for(let i=0;i<pts.length;i+=2){
    const dx=pts[i]-cx,dy=pts[i+1]-cy;
    const coord=axis===0?cx+dx*cos-dy*sin:cy+dx*sin+dy*cos;
    const b=Math.round(coord);bins.set(b,(bins.get(b)||0)+1);
  }
  let s=0;for(const c of bins.values())s+=c*c;
  return s/(pts.length/2);
}

// 기울기 추정. 반환 {angle, confidence, votes:{vertical, horizontal}}. 신뢰도가 낮으면 angle 0.
export function estimateTilt(image,{range=LEVEL_RANGE,step=LEVEL_STEP,minConfidence=LEVEL_MIN_CONFIDENCE}={}) {
  const {width,height}=image,{v,h}=edgePoints(image),cx=width/2,cy=height/2;
  const angles=[];for(let a=-range;a<=range+1e-9;a+=step)angles.push(Math.round(a*100)/100);
  const curve=(pts,axis)=>angles.map(a=>sharpness(pts,axis,a,cx,cy));
  const cv=curve(v,0),ch=curve(h,1);
  // 각 곡선을 자기 중앙값으로 나눠 같은 무게로 합침(점 수가 많은 쪽이 혼자 정하지 않게)
  const norm=c=>{const s=[...c].sort((p,q)=>p-q),med=s[Math.floor(s.length/2)]||0;return c.map(x=>med?x/med-1:0);};
  const nv=norm(cv),nh=norm(ch),total=angles.map((_,i)=>nv[i]+nh[i]);
  let best=0;for(let i=1;i<total.length;i++)if(total[i]>total[best])best=i;
  // 신뢰도: 최고점이 다른 각도들보다 얼마나 뚜렷한지(최고점 ±1.5° 밖의 두 번째 봉우리와 비교)
  const away=total.filter((_,i)=>Math.abs(angles[i]-angles[best])>1.5);
  const second=away.length?Math.max(...away):0,peak=total[best];
  const confidence=peak<=0?0:Math.max(0,Math.min(1,(peak-Math.max(0,second))/peak));
  const vertical=v.length?angles[nv.indexOf(Math.max(...nv))]:null,horizontal=h.length?angles[nh.indexOf(Math.max(...nh))]:null;
  const angle=confidence>=minConfidence&&peak>.05?angles[best]:0;
  return {angle,confidence:Math.round(confidence*100)/100,votes:{vertical,horizontal,points:(v.length+h.length)/2}};
}

// 같은 크기 안에서 회전(가운데 기준). fill: 빈 모서리 색(누끼 전 원본은 벽 색, 누끼 결과는 투명).
// scale: 가운데 기준 확대(확대·디테일 컷을 돌릴 때 모서리가 비지 않게 안쪽으로 잘라 냄, coverScale).
export function rotateCanvas(src,angle,fill=null,scale=1) {
  const c=document.createElement('canvas');c.width=src.width;c.height=src.height;
  const ctx=c.getContext('2d');
  if(fill){ctx.fillStyle=fill;ctx.fillRect(0,0,c.width,c.height);}
  ctx.imageSmoothingQuality='high';
  ctx.translate(c.width/2,c.height/2);ctx.rotate(rad(angle));if(scale!==1)ctx.scale(scale,scale);ctx.drawImage(src,-src.width/2,-src.height/2);
  return c;
}

// ---- 자동 수평 안전장치(013) ----
// 사장님 실전 시험: 정면 확대 컷이 반시계로 너무 돌아가 삐뚤어졌고, 원단 디테일 컷은 아래 가장자리가 사선으로 잘렸습니다.
// - 자동으로 돌리는 컷: 정면 전체·측면·후면만(곧은 마네킹 기둥·벽이 보이는 컷). 확대·상단·하단·원단·디테일·모델컷은 자동 회전 꺼짐(직접 돌리기는 됨).
// - 근거 2가지(세로선·가로선)가 모두 있고, 같은 방향·비슷한 각도(차이 1° 이내)일 때만 돌림. 최대 ±4°(넘으면 돌리지 않고 확인 필요).
// - 확대·디테일 컷을 직접 돌리면 모서리가 비지 않게 안쪽으로 잘라 냅니다(coverScale만큼 확대).
export const AUTO_LEVEL_SLOTS=['hero','side','back'];
export const AUTO_LEVEL_MAX=4;
export const VOTE_AGREE=1;
export const AUTO_LEVEL_SHOTS=['front','side','back'];   // 분류 결과의 컷 종류(정면 전체·측면·후면)
// 분류 결과(shot)가 있으면 그것으로, 없으면 칸 이름으로 정함
export const autoLevelAllowed=(slotId,shot)=>shot&&shot!=='unknown'?AUTO_LEVEL_SHOTS.includes(shot):AUTO_LEVEL_SLOTS.includes(slotId);
// 모서리가 비지 않으려면 얼마나 확대해야 하는지(돌린 사진이 원래 사각형을 다 덮는 배율)
export function coverScale(width,height,angle) {
  const t=Math.abs(rad(angle)),c=Math.cos(t),s=Math.sin(t);
  return Math.max(c+height/width*s,c+width/height*s);
}
// 추정 결과로 실제로 돌릴지 정함. 반환 {angle, reason(돌리지 않은 이유 또는 null), review(확인 필요)}
export function decideLevel(est,{max=AUTO_LEVEL_MAX,agree=VOTE_AGREE}={}) {
  const a=est.angle,{vertical:v,horizontal:h}=est.votes||{};
  if(!a)return {angle:0,reason:est.confidence!=null&&est.confidence<LEVEL_MIN_CONFIDENCE?'곧은 선이 부족해 돌리지 않음':null,review:false};
  if(v==null||h==null)return {angle:0,reason:'세로·가로 근거 중 하나만 있어 돌리지 않음',review:false};
  const opposite=Math.abs(v)>=.3&&Math.abs(h)>=.3&&Math.sign(v)!==Math.sign(h);
  if(opposite||Math.abs(v-h)>agree||Math.abs(a-v)>agree||Math.abs(a-h)>agree)return {angle:0,reason:`세로선(${v}°)·가로선(${h}°) 근거가 서로 달라 돌리지 않음`,review:false};
  if(Math.abs(a)>max)return {angle:0,reason:`계산 각도 ${a}°가 최대 ±${max}°를 넘어 돌리지 않음`,review:true};
  return {angle:a,reason:null,review:false};
}

// 사진 가장자리의 대표 색(중앙값) — 회전으로 생긴 모서리를 벽 색으로 채워 누끼 때 배경으로 지워지게 합니다.
export function borderColor({data,width,height}) {
  const r=[],g=[],b=[],add=p=>{r.push(data[p*4]);g.push(data[p*4+1]);b.push(data[p*4+2]);};
  for(let x=0;x<width;x+=4){add(x);add((height-1)*width+x);}
  for(let y=0;y<height;y+=4){add(y*width);add(y*width+width-1);}
  const med=a=>a.sort((p,q)=>p-q)[a.length>>1];
  return `rgb(${med(r)},${med(g)},${med(b)})`;
}

// 추정용으로 긴 변 600px 정도로 줄인 사진에서 계산합니다(각도는 크기와 상관없음).
export function estimateCanvasTilt(canvas,opts) {
  const s=Math.min(1,600/Math.max(canvas.width,canvas.height));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(canvas.width*s));c.height=Math.max(1,Math.round(canvas.height*s));
  const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0,c.width,c.height);
  return estimateTilt(ctx.getImageData(0,0,c.width,c.height),opts);
}
