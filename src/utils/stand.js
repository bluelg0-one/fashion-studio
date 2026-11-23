// 마네킹 받침대(검은 기둥) 지우기: BiRefNet 누끼에 남는 기둥을 브라우저에서 무료로 지웁니다.
// 기둥의 특징: 사진 맨 아래에서 시작해 위로 곧게 올라가고, 폭이 좁고 거의 일정하며, 무채색(검정·회색)입니다.
// 소매처럼 아래까지 내려온 옷은 폭이 넓거나 위로 갈수록 테두리가 움직여서 기둥으로 보지 않습니다.

const lum=(d,i)=>(d[i]*299+d[i+1]*587+d[i+2]*114)/1000;

// 한 줄(y)에서 불투명한 구간들 [{l,r}]
function runs(data,width,y,th=128) {
  const out=[];let start=-1;
  for(let x=0;x<=width;x++){
    const on=x<width&&data[(y*width+x)*4+3]>=th;
    if(on&&start<0)start=x;
    if(!on&&start>=0){out.push({l:start,r:x-1});start=-1;}
  }
  return out;
}
const median=a=>{const s=[...a].sort((p,q)=>p-q);return s[Math.floor(s.length/2)];};

// 기둥을 찾아 투명하게 만들고 지운 범위를 돌려줍니다. 없으면 null (사진은 그대로).
export function removeStand({data,width,height},opts={}) {
  const maxW=Math.max(4,Math.round(width*(opts.maxWidth??.045)));
  const minLen=Math.max(12,Math.round(height*(opts.minLength??.012)));
  // 맨 아래 3줄 안에서 시작하는 좁은 구간을 후보로
  let y0=height-1;
  while(y0>height-4&&!runs(data,width,y0).length)y0--;
  const found=[];
  for(const start of runs(data,width,y0).filter(r=>r.r-r.l+1<=maxW)){
    const track=[{y:y0,...start}];
    for(let y=y0-1;y>=0;y--){
      // 기준 = 바로 아래 20줄(줄마다 갱신) → 살짝 기울어 찍힌 기둥도 따라감. 폭은 처음 20줄 기준으로 고정(점점 넓어지는 소매는 멈춤).
      const prev=track[track.length-1],base=track.slice(-20),first=track.slice(0,20);
      const ml=median(base.map(t=>t.l)),mr=median(base.map(t=>t.r)),w0=median(first.map(t=>t.r-t.l+1));
      const next=runs(data,width,y).find(r=>r.r>=prev.l-2&&r.l<=prev.r+2);
      if(!next)break;
      // 테두리가 바로 아래에서 갑자기 벗어나거나 폭이 달라지면(옷·마네킹과 만나는 곳) 멈춤
      const tol=Math.max(3,Math.round(w0*.12));
      if(Math.abs(next.l-ml)>tol||Math.abs(next.r-mr)>tol||Math.abs(next.r-next.l+1-w0)>tol)break;
      track.push({y,...next});
    }
    if(track.length<minLen)continue;
    const ws=track.map(t=>t.r-t.l+1),mw=median(ws);
    if(mw>maxW)continue;
    // 곧은지: 가운데 점들을 직선에 맞춰, 기울기(최대 약 8°)와 직선에서 벗어난 정도를 봅니다.
    const cs=track.map(t=>(t.l+t.r)/2),ys=track.map(t=>t.y),n0=cs.length;
    const my=ys.reduce((p,v)=>p+v,0)/n0,mc=cs.reduce((p,v)=>p+v,0)/n0;
    let sxy=0,sxx=0;for(let k=0;k<n0;k++){sxy+=(ys[k]-my)*(cs[k]-mc);sxx+=(ys[k]-my)**2;}
    const slope=sxx?sxy/sxx:0,off=Math.max(...cs.map((c,k)=>Math.abs(c-(mc+slope*(ys[k]-my)))));
    if(Math.abs(slope)>.14||off>Math.max(3,mw*.15))continue;
    // 색: 무채색(검정·회색·은색). 가운데 세로줄 픽셀로 판단.
    let chroma=0,n=0,L=0;
    for(const t of track){const x=Math.round((t.l+t.r)/2),i=(t.y*width+x)*4;chroma+=Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2]);L+=lum(data,i);n++;}
    if(chroma/n>40)continue;
    // 기둥의 평균 색 (가운데 세로줄)
    // 기둥 밝기의 위쪽 한계(90% 지점 + 6): 이보다 어두운 픽셀만 기둥으로 봅니다.
    const ls=[];for(const t of track)for(let x=t.l+2;x<=t.r-2;x++)ls.push(lum(data,(t.y*width+x)*4));
    ls.sort((p,q)=>p-q);
    found.push({track,width:mw,maxLum:(ls[Math.floor(ls.length*.9)]??L/n)+6});
  }
  if(!found.length)return null;
  let top=height,left=width,right=0;
  for(const {track} of found)for(const t of track){
    // 반투명한 가장자리까지 함께 지웁니다(양옆 최대 4px).
    let l=t.l,r=t.r;
    for(let k=0;k<4&&l>0&&data[(t.y*width+l-1)*4+3]>0;k++)l--;
    for(let k=0;k<4&&r<width-1&&data[(t.y*width+r+1)*4+3]>0;k++)r++;
    for(let x=l;x<=r;x++)data[(t.y*width+x)*4+3]=0;
    top=Math.min(top,t.y);left=Math.min(left,l);right=Math.max(right,r);
  }
  // 기둥이 옷·마네킹과 만나는 곳: 기둥 바로 왼쪽·오른쪽에서 옷(마네킹)의 아래 테두리 높이를 재고,
  // 그 두 점을 이은 선보다 아래에 있는 기둥 폭 안의 픽셀만 지웁니다(옷 색과 상관없이, 옷 안쪽은 건드리지 않음).
  for(const {track,width:mw} of found){
    const t=track[track.length-1],reach=Math.round(mw*1.5)+10,l=Math.max(0,t.l-4),r=Math.min(width-1,t.r+4);
    const edgeY=c=>{
      if(c<0||c>=width)return null;
      for(let y=t.y-1;y>=Math.max(0,t.y-reach);y--)if(data[(y*width+c)*4+3]>=128)return y;
      return null;
    };
    const cl=l-4,cr=r+4,yl=edgeY(cl),yr=edgeY(cr);
    if(yl===null&&yr===null)continue;
    const lineY=x=>yl===null?yr:yr===null?yl:yl+(yr-yl)*(x-cl)/(cr-cl);
    for(let x=l;x<=r;x++){
      const y1=Math.floor(lineY(x));
      for(let y=t.y-1;y>y1;y--){data[(y*width+x)*4+3]=0;}
      if(y1+1<t.y)top=Math.min(top,y1+1);
    }
  }
  return {count:found.length,top,left,right,rows:found.map(f=>f.track.length)};
}
