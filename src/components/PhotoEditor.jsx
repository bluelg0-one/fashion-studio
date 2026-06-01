import { useState, useRef, useCallback } from "react";
import { callClaude, fileToBase64, applyImageFilters, downloadImage } from "../utils/api";

// ────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────
const CORRECTION_OPTIONS = [
  { id: "bg_remove",        label: "① 배경 삭제",            desc: "배경만 제거, 마네킹/옷 유지",                  default: true  },
  { id: "mannequin_remove", label: "② 마네킹 + 배경 삭제",   desc: "마네킹과 배경 모두 제거 → 옷 모양만 남김",    default: false },
  { id: "wrinkle_fix",      label: "③ 주름 펴기 / 소매 정리",desc: "옷 주름 제거, 쳐진 소매 등 깔끔하게 보정",    default: false },
  { id: "sharp_outline",    label: "④ 테두리 각지게 누끼",   desc: "옷 외곽선을 선명하고 각지게 정리",            default: false },
];

const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturation: 100 };

function buildClaudePrompt(options) {
  const parts = [];
  if (options.bg_remove)        parts.push("배경을 완전히 제거해 주세요.");
  if (options.mannequin_remove) parts.push("마네킹과 배경을 모두 제거하고 옷 모양만 남겨 주세요.");
  if (options.wrinkle_fix)      parts.push("옷의 주름을 펴고, 쳐진 소매 등을 깔끔하게 보정해 주세요.");
  if (options.sharp_outline)    parts.push("옷의 테두리 윤곽을 선명하고 각지게 정리해 주세요.");
  return parts.join(" ") + " 이 패션 상품 이미지를 쇼핑몰용으로 전문적으로 보정해 주세요.";
}

// Remove.bg 호출 함수
async function removeBackground(file, mannequinMode = false) {
  const apiKey = import.meta.env.VITE_REMOVEBG_API_KEY;
  if (!apiKey) throw new Error("VITE_REMOVEBG_API_KEY가 설정되지 않았습니다.");

  const formData = new FormData();
  formData.append("image_file", file);
  formData.append("size", "auto");
  if (mannequinMode) formData.append("type", "product");

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.errors?.[0]?.title || `Remove.bg 오류 (${res.status})`);
  }

  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ────────────────────────────────────────────────────────────
