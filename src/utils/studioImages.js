export const loadImage=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('사진을 읽을 수 없습니다. JPG·PNG·WebP 파일을 확인하세요.'));im.src=src;});
export async function imageCanvas(src) {
  const im=await loadImage(src),c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);return c;
}
export async function readPhoto(file) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG, PNG, WebP 사진을 선택하세요.');
  if(file.size>20*1024*1024)throw new Error('사진 한 장당 20MB 이하로 선택하세요.');
  const url=URL.createObjectURL(file);
  try {
    const im=await loadImage(url),c=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(im.width,im.height));
    c.width=Math.max(1,Math.round(im.width*scale));c.height=Math.max(1,Math.round(im.height*scale));
    const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);
    const image=c.toDataURL('image/jpeg',.92);
    if(image.length>4000000)throw new Error('압축 후에도 사진이 큽니다. 더 작은 사진으로 선택하세요.');
    return image;
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
