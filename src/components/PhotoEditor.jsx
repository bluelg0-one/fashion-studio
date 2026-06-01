import { useState, useRef, useCallback } from "react";
import { applyImageFilters, downloadImage } from "../utils/api";

// ────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────
const CORRECTION_OPTIONS = [
  {
    id: "bg_remove",
    label: "① 배경 삭제",
    desc: "FASHN AI로 배경 제거 → 깨끗한 흰색 배경",
    credits: "1 크레딧",
  },
  {
    id: "mannequin_remove",
    label: "② 마네킹 + 배경 삭제",
    desc: "배경·마네킹·봉 모두 제거, 옷만 남김",
    credits: "4 크레딧",
  },
  {
    id: "wrinkle_fix",
    label: "③ 주름 펴기 / 정리",
    desc: "FASHN Edit AI로 주름·구김 제거 (처리 30~60초)",
    credits: "3 크레딧",
  },
];

const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturation: 100 };
const FASHN_API      = "https://api.fashn.ai/v1";
const POLL_INTERVAL  = 2500;
const POLL_TIMEOUT   = 150000;

// ────────────────────────────────────────────────────────────
// FASHN 공통 폴링
// ────────────────────────────────────────────────────────────
async function fashnRun(modelName, inputs) {
  const apiKey = import.meta.env.VITE_FASHN_API_KEY;
  if (!apiKey) throw new Error("VITE_FASHN_API_KEY 미설정");

  const res = await fetch(`${FASHN_API}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model_name: modelName, inputs }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || err?.error || `FASHN 오류 (${res.status})`);
  }
  const { id, error } = await res.json();
  if (error) throw new Error(error);

  // 폴링
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const statusRes = await fetch(`${FASHN_API}/status/${id}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    const status = await statusRes.json();
    if (status.status === "completed") {
      const outputUrl = status.output?.[0];
      if (!outputUrl) throw new Error("결과 이미지 없음");
      // URL → base64
      const imgRes = await fetch(outputUrl);
      const blob   = await imgRes.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    if (status.status === "failed") throw new Error(status.error || "FASHN 처리 실패");
  }
  throw new Error("FASHN 타임아웃 (2분 30초 초과)");
}

// PNG 투명 → 흰색 배경 JPEG 변환
function pngToWhiteBg(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.src = dataUrl;
  });
}

// ① 배경 삭제
async function fashnBgRemove(dataUrl) {
  const result = await fashnRun("background-remove", {
    image: dataUrl,
    return_base64: true,
  });
  return pngToWhiteBg(result);
}

// ② 마네킹 + 배경 + 봉 삭제
async function fashnMannequinRemove(dataUrl) {
  // Step1: 배경 제거
  const bgRemoved = await fashnRun("background-remove", {
    image: dataUrl,
    return_base64: true,
  });
  const whiteBg = await pngToWhiteBg(bgRemoved);

  // Step2: Edit로 마네킹·봉 완전 제거
  const edited = await fashnRun("edit", {
    image: whiteBg,
    prompt: `Remove the mannequin body and mannequin stand/pole completely from this fashion product image.
Keep ONLY the clothing item itself.
The clothing should appear as a professional flat-lay or ghost mannequin shot on a pure white background.
Preserve every detail of the garment: fabric texture, stitching, seams, color, pattern, and shape exactly as they are.
Do NOT alter, deform, or recolor the clothing in any way.
The final background must be completely clean white (#ffffff) with no shadows, no stand, no pole, no mannequin parts.`,
    resolution: "2k",
    generation_mode: "quality",
    return_base64: true,
  });
  return edited;
}

// ③ 주름 펴기 (강화된 프롬프트)
async function fashnWrinkleFix(dataUrl) {
  const result = await fashnRun("edit", {
    image: dataUrl,
    prompt: `This is a fashion product photo. Please do the following:
1. REMOVE ALL WRINKLES: Smooth out every wrinkle, crease, and fold in the fabric. Make the clothing look perfectly pressed and unwrinkled as if freshly ironed.
2. STRAIGHTEN DROOPING PARTS: Fix any drooping, uneven, or sagging areas such as sleeves, hemlines, necklines, or straps. Make them symmetrical and neat.
3. CLEAN UP EDGES: Make the outline of the clothing sharp, clean, and well-defined.
4. PRESERVE ORIGINAL: Keep the original garment color, fabric texture, design details, and overall shape exactly the same. Do NOT change the style or design.
5. BACKGROUND: Keep the background clean white.`,
    resolution: "2k",
    generation_mode: "quality",
    return_base64: true,
  });
  return result;
}