// 미세 수정 모달
// ────────────────────────────────────────────────────────────
function FinetunePanel({ file, onSave, onClose }) {
  const [filters, setFilters] = useState({ ...file.filters });
  const [prompt,  setPrompt]  = useState("");
  const [preview, setPreview] = useState(file.corrected);
  const [loading, setLoading] = useState(false);

  const handleFilterChange = async (key, val) => {
    const next = { ...filters, [key]: val };
    setFilters(next);
    // applyImageFilters는 api.js의 함수 사용
    const result = await applyImageFilters(file.corrected, next.brightness, next.contrast, next.saturation);
    setPreview(result);
  };

  const handlePromptApply = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      // api.js의 callClaude 사용 (헤더/키 자동 포함)
      const base64 = preview.split(",")[1];
      const text = await callClaude(prompt, base64, "image/jpeg");
      alert("Claude 응답:\n" + text.slice(0, 300));
    } catch (e) {
      alert("오류: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <span style={S.modalTitle}>🔧 미세 수정 — {file.name}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.modalBody}>
          <div style={S.twoCol}>
            {[["보정본", file.corrected], ["수정 중", preview]].map(([label, src]) => (
              <div key={label}>
                <div style={S.miniLabel}>{label}</div>
                <img src={src} alt={label} style={S.previewImg} />
              </div>
            ))}
          </div>

          <div>
            <div style={S.sectionTitle}>🎚 수동 필터 조정</div>
            {["brightness", "contrast", "saturation"].map((key) => (
              <div key={key} style={S.sliderRow}>
                <span style={S.sliderLabel}>{key === "brightness" ? "밝기" : key === "contrast" ? "대비" : "채도"}</span>
                <input type="range" min={50} max={150} value={filters[key]}
                  onChange={(e) => handleFilterChange(key, Number(e.target.value))}
                  style={S.slider} />
                <span style={S.sliderVal}>{filters[key]}%</span>
              </div>
            ))}
          </div>

          <div>
            <div style={S.sectionTitle}>✏️ AI 추가 보정 프롬프트</div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="예) 옷깃 부분을 더 선명하게 해줘" style={S.textarea} />
            <button style={{ ...S.btn, ...S.btnBlue, marginTop: 6, opacity: loading ? 0.6 : 1 }}
              onClick={handlePromptApply} disabled={loading}>
              {loading ? "처리 중..." : "✨ AI 재보정 실행"}
            </button>
          </div>
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
  const [corrOptions,    setCorrOptions]    = useState(
    () => Object.fromEntries(CORRECTION_OPTIONS.map((o) => [o.id, o.default]))
  );
  const [processing, setProcessing] = useState(false);
  const [progress,   setProgress]   = useState({ done: 0, total: 0 });
  const [errorLog,   setErrorLog]   = useState([]); // 오류 내역 기록

  // ── 파일 추가 ──
  const addFiles = useCallback((fileList) => {
    const newFiles = Array.from(fileList).map((f) => ({
      id:        crypto.randomUUID(),
      name:      f.name,
      file:      f,
      original:  null,
      corrected: null,
      filters:   { ...DEFAULT_FILTERS },
      status:    "pending",
      finalized: false,
      selected:  true,
    }));

    newFiles.forEach((item) => {
      const reader = new FileReader();
      reader.onload = (e) =>
        setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, original: e.target.result } : f));
      reader.readAsDataURL(item.file);
    });

    setFiles((prev) => {
      const next = [...prev, ...newFiles];
      return next;
    });
    setActiveFileId((prev) => prev ?? newFiles[0]?.id);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const toggleSelect = (id) =>
    setFiles((prev) => prev.map((f) => f.id === id ? { ...f, selected: !f.selected } : f));
  const selectAll = (val) =>
    setFiles((prev) => prev.map((f) => ({ ...f, selected: val })));

  // ── 일괄 처리 (핵심 수정 부분) ──
  const runBatch = async () => {
    const targets = files.filter((f) => f.selected && f.original);
    if (!targets.length) return alert("선택된 파일이 없습니다.");

    setProcessing(true);
    setErrorLog([]);
    setProgress({ done: 0, total: targets.length });

    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, status: "processing" } : f));

      try {
        let correctedDataUrl = item.original;

        // ── STEP 1: Claude AI 분석 (api.js의 callClaude 사용 → 헤더 자동 포함) ──
        const prompt = buildClaudePrompt(corrOptions);
        const base64 = item.original.split(",")[1];
        const mimeType = item.file.type || "image/jpeg";
        await callClaude(prompt, base64, mimeType); // 분석만, 결과 텍스트는 무시

        // ── STEP 2: Remove.bg 누끼 따기 ──
        if (corrOptions.bg_remove || corrOptions.mannequin_remove) {
          correctedDataUrl = await removeBackground(item.file, corrOptions.mannequin_remove);
        }

        // ── STEP 3: 필터 적용 ──
        const { brightness, contrast, saturation } = item.filters;
        const filtered = await applyImageFilters(correctedDataUrl, brightness, contrast, saturation);

        setFiles((prev) =>
          prev.map((f) => f.id === item.id ? { ...f, corrected: filtered, status: "done" } : f)
        );

      } catch (e) {
        // 오류 내역을 사용자가 볼 수 있게 기록
        setErrorLog((prev) => [...prev, `${item.name}: ${e.message}`]);
        setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, status: "error" } : f));
      }

      setProgress({ done: i + 1, total: targets.length });
    }

    setProcessing(false);
    // 완료된 첫 파일 활성화
    const firstDone = targets.find((t) => {
      const updated = files.find((f) => f.id === t.id);
      return updated?.status === "done";
    });
    if (firstDone) setActiveFileId(firstDone.id);
  };

  const saveFinetuned = (updated) => {
    setFiles((prev) => prev.map((f) => f.id === updated.id ? updated : f));
    setFinetuneTarget(null);
  };

  const handleDownload = (file) => {
    const src = file.corrected || file.original;
    if (!src) return;
    downloadImage(src, `edited_${file.name}`); // api.js의 downloadImage 사용
  };

  const downloadAll = () => {
    files.filter((f) => f.finalized && f.corrected).forEach((f) => handleDownload(f));
  };

  const sendToNext = () => {
    const finals = files.filter((f) => f.finalized && f.corrected);
    if (!finals.length) return alert("최종 확정된 파일이 없습니다.\n파일 보정 후 '최종 확정' 버튼을 눌러주세요.");
    onFilesReady?.(finals);
    alert(`✅ ${finals.length}장을 다음 단계로 전달했습니다.`);
  };

  const activeFile    = files.find((f) => f.id === activeFileId);
  const doneCount     = files.filter((f) => f.status === "done").length;
  const finalCount    = files.filter((f) => f.finalized).length;
  const selectedCount = files.filter((f) => f.selected).length;

  return (
    <div style={S.root}>
      {finetuneTarget && (
        <FinetunePanel file={finetuneTarget} onSave={saveFinetuned} onClose={() => setFinetuneTarget(null)} />
      )}

      {/* ── 좌측 사이드바 ── */}
      <div style={S.sidebar}>
        {/* 업로드 존 */}
        <div style={S.uploadZone} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}>
          <div style={{ fontSize: 26 }}>📁</div>
          <div style={S.uploadText}>클릭 또는 드래그</div>
          <div style={S.uploadSub}>여러 장 한번에 선택 가능</div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files)} />
        </div>

        {/* Google Drive 버튼 (단순 링크 — 완전 연동은 별도) */}
        <button style={S.driveBtn} onClick={() => window.open("https://drive.google.com", "_blank")}>
          <span>📂</span> Google Drive에서 가져오기
        </button>

        {/* 파일 목록 */}
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
                  {f.original && (
                    <img src={f.corrected || f.original} alt={f.name} style={S.thumb} />
                  )}
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
                    <button style={S.iconBtn} title="다운로드"
                      onClick={(e) => { e.stopPropagation(); handleDownload(f); }}>⬇</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── 메인 영역 ── */}
      <div style={S.main}>

        {/* 원본 / 보정본 미리보기 */}
        <div style={S.twoCol}>
          {[
            { label: "원본 사진",  badge: "BEFORE", badgeStyle: {},                                    src: activeFile?.original  },
            { label: "AI 보정본",  badge: "AFTER",  badgeStyle: { background: "#22c55e", color:"#fff"}, src: activeFile?.corrected },
          ].map(({ label, badge, badgeStyle, src }) => (
            <div key={label} style={S.previewCard}>
              <div style={S.previewCardLabel}>
                {label} <span style={{ ...S.badge, ...badgeStyle }}>{badge}</span>
              </div>
              {src
                ? <img src={src} alt={label} style={S.mainImg} />
                : <div style={S.emptyImg}>{badge === "BEFORE" ? "이미지를 업로드하세요" : "보정 후 표시됩니다"}</div>}
            </div>
          ))}
        </div>

        {/* 보정 옵션 + 일괄 실행 */}
        <div style={S.card}>
          <div style={S.cardTitle}>✂️ 누끼 따기 / AI 보정 옵션</div>
          <div style={S.optionGrid}>
            {CORRECTION_OPTIONS.map((opt) => (
              <label key={opt.id} style={S.optionLabel}>
                <input type="checkbox" checked={corrOptions[opt.id]}
                  onChange={(e) => setCorrOptions((prev) => ({ ...prev, [opt.id]: e.target.checked }))}
                  style={{ accentColor: "#22c55e", marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#ddd" }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* 진행 바 */}
          {processing && (
            <div style={S.progressBar}>
              <div style={{ ...S.progressFill, width: `${(progress.done / progress.total) * 100}%` }} />
              <span style={S.progressText}>{progress.done} / {progress.total} 처리 중...</span>
            </div>
          )}

          {/* 오류 로그 */}
          {errorLog.length > 0 && (
            <div style={S.errorBox}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ 처리 중 오류 발생:</div>
              {errorLog.map((msg, i) => <div key={i} style={{ fontSize: 10 }}>{msg}</div>)}
            </div>
          )}

          <button
            style={{ ...S.btn, ...S.btnGreen, width: "100%", marginTop: 12, opacity: processing ? 0.6 : 1 }}
            onClick={runBatch} disabled={processing}>
            {processing
              ? `⏳ 처리 중 (${progress.done}/${progress.total})`
              : `✨ 선택 파일 ${selectedCount}장 일괄 보정 + 누끼 실행`}
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
              <button style={{ ...S.btn, ...S.btnBlue }} onClick={() => setFinetuneTarget(activeFile)}>
                🔧 미세 수정
              </button>
              <button style={{ ...S.btn, ...S.btnBlue }} onClick={() => handleDownload(activeFile)}>
                ⬇️ 다운로드
              </button>
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
              <div style={{ fontSize: 11, color: "#777" }}>
                최종 확정 {finalCount}장 → AI 착용샷 / 2차 상세페이지
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {finalCount > 0 && (
                <button style={{ ...S.btn, ...S.btnBlue }} onClick={downloadAll}>⬇️ 전체 다운로드</button>
              )}
              <button style={{ ...S.btn, ...S.btnGreen, opacity: finalCount ? 1 : 0.4 }}
                onClick={sendToNext} disabled={!finalCount}>
                다음 단계 →
              </button>
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
  root:        { display: "flex", minHeight: "calc(100vh - 60px)", background: "#0f0f0f", color: "#e5e5e5", fontFamily: "'Pretendard','Noto Sans KR',sans-serif" },
  sidebar:     { width: 230, minWidth: 230, background: "#1a1a1a", borderRight: "1px solid #2a2a2a", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" },
  uploadZone:  { border: "1.5px dashed #3a3a3a", borderRadius: 8, padding: "12px 8px", textAlign: "center", cursor: "pointer", background: "#111" },
  uploadText:  { fontSize: 11, fontWeight: 600, marginTop: 4, color: "#ccc" },
  uploadSub:   { fontSize: 9, color: "#666", marginTop: 2 },
  driveBtn:    { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 7, border: "1px solid #3a3a3a", background: "#1e293b", color: "#93c5fd", fontSize: 11, fontWeight: 600, cursor: "pointer", width: "100%" },
  listHeader:  { display: "flex", justifyContent: "space-between", alignItems: "center" },
  listCount:   { fontSize: 10, color: "#888" },
  microBtn:    { fontSize: 9, padding: "2px 5px", borderRadius: 4, border: "1px solid #333", background: "#222", color: "#aaa", cursor: "pointer" },
  fileList:    { display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flex: 1 },
  fileItem:    { display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: 6, cursor: "pointer", border: "1px solid transparent", background: "#111" },
  fileItemActive: { border: "1px solid #22c55e", background: "#0f1f12" },
  thumb:       { width: 34, height: 34, objectFit: "cover", borderRadius: 4, flexShrink: 0 },
  fileName:    { fontSize: 10, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  iconBtn:     { background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer", flexShrink: 0, padding: "0 2px" },
  main:        { flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" },
  twoCol:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  previewCard: { background: "#1a1a1a", borderRadius: 10, padding: "12px 14px", border: "1px solid #2a2a2a" },
  previewCardLabel: { fontSize: 12, fontWeight: 600, color: "#aaa", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" },
  badge:       { fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#333", color: "#bbb", fontWeight: 700 },
  mainImg:     { width: "100%", borderRadius: 6, objectFit: "contain", maxHeight: 280 },
  emptyImg:    { height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 13, border: "1px dashed #2a2a2a", borderRadius: 6 },
  previewImg:  { width: "100%", borderRadius: 6, objectFit: "contain", maxHeight: 200, background: "#111" },
  card:        { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px" },
  cardTitle:   { fontSize: 13, fontWeight: 700, color: "#e5e5e5", marginBottom: 10 },
  optionGrid:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  optionLabel: { display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", padding: "8px 10px", borderRadius: 7, border: "1px solid #2a2a2a", background: "#111" },
  sliderRow:   { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  sliderLabel: { fontSize: 12, color: "#aaa", width: 28, flexShrink: 0 },
  slider:      { flex: 1, accentColor: "#22c55e" },
  sliderVal:   { fontSize: 11, color: "#888", width: 36, textAlign: "right" },
  progressBar: { position: "relative", background: "#222", borderRadius: 6, height: 24, overflow: "hidden", marginTop: 10 },
  progressFill:{ position: "absolute", left: 0, top: 0, height: "100%", background: "#22c55e", transition: "width .3s" },
  progressText:{ position: "absolute", width: "100%", textAlign: "center", fontSize: 11, color: "#fff", lineHeight: "24px", fontWeight: 600 },
  errorBox:    { background: "#2d1515", border: "1px solid #7f1d1d", borderRadius: 6, padding: "8px 10px", marginTop: 8, fontSize: 11, color: "#fca5a5" },
  btn:         { padding: "8px 14px", borderRadius: 7, border: "1px solid #3a3a3a", background: "#222", color: "#ddd", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  btnGreen:    { background: "#22c55e", border: "none", color: "#fff" },
  btnBlue:     { background: "#1e293b", border: "1px solid #334155", color: "#93c5fd" },
  btnFinalOn:  { background: "#14532d", border: "1px solid #22c55e", color: "#4ade80" },
  overlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal:       { background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, width: 700, maxWidth: "95vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #2a2a2a" },
  modalTitle:  { fontSize: 14, fontWeight: 700, color: "#e5e5e5" },
  closeBtn:    { background: "none", border: "none", color: "#888", fontSize: 18, cursor: "pointer" },
  modalBody:   { flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 },
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 18px", borderTop: "1px solid #2a2a2a" },
  miniLabel:   { fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4 },
  sectionTitle:{ fontSize: 12, fontWeight: 700, color: "#ccc", marginBottom: 6 },
  textarea:    { width: "100%", minHeight: 70, padding: "8px 10px", background: "#111", border: "1px solid #333", borderRadius: 6, color: "#ddd", fontSize: 12, resize: "vertical", boxSizing: "border-box" },
};
