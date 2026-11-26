import test from 'node:test';
import assert from 'node:assert/strict';
import {planDetails, garmentFrame, detailIds, DETAIL_MIN_SIDE} from '../src/utils/detailCrops.js';
// 옷걸이 v2(014) 디테일컷 자동 잘라내기: 합성한 '옷걸이에 걸린 니트 가디건'(투명 배경, 고리·소매·단추)으로 검사합니다.
function hangerTop({k=1,buttons=true,gap=true,pants=false}={}) {
  const W=Math.round(1200*k),H=Math.round(1600*k),data=new Uint8ClampedArray(W*H*4),K=v=>Math.round(v*k);
  const put=(x,y,rgb)=>{const i=(y*W+x)*4;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;};
  const btn=buttons?[400,600,800,1000].map(y=>[K(600),K(y)]):[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const hook=x>=K(592)&&x<=K(608)&&y>=K(60)&&y<K(160);
    const body=pants?(y>=K(200)&&y<K(1450)&&x>=K(330)&&x<K(870)&&!(y>K(700)&&x>K(585)&&x<K(615))):(x>=K(300)&&x<K(900)&&y>=K(160)&&y<K(1450));
    const sleeve=!pants&&y>=K(220)&&y<K(1350)&&((x>=K(180)&&x<K(gap?270:300))||(x>=K(gap?930:900)&&x<K(1020)));
    if(!(hook||body||sleeve))continue;
    const st=((x>>1)+(y>>2))%2?9:-9;let rgb=[214+st,190+st,200+st];
    for(const [bx,by] of btn){const r=Math.hypot(x-bx,y-by);if(r<=K(18))rgb=r>K(14)?[150,120,130]:[236,226,230];}
    put(x,y,hook?[160,160,160]:rgb);
  }
  return {width:W,height:H,data};
}
const ids=r=>r.items.map(i=>i.id);
test('014: detail crops from a hanger front/back — neckline below the hook, fabric from the back, placket on the buttons, hem, cuff',()=>{
  const front=hangerTop({k:1.3}),back=hangerTop({k:1.3,buttons:false}),f=garmentFrame(front);
  assert.ok(Math.abs(f.bodyTop-Math.round(160*1.3))<=1,`몸판 위쪽은 고리 아래(${f.bodyTop})`);
  const r=planDetails({front,back,garment:'long-top'});
  assert.deepEqual(ids(r),['neckline','fabric','placket','hem','cuff'],JSON.stringify(r.skipped));
  const by=Object.fromEntries(r.items.map(i=>[i.id,i]));
  for(const it of r.items){assert.ok(it.outSide>=DETAIL_MIN_SIDE,`${it.id} 긴 변 ${it.outSide}`);assert.ok(Math.abs(it.box.w/it.box.h-.75)<.01,'3:4');}
  assert.equal(by.fabric.from,'back','소재는 후면에서');
  assert.ok(by.neckline.box.y<=f.bodyTop&&by.neckline.box.y+by.neckline.box.h>f.bodyTop+50,'넥라인은 몸판 위쪽을 담음');
  const pc=by.placket.box;assert.ok(pc.x<600*1.3&&pc.x+pc.w>600*1.3,'여밈 상자는 단추 줄 위');
  assert.ok(by.hem.box.y+by.hem.box.h>=f.hemY,'밑단 포함');
  assert.ok(by.cuff.box.x<=180*1.3+5,'왼쪽 소매 끝');
});
test('014: crops that would need upscaling are left out as 해상도 부족 (never enlarged)',()=>{
  const small=hangerTop({k:.6});
  const r=planDetails({front:small,back:hangerTop({k:.6,buttons:false}),garment:'long-top'});
  assert.equal(r.items.length,0,JSON.stringify(r.items));
  assert.ok(r.skipped.every(s=>/해상도 부족/.test(s.reason)&&!s.review),JSON.stringify(r.skipped));
  // 보정 사진이 원본을 2배로 키운 것이면(scale 2) 원본 기준으로 판단 → 큰 사진이라도 해상도 부족
  const big=hangerTop({k:1.3}),r2=planDetails({front:big,garment:'long-top',scale:{front:2}});
  assert.ok(r2.skipped.some(s=>s.id==='neckline'&&/해상도 부족/.test(s.reason)));
  assert.ok(r2.items.every(i=>i.outSide>=DETAIL_MIN_SIDE));
});
test('014: unsure spots (no buttons, sleeve stuck to the body) are skipped for review unless Claude gave a box',()=>{
  const front=hangerTop({k:1.3,buttons:false,gap:false});
  const r=planDetails({front,garment:'long-top'});
  const sk=Object.fromEntries(r.skipped.map(s=>[s.id,s]));
  assert.ok(sk.placket?.review&&/단추·여밈을 찾지 못함/.test(sk.placket.reason));
  assert.ok(sk.cuff?.review&&/소매/.test(sk.cuff.reason));
  assert.equal(r.items.find(i=>i.id==='fabric')?.from??'front','front','후면이 없으면 정면에서');
  const ai={placket:{present:false},cuff:{present:true,x0:150,y0:780,x1:230,y1:850}};
  const r2=planDetails({front,garment:'long-top',ai});
  assert.equal(r2.skipped.find(s=>s.id==='placket').review,false,'Claude: 없음 → 확인 필요 아님');
  const cuff=r2.items.find(i=>i.id==='cuff');assert.ok(cuff,'Claude 상자로 소매 끝');
  const cy=(cuff.box.y+cuff.box.h/2)/front.height*1000;assert.ok(cy>700&&cy<900,`소매 끝 위치 ${cy}`);
});
test('014: pants get waist, fabric and one leg hem; every garment type has a fixed order',()=>{
  const front=hangerTop({k:1.6,pants:true,buttons:false});
  const r=planDetails({front,back:front,garment:'long-pants'});
  assert.deepEqual(ids(r),['waist','fabric','hem'],JSON.stringify(r.skipped));
  const hem=r.items.find(i=>i.id==='hem');assert.ok(hem.box.x+hem.box.w/2<600*1.6,'한쪽 다리 밑단');
  assert.deepEqual(detailIds('vest'),['neckline','fabric','placket','hem']);
  const none=planDetails({front:null,garment:'long-top'});assert.equal(none.items.length,0);assert.ok(none.skipped.every(s=>s.review));
});
