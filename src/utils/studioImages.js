export const loadImage=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('사진을 읽을 수 없습니다. JPG·PNG·WebP 파일을 확인하세요.'));im.src=src;});
export async function imageCanvas(src) {
  const im=await loadImage(src),c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);return c;
}
// 업로드 사진: 긴 변 최대 2400px. Photoroom HD 배경 제거는 2K 이상에서 효과가 크고,
// 서버 요청 한도(약 4.5MB) 안에 들어가도록 JPG 화질→크기 순으로 맞춥니다.
export const UPLOAD_MAX_SIDE=2400, UPLOAD_MAX_CHARS=4200000;
export async function readPhoto(file) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG, PNG, WebP 사진을 선택하세요.');
  if(file.size>20*1024*1024)throw new Error('사진 한 장당 20MB 이하로 선택하세요.');
  const url=URL.createObjectURL(file);
  try {
    const im=await loadImage(url);
    const start=Math.min(UPLOAD_MAX_SIDE,Math.max(im.width,im.height));
    for(let side=start;side===start||side>=1000;side=Math.round(side*.85)){
      const c=document.createElement('canvas'),scale=Math.min(1,side/Math.max(im.width,im.height));
      c.width=Math.max(1,Math.round(im.width*scale));c.height=Math.max(1,Math.round(im.height*scale));
      const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingQuality='high';ctx.drawImage(im,0,0,c.width,c.height);
      for(const quality of [.95,.92,.88]){const image=c.toDataURL('image/jpeg',quality);if(image.length<=UPLOAD_MAX_CHARS)return image;}
    }
    throw new Error('압축 후에도 사진이 큽니다. 더 작은 사진으로 선택하세요.');
  }finally{URL.revokeObjectURL(url);}
}
export function medianLight(canvas) {
  const {data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),hist=new Uint32Array(256);let count=0;
  for(let i=0;i<data.length;i+=16){const lum=Math.round(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]);if(data[i+3]>200&&lum>15&&lum<240){hist[lum]++;count++;}}
  if(!count)return null;
  let sum=0;for(let i=0;i<256;i++){sum+=hist[i];if(sum>=count/2)return i;}
  return null;
}
// Bounded equal-channel gain: match the hero gently without changing hue/saturation.
export function whitePhoto(source,targetLight=null,brightness=3) {
  const c=document.createElement('canvas');c.width=source.width;c.height=source.height;
  const ctx=c.getContext('2d');ctx.drawImage(source,0,0);
  const pixels=ctx.getImageData(0,0,c.width,c.height),light=medianLight(source);
  const match=targetLight&&light?Math.max(.96,Math.min(1.06,targetLight/light)):1;
  const gain=Math.max(.9,Math.min(1.12,match*(1+brightness/100)));
  for(let i=0;i<pixels.data.length;i+=4){
    const max=Math.max(pixels.data[i],pixels.data[i+1],pixels.data[i+2]);
    const safe=max?Math.min(gain,255/max):gain;
    for(let k=0;k<3;k++)pixels.data[i+k]=Math.round(pixels.data[i+k]*safe);
  }
  ctx.putImageData(pixels,0,0);ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  return c.toDataURL('image/png');
}
// 개별 저장용: PNG가 maxBytes(기본 2MB)보다 크면 크기를 조금씩 줄여 그 안으로 맞춥니다.
// PNG는 화질 손실 없는 형식이라 픽셀 크기를 줄이는 방식으로 용량을 낮춥니다.
export async function compressPng(src,maxBytes=2*1024*1024) {
  const im=await loadImage(src);let w=im.naturalWidth,h=im.naturalHeight;
  const encode=async(width,height)=>{
    const c=document.createElement('canvas');c.width=width;c.height=height;
    const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.imageSmoothingQuality='high';ctx.drawImage(im,0,0,width,height);
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('사진 저장에 실패했습니다. 다시 시도하세요.');
    return blob;
  };
  let blob=await encode(w,h);
  for(let i=0;i<10&&blob.size>maxBytes&&Math.min(w,h)>200;i++){
    const scale=Math.min(.95,Math.sqrt(maxBytes/blob.size)*.97);
    w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));blob=await encode(w,h);
  }
  return {blob,width:w,height:h,original:{width:im.naturalWidth,height:im.naturalHeight}};
}
export function download(url,name) {const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();}
export function downloadBlob(blob,name) {const url=URL.createObjectURL(blob);download(url,name);setTimeout(()=>URL.revokeObjectURL(url),10000);}
const wrap=(ctx,value,width)=>{const lines=[];for(const part of String(value).split('\n')){let line='';for(const ch of part){if(line&&ctx.measureText(line+ch).width>width){lines.push(line);line='';}line+=ch;}lines.push(line);}return lines;};
export async function renderDocument(blocks) {
  await document.fonts.ready;
  const width=860,pad=40,inner=width-pad*2,measure=document.createElement('canvas').getContext('2d'),layout=[];
  for(const block of blocks){
    if(block.kind==='image') {const im=await loadImage(block.src),ratio=Math.min(inner/im.naturalWidth,1000/im.naturalHeight);layout.push({...block,im,width:im.naturalWidth*ratio,height:im.naturalHeight*ratio});}
    else if(block.kind==='text'){measure.font=`${block.size}px Arial, sans-serif`;const lines=wrap(measure,block.value,inner);layout.push({...block,lines,height:lines.length*block.size*1.65});}
    else {const cellWidth=inner/block.headers.length;measure.font='18px Arial, sans-serif';const cells=[block.headers,...block.rows].map(row=>row.map(value=>wrap(measure,value,cellWidth-12)));const heights=cells.map(row=>Math.max(...row.map(lines=>lines.length))*28+24);layout.push({...block,cells,heights,cellWidth,height:heights.reduce((a,b)=>a+b,0)});}
  }
  const height=Math.ceil(pad*2+layout.reduce((sum,b)=>sum+b.height+24,0));
  if(height>30000)throw new Error('상세페이지가 너무 깁니다. 사진이나 문구를 줄이거나 HTML로 저장하세요.');
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');if(!ctx)throw new Error('이미지 저장 공간이 부족합니다.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.textBaseline='top';let y=pad;
  for(const b of layout){
    if(b.kind==='image')ctx.drawImage(b.im,(width-b.width)/2,y,b.width,b.height);
    else if(b.kind==='text'){ctx.fillStyle='#202632';ctx.font=`${b.size}px Arial, sans-serif`;b.lines.forEach((line,i)=>ctx.fillText(line,pad,y+i*b.size*1.65));}
    else {let top=y;ctx.font='18px Arial, sans-serif';b.cells.forEach((row,r)=>{row.forEach((lines,col)=>{const x=pad+col*b.cellWidth;ctx.fillStyle=r===0?'#f3f4f6':'#fff';ctx.fillRect(x,top,b.cellWidth,b.heights[r]);ctx.strokeStyle='#d7dce3';ctx.strokeRect(x,top,b.cellWidth,b.heights[r]);ctx.fillStyle='#202632';lines.forEach((line,l)=>ctx.fillText(line,x+(b.cellWidth-ctx.measureText(line).width)/2,top+12+l*28));});top+=b.heights[r];});}
    y+=b.height+24;
  }
  const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw new Error('이미지 저장에 실패했습니다. HTML로 저장하거나 사진 수를 줄여주세요.');return blob;
}

