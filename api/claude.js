const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// Claude Messages API 프록시: API Key는 서버 환경변수에서만 읽는다.
// 요청: { prompt, imageBase64?, mimeType? } / 응답: Anthropic 응답을 그대로 전달
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'Anthropic API Key가 설정되지 않았습니다. Vercel 환경변수를 확인해주세요.' },
    })
  }

  const { prompt, imageBase64, mimeType } = req.body || {}
  if (typeof prompt !== 'string' || !prompt) {
    return res.status(400).json({ error: { message: 'prompt가 필요합니다.' } })
  }

  const content = []

  if (imageBase64) {
    const mediaType = mimeType || 'image/jpeg'
    if (typeof imageBase64 !== 'string' || !ALLOWED_IMAGE_TYPES.includes(mediaType)) {
      return res.status(400).json({ error: { message: '지원하지 않는 이미지 형식입니다.' } })
    }
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: imageBase64 },
    })
  }

  content.push({ type: 'text', text: prompt })

  try {
    const upstream = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
      }),
    })

    const data = await upstream.json().catch(() => null)
    if (!data) {
      return res.status(502).json({ error: { message: 'Claude API 응답을 읽을 수 없습니다.' } })
    }
    return res.status(upstream.status).json(data)
  } catch (err) {
    return res.status(502).json({ error: { message: err.message } })
  }
}
