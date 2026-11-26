// 드라이브 사진 → 앱에서 쓰는 사진. 분류용 작은 사진(썸네일)과 상품용 사진을 따로 받아(메모리 절약) 만듭니다.
import {downloadFile} from './googleDrive.js';
import {readPhoto, readOriginal, thumbnail} from './studioImages.js';

// HEIC(아이폰 사진)는 브라우저가 열 수 있을 때만(사파리 등) JPG로 바꿔 씁니다. 크롬은 대부분 열지 못합니다(실패로 표시).
export async function toReadableFile(blob,name,mimeType) {
  const type=blob.type&&blob.type!=='application/octet-stream'?blob.type:mimeType;
  if(['image/jpeg','image/png','image/webp'].includes(type))return new File([blob],name,{type});
  let bmp;
  try {bmp=await createImageBitmap(blob);}
  catch {throw new Error(/hei[cf]/i.test(type||name)?'HEIC(아이폰) 사진은 이 브라우저에서 열 수 없습니다. 휴대폰에서 JPG로 바꿔(설정 → 카메라 → 포맷 → 높은 호환성) 다시 올려 주세요.':'사진을 열 수 없습니다(지원하지 않는 형식).');}
  const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d').drawImage(bmp,0,0);bmp.close?.();
  const jpg=await new Promise(res=>c.toBlob(res,'image/jpeg',.92));
  return new File([jpg],name.replace(/\.\w+$/,'')+'.jpg',{type:'image/jpeg'});
}
export async function driveThumb(f) {
  const file=await toReadableFile(await downloadFile(f.id),f.name,f.mimeType),url=URL.createObjectURL(file);
  try {return await thumbnail(url);} finally {URL.revokeObjectURL(url);}
}
export async function driveFull(f) {return readPhoto(await toReadableFile(await downloadFile(f.id),f.name,f.mimeType));}
// 옷걸이 v2(014): 작업용 사진 + (크면) 원본 보관용 사진을 한 번 받아서 함께 만듭니다.
export async function driveFullWithOriginal(f) {const file=await toReadableFile(await downloadFile(f.id),f.name,f.mimeType);return {full:await readPhoto(file),original:await readOriginal(file)};}
// 묶음 사이 같은 옷 비교용 참고 사진(더 작게)
export const refThumb=src=>thumbnail(src,256);