// 분류용 작은 사진 (긴 변 512px JPG) — 업로드 비용·시간을 줄입니다.
export async function thumbnail(src,side=512) {
  const im=await loadImage(src),scale=Math.min(1,side/Math.max(im.naturalWidth,im.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*scale);c.height=Math.round(im.naturalHeight*scale);
  const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',.82);
}
// 일관성: 모든 컷을 같은 비율·크기·여백으로 맞춥니다(투명 누끼 기준).
// 옷 전체가 보이는 컷은 같은 여백으로 가운데 배치, 가장자리가 잘린 접사 컷은 비율에 맞춰 가운데를 채웁니다.
export const FRAME_SIZES={'3:4':[1500,2000],'1:1':[1800,1800],'4:5':[1600,2000]};
// size:[W,H]를 주면 그 크기로(예: 원본 크기 그대로 중앙 정렬만), 아니면 비율별 표준 크기로 맞춥니다.
export function framePhoto(source,{ratio='3:4',margin=6,size}={}) {
  const [W,H]=size||FRAME_SIZES[ratio]||FRAME_SIZES['3:4'];
  const {data,width,height}=source.getContext('2d').getImageData(0,0,source.width,source.height);
  let l=width,t=height,r=-1,b=-1;
  for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2)if(data[(y*width+x)*4+3]>128){if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y;}
  const out=document.createElement('canvas');out.width=W;out.height=H;const ctx=out.getContext('2d');ctx.imageSmoothingQuality='high';
  if(r<l){ctx.drawImage(source,0,0,W,H);return out;}
  const edge=4,cut=(l<=edge&&r>=width-1-edge)||(t<=edge&&b>=height-1-edge);
  if(cut){
    const s=Math.max(W/width,H/height),w=width*s,h=height*s;
    ctx.drawImage(source,(W-w)/2,(H-h)/2,w,h);
  } else {
    const bw=r-l+1,bh=b-t+1,m=Math.max(0,Math.min(30,margin))/100;
    const s=Math.min(W*(1-2*m)/bw,H*(1-2*m)/bh);
    ctx.drawImage(source,l,t,bw,bh,(W-bw*s)/2,(H-bh*s)/2,bw*s,bh*s);
  }
  return out;
}
