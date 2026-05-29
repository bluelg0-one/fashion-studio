export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.VITE_FASHN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FASHN API Key가 없습니다.' })

  try {
    const { model_image, garment_image, category } = req.body

    const runResponse = await fetch('https://api.fashn.ai/v1/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model_name: 'tryon-v1.6',
        inputs: {
          model_image,
          garment_image,
          category: category || 'tops',
          garment_photo_type: 'auto',
        },
      }),
    })

    const runData = await runResponse.json()
    console.log('FASHN 상태:', runResponse.status, JSON.stringify(runData))

    if (!runResponse.ok) {
      return res.status(runResponse.status).json({
        error: runData?.message || runData?.error || JSON.stringify(runData)
      })
    }

    const { id } = runData
    if (!id) return res.status(500).json({ error: '작업 ID 없음' })

    // 폴링
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const statusRes = await fetch(`https://api.fashn.ai/v1/status/${id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      if (statusRes.ok) {
        const data = await statusRes.json()
        if (data.status === 'completed' && data.output?.length > 0) {
          return res.status(200).json({ url: data.output[0] })
        }
        if (data.status === 'failed') {
          return res.status(500).json({ error: JSON.stringify(data.error) })
        }
      }
    }
    return res.status(408).json({ error: '시간 초과. 다시 시도해주세요.' })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
}
