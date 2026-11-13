import {GARMENTS} from '../utils/studioDocument.js';
import {SHOPEE_IMAGE, SHOPEE_TITLE_MAX, shopeePhotos, shopeePackage, sizeTableEn} from '../utils/shopeeExport.js';
import {downloadBlob} from '../utils/studioImages.js';
import {Cost} from './Cost.jsx';

export default function ShopeePanel({shopee,setShopee,slots,fitEnabled,garment,rows,texts,ready,task,setStep,api,productName}) {
  const set=patch=>setShopee(current=>({...current,...patch}));
  const photos=shopeePhotos(slots,fitEnabled);
  const hasSizes=sizeTableEn(garment,rows).rows.length>0;
  const chart=shopee.includeSizeChart!==false&&hasSizes;
  const total=photos.length+(chart?1:0);
  async function writeCopy() {
    await task(async()=>{
      setStep('쇼피용 영문 상품명·설명 작성 중');
      const result=await api('shopee',{garment:GARMENTS.find(g=>g.id===garment)?.label,headline:texts.headline,description:texts.description,product:texts.product,image:slots.hero.image||slots.hero.source});
      set({title:result.title,description:result.description});
      setStep('영문 상품명·설명을 작성했습니다. 사실과 다른 내용이 없는지 확인하고 고쳐 주세요.');
    });
  }
  async function download() {
    await task(async()=>{
      setStep('쇼피용 사진(정사각형·JPG 2MB 이하)과 등록 정보를 묶는 중');
      const {blob,count,skipped,filename}=await shopeePackage({name:productName,slots,fitEnabled,garment,rows,shopee,texts});
      downloadBlob(blob,filename);
      setStep(`쇼피 등록 묶음 저장 완료 · 사진 ${count}장${skipped?` (쇼피 최대 ${SHOPEE_IMAGE.maxCount}장이라 ${skipped}장 제외)`:''}`);
    });
  }
  return <section className="editor-section shopee-panel"><h2>05 · 쇼피 등록 준비</h2>
    <p>싱가포르 쇼피에 올릴 영문 상품명·설명과, 쇼피 규격 사진(정사각형 · 흰 배경 · JPG 2MB 이하)을 한 번에 준비합니다.</p>
    <span className="btn-with-cost"><button type="button" disabled={!slots.hero.image||(ready&&!ready.openai)} onClick={writeCopy}>영문 상품명·설명 자동 작성</button><Cost k="openai"/></span>
    {ready&&!ready.openai&&<p className="slot-note">OpenAI 키가 없어 자동 작성은 쓸 수 없습니다. 직접 입력하세요.</p>}
    <label>영문 상품명 <small>{(shopee.title||'').length}/{SHOPEE_TITLE_MAX}</small><input aria-label="쇼피 영문 상품명" maxLength={SHOPEE_TITLE_MAX} value={shopee.title||''} onChange={e=>set({title:e.target.value})} placeholder="Women's Striped Round Neck Long Sleeve T-Shirt"/></label>
    <label>영문 상품 설명<textarea aria-label="쇼피 영문 상품 설명" maxLength={3000} value={shopee.description||''} onChange={e=>set({description:e.target.value})} placeholder="스타일·핏·디테일. 사이즈는 아래 사이즈표에서 자동으로 붙습니다."/></label>
    <p className="slot-note">소재·원산지·세탁법은 확인된 내용만 직접 넣어 주세요. AI는 입력에 없는 내용을 쓰지 않도록 설정돼 있지만, 꼭 검토가 필요합니다.</p>
    <label className="check"><input type="checkbox" aria-label="영문 사이즈표 이미지 포함" checked={shopee.includeSizeChart!==false} onChange={e=>set({includeSizeChart:e.target.checked})}/>영문 사이즈표 이미지 포함 {!hasSizes&&'(04 · Size에 치수를 입력하면 만들어집니다)'}</label>
    <div className="shopee-photos" aria-label="쇼피 사진 순서">
      {photos.slice(0,SHOPEE_IMAGE.maxCount-(chart?1:0)).map((s,i)=><figure key={s.id}><img src={s.image} alt={s.label}/><figcaption>{i+1}. {s.label}</figcaption></figure>)}
      {chart&&<figure className="chart"><div>Size Chart</div><figcaption>{Math.min(photos.length,SHOPEE_IMAGE.maxCount-1)+1}. 영문 사이즈표</figcaption></figure>}
    </div>
    <p className="slot-note">사진 {Math.min(total,SHOPEE_IMAGE.maxCount)}장 · 대표 → 모델컷 → 디테일 → 사이즈표 순서{total>SHOPEE_IMAGE.maxCount?` · 쇼피는 최대 ${SHOPEE_IMAGE.maxCount}장이라 ${total-SHOPEE_IMAGE.maxCount}장은 빠집니다(디테일의 ‘상세페이지에 포함’ 체크로 고르세요)`:''}</p>
    <span className="btn-with-cost"><button type="button" className="primary" disabled={!photos.length} onClick={download}>쇼피 등록 묶음 다운로드 (ZIP)</button><Cost k="browser"/></span>
    <p className="review-note">쇼피 개발자 승인이 나면 이 자리에 ‘쇼피에 바로 등록’ 버튼이 추가됩니다.</p>
  </section>;
}
