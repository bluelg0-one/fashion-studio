// 쇼피 등록 준비: 쇼피용 사진(정사각형·흰 배경·JPG 2MB 이하)과 등록 정보 묶음(ZIP)을 만듭니다.
// 사진 기준은 판매자 가이드에서 공통으로 권하는 값입니다(1:1, 800px 이상, 2MB 이하). 셀러센터 안내와 다르면 아래 값을 바꾸세요.
import JSZip from 'jszip';
import {loadImage, renderDocument} from './studioImages.js';
import {sizeFields, guideUrl} from './studioDocument.js';

export const SHOPEE_IMAGE={min:800,max:1600,maxBytes:2*1024*1024,maxCount:9,fill:.9};
export const SHOPEE_TITLE_MAX=120;
const SIZE_EN={size:'Size',chest:'Chest (flat)',length:'Length',waist:'Waist (flat)',rise:'Rise',hip:'Hip (flat)',thigh:'Thigh (flat)',hem:'Hem (flat)'};

const toBlob=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('사진 변환에 실패했습니다.')),type,quality));

// 흰 배경 정사각형에 옷을 가운데 배치하고, 2MB 이하가 될 때까지 JPG 화질→크기 순으로 낮춥니다.
export async function shopeeSquare(src,opts=SHOPEE_IMAGE) {
  const im=await loadImage(src);
  let size=Math.max(opts.min,Math.min(opts.max,Math.max(im.naturalWidth,im.naturalHeight)));
  for(let attempt=0;attempt<6;attempt++){
    const c=document.createElement('canvas');c.width=c.height=size;
    const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.imageSmoothingQuality='high';
    const scale=Math.min(size*opts.fill/im.naturalWidth,size*opts.fill/im.naturalHeight);
    const w=im.naturalWidth*scale,h=im.naturalHeight*scale;
    ctx.drawImage(im,(size-w)/2,(size-h)/2,w,h);
    for(const quality of [.92,.86,.8,.72,.64]){
      const blob=await toBlob(c,'image/jpeg',quality);
      if(blob.size<=opts.maxBytes)return {blob,size,quality};
    }
    if(size<=opts.min)break;
    size=Math.max(opts.min,Math.round(size*.82));
  }
  throw new Error('사진을 2MB 이하로 줄이지 못했습니다. 더 단순한 사진을 사용하세요.');
}

export function sizeTableEn(garment,rows) {
  const fields=sizeFields(garment);
  return {headers:fields.map(([key])=>SIZE_EN[key]||key),rows:rows.filter(r=>Object.values(r).some(v=>String(v).trim())).map(r=>fields.map(([key])=>r[key]?.trim()||'-'))};
}

// 영문 사이즈표 이미지(치수 가이드 + 표). 값은 사용자가 입력한 숫자만 사용합니다.
export async function sizeChartImage(garment,rows) {
  const table=sizeTableEn(garment,rows);
  if(!table.rows.length)return null;
  const blob=await renderDocument([
    {kind:'text',value:'Size Chart (cm)',size:34},
    {kind:'image',src:guideUrl(garment,'en'),label:'size guide'},
    {kind:'table',...table},
    {kind:'text',value:'Measured flat in centimeters. Measurements may vary slightly depending on how and where they are taken.',size:18},
  ]);
  const url=URL.createObjectURL(blob);
  try {return await shopeeSquare(url);} finally {URL.revokeObjectURL(url);}
}

// 쇼피에 올릴 사진 순서: 대표 → 모델컷 → 디테일 → 사이즈표. 최대 9장.
export function shopeePhotos(slots,fitEnabled) {
  const list=[];
  if(slots.hero?.image)list.push(slots.hero);
  if(fitEnabled&&slots.fit?.enabled&&slots.fit.image)list.push(slots.fit);
  for(const s of Object.values(slots))if(!['hero','fit'].includes(s.id)&&s.enabled&&s.image)list.push(s);
  return list;
}

export function sizeText(garment,rows) {
  const t=sizeTableEn(garment,rows);
  if(!t.rows.length)return '';
  return ['Size (cm, measured flat)',t.headers.join(' | '),...t.rows.map(r=>r.join(' | '))].join('\n');
}

// 파일 이름은 영문·숫자만 씁니다(한글 이름은 일부 브라우저·압축 프로그램에서 깨질 수 있음).
const slug=name=>String(name||'').normalize('NFKD').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
const photoName=(slot,i)=>slot.id==='hero'?'main':slot.id==='fit'?'model':slug(slot.id.replace(/^extra-.*/,'extra'))||`detail-${i}`;

export async function shopeePackage({name,slots,fitEnabled,garment,rows,shopee,texts}) {
  const photos=shopeePhotos(slots,fitEnabled);
  if(!photos.length)throw new Error('대표 사진을 먼저 넣어주세요.');
  const base=slug(shopee.title)||slug(name)||`product-${new Date().toISOString().slice(0,10)}`;
  const zip=new JSZip(),folder=zip.folder(base);
  const chart=shopee.includeSizeChart!==false?await sizeChartImage(garment,rows):null;
  const room=SHOPEE_IMAGE.maxCount-(chart?1:0),used=photos.slice(0,room),files=[];
  for(let i=0;i<used.length;i++){
    const {blob}=await shopeeSquare(used[i].image);const file=`${String(i+1).padStart(2,'0')}-${photoName(used[i],i)}.jpg`;
    folder.file(file,blob);files.push(file);
  }
  if(chart){const file=`${String(files.length+1).padStart(2,'0')}-size-chart.jpg`;folder.file(file,chart.blob);files.push(file);}
  const description=[shopee.description?.trim(),sizeText(garment,rows)].filter(Boolean).join('\n\n');
  folder.file('listing.txt',[`Product (Korean name): ${name||''}`,`Title:\n${shopee.title||''}`,`Description:\n${description}`,`Images (upload in this order):\n${files.join('\n')}`].join('\n\n'));
  folder.file('listing.json',JSON.stringify({title:shopee.title||'',description,images:files,garment,sizes:sizeTableEn(garment,rows),korean:{headline:texts.headline,description:texts.description,product:texts.product}},null,2));
  const blob=await zip.generateAsync({type:'blob'});
  return {blob,count:files.length,skipped:photos.length-used.length,filename:`${base}-shopee.zip`};
}
