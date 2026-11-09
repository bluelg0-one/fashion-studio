// 누끼·보정 기본 프롬프트. 화면(체크박스)과 서버(실제 프롬프트 조립)가 함께 사용합니다.
// 서버는 화면에서 받은 id만 믿고, 프롬프트 문장은 여기에서 만듭니다.
export const RETOUCH_PRESETS = [
  {id:'clean', label:'마네킹 오염·지저분한 부분 깨끗하게', prompt:'Clean away dust, lint, loose threads, stains, smudges and scuffs on the mannequin and on the garment surface.'},
  {id:'iron', label:'원단 구김·접힌 부분 다림질한 듯 펴기 (Photoroom AI 다림질)', photoroomFeature:'ironing', prompt:'Smooth accidental wrinkles, creases and folded-over areas of the fabric as if the garment was freshly ironed and steamed. Keep intentional pleats, darts and seams.'},
  {id:'symmetry', label:'좌우 대칭 옷은 대칭 맞추기', prompt:'If the garment is designed to be symmetrical, make the left and right sides even (sleeves, shoulders, collar, hem and side seams) without changing the design.'},
  {id:'straighten', label:'기울어진 각도를 바로 세워 중앙 정렬', prompt:'Straighten any tilt or skew so the garment stands upright, level and facing straight forward, centered in the frame.'},
];

export const PRESERVE_PROMPT = 'This is a real clothing product photo for an online store. Keep the exact same garment: do not change its color, pattern, stripe width or spacing, fabric texture, logos, buttons, seams or silhouette, and do not invent details. Keep the same camera view.';

export const DEFAULT_RETOUCH = {removeBackground:true, center:true, lighting:false, presets:[], custom:'', engine:'photoroom'};

// skipFeatures: Photoroom 전용 기능(예: AI 다림질)으로 처리하는 항목은 프롬프트에서 뺍니다.
export function retouchPrompt(options={},skipFeatures=false) {
  const chosen=RETOUCH_PRESETS.filter(p=>Array.isArray(options.presets)&&options.presets.includes(p.id)&&!(skipFeatures&&p.photoroomFeature)).map(p=>p.prompt);
  const custom=String(options.custom||'').trim().slice(0,1000);
  if(!chosen.length&&!custom)return '';
  return [PRESERVE_PROMPT,...chosen,custom&&`Additional request from the seller: ${custom}`].filter(Boolean).join(' ');
}
