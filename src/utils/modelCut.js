// 모델컷(017): 구도 규칙·자동 자르기·비용 기록. 브라우저와 검사(Node)가 함께 씁니다(계산만).
// 사장님 요청: "상의는 얼굴 없이 상반신만, 하의는 하반신만 강조". 옷 종류(studioDocument GARMENTS)로 구도를 정하고 화면에서 바꿀 수 있습니다.

export const COMPOSITIONS = {
  top: { label: '상반신 · 얼굴 없음 (턱 아래 ~ 골반)', prompt: 'cropped upper body shot from just below the chin to the hips, no face, face and head out of frame, focus on the top garment', face: false },
  bottom: { label: '하반신 (허리 ~ 발목)', prompt: 'lower body shot from the waist down to the ankles, no face, upper body and head out of frame, focus on the pants or skirt', face: false },
  shorts: { label: '하반신 (허리 ~ 무릎 아래)', prompt: 'lower body shot from the waist down to just below the knees, no face, upper body and head out of frame, focus on the shorts or skirt', face: false },
  dress: { label: '원피스 · 얼굴 없음 (어깨 ~ 밑단)', prompt: 'shot from the shoulders down to below the dress hem, no face, head out of frame, focus on the dress', face: false },
  full: { label: '전신 (얼굴 포함, 예전 방식)', prompt: '', face: true },
}
// 옷 종류 → 기본 구도
export function compositionOf(garment = '') {
  if (garment === 'short-pants') return 'shorts'
  if (garment.endsWith('pants') || garment === 'skirt') return 'bottom'
  if (garment === 'dress') return 'dress'
  return 'top'
}
// Google 가상 피팅은 사람 사진이 필요 → 구도별 기본 모델 사진 1장씩(하반신 두 가지는 같은 사진)
export const baseSlotOf = c => (c === 'shorts' ? 'bottom' : c === 'full' ? 'top' : c)
export const BASE_SLOTS = [['top', '상반신 (얼굴 없음)'], ['bottom', '하반신'], ['dress', '원피스 (어깨~밑단, 얼굴 없음)']]

// ── 엔진·비용 ─────────────────────────────────────────────
// 단가(추정): FASHN 1크레딧 $0.075(help.fashn.ai 검색 요약) — product-to-model 장당 크레딧 수는 미확인(1크레딧으로 가정, 얼굴 고정·고해상도는 추가).
//             Google Virtual Try-On $0.06/장(Vertex AI 가격표 검색 요약, 원문 미확인).
export const ENGINES = {
  fashn: { label: 'FASHN', perImage: 0.075, model: 'FASHN product-to-model (추정)', note: '장당 약 $0.075~ (1크레딧 가정 · 얼굴 고정은 추가 · 단가 미확인)' },
  google: { label: 'Google 가상 피팅', perImage: 0.06, model: 'Google Virtual Try-On (추정)', note: '장당 약 $0.06 (Vertex AI 가격표 기준 · 원문 미확인)' },
}
export function modelCutRow({ engine, product, cut, images = 1, cached = false, now = new Date() }) {
  const e = ENGINES[engine] || ENGINES.fashn
  return { timestamp: now.toISOString(), product: product || '', cut: cut || '', feature: 'modelcut', model: e.model, sensitivity: null, calls: cached ? 0 : 1,
    input_tokens: 0, output_tokens: 0, cost_usd: cached ? 0 : e.perImage * images, boxes: null, photos: images, cached }
}

