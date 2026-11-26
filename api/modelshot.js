// AI 모델컷 전용 API (비동기 방식)
//
// 영상·일괄 생성은 60초를 넘길 수 있어서, 서버가 끝날 때까지 붙잡고 기다리지 않고
//   1) action: 'run'    → 작업만 시작하고 작업 ID를 바로 돌려줌
//   2) action: 'status' → 화면에서 몇 초마다 상태를 물어봄
//   3) action: 'fetch'  → 결과 이미지를 data URL로 받아옴 (FASHN 결과 URL은 약 3일 뒤 만료되므로 "내 모델" 저장용)
// 구조로 동작합니다.
//
// provider (엔진) — 엔진마다 run/status만 바꿔 끼웁니다(ENGINES). 새 엔진은 같은 모양의 함수 두 개만 추가하면 됩니다.
//   - 'fashn'     : FASHN API (https://docs.fashn.ai) — 환경변수 FASHN_API_KEY (서버 변수만 읽음)
//   - 'google'    : Google Vertex AI Virtual Try-On(017) — '사람 사진 + 옷 사진'을 받아 입힌 사진을 돌려줌(모델을 새로 만들지 않음).
//                   환경변수: GOOGLE_VTO_CREDENTIALS(서비스 계정 키 JSON 전체), GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION(기본 us-central1),
//                   GOOGLE_VTO_MODEL(기본 virtual-try-on-001). 키 값은 응답·로그에 넣지 않습니다.
//                   공식 문서(docs.cloud.google.com)는 이 작업 환경에서 열리지 않아, 검색 결과 요약에 나온 형식으로 구현했습니다(원문 미확인):
//                   POST https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{LOCATION}/publishers/google/models/{MODEL}:predict
//                   {instances:[{personImage:{image:{bytesBase64Encoded}}, productImages:[{image:{bytesBase64Encoded}}]}], parameters:{sampleCount:1~4}}
//                   응답 predictions[].bytesBase64Encoded / mimeType. 동기 방식이라 run에서 바로 결과를 돌려줍니다.
//   - 'styleroom' : 스타일룸 — 기업(Enterprise) 계약 시에만 REST API 제공, 공개 문서 없음.
//                   API 문서/키를 받으면 아래 styleroom 블록만 채우면 됩니다.

const FASHN_BASE = 'https://api.fashn.ai/v1'

// 화면에서 호출 가능한 FASHN 모델만 허용
const FASHN_ALLOWED_MODELS = new Set(['product-to-model', 'model-create', 'tryon-max', 'tryon-v1.6'])

function fashnKey() {
  return process.env.FASHN_API_KEY
}