// ────────────────────────────────────────────────────────────
// 미세 수정 모달
// ────────────────────────────────────────────────────────────
function FinetunePanel({ file, onSave, onClose }) {
  const [filters,    setFilters]    = useState({ ...file.filters });
  const [preview,    setPreview]    = useState(file.corrected);
  const [processing, setProcessing] = useState(false);
  const [procLabel,  setProcLabel]  = useState("");

  const handleFilter = async (key, val) => {
    const next = { ...filters, [key]: val };
    setFilters(next);
    setPreview(await applyImageFilters(file.corrected, next.brightness, next.contrast, next.saturation));
  };

  const applyExtra = async (type) => {
    setProcessing(true);
    try {
      let result = preview;
      if (type === "bg") {
        setProcLabel("배경 제거 중... (1~3초)");
        result = await fashnBgRemove(preview);
      } else if (type === "mannequin") {
        setProcLabel("마네킹·봉 제거 중... (30~90초)");
        result = await fashnMannequinRemove(preview);
      } else if (type === "wrinkle") {
        setProcLabel("주름 펴기 중... (30~60초)");
        result = await fashnWrinkleFix(preview);
      }
      setPreview(result);
    } catch (e) {
      alert("오류: " + e.message);
    }
    setProcessing(false);
    setProcLabel("");
  };

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <span style={S.modalTitle}>🔧 미세 수정 — {file.name}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.modalBody}>
          {/* 미리보기 */}
          <div style={S.twoCol}>
            {[["원본 보정본", file.corrected], ["현재 수정 중", preview]].map(([label, src]) => (
              <div key={label}>
                <div style={S.miniLabel}>{label}</div>
                <img src={src} alt={label} style={{ ...S.previewImg, background: "#fff" }} />
              </div>
            ))}
          </div>

          {/* 추가 보정 버튼 */}
          <div>
            <div style={S.sectionTitle}>⚡ FASHN 추가 보정</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { type: "bg",        label: "① 배경 재제거" },
                { type: "mannequin", label: "② 마네킹·봉 재제거" },
                { type: "wrinkle",   label: "③ 주름 다시 펴기" },
              ].map(({ type, label }) => (
                <button key={type}
                  style={{ ...S.btn, ...S.btnBlue, opacity: processing ? 0.5 : 1, fontSize: 11 }}
                  onClick={() => applyExtra(type)} disabled={processing}>
                  {label}
                </button>
              ))}
            </div>
            {processing && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#facc15" }}>⏳ {procLabel}</div>
            )}
          </div>

          {/* 필터 슬라이더 */}
          <div>
            <div style={S.sectionTitle}>🎚 수동 필터 조정</div>
            {["brightness", "contrast", "saturation"].map((key) => (
              <div key={key} style={S.sliderRow}>
                <span style={S.sliderLabel}>{key === "brightness" ? "밝기" : key === "contrast" ? "대비" : "채도"}</span>
                <input type="range" min={50} max={150} value={filters[key]}
                  onChange={(e) => handleFilter(key, Number(e.target.value))} style={S.slider} />
                <span style={S.sliderVal}>{filters[key]}%</span>
              </div>
            ))}
          </div>

          <button style={{ ...S.btn, fontSize: 11, color: "#666" }}
            onClick={() => { setPreview(file.corrected); setFilters({ ...file.filters }); }}>
            ↩ 원본으로 되돌리기
          </button>
        </div>
        <div style={S.modalFooter}>
          <button style={S.btn} onClick={onClose}>취소</button>
          <button style={{ ...S.btn, ...S.btnGreen }}
            onClick={() => onSave({ ...file, filters, corrected: preview, finalized: true })}>
            ✅ 저장 완료
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────────────────
export default function PhotoEditor({ onFilesReady }) {
  const fileInputRef = useRef(null);
  const [files,          setFiles]          = useState([]);
  const [activeFileId,   setActiveFileId]   = useState(null);
  const [finetuneTarget, setFinetuneTarget] = useState(null);
  const [corrOptions,    setCorrOptions]    = useState({ bg_remove: true, mannequin_remove: false, wrinkle_fix: false });
  const [processing,     setProcessing]     = useState(false);
  const [progress,       setProgress]       = useState({ done: 0, total: 0, label: "" });
  const [errorLog,       setErrorLog]       = useState([]);

  const addFiles = useCallback((fileList) => {
    const newFiles = Array.from(fileList).map((f) => ({
      id: crypto.randomUUID(), name: f.name, file: f,
      original: null, corrected: null,
      filters: { ...DEFAULT_FILTERS },
      status: "pending", finalized: false, selected: true,
    }));
    newFiles.forEach((item) => {
      const reader = new FileReader();
      reader.onload = (e) =>
        setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, original: e.target.result } : f));
      reader.readAsDataURL(item.file);
    });
    setFiles((prev) => [...prev, ...newFiles]);
    setActiveFileId((prev) => prev ?? newFiles[0]?.id);
  }, []);

  const handleDrop = useCallback((e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }, [addFiles]);
  const toggleSelect = (id) => setFiles((prev) => prev.map((f) => f.id === id ? { ...f, selected: !f.selected } : f));
  const selectAll    = (val) => setFiles((prev) => prev.map((f) => ({ ...f, selected: val })));

  const runBatch = async () => {
    const targets = files.filter((f) => f.selected && f.original);
    if (!targets.length) return alert("선택된 파일이 없습니다.");
    setProcessing(true);
    setErrorLog([]);
    setProgress({ done: 0, total: targets.length, label: "" });

    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, status: "processing" } : f));

      try {
        let result = item.original;

        // STEP 1: 배경/마네킹 제거
        if (corrOptions.mannequin_remove) {
          setProgress({ done: i, total: targets.length, label: `[${i+1}/${targets.length}] ${item.name} — 마네킹·봉 제거 중...` });
          result = await fashnMannequinRemove(result);
        } else if (corrOptions.bg_remove) {
          setProgress({ done: i, total: targets.length, label: `[${i+1}/${targets.length}] ${item.name} — 배경 제거 중...` });
          result = await fashnBgRemove(result);
        }

        // STEP 2: 주름 펴기
        if (corrOptions.wrinkle_fix) {
          setProgress({ done: i, total: targets.length, label: `[${i+1}/${targets.length}] ${item.name} — 주름 펴기 중...` });
          result = await fashnWrinkleFix(result);
        }

        // STEP 3: 밝기/대비/채도
        const { brightness, contrast, saturation } = item.filters;
        result = await applyImageFilters(result, brightness, contrast, saturation);

        setFiles((prev) => prev.map((f) =>
          f.id === item.id ? { ...f, corrected: result, status: "done" } : f
        ));
      } catch (e) {
        setErrorLog((prev) => [...prev, `❌ ${item.name}: ${e.message}`]);
        setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, status: "error" } : f));
      }

      setProgress({ done: i + 1, total: targets.length, label: "" });
    }

    setProcessing(false);
    setActiveFileId(targets[0]?.id);
  };

  const saveFinetuned = (u) => { setFiles((prev) => prev.map((f) => f.id === u.id ? u : f)); setFinetuneTarget(null); };
  const handleDownload = (file) => { const src = file.corrected || file.original; if (src) downloadImage(src, `edited_${file.name}`); };
  const downloadAll    = () => files.filter((f) => f.finalized && f.corrected).forEach(handleDownload);
  const sendToNext     = () => {
    const finals = files.filter((f) => f.finalized && f.corrected);
    if (!finals.length) return alert("최종 확정된 파일이 없습니다.");
    onFilesReady?.(finals);
    alert(`✅ ${finals.length}장을 다음 단계로 전달했습니다.`);
  };

  const activeFile    = files.find((f) => f.id === activeFileId);
  const doneCount     = files.filter((f) => f.status === "done").length;
  const finalCount    = files.filter((f) => f.finalized).length;
  const selectedCount = files.filter((f) => f.selected).length;

  // 크레딧 예상 계산
  const creditsPerImage =
    (corrOptions.mannequin_remove ? 4 : corrOptions.bg_remove ? 1 : 0) +
    (corrOptions.wrinkle_fix ? 3 : 0);

  return (
    <div style={S.root}>
      {finetuneTarget && (
        <FinetunePanel file={finetuneTarget} onSave={saveFinetuned} onClose={() => setFinetuneTarget(null)} />
      )}

      {/* 사이드바 */}
      <div style={S.sidebar}>
        <div style={S.uploadZone} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}>
          <div style={{ fontSize: 26 }}>📁</div>
          <div style={S.uploadText}>클릭 또는 드래그</div>
          <div style={S.uploadSub}>여러 장 한번에 선택 가능</div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files)} />
        </div>
        <button style={S.driveBtn} onClick={() => window.open("https://drive.google.com", "_blank")}>
          <span>📂</span> Google Drive에서 가져오기
        </button>

        {files.length > 0 && (
          <>
            <div style={S.listHeader}>
              <span style={S.listCount}>총 {files.length}장 · 완료 {doneCount} · 확정 {finalCount}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={S.microBtn} onClick={() => selectAll(true)}>전체</button>
                <button style={S.microBtn} onClick={() => selectAll(false)}>해제</button>
              </div>
            </div>
            <div style={S.fileList}>
              {files.map((f) => (
                <div key={f.id}
                  style={{ ...S.fileItem, ...(activeFileId === f.id ? S.fileItemActive : {}) }}
                  onClick={() => setActiveFileId(f.id)}>
                  <input type="checkbox" checked={f.selected}
                    onChange={() => toggleSelect(f.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: "#22c55e" }} />
                  {f.original && <img src={f.corrected || f.original} alt={f.name} style={S.thumb} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.fileName}>{f.name}</div>
                    <div style={{ fontSize: 9, marginTop: 2 }}>
                      {f.status === "pending"    && <span style={{ color: "#888" }}>대기</span>}
                      {f.status === "processing" && <span style={{ color: "#facc15" }}>처리 중...</span>}
                      {f.status === "done" && !f.finalized && <span style={{ color: "#4ade80" }}>보정완료</span>}
                      {f.finalized               && <span style={{ color: "#22c55e", fontWeight: 700 }}>✅ 확정</span>}
                      {f.status === "error"      && <span style={{ color: "#f87171" }}>오류</span>}
                    </div>
                  </div>
                  {f.corrected && (
                    <button style={S.iconBtn} onClick={(e) => { e.stopPropagation(); handleDownload(f); }}>⬇</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 메인 */}
      <div style={S.main}>
        {/* 미리보기 */}
        <div style={S.twoCol}>
          {[
            { label: "원본 사진", badge: "BEFORE", badgeStyle: {},                                      src: activeFile?.original  },
            { label: "AI 보정본", badge: "AFTER",  badgeStyle: { background: "#22c55e", color: "#fff" }, src: activeFile?.corrected },
          ].map(({ label, badge, badgeStyle, src }) => (
            <div key={label} style={S.previewCard}>
              <div style={S.previewCardLabel}>
                {label} <span style={{ ...S.badge, ...badgeStyle }}>{badge}</span>
              </div>
              {src
                ? <img src={src} alt={label} style={{ ...S.mainImg, background: "#fff" }} />
                : <div style={S.emptyImg}>{badge === "BEFORE" ? "이미지를 업로드하세요" : "보정 후 표시됩니다"}</div>}
            </div>
          ))}
        </div>

        {/* 보정 옵션 */}
        <div style={S.card}>
          <div style={S.cardTitle}>✂️ AI 보정 옵션 (모두 FASHN API)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {CORRECTION_OPTIONS.map((opt) => (
              <label key={opt.id} style={{
                ...S.optionLabelFull,
                ...(corrOptions[opt.id] ? { border: "1px solid #22c55e", background: "#0f1f12" } : {})
              }}>
                <input type="checkbox" checked={corrOptions[opt.id] || false}
                  onChange={(e) => setCorrOptions((prev) => ({ ...prev, [opt.id]: e.target.checked }))}
                  style={{ accentColor: "#22c55e", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#ddd" }}>{opt.label}</span>
                    <span style={{ fontSize: 10, color: "#f9a8d4", background: "#4c1d95", padding: "1px 6px", borderRadius: 3 }}>
                      {opt.credits}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* 크레딧 합계 */}
          <div style={S.creditBox}>
            <span>💳 선택 옵션 크레딧: 장당 <strong style={{ color: "#fbbf24" }}>{creditsPerImage} 크레딧</strong></span>
            {selectedCount > 0 && (
              <span style={{ marginLeft: 12 }}>
                → {selectedCount}장 선택 시 총 <strong style={{ color: "#fbbf24" }}>{creditsPerImage * selectedCount} 크레딧</strong>
              </span>
            )}
          </div>

          {/* 진행 상태 */}
          {processing && (
            <>
              <div style={S.progressBar}>
                <div style={{ ...S.progressFill, width: `${(progress.done / progress.total) * 100}%` }} />
                <span style={S.progressText}>{progress.done} / {progress.total}</span>
              </div>
              {progress.label && (
                <div style={{ fontSize: 11, color: "#facc15", marginTop: 6, textAlign: "center" }}>
                  ⏳ {progress.label}
                </div>
              )}
            </>
          )}

          {errorLog.length > 0 && (
            <div style={S.errorBox}>
              {errorLog.map((msg, i) => <div key={i}>{msg}</div>)}
            </div>
          )}

          <button
            style={{ ...S.btn, ...S.btnGreen, width: "100%", marginTop: 12, opacity: processing ? 0.6 : 1 }}
            onClick={runBatch} disabled={processing}>
            {processing
              ? `⏳ 처리 중 (${progress.done}/${progress.total})`
              : `✨ 선택 파일 ${selectedCount}장 일괄 보정 실행`}
          </button>
        </div>

        {/* 수동 필터 */}
        {activeFile && (
          <div style={S.card}>
            <div style={S.cardTitle}>🎚 수동 필터 조정 — {activeFile.name}</div>
            {["brightness", "contrast", "saturation"].map((key) => (
              <div key={key} style={S.sliderRow}>
                <span style={S.sliderLabel}>{key === "brightness" ? "밝기" : key === "contrast" ? "대비" : "채도"}</span>
                <input type="range" min={50} max={150} value={activeFile.filters[key]}
                  onChange={async (e) => {
                    const val  = Number(e.target.value);
                    const next = { ...activeFile.filters, [key]: val };
                    const base = activeFile.corrected || activeFile.original;
                    const filtered = await applyImageFilters(base, next.brightness, next.contrast, next.saturation);
                    setFiles((prev) => prev.map((f) =>
                      f.id === activeFile.id ? { ...f, filters: next, corrected: filtered } : f
                    ));
                  }} style={S.slider} />
                <span style={S.sliderVal}>{activeFile.filters[key]}%</span>
              </div>
            ))}
          </div>
        )}

        {/* 파일 액션 */}
        {activeFile?.status === "done" && (
          <div style={S.card}>
            <div style={S.cardTitle}>📋 파일 관리 — {activeFile.name}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={{ ...S.btn, ...S.btnBlue }} onClick={() => setFinetuneTarget(activeFile)}>🔧 미세 수정</button>
              <button style={{ ...S.btn, ...S.btnBlue }} onClick={() => handleDownload(activeFile)}>⬇️ 다운로드</button>
              <button
                style={{ ...S.btn, ...(activeFile.finalized ? S.btnFinalOn : S.btnBlue) }}
                onClick={() => setFiles((prev) =>
                  prev.map((f) => f.id === activeFile.id ? { ...f, finalized: !f.finalized } : f)
                )}>
                {activeFile.finalized ? "✅ 확정됨 (클릭시 해제)" : "✔ 최종 확정"}
              </button>
            </div>
          </div>
        )}

        {/* 다음 단계 */}
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={S.cardTitle}>🚀 다음 단계로 전달</div>
              <div style={{ fontSize: 11, color: "#777" }}>최종 확정 {finalCount}장 → AI 착용샷 / 2차 상세페이지</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {finalCount > 0 && (
                <button style={{ ...S.btn, ...S.btnBlue }} onClick={downloadAll}>⬇️ 전체 다운로드</button>
              )}
              <button style={{ ...S.btn, ...S.btnGreen, opacity: finalCount ? 1 : 0.4 }}
                onClick={sendToNext} disabled={!finalCount}>다음 단계 →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 스타일
// ────────────────────────────────────────────────────────────
const S = {
  root:           { display: "flex", minHeight: "calc(100vh - 60px)", background: "#0f0f0f", color: "#e5e5e5", fontFamily: "'Pretendard','Noto Sans KR',sans-serif" },
  sidebar:        { width: 230, minWidth: 230, background: "#1a1a1a", borderRight: "1px solid #2a2a2a", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" },
  uploadZone:     { border: "1.5px dashed #3a3a3a", borderRadius: 8, padding: "12px 8px", textAlign: "center", cursor: "pointer", background: "#111" },
  uploadText:     { fontSize: 11, fontWeight: 600, marginTop: 4, color: "#ccc" },
  uploadSub:      { fontSize: 9, color: "#666", marginTop: 2 },
  driveBtn:       { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 7, border: "1px solid #3a3a3a", background: "#1e293b", color: "#93c5fd", fontSize: 11, fontWeight: 600, cursor: "pointer", width: "100%" },
  listHeader:     { display: "flex", justifyContent: "space-between", alignItems: "center" },
  listCount:      { fontSize: 10, color: "#888" },
  microBtn:       { fontSize: 9, padding: "2px 5px", borderRadius: 4, border: "1px solid #333", background: "#222", color: "#aaa", cursor: "pointer" },
  fileList:       { display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flex: 1 },
  fileItem:       { display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: 6, cursor: "pointer", border: "1px solid transparent", background: "#111" },
  fileItemActive: { border: "1px solid #22c55e", background: "#0f1f12" },
  thumb:          { width: 34, height: 34, objectFit: "cover", borderRadius: 4, flexShrink: 0 },
  fileName:       { fontSize: 10, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  iconBtn:        { background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer", flexShrink: 0, padding: "0 2px" },
  main:           { flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" },
  twoCol:         { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  previewCard:    { background: "#1a1a1a", borderRadius: 10, padding: "12px 14px", border: "1px solid #2a2a2a" },
  previewCardLabel: { fontSize: 12, fontWeight: 600, color: "#aaa", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" },
  badge:          { fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#333", color: "#bbb", fontWeight: 700 },
  mainImg:        { width: "100%", borderRadius: 6, objectFit: "contain", maxHeight: 280 },
  emptyImg:       { height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 13, border: "1px dashed #2a2a2a", borderRadius: 6 },
  previewImg:     { width: "100%", borderRadius: 6, objectFit: "contain", maxHeight: 200 },
  card:           { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px" },
  cardTitle:      { fontSize: 13, fontWeight: 700, color: "#e5e5e5", marginBottom: 10 },
  optionLabelFull:{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", padding: "10px 12px", borderRadius: 7, border: "1px solid #2a2a2a", background: "#111", transition: "all .15s" },
  creditBox:      { marginTop: 10, padding: "8px 12px", background: "#1a1f2e", border: "1px solid #2d3a5a", borderRadius: 6, fontSize: 11, color: "#93c5fd" },
  sliderRow:      { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  sliderLabel:    { fontSize: 12, color: "#aaa", width: 28, flexShrink: 0 },
  slider:         { flex: 1, accentColor: "#22c55e" },
  sliderVal:      { fontSize: 11, color: "#888", width: 36, textAlign: "right" },
  progressBar:    { position: "relative", background: "#222", borderRadius: 6, height: 24, overflow: "hidden", marginTop: 10 },
  progressFill:   { position: "absolute", left: 0, top: 0, height: "100%", background: "#22c55e", transition: "width .3s" },
  progressText:   { position: "absolute", width: "100%", textAlign: "center", fontSize: 11, color: "#fff", lineHeight: "24px", fontWeight: 600 },
  errorBox:       { background: "#2d1515", border: "1px solid #7f1d1d", borderRadius: 6, padding: "8px 10px", marginTop: 8, fontSize: 11, color: "#fca5a5" },
  btn:            { padding: "8px 14px", borderRadius: 7, border: "1px solid #3a3a3a", background: "#222", color: "#ddd", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  btnGreen:       { background: "#22c55e", border: "none", color: "#fff" },
  btnBlue:        { background: "#1e293b", border: "1px solid #334155", color: "#93c5fd" },
  btnFinalOn:     { background: "#14532d", border: "1px solid #22c55e", color: "#4ade80" },
  overlay:        { position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal:          { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, width: 720, maxWidth: "95vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" },
  modalHeader:    { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #2a2a2a" },
  modalTitle:     { fontSize: 14, fontWeight: 700, color: "#e5e5e5" },
  closeBtn:       { background: "none", border: "none", color: "#888", fontSize: 18, cursor: "pointer" },
  modalBody:      { flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 },
  modalFooter:    { display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 18px", borderTop: "1px solid #2a2a2a" },
  miniLabel:      { fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4 },
  sectionTitle:   { fontSize: 12, fontWeight: 700, color: "#ccc", marginBottom: 6 },
};
