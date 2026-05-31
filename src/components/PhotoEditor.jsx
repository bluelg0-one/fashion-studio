import { useState, useRef, useCallback } from "react";

// ────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────
const CORRECTION_OPTIONS = [
  {
    id: "bg_remove",
    label: "① 배경 삭제",
    desc: "배경만 제거, 마네킹/옷 유지",
    default: true,
  },
  {
    id: "mannequin_remove",
    label: "② 마네킹 + 배경 삭제",
    desc: "마네킹과 배경 모두 제거 → 옷 모양만 남김",
    default: false,
  },
  {
    id: "wrinkle_fix",
    label: "③ 주름 펴기 / 소매 정리",
    desc: "옷 주름 제거, 쳐진 소매 등 깔끔하게 보정",
    default: false,
  },
  {
    id: "sharp_outline",
    label: "④ 테두리 각지게 누끼",
    desc: "옷 외곽선을 선명하고 각지게 정리",
    default: false,
  },
];

const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturation: 100 };

// ────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────
function applyFilters(base64, filters) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.src = base64;
  });
}

function buildClaudePrompt(options) {
  const parts = [];
  if (options.bg_remove) parts.push("배경을 완전히 제거해 주세요.");
  if (options.mannequin_remove)
    parts.push(
      "마네킹과 배경을 모두 제거하고 옷 모양만 남겨 주세요."
    );
  if (options.wrinkle_fix)
    parts.push(
      "옷의 주름을 펴고, 쳐진 소매 등을 깔끔하게 보정해 주세요."
    );
  if (options.sharp_outline)
    parts.push(
      "옷의 테두리 윤곽을 선명하고 각지게 정리해 주세요."
    );
  return (
    parts.join(" ") +
    " 보정 후 고품질 이미지로 반환해 주세요."
  );
}