// ── Google Vertex AI Virtual Try-On ─────────────────────────
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
function googleEnv() {
  const raw = process.env.GOOGLE_VTO_CREDENTIALS, project = process.env.GOOGLE_CLOUD_PROJECT
  if (!raw || !project) return null
  let cred
  try { cred = JSON.parse(raw) } catch { return { error: 'GOOGLE_VTO_CREDENTIALS가 올바른 JSON이 아닙니다(서비스 계정 키 파일 내용 전체를 넣어 주세요).' } }
  if (!cred.client_email || !cred.private_key) return { error: 'GOOGLE_VTO_CREDENTIALS에 client_email·private_key가 없습니다.' }
  const location = (process.env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim()
  if (!/^[a-z0-9-]+$/.test(location)) return { error: 'GOOGLE_CLOUD_LOCATION 형식이 올바르지 않습니다.' }
  const model = (process.env.GOOGLE_VTO_MODEL || 'virtual-try-on-001').trim()
  if (!/^[a-z0-9.-]+$/.test(model)) return { error: 'GOOGLE_VTO_MODEL 형식이 올바르지 않습니다.' }
  return { cred, project, location, model }
}
// 서비스 계정 키로 접근 토큰 받기(JWT 서명은 Node 기본 crypto, 새 패키지 없음). 토큰은 만료 1분 전까지 다시 씁니다.
let googleToken = null
async function googleAccessToken(cred) {
  if (googleToken && googleToken.email === cred.client_email && googleToken.exp > Date.now() + 60000) return googleToken.value
  const { createSign } = await import('node:crypto')
  const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: cred.client_email, scope: GOOGLE_SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(cred.private_key).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  })
  const data = await readJson(res)
  if (!res.ok || !data.access_token) throw Object.assign(new Error('Google 인증에 실패했습니다. 서비스 계정 키와 권한(Vertex AI 사용자)을 확인하세요.'), { status: 401 })
  googleToken = { value: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000, email: cred.client_email }
  return googleToken.value
}
const imageData = v => { const m = typeof v === 'string' && v.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/); return m ? m[2] : null }
async function googleRun({ inputs = {} }) {
  const env = googleEnv()
  if (!env) return { status: 500, body: { error: 'Google 가상 피팅 설정이 없습니다. Vercel 환경변수 GOOGLE_VTO_CREDENTIALS·GOOGLE_CLOUD_PROJECT를 설정해 주세요.' } }
  if (env.error) return { status: 500, body: { error: env.error } }
  const person = imageData(inputs.person_image), product = imageData(inputs.product_image)
  if (!person || !product) return { status: 400, body: { error: 'Google 가상 피팅에는 기본 모델 사진과 옷 사진(JPG·PNG)이 필요합니다.' } }
  const sampleCount = Math.min(4, Math.max(1, Number(inputs.sample_count) || 1))
  const token = await googleAccessToken(env.cred)
  const url = `https://${env.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(env.project)}/locations/${env.location}/publishers/google/models/${env.model}:predict`
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ instances: [{ personImage: { image: { bytesBase64Encoded: person } }, productImages: [{ image: { bytesBase64Encoded: product } }] }], parameters: { sampleCount } }),
  })
  const data = await readJson(res)
  if (!res.ok) return { status: res.status, body: { error: `Google 가상 피팅 오류 (${res.status}): ${String(data?.error?.message || data?.message || '').slice(0, 200)}` } }
  const output = (data.predictions || []).filter(p => p?.bytesBase64Encoded).map(p => `data:${p.mimeType || 'image/png'};base64,${p.bytesBase64Encoded}`)
  if (!output.length) return { status: 502, body: { error: 'Google 가상 피팅 결과가 비어 있습니다(안전 필터에 걸렸을 수 있음).' } }
  return { status: 200, body: { id: `google-${Date.now()}`, status: 'completed', output } }
}

// 엔진 목록: ready(키 있음), run(작업 시작 또는 바로 결과), status(비동기 엔진만)
const ENGINES = {
  fashn: { ready: () => Boolean(fashnKey()), missing: 'FASHN API Key가 없습니다. Vercel 환경변수 FASHN_API_KEY를 설정해주세요.', run: b => fashnRun(b), status: id => fashnStatus(id) },
  google: { ready: () => Boolean(googleEnv()), missing: 'Google 가상 피팅 설정이 없습니다. Vercel 환경변수 GOOGLE_VTO_CREDENTIALS·GOOGLE_CLOUD_PROJECT를 설정해 주세요.', run: b => googleRun(b), status: null },
}

async function readJson(res) {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { message: text.slice(0, 300) } }
}

async function fashnRun({ model_name, inputs }) {
  if (!FASHN_ALLOWED_MODELS.has(model_name)) {
    return { status: 400, body: { error: `허용되지 않은 모델: ${model_name}` } }
  }
  const res = await fetch(`${FASHN_BASE}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fashnKey()}` },
    body: JSON.stringify({ model_name, inputs }),
  })
  const data = await readJson(res)
  if (!res.ok || !data?.id) {
    return { status: res.ok ? 500 : res.status, body: { error: data?.error?.message || data?.message || data?.error || JSON.stringify(data) } }
  }
  return { status: 200, body: { id: data.id } }
}

