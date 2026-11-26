import {findButtons} from './flatten.js';
// 누끼 결과에 실제 투명 배경과 옷이 있는지 확인합니다.
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

// ---- 옷걸이 v2(014): 보정이 끝난 정면·후면에서 디테일컷을 자동으로 잘라 냅니다(브라우저 계산, 무료) ----
// 사장님 결정: 실제 사진만 씁니다. 없는 부분·다른 각도를 만들지 않고, 작으면 키우지 않고 빼고 '해상도 부족'으로 표시합니다.
// 위치는 옷 영역 비율로 정하고(단추·소매는 픽셀로 확인), 확신이 없는 곳은 sure=false → (켜 두면) Claude 1회로 상자를 받거나 '위치 확인 필요'로 뺍니다.

export const DETAIL_MIN_SIDE=800;// 잘라 낸 사진의 긴 변(원본 픽셀 기준) 최소값
export const DETAIL_RATIO=.75;// 가로:세로 = 3:4 (상세페이지·정렬 비율과 같음)
export const DETAIL_LABELS={neckline:'넥라인',fabric:'소재(원단 결)',placket:'단추·여밈',waist:'허리·여밈',hem:'밑단',cuff:'소매 끝'};
// 옷 종류별 디테일(상세페이지 순서)
export const DETAIL_SETS={
  'long-top':['neckline','fabric','placket','hem','cuff'],
  'short-top':['neckline','fabric','placket','hem'],
  vest:['neckline','fabric','placket','hem'],
  dress:['neckline','fabric','placket','hem'],
  'long-pants':['waist','fabric','hem'],
  'short-pants':['waist','fabric','hem'],
};
export const detailIds=garment=>DETAIL_SETS[garment]||DETAIL_SETS['long-top'];
export const detailSlotId=id=>'d-'+id;
// 옷마다 보이는 크기(옷 폭 대비 세로 길이)와 최대 크기(이보다 크게 잘라야 해상도가 나오면 '해상도 부족')
const SIZE={neckline:[.62,.95],fabric:[.38,.75],placket:[.6,.9],waist:[.6,.95],hem:[.62,1],cuff:[.42,.75]};

