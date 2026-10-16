export const GARMENTS = [
  {id:'long-top',label:'긴팔티셔츠'}, {id:'short-top',label:'반팔티셔츠'},
  {id:'vest',label:'조끼'}, {id:'dress',label:'원피스'},
  {id:'long-pants',label:'긴바지'}, {id:'short-pants',label:'반바지'},
];
export const TOP_FIELDS = [['size','사이즈'],['chest','가슴단면'],['length','총장']];
export const BOTTOM_FIELDS = [['size','사이즈'],['waist','허리단면'],['rise','밑위'],['hip','엉덩이 단면'],['thigh','허벅지 단면'],['hem','밑단단면'],['length','총장']];
export const sizeFields = type => type.endsWith('pants') ? BOTTOM_FIELDS : TOP_FIELDS;
export const newSizeRow = () => Object.fromEntries([...TOP_FIELDS,...BOTTOM_FIELDS].map(([key])=>[key,'']));
export const DETAIL_SLOTS = [
  ['frontZoom','정면 확대컷'],['frontTop','정면 상단컷'],['frontBottom','정면 하단컷'],
  ['fabric','원단컷'],['side','옆면컷'],['back','후면컷'],['extra','특정 디테일컷'],
];
export const initialSlots = () => Object.fromEntries([['hero','대표 정면샷'],['fit','모델컷'],...DETAIL_SLOTS].map(([id,label])=>[id,{id,label,enabled:true,source:null,image:null,cutout:null,crop:null,status:'empty'}]));
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The guide describes where to measure; numeric values only come from the user.
export function guideSvg(type) {
  const pants=type.endsWith('pants'),short=type==='short-pants';
  const shapes={
    'long-top':'M100 65 L65 85 L25 230 L65 245 L95 140 L95 300 L225 300 L225 140 L255 245 L295 230 L255 85 L220 65 Q160 105 100 65Z',
    'short-top':'M100 65 L65 85 L25 145 L70 175 L95 140 L95 300 L225 300 L225 140 L250 175 L295 145 L255 85 L220 65 Q160 105 100 65Z',
    vest:'M105 65 L80 80 Q105 125 90 155 L90 300 L230 300 L230 155 Q215 125 240 80 L215 65 Q160 110 105 65Z',
    dress:'M110 45 L75 65 L40 130 L85 155 L108 120 L110 180 L65 330 L255 330 L210 180 L212 120 L235 155 L280 130 L245 65 L210 45 Q160 85 110 45Z',
    'long-pants':'M95 50 L225 50 L245 330 L175 330 L160 160 L145 330 L75 330Z',
    'short-pants':'M95 70 L225 70 L245 240 L175 240 L160 150 L145 240 L75 240Z',
  };
  const line=(x1,y1,x2,y2,label,tx,ty)=>`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#596982" stroke-width="2" marker-start="url(#arrow)" marker-end="url(#arrow)"/><text x="${tx}" y="${ty}" fill="#334155" font-size="13" font-family="sans-serif">${label}</text>`;
  const marks=pants ?
    line(99,short?82:62,221,short?82:62,'A',155,short?75:55)+
    line(160,short?85:65,160,short?147:157,'B',164,118)+
    line(93,125,227,125,'C',100,117)+
    line(93,short?177:195,145,short?177:195,'D',106,short?170:188)+
    line(80,short?229:318,140,short?229:318,'E',103,short?222:311)+
    line(265,short?72:52,265,short?240:330,'F',272,195) :
    line(100,160,220,160,'A',155,152)+line(310,type==='dress'?48:68,310,type==='dress'?330:300,'B',316,210);
  const legend=pants?'A 허리단면 · B 밑위 · C 엉덩이 단면 · D 허벅지 단면 · E 밑단단면 · F 총장':'A 가슴단면 · B 총장';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="white"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="#596982"/></marker></defs><g transform="translate(145,0)"><path d="${shapes[type]||shapes['long-top']}" fill="#f4f5f7" stroke="#334155" stroke-width="2.5"/>${marks}</g><text x="320" y="382" text-anchor="middle" fill="#334155" font-size="14" font-family="sans-serif">${legend}</text></svg>`;
}
export const guideUrl = type => 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(guideSvg(type));
export function documentBlocks({slots,fitEnabled,texts,garment,rows}) {
  const blocks=[];
  const text=(value,size=24)=>{if(value?.trim())blocks.push({kind:'text',value,size});};
  const picture=slot=>{if(slot?.enabled&&slot.image)blocks.push({kind:'image',src:slot.image,label:slot.label});};
  picture(slots.hero);
  text(texts.headline,36);text(texts.description);text(texts.product,20);
  if(fitEnabled&&slots.fit.image&&slots.fit.enabled){text(texts.fitTitle,32);picture(slots.fit);text(texts.fitDescription,22);}
  const details=Object.values(slots).filter(s=>!['hero','fit'].includes(s.id)&&s.enabled&&s.image);
  if(details.length){text(texts.detailTitle,32);for(const slot of details){text(slot.label,24);picture(slot);}}
  text(texts.sizeTitle,32);
  blocks.push({kind:'image',src:guideUrl(garment),label:'치수 측정 가이드',guide:true});
  const fields=sizeFields(garment);
  blocks.push({kind:'table',headers:fields.map(([,label])=>label),rows:rows.map(row=>fields.map(([key])=>row[key]||'—'))});
  text(texts.sizeNote,18);
  return blocks;
}
export function documentHtml(blocks,title) {
  const content=blocks.map(b=>b.kind==='text'?`<p style="font-size:${b.size}px">${esc(b.value)}</p>`:b.kind==='image'?`<img src="${esc(b.src)}" alt="${esc(b.label)}">`:`<table><thead><tr>${b.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#202632;font-family:Arial,sans-serif}main{max-width:860px;margin:auto;padding:40px}p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;margin:24px 0}img{display:block;width:100%;max-height:1000px;object-fit:contain;background:white;margin:24px auto}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:24px 0;font-size:18px}td,th{border:1px solid #d7dce3;padding:12px 4px;text-align:center;overflow-wrap:anywhere}th{background:#f3f4f6}</style><main>${content}</main></html>`;
}
