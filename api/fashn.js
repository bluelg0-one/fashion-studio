import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const FASHN_API = 'https://api.fashn.ai/v1'
// 사진 보정(PhotoEditor)에서 쓰는 모델만 허용
const ALLOWED_MODELS = ['background-remove', 'edit']

// FASHN 프록시: API Key는 서버 환경변수에서만 읽는다.
//   POST /api/fashn        { model_name, inputs } → FASHN /run 응답 그대로 ({ id, error })
//   GET  /api/fashn?id=... → FASHN /status/:id 응답 그대로
// 폴링은 브라우저가 하므로 함수 실행 시간은 짧게 유지된다.
export default async function handler(req, res) {
  const apiKey = process.env.FASHN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FASHN API Key가 없습니다.' })

  try {
    if (req.method === 'POST') {
      const { model_name, inputs } = req.body || {}
      if (!ALLOWED_MODELS.includes(model_name)) {
        return res.status(400).json({ error: '허용되지 않은 모델입니다.' })
      }
      if (!inputs || typeof inputs !== 'object') {
        return res.status(400).json({ error: 'inputs가 필요합니다.' })
      }
      const upstream = await fetch(`${FASHN_API}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model_name, inputs }),
      })
      return await relay(upstream, res)
    }

    if (req.method === 'GET') {
      const id = req.query?.id
      if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) {
        return res.status(400).json({ error: '잘못된 작업 ID입니다.' })
      }
      const upstream = await fetch(`${FASHN_API}/status/${id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      return await relay(upstream, res)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (res.headersSent) return res.end()
    return res.status(502).json({ error: err.message })
  }
}

// 응답을 버퍼링 없이 스트리밍으로 전달 (return_base64 결과는 수 MB가 될 수 있음)
async function relay(upstream, res) {
  res.statusCode = upstream.status
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  if (!upstream.body) return res.end()
  await pipeline(Readable.fromWeb(upstream.body), res)
}
