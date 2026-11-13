// IOPaint(사장님 PC에서 실행) 연결: 브라우저가 내 PC의 IOPaint(기본 http://127.0.0.1:8080)에 직접 요청합니다.
// 사진이 Vercel 서버를 거치지 않고, 비용도 없습니다. IOPaint가 꺼져 있으면 이 기능만 쓸 수 없습니다.
import {imageCanvas, loadImage} from './studioImages.js';

const KEY='iopaintUrl';
export const DEFAULT_IOPAINT_URL='http://127.0.0.1:8080';
export function getIopaintUrl() {try{return localStorage.getItem(KEY)||DEFAULT_IOPAINT_URL;}catch{return DEFAULT_IOPAINT_URL;}}
export function setIopaintUrl(url) {try{localStorage.setItem(KEY,url);}catch{}}

const base=url=>url.replace(/\/$/,'');
export async function checkIopaint(url=getIopaintUrl()) {
  try {
    const r=await fetch(`${base(url)}/api/v1/model`,{signal:AbortSignal.timeout(2500)});
    if(!r.ok)return {ok:false};
    const m=await r.json();return {ok:true,model:m.name||'lama'};
  } catch {return {ok:false};}
}

const toDataUrl=blob=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>rej(new Error('결과 사진을 읽지 못했습니다.'));fr.readAsDataURL(blob);});
const NOT_RUNNING='IOPaint에 연결할 수 없습니다. 내 PC에서 ‘IOPaint Start’를 실행했는지 확인하세요. 크롬이 "이 기기의 다른 앱에 액세스" 허용을 물으면 허용을 누르세요.';

// ---- BiRefNet 배경 지우기 (무료, 내 PC) ----
// IOPaint Start가 함께 켜는 작은 서버(public/iopaint/birefnet_server.py, 기본 http://127.0.0.1:8081)에 요청합니다.
export const DEFAULT_BIREFNET_URL='http://127.0.0.1:8081';
export function getBirefnetUrl() {try{return localStorage.getItem('birefnetUrl')||DEFAULT_BIREFNET_URL;}catch{return DEFAULT_BIREFNET_URL;}}
export function setBirefnetUrl(url) {try{localStorage.setItem('birefnetUrl',url);}catch{}}
export async function checkBirefnet(url=getBirefnetUrl()) {
  try {
    const r=await fetch(`${base(url)}/health`,{signal:AbortSignal.timeout(2500)});
    if(!r.ok)return {ok:false};
    const h=await r.json();return {ok:true,ready:Boolean(h.ready),error:h.error||null};
  } catch {return {ok:false};}
}
const BIREFNET_OFF='BiRefNet에 연결할 수 없습니다. 바탕화면의 ‘IOPaint Start’로 켰는지 확인하세요. 예전에 설치했다면 설치 파일(install-iopaint.bat)을 다시 받아 한 번 더 실행해야 BiRefNet이 추가됩니다.';
export async function removeBackground(src,url=getBirefnetUrl()) {
  const h=await checkBirefnet(url);
  if(!h.ok)throw new Error(BIREFNET_OFF);
  if(h.error)throw new Error(`BiRefNet 모델을 불러오지 못했습니다: ${h.error.slice(0,200)}`);
  if(!h.ready)throw new Error('BiRefNet 모델을 준비하는 중입니다(처음 한 번은 약 450MB를 내려받습니다). 검은 창에 “Ready”가 보이면 다시 누르세요.');
  let r;
  try {r=await fetch(`${base(url)}/remove`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:src}),signal:AbortSignal.timeout(600000)});}
  catch {throw new Error(BIREFNET_OFF);}
  if(!r.ok){let msg='';try{msg=(await r.json()).error||'';}catch{}throw new Error(`BiRefNet 배경 지우기 실패 (${r.status}) ${msg}`.trim());}
  return toDataUrl(await r.blob());
}

export const DEFECT_LABEL={stain:'얼룩',wrinkle:'구김',lint:'먼지·보풀',thread:'실밥',mannequin_mark:'마네킹 흔적',wall_mark:'벽 흔적',other:'기타'};

// Claude에 보낼 검사용 사진: 흰 배경에 합성, 긴 변 1024px JPG.
export async function inspectImage(src,side=1024) {
  const im=await loadImage(src),s=Math.min(1,side/Math.max(im.naturalWidth,im.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*s);c.height=Math.round(im.naturalHeight*s);
  const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);
  return {image:c.toDataURL('image/jpeg',.9),width:c.width,height:c.height};
}

// 영역(0~1000 비율)을 실제 픽셀 마스크로. 테두리까지 덮도록 조금 넓혀 타원으로 칠합니다.
export function maskFromRegions(width,height,regions,pad=.25) {
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);ctx.fillStyle='#fff';
  for(const r of regions){
    const x0=r.x0/1000*width,x1=r.x1/1000*width,y0=r.y0/1000*height,y1=r.y1/1000*height;
    const rx=Math.max(6,(x1-x0)/2*(1+pad)),ry=Math.max(6,(y1-y0)/2*(1+pad));
    ctx.beginPath();ctx.ellipse((x0+x1)/2,(y0+y1)/2,rx,ry,0,0,Math.PI*2);ctx.fill();
  }
  return c.toDataURL('image/png');
}

// 표시 미리보기: 사진 위에 번호가 붙은 상자를 그립니다.
export async function markedPreview(src,regions,selected) {
  const c=await imageCanvas(src),ctx=c.getContext('2d'),w=c.width,h=c.height,lw=Math.max(2,Math.round(Math.max(w,h)/400));
  ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';
  regions.forEach((r,i)=>{
    const on=selected.includes(i),x=r.x0/1000*w,y=r.y0/1000*h,bw=(r.x1-r.x0)/1000*w,bh=(r.y1-r.y0)/1000*h;
    ctx.strokeStyle=on?'#e0245e':'#9aa3af';ctx.lineWidth=lw;ctx.setLineDash(on?[]:[lw*3,lw*2]);ctx.strokeRect(x,y,bw,bh);
    const fs=Math.max(14,Math.round(Math.max(w,h)/45));ctx.font=`bold ${fs}px sans-serif`;ctx.setLineDash([]);
    ctx.fillStyle=on?'#e0245e':'#6b7280';ctx.fillRect(x,Math.max(0,y-fs-6),fs*1.4,fs+6);ctx.fillStyle='#fff';ctx.fillText(String(i+1),x+fs*.3,Math.max(fs,y-4));
  });
  return c.toDataURL('image/jpeg',.9);
}

// IOPaint(LaMa)로 지우기. 투명 배경(누끼)은 그대로 유지됩니다(IOPaint가 투명도를 다시 붙여 돌려줌).
export async function inpaint(src,regions,url=getIopaintUrl()) {
  const c=await imageCanvas(src),ctx=c.getContext('2d'),d=ctx.getImageData(0,0,c.width,c.height);
  // 투명한 곳의 색을 흰색으로 채워 경계 주변 채우기가 검게 번지지 않게 합니다.
  for(let i=0;i<d.data.length;i+=4)if(d.data[i+3]===0){d.data[i]=d.data[i+1]=d.data[i+2]=255;}
  ctx.putImageData(d,0,0);
  const body={image:c.toDataURL('image/png'),mask:maskFromRegions(c.width,c.height,regions)};
  let r;
  try {r=await fetch(`${base(url)}/api/v1/inpaint`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});}
  catch {throw new Error(NOT_RUNNING);}
  if(!r.ok)throw new Error(`IOPaint 처리 실패 (${r.status}).`);
  return toDataUrl(await r.blob());
}
