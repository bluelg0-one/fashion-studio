// 누끼 결과의 투명도(알파) 다루기 — 브라우저 계산, 무료.

// 거의 모든 픽셀이 불투명하면(투명 배경이 아니라 흰 배경으로 받은 결과) true.
export function isOpaque({data},share=.995) {
  let solid=0;const n=data.length/4;
  for(let i=3;i<data.length;i+=4)if(data[i]>=250)solid++;
  return solid>=n*share;
}

// 흰 배경에서 알파 되살리기: 사진 가장자리에서 이어진 흰색(밝고 무채색) 영역만 투명하게 만듭니다.
// 옷 안쪽의 흰 부분은 가장자리와 이어지지 않으면 그대로 둡니다. 경계 1px은 반투명으로 부드럽게.
// 흰 옷처럼 배경과 이어진 흰 부분이 있으면 함께 지워질 수 있어, 바꾼 픽셀이 너무 많으면(옷까지 지운 것으로 보고) 원래대로 둡니다.
export function alphaFromWhite({data,width,height},{min=242,chroma=10,maxShare=.92}={}) {
  const white=i=>{const r=data[i],g=data[i+1],b=data[i+2];return r>=min&&g>=min&&b>=min&&Math.max(r,g,b)-Math.min(r,g,b)<=chroma;};
  const seen=new Uint8Array(width*height),stack=[];
  const push=(x,y)=>{const p=y*width+x;if(seen[p])return;seen[p]=1;if(white(p*4))stack.push(p);else seen[p]=2;};
  for(let x=0;x<width;x++){push(x,0);push(x,height-1);}
  for(let y=0;y<height;y++){push(0,y);push(width-1,y);}
  const bg=new Uint8Array(width*height);let count=0;
  while(stack.length){
    const p=stack.pop();bg[p]=1;count++;
    const x=p%width,y=(p-x)/width;
    if(x>0)push(x-1,y);if(x<width-1)push(x+1,y);if(y>0)push(x,y-1);if(y<height-1)push(x,y+1);
  }
  if(!count||count>width*height*maxShare)return 0;
  for(let p=0;p<bg.length;p++){
    if(bg[p]){data[p*4+3]=0;continue;}
    // 배경과 맞닿은 옷 가장자리 한 줄은 반투명(계단 현상 완화)
    const x=p%width,y=(p-x)/width;
    if((x>0&&bg[p-1])||(x<width-1&&bg[p+1])||(y>0&&bg[p-width])||(y<height-1&&bg[p+width]))data[p*4+3]=Math.min(data[p*4+3],200);
  }
  return count;
}
