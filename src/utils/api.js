const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'

export async function callClaude(prompt, imageBase64 = null, mimeType = 'image/jpeg') {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('Anthropic API Key가 설정되지 않았습니다. Vercel 환경변수를 확인해주세요.')
  }

  const content = []

  if (imageBase64) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType,
        data: imageBase64,
      },
    })
  }

  content.push({ type: 'text', text: prompt })

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(err?.error?.message || 'Claude API 오류가 발생했습니다.')
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function applyImageFilters(dataUrl, brightness, contrast, saturation) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.src = dataUrl
  })
}

export function downloadImage(dataUrl, filename) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
