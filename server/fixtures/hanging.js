// 합성 '옷걸이에 걸린 니트'(누끼 결과, 투명 배경, 기본 600×800 × k) — 016 옷걸이 지우기 검사용.
// 휜 은색 고리 → 목 안쪽에 보이는 옷걸이 바 → 어깨 끝으로 튀어나온 바 끝, 목 안쪽 뒤판(옷 색 조금 어둡게)·흰 라벨(검은 글자)·밑단의 가는 끈·어깨 위 작은 검은 점.
export const SILVER=[170,170,175],BROWN=[120,80,45],LABEL=[245,245,240],INK=[30,30,30];
export function hanging(color,{bar=BROWN,k=1}={}){
  const W=Math.round(600*k),H=Math.round(800*k),img={width:W,height:H,data:new Uint8ClampedArray(W*H*4)},K=v=>Math.round(v*k);
  const rect=(x0,y0,x1,y1,c)=>{for(let y=K(y0);y<=K(y1+1)-1;y++)for(let x=K(x0);x<=K(x1+1)-1;x++)img.data.set([...c,255],(y*W+x)*4);};
  const dot=(x,y,c)=>{const X=Math.round(x*k),Y=Math.round(y*k);for(let yy=Y;yy<Y+Math.max(1,Math.round(k));yy++)for(let xx=X;xx<X+Math.max(1,Math.round(k));xx++)img.data.set([...c,255],(yy*W+xx)*4);};
  for(let a=Math.PI;a<=2*Math.PI;a+=.004)for(let t=0;t<5;t+=.5)dot(285+(12+t)*Math.cos(a),32+(12+t)*Math.sin(a),SILVER);
  const shade=c=>c.map(v=>Math.round(v*.85));
  rect(270,32,274,48,SILVER);rect(297,32,302,113,SILVER);
  rect(140,112,460,760,color);rect(250,112,350,170,shade(color));
  rect(250,114,350,124,bar);rect(128,114,139,124,bar);rect(461,114,472,124,bar);
  rect(288,135,312,150,LABEL);for(const x of [292,297,302,307])rect(x,141,x+1,144,INK);
  rect(330,761,333,790,color);rect(200,94,202,96,[20,20,20]);
  return img;
}
