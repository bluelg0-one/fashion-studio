const CLAUDE_PROXY_URL = '/api/claude'

// API Key는 서버(api/claude.js)에만 있고, 브라우저는 프록시만 호출한다.
export async function callClaude(prompt, imageBase64 = null, mimeType = 'image/jpeg') {
  const response = await fetch(CLAUDE_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, imageBase64, mimeType }),
  })

  if (!response.ok) {
    if (response.status === 413) {
      throw new Error('이미지 용량이 너무 큽니다. 3MB 이하 이미지로 다시 시도해주세요.')
    }
    const err = await response.json().catch(() => null)
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
