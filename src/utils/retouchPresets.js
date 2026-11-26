import {HANGER_V2} from './appMode.js';
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
// hangerMode: 'keep'(옷걸이 남기고 반투명 고리만 선명하게, ?v1 기본값) | 'remove'(옷걸이 지우기, 016 사장님 결정: 옷걸이 v2 새 상품 기본값)
// 1차 보정 색감 기본값(사장님 결정 2026-11-23): 새로 넣는 사진에만 저장됩니다. 예전에 저장한 사진은 값이 없어 0(그대로)으로 남습니다.
// 사진마다 ‘밝기·화사하게’ 슬라이더로 조절하거나 ‘색감 보정 끄기’로 0으로 돌릴 수 있습니다.
export const DEFAULT_TONE={bright:20,vivid:30};
// autoLevelBeta: 사진을 넣을 때 자동 수평 맞추기(실험, 기본 꺼짐 — 013 팀장 결정: 상품 3개에서 거의 모든 컷이 틀림). 꺼져 있으면 '수평 제안 n°'만 보여 줍니다.
//   예전 설정 autoLevel(기본 켬)은 더 이상 쓰지 않습니다(저장된 설정 때문에 다시 켜지지 않도록 새 이름).
// clearWhite: 흰·아이보리 옷의 누런 기를 약하게 덜고 밝은 부분을 살짝 올림(013-B, 기본 켬, 브라우저 계산)
// clearFinial: 마네킹 금색 꼭지 위에 남은 벽 걸이 부품 지우기(013-B). 옷걸이 v2에서는 끔(금색 옷걸이 고리를 꼭지로 볼 수 있음, 점검 C-3).
export const POST_OPTIONS=['removeStand','cleanIslands','cleanMannequinTop','clearFinial','hangerMode','autoLevel','autoLevelBeta','clearWhite'];
export const DEFAULT_RETOUCH_V1 = {cutout:'photoroom', autoLevelBeta:false, removeStand:true, cleanIslands:true, cleanMannequinTop:false, clearWhite:true, clearFinial:true, hangerMode:'keep', removeBackground:true, center:true, lighting:false, shadow:false, mannequin:'keep', presets:[], custom:'', engine:'photoroom'};
// 옷걸이 v2(014) 기본값: 받침대 기둥 지우기·꼭지 위 정리·마네킹 꼭지 지우기·자동 수평을 끕니다(옷걸이 사진에는 받침대·꼭지가 없고,
// 켜 두면 늘어진 끈·금색 고리를 잘못 지울 수 있음 — 점검 C-2·C-3). 흰 옷 맑게는 켬.
// 016(사장님 결정 변경): 누끼 때 옷걸이도 지웁니다(hangerMode 'remove'). 새 상품에만 적용 — 설정을 저장한 예전 상품은 keepSavedHanger로 그대로 둡니다.
export const V2_RETOUCH = {removeStand:false, clearFinial:false, cleanMannequinTop:false, autoLevelBeta:false, hangerMode:'remove', mannequin:'keep'};
export const DEFAULT_RETOUCH = HANGER_V2 ? {...DEFAULT_RETOUCH_V1, ...V2_RETOUCH} : DEFAULT_RETOUCH_V1;
// 저장된 상품 설정(saved)을 열 때: 설정이 저장된 상품인데 옷걸이 값이 없으면 예전 기본값(남기기)으로 둡니다. 설정이 없는 새 상품은 지금 기본값.
export const keepSavedHanger = (saved, defaults=DEFAULT_RETOUCH) => saved ? {...defaults, hangerMode:'keep', ...saved} : {...defaults};
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
