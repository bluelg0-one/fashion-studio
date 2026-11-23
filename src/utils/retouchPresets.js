// 누끼·보정 기본 프롬프트. 화면(체크박스)과 서버(실제 프롬프트 조립)가 함께 사용합니다.
// 서버는 화면에서 받은 id만 믿고, 프롬프트 문장은 여기에서 만듭니다.
export const RETOUCH_PRESETS = [
  {id:'symmetry', label:'좌우 대칭 옷은 대칭 맞추기', prompt:'If the garment is designed to be symmetrical, make the left and right sides even (sleeves, shoulders, collar, hem and side seams) without changing the design.'},
  {id:'straighten', label:'기울어진 각도를 바로 세워 중앙 정렬', prompt:'Straighten any tilt or skew so the garment stands upright, level and facing straight forward, centered in the frame.'},
];

export const PRESERVE_PROMPT = 'This is a real clothing product photo for an online store. Keep the exact same garment: do not change its color, pattern, stripe width or spacing, fabric texture, logos, buttons, seams or silhouette, and do not invent details. Keep the same camera view.';

// 다림질(구김)·얼룩 지우기는 IOPaint(무료, 내 PC)로 옮겼습니다. 예전에 저장된 설정의 해당 항목은 지웁니다.
export const MOVED_TO_IOPAINT=['iron','clean'];
export const sanitizeRetouch=r=>r&&{...r,cutout:CUTOUT_ENGINES.includes(r.cutout)?r.cutout:'photoroom',presets:(r.presets||[]).filter(p=>!MOVED_TO_IOPAINT.includes(p))};
// cutout: 배경 지우기 엔진 — 'photoroom'(유료, 서버) 또는 'birefnet'(무료, 내 PC의 IOPaint).
export const CUTOUT_ENGINES=['photoroom','birefnet'];
// 누끼 뒤 정리(브라우저 계산, 무료) — 엔진 호출과 상관없는 설정이라 Photoroom 재과금 기준(캐시 키)에서 뺍니다.
// cleanIslands: 떨어진 작은 조각 정리 / cleanMannequinTop: 마네킹 금색 꼭지·목 받침 지우기(사장님 결정: 기본 남김)
// hangerMode: 'keep'(옷걸이 남기고 반투명 고리만 선명하게, 사장님 결정 기본값) | 'remove'(옷걸이 지우기)
// 1차 보정 색감 기본값(사장님 결정 2026-11-23): 새로 넣는 사진에만 저장됩니다. 예전에 저장한 사진은 값이 없어 0(그대로)으로 남습니다.
// 사진마다 ‘밝기·화사하게’ 슬라이더로 조절하거나 ‘색감 보정 끄기’로 0으로 돌릴 수 있습니다.
export const DEFAULT_TONE={bright:20,vivid:30};
// autoLevel: 사진을 넣을 때 자동 수평 맞추기(무료, 기본 켬). 엔진 요청과 상관없어 재과금 기준에서 뺍니다.
export const POST_OPTIONS=['removeStand','cleanIslands','cleanMannequinTop','hangerMode','autoLevel'];
export const DEFAULT_RETOUCH = {cutout:'photoroom', autoLevel:true, removeStand:true, cleanIslands:true, cleanMannequinTop:false, hangerMode:'keep', removeBackground:true, center:true, lighting:false, shadow:false, mannequin:'keep', presets:[], custom:'', engine:'photoroom'};
// 마네킹 처리: 그대로 / 고스트 마네킹(마네킹을 지우고 옷만 입체로) / 플랫레이(바닥에 펼친 모습). 둘 다 생성형이며 결과가 1K로 작아집니다.
export const MANNEQUIN_MODES = [
  {id:'keep', label:'마네킹 그대로 두기'},
  {id:'ghost', label:'고스트 마네킹 (마네킹 지우고 옷만 입체로)'},
  {id:'flatlay', label:'플랫레이 (바닥에 펼쳐 놓은 모습)'},
];
// 결과 해상도가 1K(약 1024px)로 줄어드는 설정인지 (Photoroom 문서 기준).
export function lowResolution(o={},promptText='') {
  return o.mannequin==='ghost'||o.mannequin==='flatlay'||(o.engine!=='openai'&&Boolean(promptText));
}

// skipFeatures: Photoroom 전용 기능(예: AI 다림질)으로 처리하는 항목은 프롬프트에서 뺍니다.
export function retouchPrompt(options={},skipFeatures=false) {
  const chosen=RETOUCH_PRESETS.filter(p=>Array.isArray(options.presets)&&options.presets.includes(p.id)&&!(skipFeatures&&p.photoroomFeature)).map(p=>p.prompt);
  const custom=String(options.custom||'').trim().slice(0,1000);
  if(!chosen.length&&!custom)return '';
  return [PRESERVE_PROMPT,...chosen,custom&&`Additional request from the seller: ${custom}`].filter(Boolean).join(' ');
}
