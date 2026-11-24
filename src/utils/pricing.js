// 유료 API 단가표 (한 곳에서만 관리). 화면의 예상 비용(cost.js)과 비용 기록(costLog.js)이 모두 이 표로 계산합니다.
// 단가가 바뀌면 이 파일만 고치세요. 공식 단가를 확인하지 못한 항목은 null(= '미확인')로 두고, 토큰 수만 기록합니다.
export const SOURCES={
  claude:{url:'https://platform.claude.com/docs/en/about-claude/pricing',checked:'2026-11-24',note:'Model pricing 표 (USD / 100만 토큰)'},
  photoroomCredits:{url:'https://docs.photoroom.com/getting-started/pricing',checked:'2026-11-24',note:'“1 call to the Image Editing API is worth 5 calls to the Remove Background API” · 오류 난 호출은 차감 없음'},
  photoroomPrice:{url:'https://www.photoroom.com/api/pricing',checked:null,note:'장당 $0.10은 사장님 지시서·CLAUDE.md 기준. 이 가격 페이지는 작업 환경에서 열리지 않아 다시 확인하지 못함'},
  openai:{url:'https://platform.openai.com/docs/pricing',checked:null,note:'작업 환경에서 열리지 않아 미확인 → 토큰만 기록'},
};

// Claude 모델 단가 (USD / 100만 토큰). 출처: SOURCES.claude (2026-11-24 확인)
// input = 기본 입력, cacheWrite5m·cacheWrite1h = 캐시 쓰기, cacheRead = 캐시 읽기(적중), output = 출력
export const CLAUDE_PRICES={
  'claude-opus-5-5':{label:'Claude Opus 5.5',input:4,cacheWrite5m:5,cacheWrite1h:8,cacheRead:.2,output:20},
  'claude-opus-5':{label:'Claude Opus 5',input:5,cacheWrite5m:6.25,cacheWrite1h:10,cacheRead:.5,output:25},
  'claude-opus-4-8':{label:'Claude Opus 4.8',input:5,cacheWrite5m:6.25,cacheWrite1h:10,cacheRead:.5,output:25},
  'claude-sonnet-5-5':{label:'Claude Sonnet 5.5',input:2,cacheWrite5m:2.5,cacheWrite1h:4,cacheRead:.1,output:10},
  'claude-sonnet-5':{label:'Claude Sonnet 5',input:2,cacheWrite5m:2.5,cacheWrite1h:4,cacheRead:.2,output:10},
  'claude-haiku-4-5':{label:'Claude Haiku 4.5',input:1,cacheWrite5m:1.25,cacheWrite1h:2,cacheRead:.1,output:5},
};
// OpenAI: 공식 단가 미확인 → null. 확인되면 {input, output}(USD / 100만 토큰)을 넣으면 바로 계산됩니다.
export const OPENAI_PRICES={'gpt-4.1-mini':null,'gpt-image-1':null};
// Photoroom: 이미지 편집(v2/edit) 호출 1번 = $0.10 (옵션 수와 무관), 남은 이미지 수 5 차감(배경 제거 5회분).
export const PHOTOROOM={perCall:.1,credits:5,label:'Photoroom'};

// 응답의 model 값(예: 'claude-opus-5-5', 날짜가 붙은 이름)을 단가표 이름으로 맞춥니다. 긴 이름부터 비교.
const KEYS=Object.keys(CLAUDE_PRICES).sort((a,b)=>b.length-a.length);
export function claudePrice(model) {const m=String(model||'');const k=KEYS.find(k=>m===k||m.startsWith(k+'-')||m.startsWith(k+'@'));return k?{key:k,...CLAUDE_PRICES[k]}:null;}
export function openaiPrice(model) {const m=String(model||'');const k=Object.keys(OPENAI_PRICES).sort((a,b)=>b.length-a.length).find(k=>m===k||m.startsWith(k+'-'));return k?OPENAI_PRICES[k]:null;}

const num=v=>Number.isFinite(Number(v))?Number(v):0;
// Anthropic usage → 비용(USD). 단가를 모르는 모델이면 null(미확인).
// input_tokens에는 캐시 토큰이 들어 있지 않으므로 캐시 쓰기·읽기를 따로 더합니다. 캐시 쓰기 구분(5분/1시간)이 없으면 5분 단가로 계산합니다.
export function claudeCost(model,u={}) {
  const p=claudePrice(model);if(!p)return null;
  const w1h=num(u.cache_creation?.ephemeral_1h_input_tokens),w5m=u.cache_creation?num(u.cache_creation.ephemeral_5m_input_tokens):num(u.cache_creation_input_tokens)-w1h;
  return (num(u.input_tokens)*p.input+Math.max(0,w5m)*p.cacheWrite5m+w1h*p.cacheWrite1h+num(u.cache_read_input_tokens)*p.cacheRead+num(u.output_tokens)*p.output)/1e6;
}
export function openaiCost(model,u={}) {const p=openaiPrice(model);return p?(num(u.input_tokens)*p.input+num(u.output_tokens)*p.output)/1e6:null;}

// 화면의 ‘예상 비용’ 계산용 토큰 가정(실제 값은 비용 통계에서 확인). 사진 토큰 ≈ 가로×세로÷750.
// - 수정할 곳 찾기 1회: 긴 변 1024px 사진 약 1,000~1,400 + 지시문·형식 약 500~1,100 → 입력 1,500~2,500 / 출력(상자 목록) 50~1,500
// - 자동 분류 1회: 512px 축소 사진 장당 약 270 × 5~24장 + 지시문 → 입력 2,000~8,000 / 출력 500~3,000
export const ESTIMATES={
  claudeDefects:{model:'claude-opus-5-5',input:[1500,2500],output:[50,1500],unit:'장'},
  claudeClassify:{model:'claude-opus-5-5',input:[2000,8000],output:[500,3000],unit:'회'},
};
export function estimateRange(k) {
  const e=ESTIMATES[k],p=claudePrice(e.model);
  return [0,1].map(i=>(e.input[i]*p.input+e.output[i]*p.output)/1e6);
}
const usd2=v=>(Math.round(v*100)/100).toFixed(2);
export function estimateText(k) {const [a,b]=estimateRange(k);return `약 $${usd2(a)}~${usd2(b)}/${ESTIMATES[k].unit}`;}
