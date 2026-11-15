// AI 모델컷 전용 API (비동기 방식)
//
// 영상·일괄 생성은 60초를 넘길 수 있어서, 서버가 끝날 때까지 붙잡고 기다리지 않고
//   1) action: 'run'    → 작업만 시작하고 작업 ID를 바로 돌려줌
//   2) action: 'status' → 화면에서 몇 초마다 상태를 물어봄
//   3) action: 'fetch'  → 결과 이미지를 data URL로 받아옴 (FASHN 결과 URL은 약 3일 뒤 만료되므로 "내 모델" 저장용)
// 구조로 동작합니다.
//
// provider
//   - 'fashn'     : FASHN API (https://docs.fashn.ai) — 환경변수 FASHN_API_KEY 또는 VITE_FASHN_API_KEY
//   - 'styleroom' : 스타일룸 — 기업(Enterprise) 계약 시에만 REST API 제공, 공개 문서 없음.
//                   API 문서/키를 받으면 아래 styleroom 블록만 채우면 됩니다.

const FASHN_BASE = 'https://api.fashn.ai/v1'

// 화면에서 호출 가능한 FASHN 모델만 허용
const FASHN_ALLOWED_MODELS = new Set(['product-to-model', 'model-create', 'tryon-max', 'tryon-v1.6'])

function fashnKey() {
  return process.env.FASHN_API_KEY || process.env.VITE_FASHN_API_KEY
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
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { action, provider = 'fashn' } = req.body || {}

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

    if (provider !== 'fashn') return res.status(400).json({ error: `알 수 없는 provider: ${provider}` })
    if (!fashnKey()) return res.status(500).json({ error: 'FASHN API Key가 없습니다. Vercel 환경변수 FASHN_API_KEY를 설정해주세요.' })

    if (action === 'run') {
      const r = await fashnRun(req.body)
      return res.status(r.status).json(r.body)
    }
    if (action === 'status') {
      if (!req.body.id) return res.status(400).json({ error: '작업 ID가 없습니다.' })
      const r = await fashnStatus(req.body.id)
      return res.status(r.status).json(r.body)
    }
    return res.status(400).json({ error: `알 수 없는 action: ${action}` })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
}