// ── 얼굴 자동 자르기 ──────────────────────────────────────
// 생성 지시에도 얼굴이 나오면 브라우저에서 자릅니다. 가운데 60% 폭에서 피부색 픽셀이 많은 줄이 위쪽에 이어지면 얼굴(+목)로 봅니다.
//  상반신·원피스: 얼굴 덩어리의 75% 지점(턱 바로 아래 추정)부터 아래만 남김 · 하반신: 얼굴 아래 또는 사진 높이 42% 중 아래쪽부터
// 피부색 판별은 대략적이라(피부색 옷·배경, 조명) 자른 경우는 항상 '확인 필요'로 표시하고 수동 슬라이더로 고칠 수 있게 합니다.
export const CROP = { search: 0.55, start: 0.08, keep: 0.04, minFace: 0.04, chin: 0.75, bottomMin: 0.42, minSide: 1000 }
export const isSkin = (r, g, b) => {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return r > 95 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173
}
export function faceCrop({ width, height, data }, composition = 'top', o = CROP) {
  const x0 = Math.floor(width * 0.2), x1 = Math.ceil(width * 0.8), span = x1 - x0, step = Math.max(1, Math.floor(span / 300))
  const ratio = y => { let s = 0, n = 0; for (let x = x0; x < x1; x += step) { const i = (y * width + x) * 4; n++; if (data[i + 3] > 128 && isSkin(data[i], data[i + 1], data[i + 2])) s++ } return s / n }
  const limit = Math.floor(height * o.search)
  let top = -1, end = -1
  for (let y = 0; y < limit; y++) {
    const r = ratio(y)
    if (top < 0) { if (r >= o.start) top = y; continue }
    if (r < o.keep) { end = y; break }
  }
  if (top >= 0 && end < 0) end = limit
  const face = top >= 0 && end - top >= height * o.minFace
  if (!face || COMPOSITIONS[composition]?.face) return { face, cropTop: 0, review: false, reason: face ? '전신 구도(얼굴 포함)' : '얼굴 없음' }
  const chin = Math.round(top + (end - top) * o.chin)
  const cropTop = composition === 'bottom' || composition === 'shorts' ? Math.max(end, Math.round(height * o.bottomMin)) : chin
  return { face, cropTop, review: true, reason: `얼굴로 보이는 부분(위 ${Math.round(end / height * 100)}%)이 있어 위 ${Math.round(cropTop / height * 100)}%를 잘랐습니다 · 확인 필요` }
}
// 자른 뒤 크기·해상도
export function cropInfo(width, height, cropTop, o = CROP) {
  const h = height - Math.max(0, Math.min(height - 1, Math.round(cropTop))), side = Math.max(width, h)
  return { width, height: h, side, lowRes: side < o.minSide, note: side < o.minSide ? `해상도 부족: 자른 뒤 긴 변 ${side}px (채널 기준 ${o.minSide}px 미만)` : '' }
}

// ── 고정 모델(018) ───────────────────────────────────────
// 사장님: "모델을 매번 새로 만들면 돈이 드니 처음 한 번만 만들어 고정으로 쓰자."
// 구도별 기본 모델 사진(top·bottom·dress)이 있으면 FASHN도 가상 피팅(tryon-v1.6: 사람 사진 + 옷 사진, 장당 1크레딧)으로 그 사람에게 입힙니다.
// 없으면 예전처럼 product-to-model(새 모델 생성). 고정 모델 방식에서는 얼굴 고정(face_reference, 추가 크레딧)을 쓰지 않습니다.
// FASHN 문서(docs.fashn.ai)는 이 작업 환경에서 열리지 않아 검색 요약 기준(원문 미확인): /v1/run, model_name 'tryon-v1.6',
// inputs {model_image, garment_image, category:'auto'|'tops'|'bottoms'|'one-pieces', num_samples, output_format}.
export const TRYON_CATEGORY = { top: 'tops', bottom: 'bottoms', shorts: 'bottoms', dress: 'one-pieces', full: 'auto' }
export const fashnMode = (base = {}, composition = 'top') => (base[baseSlotOf(composition)] ? 'fixed' : 'create')
export const FASHN_MODE_LABEL = { fixed: '고정 모델 · 장당 약 $0.075', create: '새 모델 생성' }
export function tryonInputs({ person, garment, composition, samples = 1 }) {
  return { model_image: person, garment_image: garment, category: TRYON_CATEGORY[composition] || 'auto', num_samples: Math.min(4, Math.max(1, samples)), output_format: 'jpeg' }
}
// 브라우저 저장본과 드라이브 저장본 중 나중에 바꾼 쪽(at)을 씁니다.
export function newerBase(local = {}, remote = null) {
  if (!remote || typeof remote !== 'object') return local
  return (Number(remote.at) || 0) > (Number(local.at) || 0) ? { top: remote.top, bottom: remote.bottom, dress: remote.dress, at: remote.at } : local
}
