// Locate the actual cutout, never a model's guessed coordinates in the wall.
export function cutoutBounds({data, width, height}) {
  let left=width, top=height, right=-1, bottom=-1, transparent=0;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const alpha=data[(y*width+x)*4+3];
    if(alpha<16) transparent++;
    if(alpha>128) {left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  }
  if(right<left || transparent<width*height*.01) throw new Error('투명 배경을 확인할 수 없습니다. 결과를 확인한 후 다시 제작하세요.');
  return {x:left/width,y:top/height,w:(right-left+1)/width,h:(bottom-top+1)/height};
}
export function defaultDetails(b) {
  return [
    {label:'목·어깨 확대',x:.12,y:.16,w:.76,h:.36},
    {label:'옷 중앙 확대',x:.2,y:.36,w:.6,h:.36},
    {label:'몸통 원단 확대',x:.12,y:.3,w:.76,h:.52},
  ].map(d=>({...d,x:b.x+d.x*b.w,y:b.y+d.y*b.h,w:d.w*b.w,h:d.h*b.h}));
}
export function clampCrop(d) {
  const w=Math.min(1,Math.max(.05,d.w)),h=Math.min(1,Math.max(.05,d.h));
  return {...d,w,h,x:Math.max(0,Math.min(1-w,d.x)),y:Math.max(0,Math.min(1-h,d.y))};
}
export function cropCanvas(source,rect) {
  const d=clampCrop(rect),c=document.createElement('canvas');
  const x=Math.round(d.x*source.width),y=Math.round(d.y*source.height);
  c.width=Math.max(1,Math.min(source.width-x,Math.round(d.w*source.width)));
  c.height=Math.max(1,Math.min(source.height-y,Math.round(d.h*source.height)));
  c.getContext('2d').drawImage(source,x,y,c.width,c.height,0,0,c.width,c.height);
  return {...d,image:c.toDataURL('image/png')};
}
