/**
 * imageProcessing.js
 * Canvas 기반 이미지 처리 유틸 모음
 * src/utils/imageProcessing.js 로 저장하세요
 */

// ────────────────────────────────────────────────────────────
// 공통 유틸
// ────────────────────────────────────────────────────────────
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function getCanvas(img) {
  const canvas = document.createElement("canvas");
  canvas.width  = img.width;
  canvas.height = img.height;
  return { canvas, ctx: canvas.getContext("2d") };
}

// ────────────────────────────────────────────────────────────
// 1. 투명 PNG → 흰색 배경 JPEG
// ────────────────────────────────────────────────────────────
export async function pngToWhiteBg(dataUrl) {
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = getCanvas(img);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.95);
}

// ────────────────────────────────────────────────────────────
// 2. 주름 펴기 (언샤프 마스크 + 부드러운 스무딩 조합)
//    - 먼저 살짝 블러로 잡티/주름 완화
//    - 그 위에 샤프닝으로 옷 윤곽만 다시 선명하게
// ────────────────────────────────────────────────────────────
export async function fixWrinkles(dataUrl) {
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = getCanvas(img);
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const src  = imageData.data;
  const w    = canvas.width;
  const h    = canvas.height;
  const out  = new Uint8ClampedArray(src.length);

  // Step1: 3×3 가우시안 블러 (주름 완화)
  const gaussian = [1,2,1, 2,4,2, 1,2,1];
  const gSum = 16;
  const blurred = new Uint8ClampedArray(src.length);

  for (let y = 1; y < h-1; y++) {
    for (let x = 1; x < w-1; x++) {
      const idx = (y*w+x)*4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky=-1; ky<=1; ky++)
          for (let kx=-1; kx<=1; kx++)
            sum += src[((y+ky)*w+(x+kx))*4+c] * gaussian[(ky+1)*3+(kx+1)];
        blurred[idx+c] = sum / gSum;
      }
      blurred[idx+3] = src[idx+3];
    }
  }

  // Step2: 언샤프 마스크 (원본 - 블러 = 엣지 → 원본에 추가)
  // result = original + amount * (original - blurred)
  const amount = 0.6; // 강도 (0~1, 높을수록 선명)
  for (let i = 0; i < src.length-3; i += 4) {
    for (let c = 0; c < 3; c++) {
      const edge = src[i+c] - blurred[i+c];
      out[i+c] = Math.min(255, Math.max(0, src[i+c] + amount * edge));
    }
    out[i+3] = src[i+3];
  }

  // 가장자리는 원본 유지
  for (let x = 0; x < w; x++) {
    for (const y of [0, h-1]) {
      const i = (y*w+x)*4;
      out[i]=src[i]; out[i+1]=src[i+1]; out[i+2]=src[i+2]; out[i+3]=src[i+3];
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w-1]) {
      const i = (y*w+x)*4;
      out[i]=src[i]; out[i+1]=src[i+1]; out[i+2]=src[i+2]; out[i+3]=src[i+3];
    }
  }

  ctx.putImageData(new ImageData(out, w, h), 0, 0);

  // Step3: 밝기/대비 약간 올려서 깔끔하게
  const canvas2 = document.createElement("canvas");
  canvas2.width = w; canvas2.height = h;
  const ctx2 = canvas2.getContext("2d");
  ctx2.filter = "brightness(103%) contrast(108%)";
  ctx2.drawImage(canvas, 0, 0);

  return canvas2.toDataURL("image/jpeg", 0.95);
}

// ────────────────────────────────────────────────────────────
// 3. 테두리 각지게 + 좌우 여백 균등 정렬
//    - 소벨 엣지 강화로 외곽선 선명하게
//    - 콘텐츠 영역 감지 후 캔버스 중앙 정렬
// ────────────────────────────────────────────────────────────
export async function sharpOutlineAndCenter(dataUrl) {
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = getCanvas(img);
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const src = imageData.data;
  const w   = canvas.width;
  const h   = canvas.height;

  // ── 콘텐츠 경계 감지 (흰 배경 기준: RGB 모두 240 이상이면 배경) ──
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y*w+x)*4;
      const r = src[i], g = src[i+1], b = src[i+2];
      if (!(r > 240 && g > 240 && b > 240)) { // 배경 아닌 픽셀
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // 콘텐츠 없으면 원본 반환
  if (minX >= maxX || minY >= maxY) return dataUrl;

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const padding  = Math.round(Math.max(contentW, contentH) * 0.08); // 8% 여백

  // ── 중앙 정렬된 새 캔버스 (정사각형) ──
  const size    = Math.max(contentW, contentH) + padding * 2;
  const canvas2 = document.createElement("canvas");
  canvas2.width  = size;
  canvas2.height = size;
  const ctx2 = canvas2.getContext("2d");

  // 흰 배경
  ctx2.fillStyle = "#ffffff";
  ctx2.fillRect(0, 0, size, size);

  // 콘텐츠를 중앙에 배치
  const destX = Math.round((size - contentW) / 2);
  const destY = Math.round((size - contentH) / 2);
  ctx2.drawImage(canvas, minX, minY, contentW, contentH, destX, destY, contentW, contentH);

  // ── 엣지 강화 (소벨 필터) ──
  const imgData2 = ctx2.getImageData(0, 0, size, size);
  const d2  = imgData2.data;
  const out2 = new Uint8ClampedArray(d2.length);

  // 강화된 샤프닝 커널 (중심값 높임)
  const kernel = [0, -1, 0,  -1, 6, -1,  0, -1, 0];

  for (let y = 1; y < size-1; y++) {
    for (let x = 1; x < size-1; x++) {
      const idx = (y*size+x)*4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky=-1; ky<=1; ky++)
          for (let kx=-1; kx<=1; kx++)
            sum += d2[((y+ky)*size+(x+kx))*4+c] * kernel[(ky+1)*3+(kx+1)];
        out2[idx+c] = Math.min(255, Math.max(0, sum));
      }
      out2[idx+3] = d2[idx+3];
    }
  }
  for (let i = 0; i < d2.length; i++) if (!out2[i]) out2[i] = d2[i];

  ctx2.putImageData(new ImageData(out2, size, size), 0, 0);

  // ── 최종 대비 살짝 올리기 ──
  const canvas3 = document.createElement("canvas");
  canvas3.width = size; canvas3.height = size;
  const ctx3 = canvas3.getContext("2d");
  ctx3.filter = "contrast(110%) brightness(101%)";
  ctx3.drawImage(canvas2, 0, 0);

  return canvas3.toDataURL("image/jpeg", 0.95);
}

// ────────────────────────────────────────────────────────────
// 4. 전체 파이프라인 실행
//    options: { wrinkle_fix, sharp_outline }
// ────────────────────────────────────────────────────────────
export async function runCanvasPipeline(dataUrl, options) {
  let result = dataUrl;
  if (options.wrinkle_fix)   result = await fixWrinkles(result);
  if (options.sharp_outline) result = await sharpOutlineAndCenter(result);
  return result;
}
