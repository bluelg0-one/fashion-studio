export default async function handler(req, res) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.VITE_FASHN_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'FASHN API Key가 설정되지 않았습니다.' })
  }

  try {
    const { model_image, garment_image, category } = req.body

    // FASHN API 호출
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
          nsfw_filter: true,
          cover_feet: false,
          adjust_hands: true,
          restore_background: true,
          restore_clothes: true,
        },
      }),
    })

    const runData = await runResponse.json()

    if (!runResponse.ok) {
      return res.status(runResponse.status).json({
        error: runData?.error || runData?.detail || `FASHN 오류 (${runResponse.status})`
      })
    }

    const { id } = runData
    if (!id) {
      return res.status(500).json({ error: '작업 ID를 받지 못했습니다.' })
    }

    // 결과 폴링 (최대 60초)
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
          return res.status(500).json({
            error: '착용샷 생성 실패: ' + (data.error?.message || data.error || '알 수 없는 오류')
          })
        }
      }
    }

    return res.status(408).json({ error: '처리 시간 초과. 다시 시도해주세요.' })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