const opaqueAt=(img,x,y)=>x>=0&&y>=0&&x<img.width&&y<img.height&&img.data[(y*img.width+x)*4+3]>=128;
// 옷 영역: 불투명 범위 + 몸판 위쪽(옷걸이 고리처럼 좁은 줄은 빼고 폭이 옷의 35% 이상인 첫 줄) + 가운데 세로줄 기준 밑단
export function garmentFrame(img) {
  const {width:W,height:H,data}=img;let x0=W,x1=-1,y0=H,y1=-1;
  const left=new Int32Array(H).fill(-1),right=new Int32Array(H).fill(-1);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(data[(y*W+x)*4+3]>=128){if(left[y]<0)left[y]=x;right[y]=x;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  if(x1<x0)return null;
  const gw=x1-x0+1,cx=(x0+x1)/2;
  let bodyTop=y0;for(let y=y0;y<=y1;y++)if(left[y]>=0&&right[y]-left[y]+1>=gw*.35){bodyTop=y;break;}
  // 가운데(옷 폭 ±10%)에서 가장 아래 불투명 줄 = 밑단(옆으로 늘어진 소매보다 위일 수 있음)
  let hemY=bodyTop;for(let y=y1;y>=bodyTop;y--){let hit=false;for(let x=Math.round(cx-gw*.1);x<=Math.round(cx+gw*.1);x++)if(opaqueAt(img,x,y)){hit=true;break;}if(hit){hemY=y;break;}}
  return {x0,x1,y0,y1,gw,gh:hemY-bodyTop+1,cx,bodyTop,hemY,left,right};
}
// 가운데(cx,cy)·세로 h의 3:4 상자를 사진 안으로 밀어 넣습니다.
export function fitBox(cx,cy,h,W,H) {
  h=Math.min(h,H,W/DETAIL_RATIO);const w=h*DETAIL_RATIO;
  const x=Math.max(0,Math.min(W-w,cx-w/2)),y=Math.max(0,Math.min(H-h,cy-h/2));
  return {x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(h)};
}
export function opaqueShare(img,b) {
  let n=0,o=0;const step=Math.max(1,Math.round(Math.max(b.w,b.h)/120));
  for(let y=b.y;y<b.y+b.h;y+=step)for(let x=b.x;x<b.x+b.w;x+=step){n++;if(opaqueAt(img,x,y))o++;}
  return n?o/n:0;
}
// 소매 끝(긴팔): 옷 왼쪽 18% 안에서 가장 아래 불투명 줄. 그보다 조금 위에서 소매와 몸판 사이에 투명한 틈이 있어야 확신.
function cuffSpot(img,f) {
  const band=Math.round(f.x0+f.gw*.18);let sb=-1;
  for(let y=f.y1;y>=f.bodyTop&&sb<0;y--)for(let x=f.x0;x<=band;x++)if(opaqueAt(img,x,y)){sb=y;break;}
  if(sb<0||sb<f.bodyTop+f.gh*.4)return {sure:false,reason:'소매 끝을 찾지 못함'};
  const yy=Math.round(sb-f.gh*.08);let x=f.x0;while(x<f.cx&&!opaqueAt(img,x,yy))x++;
  const a=x;while(x<f.cx&&opaqueAt(img,x,yy))x++;const b=x;let gap=0;while(x<f.cx&&!opaqueAt(img,x,yy)){x++;gap++;}
  const sure=b>a&&gap>=f.gw*.015&&x<f.cx;
  return {sure,cx:(a+b)/2,bottom:sb,reason:sure?null:'소매가 몸판에 붙어 소매 끝을 구분하지 못함'};
}
// 디테일 계획. front·back: ImageData 모양({data,width,height}, 보정 끝난 투명 배경 사진) · scale: 그 사진 1px이 원본 몇 px을 키운 것인지(1 이상이면 확대된 사진)
// ai: Claude가 준 상자 {id:{x0,y0,x1,y1(0~1000), present}} — 확신 없는 곳에만 씀
// 반환: items[{id,label,from,box,sure,outSide}] · skipped[{id,label,reason,review}]
export function planDetails({front,back=null,garment='long-top',scale={},ai=null,minSide=DETAIL_MIN_SIDE}) {
  const items=[],skipped=[],ids=detailIds(garment),pants=garment.endsWith('pants');
  const frames={front:front?garmentFrame(front):null,back:back?garmentFrame(back):null};
  const add=(id,from,cx,cy,h0,sure=true,reason=null)=>{
    const label=DETAIL_LABELS[id],img=from==='front'?front:back,f=frames[from],s=scale[from]||1,[,maxF]=SIZE[id];// s<1: 원본이 보정본보다 큼(원본에서 자름)
    if(!sure){
      const a=ai?.[id];
      if(a&&a.present===false){skipped.push({id,label,reason:'Claude: 이 옷에는 없음',review:false});return;}
      if(a&&a.present!==false){const W=img.width,H=img.height,bx=(a.x0+a.x1)/2000*W,by=(a.y0+a.y1)/2000*H,bh=Math.max((a.y1-a.y0)/1000*H,(a.x1-a.x0)/1000*W/DETAIL_RATIO);cx=bx;cy=by;h0=Math.max(h0*.6,bh*1.15);sure=true;}
      else {skipped.push({id,label,reason:reason||'위치 확인 필요',review:true});return;}
    }
    const need=minSide*s,h=Math.max(h0,need);
    if(h>maxF*f.gw/DETAIL_RATIO||h>img.height||h*DETAIL_RATIO>img.width){skipped.push({id,label,reason:`해상도 부족(이 부분을 긴 변 ${minSide}px 이상으로 잘라 낼 수 없음)`,review:false});return;}
    const box=fitBox(cx,cy,h,img.width,img.height);
    if(id==='fabric'&&opaqueShare(img,box)<.92){skipped.push({id,label,reason:'해상도 부족(원단만 담을 만큼 크게 잘라 낼 수 없음)',review:false});return;}
    items.push({id,label,from,box,sure:true,outSide:Math.round(box.h/s)});
  };
  const f=frames.front;
  if(!f){for(const id of ids)skipped.push({id,label:DETAIL_LABELS[id],reason:'옷걸이 정면 보정 사진이 없음',review:true});return {items,skipped};}
  for(const id of ids){
    if(id==='neckline'){const h=SIZE.neckline[0]*f.gw/DETAIL_RATIO;add(id,'front',f.cx,f.bodyTop-h*.05+h/2,h);}
    else if(id==='waist'){const h=SIZE.waist[0]*f.gw/DETAIL_RATIO;add(id,'front',f.cx,f.bodyTop-h*.05+h/2,h);}
    else if(id==='fabric'){
      // 소재는 단추·무늬가 적은 후면 가운데에서. 후면이 없으면 정면 왼쪽 앞판(가운데 여밈을 피함)
      const from=frames.back?'back':'front',g=frames[from],h=SIZE.fabric[0]*g.gw/DETAIL_RATIO;
      add(id,from,from==='back'?g.cx:g.cx-g.gw*.22,g.bodyTop+g.gh*(pants?.22:.5),h);// 바지는 다리가 갈라지기 전 엉덩이 쪽
    }
    else if(id==='placket'){
      const box={x:Math.max(0,Math.round(f.cx-f.gw*.2)),y:f.bodyTop,x1:Math.min(front.width-1,Math.round(f.cx+f.gw*.2)),y1:f.hemY};
      const bt=findButtons(front,box,{strong:true}),mx=bt.length?[...bt.map(b=>b.x)].sort((a,b)=>a-b)[bt.length>>1]:0,line=bt.filter(b=>Math.abs(b.x-mx)<=f.gw*.05);
      const h=SIZE.placket[0]*f.gw/DETAIL_RATIO;
      if(line.length>=2){const ys=line.map(b=>b.y).sort((a,b)=>a-b);add(id,'front',mx,Math.min(ys[ys.length>>1],f.bodyTop+h/2),h);}
      else add(id,'front',f.cx,f.bodyTop+f.gh*.4,h,false,line.length?'단추가 1개만 보여 여밈 위치를 확신하지 못함':'단추·여밈을 찾지 못함(없는 옷일 수 있음)');
    }
    else if(id==='hem'){
      const h=SIZE.hem[0]*f.gw/DETAIL_RATIO;
      if(pants){let y=f.y1,xs=[];for(let x=f.x0;x<f.cx;x++)if(opaqueAt(front,x,Math.round(y-f.gh*.03)))xs.push(x);const lx=xs.length?(xs[0]+xs[xs.length-1])/2:f.x0+f.gw*.25;add(id,'front',lx,f.y1+h*.06-h/2,h);}
      else add(id,'front',f.cx,f.hemY+h*.06-h/2,h);
    }
    else if(id==='cuff'){const c=cuffSpot(front,f),h=SIZE.cuff[0]*f.gw/DETAIL_RATIO;add(id,'front',c.cx??f.x0+f.gw*.1,(c.bottom??f.y1)+h*.08-h/2,h,c.sure,c.reason);}
  }
  return {items,skipped};
}
