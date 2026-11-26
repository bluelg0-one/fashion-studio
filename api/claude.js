import Anthropic from '@anthropic-ai/sdk'

// 브라우저에 API 키가 노출되지 않도록 Claude 호출은 서버에서만 한다.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_PROMPT_CHARS = 20000

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // VITE_ 이름은 예전 설정 호환용. Vercel에서 ANTHROPIC_API_KEY로 바꾼 뒤 지워도 된다.
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API Key가 서버에 설정되지 않았습니다.' })

  const { prompt, imageBase64, mimeType = 'image/jpeg' } = req.body || {}
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({ error: '요청 내용이 비어 있거나 너무 깁니다.' })
  }
  if (imageBase64 && (typeof imageBase64 !== 'string' || !ALLOWED_MIME.has(mimeType))) {
    return res.status(400).json({ error: '지원하지 않는 이미지 형식입니다.' })
  }

  const content = []
  if (imageBase64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } })
  }
  content.push({ type: 'text', text: prompt })

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.beta.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      // 안전 필터가 거절하면 서버가 다른 모델로 자동 재시도
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content }],
    })

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'AI가 이 요청을 처리하지 않았습니다. 내용을 바꿔 다시 시도해주세요.' })
    }

    // 응답 맨 앞에는 thinking 블록이 올 수 있으므로 text 블록만 모은다.
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    return res.status(200).json({ text })
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return res.status(err.status || 502).json({ error: err.message })
    }
    return res.status(500).json({ error: err.message })
  }
}
