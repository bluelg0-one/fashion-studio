// 사진 보정(배경 제거·편집)용 FASHN 중계. API 키는 서버에만 둔다.
const FASHN_API = 'https://api.fashn.ai/v1'
const ALLOWED_MODELS = new Set(['background-remove', 'edit'])

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // VITE_ 이름은 예전 설정 호환용. Vercel에서 FASHN_API_KEY로 바꾼 뒤 지워도 된다.
  const apiKey = process.env.FASHN_API_KEY || process.env.VITE_FASHN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FASHN API Key가 서버에 설정되지 않았습니다.' })

  const { action, model_name, inputs, id } = req.body || {}
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }

  try {
    let upstream
    if (action === 'run') {
      if (!ALLOWED_MODELS.has(model_name) || typeof inputs !== 'object' || !inputs) {
        return res.status(400).json({ error: '허용되지 않은 작업입니다.' })
      }
      upstream = await fetch(`${FASHN_API}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model_name, inputs }),
      })
    } else if (action === 'status') {
      if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) {
        return res.status(400).json({ error: '작업 ID가 올바르지 않습니다.' })
      }
      upstream = await fetch(`${FASHN_API}/status/${id}`, { headers })
    } else {
      return res.status(400).json({ error: '알 수 없는 요청입니다.' })
    }

    const data = await upstream.json().catch(() => ({}))
    return res.status(upstream.status).json(data)
  } catch (err) {
    return res.status(502).json({ error: err.message })
  }
}