async function fashnStatus(id) {
  const res = await fetch(`${FASHN_BASE}/status/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${fashnKey()}` },
  })
  const data = await readJson(res)
  if (!res.ok) return { status: res.status, body: { error: data?.message || JSON.stringify(data) } }

  // FASHN 상태값: starting / in_queue / processing / completed / failed
  if (data.status === 'completed') return { status: 200, body: { status: 'completed', output: data.output || [] } }
  if (data.status === 'failed') {
    const err = data.error
    return { status: 200, body: { status: 'failed', error: err?.message || err?.name || JSON.stringify(err) } }
  }
  return { status: 200, body: { status: 'processing' } }
}

// 결과 이미지를 data URL로 변환 (내 모델 저장용). SSRF 방지를 위해 https 이미지만, 8MB 이하만 허용.
async function fetchAsDataUrl(url) {
  let parsed
  try { parsed = new URL(url) } catch { return { status: 400, body: { error: '잘못된 URL' } } }
  if (parsed.protocol !== 'https:') return { status: 400, body: { error: 'https URL만 허용됩니다.' } }
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname)) {
    return { status: 400, body: { error: '허용되지 않은 주소' } }
  }
  const res = await fetch(parsed.toString())
  if (!res.ok) return { status: res.status, body: { error: `이미지를 가져오지 못했습니다 (${res.status})` } }
  const type = res.headers.get('content-type') || ''
  if (!type.startsWith('image/')) return { status: 400, body: { error: '이미지가 아닙니다.' } }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 8 * 1024 * 1024) return { status: 413, body: { error: '이미지가 너무 큽니다.' } }
  return { status: 200, body: { dataUrl: `data:${type};base64,${buf.toString('base64')}` } }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  // 같은 사이트에서 온 요청만 허용 (api/studio.js와 동일한 방식)
  const origin = req.headers.origin
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: '허용되지 않은 요청입니다.' }) }
    catch { return res.status(403).json({ error: '허용되지 않은 요청입니다.' }) }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { action, provider = 'fashn' } = req.body || {}

    // 키가 설정돼 있는지만 알려 줌 (FASHN을 호출하지 않으므로 과금 없음, 키 값은 절대 응답에 넣지 않음)
    if (action === 'config') {
      return res.status(200).json({ fashn: Boolean(fashnKey()), styleroom: Boolean(process.env.STYLEROOM_API_KEY), google: Boolean(googleEnv() && !googleEnv().error) })
    }

    if (action === 'fetch') {
      const r = await fetchAsDataUrl(req.body.url)
      return res.status(r.status).json(r.body)
    }

    if (provider === 'styleroom') {
      // 스타일룸 REST API는 기업 계약 고객에게만 제공됩니다 (공개 문서·셀프 발급 키 없음).
      // 계약 후 받은 API 문서에 맞춰 여기서 run/status를 구현하세요. 키는 STYLEROOM_API_KEY 환경변수로.
      return res.status(501).json({
        error: process.env.STYLEROOM_API_KEY
          ? '스타일룸 API 키는 있지만 아직 연동 코드가 없습니다. 받은 API 문서를 전달해주시면 연결합니다.'
          : '스타일룸 API는 기업(Enterprise) 계약 시에만 제공됩니다. 스타일룸에 API 이용을 문의해 키와 문서를 받아주세요.',
      })
    }

    const engine = ENGINES[provider]
    if (!engine) return res.status(400).json({ error: `알 수 없는 provider: ${provider}` })
    if (!engine.ready()) return res.status(500).json({ error: engine.missing })

    if (action === 'run') {
      const r = await engine.run(req.body)
      return res.status(r.status).json(r.body)
    }
    if (action === 'status') {
      if (!engine.status) return res.status(400).json({ error: '이 엔진은 결과를 바로 돌려줍니다(상태 확인 없음).' })
      if (!req.body.id) return res.status(400).json({ error: '작업 ID가 없습니다.' })
      const r = await engine.status(req.body.id)
      return res.status(r.status).json(r.body)
    }
    return res.status(400).json({ error: `알 수 없는 action: ${action}` })
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message })
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
}
