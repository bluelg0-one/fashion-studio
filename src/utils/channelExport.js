// 채널별 내보내기: 완성 사진(최종 버전)을 채널 규격(channelSpecs.js)에 맞춰 한 번에 ZIP으로 묶습니다.
// 모두 브라우저에서 계산합니다(API 비용 없음).
import JSZip from 'jszip';
import {loadImage} from './studioImages.js';
import {shopeePhotos} from './shopeeExport.js';
import {CHANNELS, DEFAULT_MARGIN} from './channelSpecs.js';

// 사진 순서는 쇼피·인스타와 같습니다: 대표 → 모델컷 → 디테일(상세페이지에 포함한 컷).
export const channelPhotos=(slots,fitEnabled)=>shopeePhotos(slots,fitEnabled);

const toBlob=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('사진 변환에 실패했습니다.')),type,quality));

// 옷이 있는 영역 찾기: 투명하지 않고 흰 배경(밝기 245 이상)도 아닌 픽셀의 범위.
// 누끼(투명)와 흰 배경 완성 사진 모두에서 동작합니다.
export function contentBox(canvas) {
  const {width,height}=canvas,{data}=canvas.getContext('2d').getImageData(0,0,width,height);
  let l=width,t=height,r=-1,b=-1;
  for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){
    const i=(y*width+x)*4;
    if(data[i+3]>128&&!(data[i]>245&&data[i+1]>245&&data[i+2]>245)){if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y;}
  }
  return r<l?null:{x:l,y:t,w:Math.min(width,r+2)-l,h:Math.min(height,b+2)-t};
}

// 흰 배경 W×H에 옷을 같은 여백으로 가운데 배치합니다. framePhoto와 같은 방식이지만 절대 자르지 않습니다.
// (framePhoto는 가장자리까지 찬 접사 컷을 비율에 맞춰 잘라 채우므로, 판매 채널용에서는 쓰지 않습니다.)
// 가장자리까지 찬 사진(접사·배경 있는 모델컷)은 사진 전체를 여백 없이 넣고 남는 곳은 흰색으로 둡니다.
export function placeOnWhite(source,[W,H],margin=DEFAULT_MARGIN,background='#ffffff') {
  const out=document.createElement('canvas');out.width=W;out.height=H;
  const ctx=out.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,W,H);ctx.imageSmoothingQuality='high';
  const box=contentBox(source),edge=4;
  const full=!box||box.x<=edge||box.y<=edge||box.x+box.w>=source.width-edge||box.y+box.h>=source.height-edge;
  const src=full?{x:0,y:0,w:source.width,h:source.height}:box;
  const m=full?0:Math.max(0,Math.min(30,margin))/100;
  const s=Math.min(W*(1-2*m)/src.w,H*(1-2*m)/src.h);
  const w=src.w*s,h=src.h*s;
  ctx.drawImage(source,src.x,src.y,src.w,src.h,(W-w)/2,(H-h)/2,w,h);
  return out;
}

async function sourceCanvas(src) {
  const im=await loadImage(src),c=document.createElement('canvas');
  c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);
  return c;
}

// 규격 크기로 만든 뒤 용량을 넘으면 JPG 화질 → 크기 순으로 낮춥니다(비율은 유지).
export async function renderForSpec(source,spec,margin=DEFAULT_MARGIN) {
  let [W,H]=spec.size;
  const minScale=.6;
  for(let scale=1;scale>=minScale-1e-9;scale-=.1){
    const size=[Math.round(W*scale),Math.round(H*scale)];
    const c=placeOnWhite(source,size,margin,spec.background);
    for(const quality of [.92,.86,.8,.72,.64]){
      const blob=await toBlob(c,spec.format,quality);
      if(blob.size<=spec.maxBytes)return {blob,width:size[0],height:size[1],quality};
    }
  }
  throw new Error(`사진을 ${Math.round(spec.maxBytes/1024/1024)}MB 이하로 줄이지 못했습니다.`);
}

