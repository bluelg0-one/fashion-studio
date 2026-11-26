// 서버(api/*.js)를 거쳐 호출. 응답이 JSON이 아니면(용량 초과 등) 읽을 수 있는 오류로 바꾼다.
export async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    if (res.status === 413) throw new Error('이미지가 너무 커서 서버 한도(4.5MB)를 넘었습니다.')
    throw new Error('서버 응답 오류: ' + text.slice(0, 100))
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || data?.detail || data?.message || `오류 (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data
}

export async function callClaude(prompt, imageDataUrl = null) {
  let imageBase64 = null
  if (imageDataUrl) {
    // Claude 분석에는 이 정도 크기면 충분하고, 서버 요청 한도(4.5MB)도 지킨다.
    imageBase64 = (await compressImage(imageDataUrl, 1568, 0.85)).split(',')[1]
  }
  const { text } = await postJson('/api/claude', { prompt, imageBase64, mimeType: 'image/jpeg' })
  return text || ''
}

// 가로가 maxWidth를 넘으면 줄여서 JPEG로 만든다.
export async function compressImage(dataUrl, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff' // 투명 PNG가 검게 변하지 않도록
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'))
    img.src = dataUrl
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