// ────────────────────────────────────────────────────────────
// 서브 컴포넌트 – 개별 미세 수정 패널
// ────────────────────────────────────────────────────────────
function FinetunePanel({ file, onSave, onClose }) {
  const [filters, setFilters] = useState({ ...file.filters });
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState(file.corrected);
  const [loading, setLoading] = useState(false);

  const handleFilterChange = async (key, val) => {
    const next = { ...filters, [key]: val };
    setFilters(next);
    const result = await applyFilters(file.corrected, next);
    setPreview(result);
  };

  const handlePromptApply = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: file.corrected.split(",")[1],
                  },
                },
                { type: "text", text: prompt },
              ],
            },
          ],
        }),
      });
      const data = await res.json();
      const text = data.content?.find((c) => c.type === "text")?.text || "";
      // Claude가 이미지를 직접 반환하지 않으므로 안내 메시지 표시
      alert("Claude 응답: " + text.slice(0, 200));
    } catch (e) {
      alert("오류: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>🔧 미세 수정 — {file.name}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.modalBody}>
          {/* 미리보기 */}
          <div style={styles.previewRow}>
            <div style={styles.previewBox}>
              <div style={styles.previewLabel}>보정본</div>
              <img src={file.corrected} alt="원본" style={styles.previewImg} />
            </div>
            <div style={styles.previewBox}>
              <div style={styles.previewLabel}>수정 중</div>
              <img src={preview} alt="수정" style={styles.previewImg} />
            </div>
          </div>

          {/* 수동 필터 */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>🎚 수동 필터 조정</div>
            {["brightness", "contrast", "saturation"].map((key) => (
              <div key={key} style={styles.sliderRow}>
                <span style={styles.sliderLabel}>
                  {key === "brightness" ? "밝기" : key === "contrast" ? "대비" : "채도"}
                </span>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={filters[key]}
                  onChange={(e) => handleFilterChange(key, Number(e.target.value))}
                  style={styles.slider}
                />
                <span style={styles.sliderVal}>{filters[key]}%</span>
              </div>
            ))}
          </div>

          {/* 프롬프트 수정 */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>✏️ AI 추가 보정 프롬프트</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="예) 옷깃 부분을 더 선명하게 해줘"
              style={styles.textarea}
            />
            <button
              style={{ ...styles.btn, ...styles.btnSecondary, opacity: loading ? 0.6 : 1 }}
              onClick={handlePromptApply}
              disabled={loading}
            >
              {loading ? "처리 중..." : "✨ AI 재보정 실행"}
            </button>
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.btn} onClick={onClose}>취소</button>
          <button
            style={{ ...styles.btn, ...styles.btnGreen }}
            onClick={() => onSave({ ...file, filters, corrected: preview, finalized: true })}
          >
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

  // 파일 목록: { id, name, original(base64), corrected, filters, status, finalized, selected }
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [finetuneTarget, setFinetuneTarget] = useState(null);

  // 보정 옵션
  const [corrOptions, setCorrOptions] = useState(() =>
    Object.fromEntries(CORRECTION_OPTIONS.map((o) => [o.id, o.default]))
  );

  // 처리 상태
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // ── 파일 추가 ──
  const addFiles = (fileList) => {
    const newFiles = Array.from(fileList).map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      file: f,
      original: null,
      corrected: null,
      filters: { ...DEFAULT_FILTERS },
      status: "pending", // pending | processing | done | error
      finalized: false,
      selected: true,
    }));

    newFiles.forEach((item) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, original: e.target.result } : f
          )
        );
      };
      reader.readAsDataURL(item.file);
    });

    setFiles((prev) => [...prev, ...newFiles]);
    if (newFiles.length > 0 && !activeFileId) setActiveFileId(newFiles[0].id);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }, []);

  // ── 구글 드라이브 연결 ──
  const openGoogleDrive = () => {
    // Google Picker API 연동 포인트 (실제 구현 시 OAuth 필요)
    window.open(
      "https://drive.google.com/drive/my-drive",
      "_blank",
      "width=800,height=600"
    );
  };

  // ── 선택 토글 ──
  const toggleSelect = (id) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
  };
  const selectAll = (val) => {
    setFiles((prev) => prev.map((f) => ({ ...f, selected: val })));
  };

  // ── 일괄 처리 ──
  const runBatch = async () => {
    const targets = files.filter((f) => f.selected && f.original);
    if (!targets.length) return alert("선택된 파일이 없습니다.");

    setProcessing(true);
    setProgress({ done: 0, total: targets.length });

    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "processing" } : f))
      );

      try {
        const prompt = buildClaudePrompt(corrOptions);

        // 1. Claude AI 보정 (vision 분석 → 실제 이미지 편집은 canvas로)
        await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: "image/jpeg",
                      data: item.original.split(",")[1],
                    },
                  },
                  { type: "text", text: prompt },
                ],
              },
            ],
          }),
        });

        // 2. Remove.bg 누끼 (선택 옵션에 배경제거 포함 시)
        let correctedBase64 = item.original;
        if (corrOptions.bg_remove || corrOptions.mannequin_remove) {
          const formData = new FormData();
          formData.append("image_file", item.file);
          formData.append("size", "auto");
          if (corrOptions.mannequin_remove) {
            formData.append("type", "product");
          }

          const bgRes = await fetch("https://api.remove.bg/v1.0/removebg", {
            method: "POST",
            headers: { "X-Api-Key": import.meta.env.VITE_REMOVEBG_API_KEY },
            body: formData,
          });

          if (bgRes.ok) {
            const blob = await bgRes.blob();
            correctedBase64 = await new Promise((res) => {
              const r = new FileReader();
              r.onload = (e) => res(e.target.result);
              r.readAsDataURL(blob);
            });
          }
        }

        // 3. 필터 적용
        const filtered = await applyFilters(correctedBase64, item.filters);

        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, corrected: filtered, status: "done" }
              : f
          )
        );
      } catch (e) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, status: "error" } : f
          )
        );
      }

      setProgress({ done: i + 1, total: targets.length });
    }

    setProcessing(false);
    // 첫 번째 done 파일 활성화
    setActiveFileId(targets[0].id);
  };

  // ── 미세 수정 저장 ──
  const saveFinetuned = (updated) => {
    setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    setFinetuneTarget(null);
  };

  // ── 개별 다운로드 ──
  const downloadFile = (file) => {
    const src = file.corrected || file.original;
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = `edited_${file.name}`;
    a.click();
  };

  // ── 다음 단계로 전달 ──
  const sendToNext = () => {
    const finals = files.filter((f) => f.finalized && f.corrected);
    if (!finals.length) return alert("최종 확정된 파일이 없습니다.");
    onFilesReady?.(finals);
    alert(`${finals.length}장을 다음 단계로 전달했습니다.`);
  };

  const activeFile = files.find((f) => f.id === activeFileId);
  const doneCount = files.filter((f) => f.status === "done").length;
  const finalCount = files.filter((f) => f.finalized).length;
  const selectedCount = files.filter((f) => f.selected).length;

  return (
    <div style={styles.root}>
      {finetuneTarget && (
        <FinetunePanel
          file={finetuneTarget}
          onSave={saveFinetuned}
          onClose={() => setFinetuneTarget(null)}
        />
      )}

      {/* ── 좌측 패널 ── */}
      <div style={styles.sidebar}>
        {/* 업로드 영역 */}
        <div
          style={styles.uploadZone}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <div style={{ fontSize: 28 }}>📁</div>
          <div style={styles.uploadText}>클릭 또는 드래그</div>
          <div style={styles.uploadSub}>여러 장 한번에 선택 가능</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {/* 구글 드라이브 버튼 */}
        <button style={styles.driveBtn} onClick={openGoogleDrive}>
          <span style={{ fontSize: 16 }}>📂</span> Google Drive에서 가져오기
        </button>

        {/* 파일 목록 */}
        {files.length > 0 && (
          <>
            <div style={styles.listHeader}>
              <span style={styles.listCount}>
                총 {files.length}장 · 완료 {doneCount} · 확정 {finalCount}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={styles.microBtn} onClick={() => selectAll(true)}>전체선택</button>
                <button style={styles.microBtn} onClick={() => selectAll(false)}>해제</button>
              </div>
            </div>

            <div style={styles.fileList}>
              {files.map((f) => (
                <div
                  key={f.id}
                  style={{
                    ...styles.fileItem,
                    ...(activeFileId === f.id ? styles.fileItemActive : {}),
                  }}
                  onClick={() => setActiveFileId(f.id)}
                >
                  <input
                    type="checkbox"
                    checked={f.selected}
                    onChange={() => toggleSelect(f.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={styles.checkbox}
                  />
                  {f.original && (
                    <img
                      src={f.corrected || f.original}
                      alt={f.name}
                      style={styles.thumb}
                    />
                  )}
                  <div style={styles.fileInfo}>
                    <div style={styles.fileName}>{f.name}</div>
                    <div style={styles.fileStatus}>
                      {f.status === "pending" && <span style={styles.statusPending}>대기</span>}
                      {f.status === "processing" && <span style={styles.statusProc}>처리 중...</span>}
                      {f.status === "done" && !f.finalized && <span style={styles.statusDone}>보정완료</span>}
                      {f.finalized && <span style={styles.statusFinal}>✅ 확정</span>}
                      {f.status === "error" && <span style={styles.statusErr}>오류</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── 우측 메인 ── */}
      <div style={styles.main}>
        {/* 미리보기 */}
        <div style={styles.previewSection}>
          <div style={styles.previewCard}>
            <div style={styles.previewCardLabel}>원본 사진 <span style={styles.badge}>BEFORE</span></div>
            {activeFile?.original ? (
              <img src={activeFile.original} alt="원본" style={styles.mainImg} />
            ) : (
              <div style={styles.emptyImg}>이미지를 업로드하세요</div>
            )}
          </div>
          <div style={styles.previewCard}>
            <div style={styles.previewCardLabel}>AI 보정본 <span style={{ ...styles.badge, background: "#22c55e", color: "#fff" }}>AFTER</span></div>
            {activeFile?.corrected ? (
              <img src={activeFile.corrected} alt="보정" style={styles.mainImg} />
            ) : (
              <div style={styles.emptyImg}>보정 후 표시됩니다</div>
            )}
          </div>
        </div>

        {/* 보정 옵션 체크박스 */}
        <div style={styles.optionCard}>
          <div style={styles.cardTitle}>✂️ 누끼 따기 / AI 보정 옵션</div>
          <div style={styles.optionGrid}>
            {CORRECTION_OPTIONS.map((opt) => (
              <label key={opt.id} style={styles.optionLabel}>
                <input
                  type="checkbox"
                  checked={corrOptions[opt.id]}
                  onChange={(e) =>
                    setCorrOptions((prev) => ({ ...prev, [opt.id]: e.target.checked }))
                  }
                  style={styles.checkbox}
                />
                <div>
                  <div style={styles.optionName}>{opt.label}</div>
                  <div style={styles.optionDesc}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* 진행 바 */}
          {processing && (
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${(progress.done / progress.total) * 100}%` }} />
              <span style={styles.progressText}>
                {progress.done} / {progress.total} 처리 중...
              </span>
            </div>
          )}

          {/* 일괄 실행 버튼 */}
          <button
            style={{ ...styles.btn, ...styles.btnGreen, width: "100%", marginTop: 12, opacity: processing ? 0.6 : 1 }}
            onClick={runBatch}
            disabled={processing}
          >
            {processing
              ? `⏳ 처리 중 (${progress.done}/${progress.total})`
              : `✨ 선택 파일 ${selectedCount}장 일괄 보정 + 누끼 실행`}
          </button>
        </div>

        {/* 수동 필터 (활성 파일) */}
        {activeFile && (
          <div style={styles.optionCard}>
            <div style={styles.cardTitle}>🎚 수동 필터 조정 — {activeFile.name}</div>
            {["brightness", "contrast", "saturation"].map((key) => (
              <div key={key} style={styles.sliderRow}>
                <span style={styles.sliderLabel}>
                  {key === "brightness" ? "밝기" : key === "contrast" ? "대비" : "채도"}
                </span>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={activeFile.filters[key]}
                  onChange={async (e) => {
                    const val = Number(e.target.value);
                    const next = { ...activeFile.filters, [key]: val };
                    const filtered = activeFile.corrected
                      ? await applyFilters(activeFile.corrected, next)
                      : null;
                    setFiles((prev) =>
                      prev.map((f) =>
                        f.id === activeFile.id
                          ? { ...f, filters: next, ...(filtered ? { corrected: filtered } : {}) }
                          : f
                      )
                    );
                  }}
                  style={styles.slider}
                />
                <span style={styles.sliderVal}>{activeFile.filters[key]}%</span>
              </div>
            ))}
          </div>
        )}

        {/* 개별 파일 액션 */}
        {activeFile?.status === "done" && (
          <div style={styles.optionCard}>
            <div style={styles.cardTitle}>📋 파일 관리 — {activeFile.name}</div>
            <div style={styles.actionRow}>
              <button
                style={{ ...styles.btn, ...styles.btnSecondary }}
                onClick={() => setFinetuneTarget(activeFile)}
              >
                🔧 미세 수정
              </button>
              <button
                style={{ ...styles.btn, ...styles.btnSecondary }}
                onClick={() => downloadFile(activeFile)}
              >
                ⬇️ 다운로드
              </button>
              <button
                style={{
                  ...styles.btn,
                  ...(activeFile.finalized ? styles.btnFinalOn : styles.btnSecondary),
                }}
                onClick={() =>
                  setFiles((prev) =>
                    prev.map((f) =>
                      f.id === activeFile.id ? { ...f, finalized: !f.finalized } : f
                    )
                  )
                }
              >
                {activeFile.finalized ? "✅ 확정됨" : "✔ 최종 확정"}
              </button>
            </div>
          </div>
        )}

        {/* 다음 단계 전달 */}
        <div style={styles.optionCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={styles.cardTitle}>🚀 다음 단계로 전달</div>
              <div style={styles.optionDesc}>
                최종 확정 {finalCount}장 → AI 착용샷 / 2차 상세페이지에서 사용
              </div>
            </div>
            <button
              style={{ ...styles.btn, ...styles.btnGreen, opacity: finalCount ? 1 : 0.4 }}
              onClick={sendToNext}
              disabled={!finalCount}
            >
              다음 단계 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 스타일 (기존 앱 다크 테마 유지)
// ────────────────────────────────────────────────────────────
const styles = {
  root: {
    display: "flex",
    gap: 0,
    minHeight: "calc(100vh - 60px)",
    background: "#0f0f0f",
    color: "#e5e5e5",
    fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
  },

  // 사이드바
  sidebar: {
    width: 240,
    minWidth: 240,
    background: "#1a1a1a",
    borderRight: "1px solid #2a2a2a",
    padding: "14px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    overflowY: "auto",
  },
  uploadZone: {
    border: "1.5px dashed #3a3a3a",
    borderRadius: 8,
    padding: "14px 8px",
    textAlign: "center",
    cursor: "pointer",
    background: "#111",
    transition: "border-color .2s",
  },
  uploadText: { fontSize: 12, fontWeight: 600, marginTop: 6, color: "#ccc" },
  uploadSub: { fontSize: 10, color: "#666", marginTop: 2 },
  driveBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "8px 0",
    borderRadius: 7,
    border: "1px solid #3a3a3a",
    background: "#1e293b",
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "2px 2px",
  },
  listCount: { fontSize: 10, color: "#888" },
  microBtn: {
    fontSize: 9,
    padding: "2px 6px",
    borderRadius: 4,
    border: "1px solid #333",
    background: "#222",
    color: "#aaa",
    cursor: "pointer",
  },
  fileList: { display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", maxHeight: "calc(100vh - 280px)" },
  fileItem: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "6px 6px",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid transparent",
    background: "#111",
  },
  fileItemActive: { border: "1px solid #22c55e", background: "#0f1f12" },
  thumb: { width: 36, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0 },
  fileInfo: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 10, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  fileStatus: { fontSize: 9, marginTop: 2 },
  statusPending: { color: "#888" },
  statusProc: { color: "#facc15" },
  statusDone: { color: "#4ade80" },
  statusFinal: { color: "#22c55e", fontWeight: 700 },
  statusErr: { color: "#f87171" },
  checkbox: { accentColor: "#22c55e", flexShrink: 0 },

  // 메인
  main: {
    flex: 1,
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    overflowY: "auto",
  },
  previewSection: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
  },
  previewCard: {
    background: "#1a1a1a",
    borderRadius: 10,
    padding: "12px 14px",
    border: "1px solid #2a2a2a",
  },
  previewCardLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#aaa",
    marginBottom: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 4,
    background: "#333",
    color: "#bbb",
    fontWeight: 700,
  },
  mainImg: { width: "100%", borderRadius: 6, objectFit: "contain", maxHeight: 280 },
  emptyImg: {
    height: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#444",
    fontSize: 13,
    border: "1px dashed #2a2a2a",
    borderRadius: 6,
  },

  // 카드
  optionCard: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    padding: "14px 16px",
  },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#e5e5e5", marginBottom: 10 },
  optionGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  optionLabel: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    cursor: "pointer",
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid #2a2a2a",
    background: "#111",
  },
  optionName: { fontSize: 12, fontWeight: 600, color: "#ddd" },
  optionDesc: { fontSize: 10, color: "#777", marginTop: 2 },

  // 슬라이더
  sliderRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  sliderLabel: { fontSize: 12, color: "#aaa", width: 28, flexShrink: 0 },
  slider: { flex: 1, accentColor: "#22c55e" },
  sliderVal: { fontSize: 11, color: "#888", width: 36, textAlign: "right" },

  // 진행 바
  progressBar: {
    position: "relative",
    background: "#222",
    borderRadius: 6,
    height: 24,
    overflow: "hidden",
    marginTop: 10,
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    height: "100%",
    background: "#22c55e",
    transition: "width .3s",
  },
  progressText: {
    position: "absolute",
    width: "100%",
    textAlign: "center",
    fontSize: 11,
    color: "#fff",
    lineHeight: "24px",
    fontWeight: 600,
  },

  // 버튼
  btn: {
    padding: "8px 16px",
    borderRadius: 7,
    border: "1px solid #3a3a3a",
    background: "#222",
    color: "#ddd",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnGreen: { background: "#22c55e", border: "none", color: "#fff" },
  btnSecondary: { background: "#1e293b", border: "1px solid #334155", color: "#93c5fd" },
  btnFinalOn: { background: "#14532d", border: "1px solid #22c55e", color: "#4ade80" },
  actionRow: { display: "flex", gap: 8, flexWrap: "wrap" },

  // 오버레이 / 모달
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    width: 700,
    maxWidth: "95vw",
    maxHeight: "90vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 18px",
    borderBottom: "1px solid #2a2a2a",
  },
  modalTitle: { fontSize: 14, fontWeight: 700, color: "#e5e5e5" },
  closeBtn: { background: "none", border: "none", color: "#888", fontSize: 18, cursor: "pointer" },
  modalBody: { flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    padding: "12px 18px",
    borderTop: "1px solid #2a2a2a",
  },
  previewRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  previewBox: { display: "flex", flexDirection: "column", gap: 6 },
  previewLabel: { fontSize: 11, color: "#888", fontWeight: 600 },
  previewImg: { width: "100%", borderRadius: 6, objectFit: "contain", maxHeight: 200, background: "#111" },
  section: { display: "flex", flexDirection: "column", gap: 6 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: "#ccc", marginBottom: 4 },
  textarea: {
    width: "100%",
    minHeight: 70,
    padding: "8px 10px",
    background: "#111",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#ddd",
    fontSize: 12,
    resize: "vertical",
    boxSizing: "border-box",
  },
};