// 파일 이름: 상품명_채널_순번.jpg (윈도우에서 쓸 수 없는 문자만 바꿉니다. 한글은 그대로 둡니다.)
export const safeName=name=>String(name||'').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,60)||`상품-${new Date().toISOString().slice(0,10)}`;
const pad=n=>String(n).padStart(2,'0');
// 내려받는 ZIP 파일 이름은 영문·숫자만 씁니다(한글 이름을 'download'로 바꿔 버리는 브라우저가 있음). 안의 폴더·파일 이름은 한글 그대로입니다.
const zipName=name=>{const ascii=String(name||'').normalize('NFKD').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);return `${ascii||'product'}_channels_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.zip`;};

// 각 채널의 이미지 역할별로 어떤 사진을 쓸지 정합니다.
// main/thumb: 첫 사진(대표) 1장 · extra: 나머지 · feed/detail: 전체(장수 상한까지)
export function plan(channel,photos) {
  const out=[];
  for(const spec of channel.images){
    const pick=spec.role==='main'||spec.role==='thumb'?photos.slice(0,1):spec.role==='extra'?photos.slice(1):photos;
    pick.slice(0,spec.maxCount).forEach(photo=>out.push({spec,photo}));
  }
  return out;
}

export function channelSummary(channelIds,photos) {
  return CHANNELS.filter(c=>channelIds.includes(c.id)).map(c=>({channel:c,items:plan(c,photos)}));
}

export async function channelPackage({name,slots,fitEnabled,channelIds,margin=DEFAULT_MARGIN,onProgress}) {
  const photos=channelPhotos(slots,fitEnabled);
  if(!photos.length)throw new Error('대표 사진을 먼저 넣어주세요.');
  const chosen=channelSummary(channelIds,photos).filter(x=>x.items.length);
  if(!chosen.length)throw new Error('내보낼 채널을 하나 이상 고르세요.');
  const base=safeName(name),zip=new JSZip(),root=zip.folder(base);
  const sources=new Map(),manifest=[];
  const total=chosen.reduce((n,x)=>n+x.items.length,0);let done=0;
  for(const {channel,items} of chosen){
    const folder=root.folder(channel.folder);
    // 크기가 다른 묶음이 섞인 채널(자사몰 상세·썸네일)만 이름에 역할을 붙이고, 나머지는 대표가 01번입니다.
    const mixed=new Set(channel.images.map(s=>s.size.join('x'))).size>1,count={};
    for(const {spec,photo} of items){
      const key=mixed?spec.role:'all';count[key]=(count[key]||0)+1;
      if(!sources.has(photo.id))sources.set(photo.id,await sourceCanvas(photo.image));
      const r=await renderForSpec(sources.get(photo.id),spec,margin);
      const file=`${base}_${channel.id}${mixed?`-${spec.role}`:''}_${pad(count[key])}.jpg`;
      folder.file(file,r.blob);
      manifest.push({channel:channel.label,role:spec.label,file:`${channel.folder}/${file}`,photo:photo.label,width:r.width,height:r.height,bytes:r.blob.size});
      onProgress?.(++done,total);
    }
  }
  const lines=['채널별 내보내기 목록',`상품: ${base}`,`만든 날: ${new Date().toLocaleString('ko-KR')}`,''];
  for(const {channel} of chosen){
    lines.push(`[${channel.label}] ${channel.note}`);
    for(const s of channel.sources)lines.push(`  출처: ${s}`);
    for(const m of manifest.filter(m=>m.channel===channel.label))lines.push(`  ${m.file} · ${m.role} · ${m.width}×${m.height} · ${(m.bytes/1024).toFixed(0)}KB · 원본 컷: ${m.photo}`);
    lines.push('');
  }
  root.file('목록.txt',lines.join('\n'));
  return {blob:await zip.generateAsync({type:'blob'}),count:manifest.length,filename:zipName(name),manifest};
}
