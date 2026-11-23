// 수정할 곳(구김·얼룩) 자동 찾기 보조 계산 — 브라우저 계산, 무료.
// - 민감도: 보통(사진 1장 그대로) / 적극(옷 영역 2×2 타일) / 최대(3×3 타일). 타일은 겹치게 잘라 높은 해상도로 보냅니다.
// - 타일에서 찾은 좌표(타일 기준 0~1000)를 원래 사진 기준(0~1000)으로 바꾸고, 겹치는 표시를 합칩니다.
// - IOPaint에 보내기 전 넓은 상자를 작은 상자 여러 개로 나눕니다(넓은 구김을 한 번에 지우면 흐릿하게 뭉개지기 쉬움).

export const DEFECT_LEVELS={
  normal:{label:'보통',grid:1,maxRegions:12},
  aggressive:{label:'적극',grid:2,maxRegions:20},
  max:{label:'최대',grid:3,maxRegions:25},
};
export const DEFAULT_DEFECT_LEVEL='aggressive';
export const TILE_OVERLAP=.2;     // 타일끼리 20% 겹침(15% 이상)
export const SPLIT_MAX_SIDE=90;   // 작은 상자 한 변: 사진의 9% (0~1000 단위)
export const SPLIT_OVERLAP=.28;   // 작은 상자끼리 28% 겹침
export const callsFor=level=>(DEFECT_LEVELS[level]||DEFECT_LEVELS.normal).grid**2;

// 옷이 있는 범위(누끼의 불투명한 곳). 투명한 곳이 없으면 사진 전체.
export function garmentBox({data,width,height}) {
  let l=width,t=height,r=-1,b=-1;
  for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2)if(data[(y*width+x)*4+3]>128){if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y;}
  if(r<l)return {x:0,y:0,w:width,h:height};
  const pad=Math.round(Math.max(width,height)*.01);
  l=Math.max(0,l-pad);t=Math.max(0,t-pad);r=Math.min(width-1,r+pad);b=Math.min(height-1,b+pad);
  return {x:l,y:t,w:r-l+1,h:b-t+1};
}

// 옷 범위를 n×n 타일로(겹침 overlap). 픽셀 단위 {x,y,w,h}.
export function tileGrid(box,n,overlap=TILE_OVERLAP) {
  if(n<=1)return [{...box}];
  const tw=box.w/(n-(n-1)*overlap),th=box.h/(n-(n-1)*overlap),sx=tw*(1-overlap),sy=th*(1-overlap),out=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++)out.push({x:Math.round(box.x+i*sx),y:Math.round(box.y+j*sy),w:Math.round(tw),h:Math.round(th)});
  return out;
}

// 타일 기준 0~1000 → 사진 기준 0~1000
export function mapFromTile(r,tile,width,height) {
  const X=v=>Math.round((tile.x+v/1000*tile.w)/width*1000),Y=v=>Math.round((tile.y+v/1000*tile.h)/height*1000);
  const c=v=>Math.max(0,Math.min(1000,v));
  return {...r,x0:c(X(r.x0)),x1:c(X(r.x1)),y0:c(Y(r.y0)),y1:c(Y(r.y1))};
}

const area=r=>Math.max(0,r.x1-r.x0)*Math.max(0,r.y1-r.y0);
const inter=(a,b)=>area({x0:Math.max(a.x0,b.x0),y0:Math.max(a.y0,b.y0),x1:Math.min(a.x1,b.x1),y1:Math.min(a.y1,b.y1)});
// 같은 곳을 두 타일이 함께 찾은 경우: 겹침이 크면(IoU ≥ 0.3 또는 작은 쪽의 60% 이상이 겹침) 하나로 합칩니다(바깥 상자, 높은 신뢰도).
export function mergeRegions(regions,{iou=.3,contain=.6}={}) {
  const out=[];
  for(const r of [...regions].sort((a,b)=>b.confidence-a.confidence)){
    const hit=out.find(o=>{const i=inter(o,r);if(!i)return false;return i/(area(o)+area(r)-i)>=iou||i/Math.min(area(o),area(r))>=contain;});
    if(hit){Object.assign(hit,{x0:Math.min(hit.x0,r.x0),y0:Math.min(hit.y0,r.y0),x1:Math.max(hit.x1,r.x1),y1:Math.max(hit.y1,r.y1),confidence:Math.max(hit.confidence,r.confidence)});
      if(hit.type!==r.type&&r.type==='wrinkle')hit.type='wrinkle';}
    else out.push({...r});
  }
  return out;
}

// 넓은 상자 → 한 변 maxSide 이하, overlap만큼 겹치는 작은 상자들. 붓 자국(stroke)은 이미 가늘어 그대로 둡니다.
export function splitBox(r,{maxSide=SPLIT_MAX_SIDE,overlap=SPLIT_OVERLAP}={}) {
  if(r.shape==='stroke')return [r];
  const w=r.x1-r.x0,h=r.y1-r.y0;
  if(w<=maxSide&&h<=maxSide)return [r];
  const axis=(len,start)=>{
    if(len<=maxSide)return [[start,start+len]];
    const n=Math.ceil((len-maxSide*overlap)/(maxSide*(1-overlap)));
    const side=len/(n-(n-1)*overlap),step=side*(1-overlap);
    return Array.from({length:n},(_,k)=>[Math.round(start+k*step),Math.round(start+k*step+side)]);
  };
  const out=[];
  for(const [y0,y1] of axis(h,r.y0))for(const [x0,x1] of axis(w,r.x0))out.push({...r,x0,x1:Math.min(r.x1,x1),y0,y1:Math.min(r.y1,y1),split:true});
  return out;
}
export const splitRegions=(regions,opts)=>regions.flatMap(r=>splitBox(r,opts));
