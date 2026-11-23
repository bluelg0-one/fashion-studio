export const GARMENTS = [
  {id:'long-top',label:'긴팔티셔츠'}, {id:'short-top',label:'반팔티셔츠'},
  {id:'vest',label:'조끼'}, {id:'dress',label:'원피스'},
  {id:'long-pants',label:'긴바지'}, {id:'short-pants',label:'반바지'},
];
export const TOP_FIELDS = [['size','사이즈'],['chest','가슴단면'],['length','총장']];
export const BOTTOM_FIELDS = [['size','사이즈'],['waist','허리단면'],['rise','밑위'],['hip','엉덩이 단면'],['thigh','허벅지 단면'],['hem','밑단단면'],['length','총장']];
export const sizeFields = type => type.endsWith('pants') ? BOTTOM_FIELDS : TOP_FIELDS;
export const newSizeRow = () => Object.fromEntries([...TOP_FIELDS,...BOTTOM_FIELDS].map(([key])=>[key,'']));
// 컷 종류 (상세페이지 순서). 사진이 없는 컷은 편집 화면에서 숨기고 '+ 컷 추가'로 꺼냅니다.
export const DETAIL_SLOTS = [
  ['frontZoom','정면 확대'],['frontTop','정면 상단'],['frontBottom','정면 하단'],
  ['fabric','원단 및 디테일'],['detail2','디테일 2'],['detail3','디테일 3'],
  ['side','측면'],['back','후면'],['point1','포인트 1'],['point2','포인트 2'],
];
export const initialSlots = () => Object.fromEntries([['hero','정면'],['fit','모델컷'],...DETAIL_SLOTS].map(([id,label])=>[id,{id,label,enabled:true,source:null,image:null,cutout:null,crop:null,status:'empty'}]));
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The guide describes where to measure; numeric values only come from the user.
// opts.big: 소프트·미니멀 테마용. 그림 안 글자를 키우고(화살표 글자 13→24, 설명 14→24) 설명을 두 줄로 나눕니다.
// 860px 상세페이지가 폰 폭 390px로 줄어도 약 12px로 보이는 크기입니다. big이 없으면 예전 그림과 한 글자도 다르지 않습니다.
export function guideSvg(type,lang='ko',opts={}) {
  const big=Boolean(opts.big);
  const pants=type.endsWith('pants'),short=type==='short-pants';
  const shapes={
    'long-top':'M100 65 L65 85 L25 230 L65 245 L95 140 L95 300 L225 300 L225 140 L255 245 L295 230 L255 85 L220 65 Q160 105 100 65Z',
    'short-top':'M100 65 L65 85 L25 145 L70 175 L95 140 L95 300 L225 300 L225 140 L250 175 L295 145 L255 85 L220 65 Q160 105 100 65Z',
    vest:'M105 65 L80 80 Q105 125 90 155 L90 300 L230 300 L230 155 Q215 125 240 80 L215 65 Q160 110 105 65Z',
    dress:'M110 45 L75 65 L40 130 L85 155 L108 120 L110 180 L65 330 L255 330 L210 180 L212 120 L235 155 L280 130 L245 65 L210 45 Q160 85 110 45Z',
    'long-pants':'M95 50 L225 50 L245 330 L175 330 L160 160 L145 330 L75 330Z',
    'short-pants':'M95 70 L225 70 L245 240 L175 240 L160 150 L145 240 L75 240Z',
  };
  // 큰 글자에서는 바지 A(허리) 글자가 허리선·밑위선과 겹치지 않게 허리선 위 왼쪽으로 옮깁니다.
  const place=(label,tx,ty)=>big&&pants&&label==='A'?[118,short?64:44]:[tx,ty];
  const line=(x1,y1,x2,y2,label,tx0,ty0,[tx,ty]=place(label,tx0,ty0))=>`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#596982" stroke-width="2" marker-start="url(#arrow)" marker-end="url(#arrow)"/><text x="${tx}" y="${ty}" fill="#334155" font-size="${big?24:13}" font-family="sans-serif"${big?' font-weight="bold"':''}>${label}</text>`;
  const marks=pants ?
    line(99,short?82:62,221,short?82:62,'A',155,short?75:55)+
    line(160,short?85:65,160,short?147:157,'B',164,118)+
    line(93,125,227,125,'C',100,117)+
    line(93,short?177:195,145,short?177:195,'D',106,short?170:188)+
    line(80,short?229:318,140,short?229:318,'E',103,short?222:311)+
    line(265,short?72:52,265,short?240:330,'F',272,195) :
    line(100,160,220,160,'A',155,152)+line(310,type==='dress'?48:68,310,type==='dress'?330:300,'B',316,210);
  const legend=pants?'A 허리단면 · B 밑위 · C 엉덩이 단면 · D 허벅지 단면 · E 밑단단면 · F 총장':'A 가슴단면 · B 총장';
  const legendEn=pants?'A Waist · B Rise · C Hip · D Thigh · E Hem · F Length (flat, cm)':'A Chest · B Length (flat, cm)';
  if(big){
    const items=(lang==='en'?legendEn:legend).split(' · '),rows=items.length>3?[items.slice(0,3),items.slice(3)]:[items];
    const H=420+(rows.length-1)*36;
    const text=rows.map((r,k)=>`<text x="320" y="${386+k*36}" text-anchor="middle" fill="#334155" font-size="24" font-family="sans-serif">${r.join(' · ')}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${H}" viewBox="0 0 640 ${H}"><rect width="640" height="${H}" fill="white"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="#596982"/></marker></defs><g transform="translate(145,0)"><path d="${shapes[type]||shapes['long-top']}" fill="#f4f5f7" stroke="#334155" stroke-width="2.5"/>${marks}</g>${text}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="white"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="#596982"/></marker></defs><g transform="translate(145,0)"><path d="${shapes[type]||shapes['long-top']}" fill="#f4f5f7" stroke="#334155" stroke-width="2.5"/>${marks}</g><text x="320" y="382" text-anchor="middle" fill="#334155" font-size="14" font-family="sans-serif">${lang==='en'?legendEn:legend}</text></svg>`;
}
export const guideUrl = (type,lang,opts) => 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(guideSvg(type,lang,opts));
export function documentBlocks({slots,fitEnabled,texts,garment,rows}) {
  const blocks=[];
  // role은 테마(detailThemes.js)가 모양을 정할 때 쓰는 표시입니다. 기본 테마는 쓰지 않습니다.
  const text=(value,size=24,role='body',extra={})=>{if(value?.trim())blocks.push({kind:'text',value,size,role,...extra});};
  const picture=(slot,role='photo')=>{if(slot?.enabled&&slot.image)blocks.push({kind:'image',src:slot.image,label:slot.label,role});};
  picture(slots.hero,'hero');
  text(texts.headline,36,'headline');text(texts.description,24,'body');text(texts.product,20,'product');
  if(fitEnabled&&slots.fit.image&&slots.fit.enabled){text(texts.fitTitle,32,'section',{section:'fit'});picture(slots.fit);text(texts.fitDescription,22,'caption');}
  const details=Object.values(slots).filter(s=>!['hero','fit'].includes(s.id)&&s.enabled&&s.image);
  if(details.length){text(texts.detailTitle,32,'section',{section:'detail'});for(const slot of details){text(slot.label,24,'label');picture(slot,'detail');}}
  text(texts.sizeTitle,32,'section',{section:'size'});
  blocks.push({kind:'image',src:guideUrl(garment),label:'치수 측정 가이드',guide:true,role:'guide',garment});
  const fields=sizeFields(garment);
  blocks.push({kind:'table',headers:fields.map(([,label])=>label),rows:rows.map(row=>fields.map(([key])=>row[key]||'—')),role:'table'});
  text(texts.sizeNote,18,'note');
  return blocks;
}
export function documentHtml(blocks,title) {
  const content=blocks.map(b=>b.kind==='text'?`<p style="font-size:${b.size}px">${esc(b.value)}</p>`:b.kind==='image'?`<img src="${esc(b.src)}" alt="${esc(b.label)}">`:`<table><thead><tr>${b.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#202632;font-family:Arial,sans-serif}main{max-width:860px;margin:auto;padding:40px}p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;margin:24px 0}img{display:block;width:100%;max-height:1000px;object-fit:contain;background:white;margin:24px auto}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:24px 0;font-size:18px}td,th{border:1px solid #d7dce3;padding:12px 4px;text-align:center;overflow-wrap:anywhere}th{background:#f3f4f6}</style><main>${content}</main></html>`;
}
