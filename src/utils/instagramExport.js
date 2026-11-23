// 인스타그램 게시 준비: 사진을 4:5(1080×1350) JPG로 맞추고, 같은 틀로 캡션을 만듭니다.
import JSZip from 'jszip';
import {loadImage} from './studioImages.js';
import {shopeePhotos} from './shopeeExport.js';

// 인스타그램 피드 세로 사진 기준(4:5). 게시 API는 JPG만 받고 한 게시물에 최대 10장입니다.
export const IG_IMAGE={width:1080,height:1350,fill:.94,maxBytes:3*1024*1024,maxCount:10};
export const IG_CAPTION_MAX=2200, IG_HASHTAG_MAX=30;
const DEFAULTS_KEY='fashion-studio-instagram-defaults';

// 배송·구매 안내·해시태그는 상품마다 거의 같으므로 마지막에 쓴 값을 다음 상품의 기본값으로 씁니다.
function savedDefaults() {try{return JSON.parse(localStorage.getItem(DEFAULTS_KEY))||{};}catch{return {};}}
export function rememberDefaults({shipping,dm,profileLink,hashtags,fit}) {try{localStorage.setItem(DEFAULTS_KEY,JSON.stringify({shipping,dm,profileLink,hashtags,fit}));}catch{}}
export const defaultInstagram=()=>({title:'',color:'',size:'',material:'',price:'',quantity:'',note:'',shipping:'무료배송',dm:true,profileLink:false,hashtags:'#여성의류 #데일리룩',fit:'contain',caption:'',captionEdited:false,posted:null,...savedDefaults()});

const toBlob=(canvas,quality)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('사진 변환에 실패했습니다.')),'image/jpeg',quality));

// contain: 흰 배경에 옷 전체가 보이게 / cover: 가장자리를 잘라 화면을 꽉 채움(모델컷 등 배경이 있는 사진용).
export async function instagramFrame(src,fit='contain',opts=IG_IMAGE) {
  const im=await loadImage(src),c=document.createElement('canvas');
  c.width=opts.width;c.height=opts.height;
  const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingQuality='high';
  const scale=fit==='cover'?Math.max(c.width/im.naturalWidth,c.height/im.naturalHeight):Math.min(c.width*opts.fill/im.naturalWidth,c.height*opts.fill/im.naturalHeight);
  const w=im.naturalWidth*scale,h=im.naturalHeight*scale;
  ctx.drawImage(im,(c.width-w)/2,(c.height-h)/2,w,h);
  for(const quality of [.92,.86,.8,.72,.64]){
    const blob=await toBlob(c,quality);
    if(blob.size<=opts.maxBytes)return blob;
  }
  throw new Error('사진을 3MB 이하로 줄이지 못했습니다.');
}

// 사진 순서는 쇼피와 같습니다: 대표 → 모델컷 → 디테일.
export const instagramPhotos=(slots,fitEnabled)=>shopeePhotos(slots,fitEnabled);

const won=value=>{const text=String(value||'').trim();if(!text)return '';const digits=text.replace(/[,\s원]/g,'');return /^\d+$/.test(digits)?`${Number(digits).toLocaleString('ko-KR')}원`:text;};
const quantityText=value=>{const text=String(value||'').trim();return /^\d+$/.test(text)?`${text}장 한정`:text;};
export const countHashtags=caption=>(String(caption).match(/#[^\s#]+/g)||[]).length;

// 캡션 틀. 입력하지 않은 항목은 줄째로 빠집니다(추측해서 채우지 않음).
export function buildCaption(f) {
  const price=[won(f.price),f.shipping?.trim()&&`(${f.shipping.trim()})`].filter(Boolean).join(' ');
  const facts=[['컬러',f.color],['사이즈',f.size],['소재',f.material],['가격',won(f.price)?price:''],['수량',quantityText(f.quantity)]].filter(([,value])=>String(value||'').trim()).map(([label,value])=>`${label} | ${String(value).trim()}`);
  const buy=[f.dm&&'구매·문의는 DM 주세요 💌',f.profileLink&&'프로필 링크에서도 구매하실 수 있어요.'].filter(Boolean);
  return [f.title?.trim(),facts.join('\n'),f.note?.trim(),buy.join('\n'),f.hashtags?.trim()].filter(Boolean).join('\n\n');
}
export const captionOf=instagram=>instagram.captionEdited?instagram.caption||'':buildCaption(instagram);

export async function instagramImages({slots,fitEnabled,fit}) {
  const photos=instagramPhotos(slots,fitEnabled).slice(0,IG_IMAGE.maxCount),blobs=[];
  for(const photo of photos)blobs.push(await instagramFrame(photo.image,fit));
  return blobs;
}

const slug=name=>String(name||'').normalize('NFKD').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
// 직접 올릴 때 쓰는 묶음: 4:5 사진(올릴 순서대로)과 캡션 글.
export async function instagramPackage({name,slots,fitEnabled,instagram}) {
  const blobs=await instagramImages({slots,fitEnabled,fit:instagram.fit});
  if(!blobs.length)throw new Error('대표 사진을 먼저 넣어주세요.');
  const base=slug(name)||`product-${new Date().toISOString().slice(0,10)}`,zip=new JSZip(),folder=zip.folder(base);
  blobs.forEach((blob,i)=>folder.file(`${String(i+1).padStart(2,'0')}.jpg`,blob));
  folder.file('caption.txt',captionOf(instagram));
  return {blob:await zip.generateAsync({type:'blob'}),count:blobs.length,filename:`${base}-instagram.zip`};
}

export const blobToDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('사진을 읽을 수 없습니다.'));reader.readAsDataURL(blob);});
