/* 공용 UI 컴포넌트 - 배지·리스트·모달·시간 선택 등 화면들이 공유 (C-2 파일 분리) */
import React, { useState, useEffect } from "react";
import { ChevronLeft, X } from "lucide-react";
import { C, CATEGORY, CATEGORIES, selectStyle } from "../theme";
import { fmtTime } from "../lib/dates";
import { catOf, gOf, catTotals, sortByCategory } from "../state/appState";
import { useStore } from "../store";

export function CubeMark({ size = 18 }) {
  const cells = [1, 1, 0, 1];
  const gap = Math.max(2, Math.round(size * 0.12));
  const cell = (size - gap) / 2;
  return (
    <div style={{ width: size, height: size, display: "grid",
      gridTemplateColumns: `${cell}px ${cell}px`, gridTemplateRows: `${cell}px ${cell}px`, gap }}>
      {cells.map((f, i) => (
        <div key={i} style={{ borderRadius: 2, background: f ? C.sage : "transparent",
          border: f ? "none" : `1.5px solid ${C.sageLight}` }} />
      ))}
    </div>
  );
}

export function CubeGrid({ filled, total, size = 11, gap = 4, color = C.sage }) {
  const cap = Math.min(total, 10);
  const arr = Array.from({ length: cap }, (_, i) => i < filled);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap }}>
      {arr.map((on, i) => (
        <div key={i} style={{ width: size, height: size, borderRadius: 3,
          background: on ? color : "transparent", border: on ? "none" : `1.4px solid ${C.border}` }} />
      ))}
      {total > 10 && <span style={{ fontSize: 10, color: C.muted, alignSelf: "center", marginLeft: 2 }}>+{total - 10}</span>}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", background: C.sageLight, borderRadius: 999, padding: 3 }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button key={opt.value} onClick={() => onChange(opt.value)}
            style={{ flex: 1, border: "none", padding: "6px 10px", borderRadius: 999, fontSize: 12,
              fontWeight: 700, cursor: "pointer", background: active ? C.surface : "transparent",
              color: active ? C.sageDeep : C.inkSoft, boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function CatDot({ name, size = 7 }) {
  const { state } = useStore();
  const color = (CATEGORY[catOf(state, name)] || {}).color || C.muted;
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%",
    background: color, marginRight: 6, flexShrink: 0 }} />;
}

export function CategoryLegend() {
  return (
    <div className="flex items-center" style={{ gap: 13, flexWrap: "wrap" }}>
      {Object.values(CATEGORY).map((v) => (
        <div key={v.label} className="flex items-center" style={{ gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: v.color, display: "inline-block" }} />
          <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>{v.label}</span>
        </div>
      ))}
    </div>
  );
}

export function CategoryBar({ items, height = 6 }) {
  const { state } = useStore();
  const totals = catTotals(state, items);
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return (
    <div style={{ display: "flex", width: "100%", height, borderRadius: height / 2, overflow: "hidden", background: C.border }}>
      {Object.entries(totals).map(([cat, g]) =>
        g > 0 ? <div key={cat} style={{ width: `${(g / sum) * 100}%`, background: CATEGORY[cat].color }} /> : null
      )}
    </div>
  );
}

// CategoryBar와 동일한 모양이지만, items 배열이 아니라 카테고리별 g 합계(totals 객체)를 바로 받는 버전
export function CategoryTotalsBar({ totals, height = 6 }) {
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return (
    <div style={{ display: "flex", width: "100%", height, borderRadius: height / 2, overflow: "hidden", background: C.border }}>
      {Object.entries(totals).map(([cat, g]) =>
        g > 0 ? <div key={cat} style={{ width: `${(g / sum) * 100}%`, background: CATEGORY[cat].color }} /> : null
      )}
    </div>
  );
}

export function MealItemList({ items, fontSize = 11, wrap = false, empty = "-" }) {
  const { state } = useStore();
  if (!items || items.length === 0) return <span style={{ fontSize, color: C.muted }}>{empty}</span>;
  const sorted = sortByCategory(state, items);
  return (
    <div style={{ display: "flex", flexDirection: wrap ? "row" : "column", flexWrap: wrap ? "wrap" : "nowrap", gap: wrap ? "3px 12px" : 2 }}>
      {sorted.map((it) => (
        <span key={it.name} className="flex items-center" style={{ fontSize, color: C.inkSoft, lineHeight: 1.3 }}>
          <CatDot name={it.name} size={Math.max(5, fontSize - 4)} />{it.name}
        </span>
      ))}
    </div>
  );
}

export function IngredientTable({ items, total }) {
  const { state } = useStore();
  const sorted = sortByCategory(state, items);
  return (
    <div>
      <div className="flex items-center justify-between" style={{ padding: "5px 9px", background: C.sageLight, borderRadius: "8px 8px 0 0" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep }}>재료</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep }}>양</span>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 8px 8px" }}>
        {sorted.map((it, i) => (
          <div key={it.name} className="flex items-center justify-between" style={{ padding: "7px 9px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
            <div className="flex items-center"><CatDot name={it.name} /><span style={{ fontSize: 12, color: C.inkSoft }}>{it.name}</span></div>
            <span style={{ fontSize: 12, color: C.muted }}>{it.gramsOverride != null || it.source === "fridge" ? `${gOf(state, it)}g` : `${gOf(state, it)}g (${it.qty}큐브)`}</span>
          </div>
        ))}
      </div>
      {total != null && (
        <div className="flex items-center justify-between" style={{ marginTop: 6, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>끼니 총량</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{total}g</span>
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    예정: { bg: C.sageLight, fg: C.sageDeep, label: "예정" },
    대기: { bg: C.apricotLight, fg: C.apricot, label: "기록 대기" },
    완료: { bg: C.butterLight, fg: "#9A7416", label: "완료" },
  };
  const s = map[status];
  return <span style={{ fontSize: 10.5, fontWeight: 700, background: s.bg, color: s.fg, padding: "3px 8px", borderRadius: 999 }}>{s.label}</span>;
}

// 식단표 끼니 중 "바로 기록"에서 만들어진 것 구분 표시 (계획해서 세운 끼니와 분류)
export function FromRecordBadge({ small = false }) {
  return (
    <span style={{ fontSize: small ? 9 : 10, fontWeight: 800, background: C.butterLight, color: "#9A7416", padding: small ? "1px 6px" : "2px 8px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}>
      바로 기록
    </span>
  );
}

// 급여 기록·식단표 끼니·제조 배치 3종에 붙는 작성자 뱃지 (작성자 추적 기능).
// createdBy·updatedBy가 memberProfiles에 매핑되지 않으면(구버전 데이터) 아무것도 렌더하지 않음
export const authorTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export function AuthorInfo({ createdBy, createdAt, updatedBy, updatedAt, createdLabel = "기록", updatedLabel = "수정", size = 11 }) {
  const { state } = useStore();
  const profiles = (state && state.memberProfiles) || {};
  const created = createdBy && profiles[createdBy];
  const updated = updatedBy && profiles[updatedBy];
  if (!created && !updated) return null;
  const dotSize = Math.max(5, size - 5);
  const Person = ({ label, profile, at }) => (
    <span className="flex items-center" style={{ gap: 5, fontSize: size, color: C.muted, fontWeight: 600 }}>
      <span style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: profile.color, display: "inline-block", flexShrink: 0 }} />
      {label}: {profile.name}{at ? ` · ${authorTime(at)}` : ""}
    </span>
  );
  return (
    <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
      {created && <Person label={createdLabel} profile={created} at={createdAt} />}
      {updated && <Person label={updatedLabel} profile={updated} at={updatedAt} />}
    </div>
  );
}

export function ScreenHeader({ title, right }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "14px 18px 10px" }}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <CubeMark size={20} />
        <span style={{ fontFamily: "'Gowun Dodum', sans-serif", fontSize: 19, color: C.ink }}>{title}</span>
      </div>
      {right}
    </div>
  );
}

export function SubHeader({ title, onBack, right }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "14px 18px 6px" }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <ChevronLeft size={20} color={C.ink} />
        </button>
        <span style={{ fontFamily: "'Gowun Dodum', sans-serif", fontSize: 18, color: C.ink }}>{title}</span>
      </div>
      {right}
    </div>
  );
}

// min 기본값 0: 이 컴포넌트는 항상 재고 그램·큐브 수·일수 등 음수가 나올 수 없는 값에만 쓰이는데,
// 숫자 입력창(type=number)의 HTML min 속성은 스핀 버튼에만 적용되고 직접 타이핑으로 음수를 넣는 건 막아주지 않아서
// (예: 냉장 보관량을 직접 편집하다 "-" 부호가 남는 경우) 재고 중량이 음수로 표시되는 버그가 있었음.
// onChange에서 Math.max로 실제로 clamp해서 근본적으로 막음.
export function NumInput({ value, onChange, width = 46, suffix, placeholder = "0", min = 0 }) {
  return (
    <div className="flex items-center" style={{ gap: 6 }}>
      <input
        type="number"
        inputMode="numeric"
        value={value === 0 || value == null ? "" : value}
        placeholder={placeholder}
        min={min}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") { onChange(0); return; }
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(min != null ? Math.max(min, n) : n);
        }}
        style={{ width, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px",
          fontSize: 12, textAlign: "center", color: C.ink, outline: "none" }}
      />
      {suffix && <span style={{ fontSize: 11, color: C.muted }}>{suffix}</span>}
    </div>
  );
}

export function ConfirmModal({ title, message, warning, confirmLabel = "삭제", danger = true, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, borderRadius: 18, padding: "20px 18px", width: "100%", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: message || warning ? 6 : 16 }}>{title}</div>
        {message && <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: warning ? 8 : 16, lineHeight: 1.5 }}>{message}</div>}
        {warning && (
          <div style={{ fontSize: 12, color: C.apricot, fontWeight: 700, marginBottom: 16, lineHeight: 1.5, background: C.apricotLight, borderRadius: 10, padding: "8px 10px" }}>
            ⚠ {warning}
          </div>
        )}
        <div className="flex items-center" style={{ gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, background: C.sageLight, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.inkSoft, cursor: "pointer" }}>취소</button>
          <button onClick={onConfirm} style={{ flex: 1, background: danger ? C.apricot : C.sage, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// iOS Safari에서 키보드가 올라오면 레이아웃 뷰포트는 그대로인데 실제 보이는 영역(visualViewport)만 줄어들어서,
// position:fixed 바텀시트가 키보드 뒤에 가려지는 문제가 있음(재료 검색창이 대표적). 실제 보이는 영역의 높이/위치를 추적해서
// 시트를 그 영역 안에 맞추는 데 사용.
export function useVisualViewport() {
  const getSnapshot = () => (
    window.visualViewport
      ? { height: window.visualViewport.height, offsetTop: window.visualViewport.offsetTop }
      : { height: window.innerHeight, offsetTop: 0 }
  );
  const [vv, setVv] = useState(getSnapshot);
  useEffect(() => {
    if (!window.visualViewport) return;
    const update = () => setVv(getSnapshot());
    window.visualViewport.addEventListener("resize", update);
    window.visualViewport.addEventListener("scroll", update);
    return () => {
      window.visualViewport.removeEventListener("resize", update);
      window.visualViewport.removeEventListener("scroll", update);
    };
  }, []);
  return vv;
}

// bare=true면 카드(테두리) 없이 행만 렌더링 - 다른 카드 안에 합쳐 넣을 때 사용
export function TimePicker({ time, setTime, timeFmt, bare = false, labelColor, label = "끼니 시간" }) {
  const [h0, m0] = time.split(":").map(Number);
  const setH = (h24) => setTime(`${String(h24).padStart(2, "0")}:${String(m0).padStart(2, "0")}`);
  const setM = (mm) => setTime(`${String(h0).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  // 기본은 10분 단위, 현재 값이 목록에 없으면(예: '지금' 버튼으로 입력된 08:16) 그 값도 포함해 표시
  const minuteOptions = [0, 10, 20, 30, 40, 50].includes(m0)
    ? [0, 10, 20, 30, 40, 50]
    : [0, 10, 20, 30, 40, 50, m0].sort((a, b) => a - b);
  const row = (
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12.5, color: labelColor || C.inkSoft, fontWeight: 600 }}>{label}</span>
        <div className="flex items-center" style={{ gap: 6 }}>
          {timeFmt === "ampm" && (
            <select value={h0 < 12 ? "오전" : "오후"} onChange={(e) => {
              const wantPM = e.target.value === "오후", isPM = h0 >= 12;
              if (wantPM && !isPM) setH(h0 + 12); else if (!wantPM && isPM) setH(h0 - 12);
            }} style={selectStyle}><option>오전</option><option>오후</option></select>
          )}
          <select value={timeFmt === "ampm" ? ((h0 % 12) === 0 ? 12 : h0 % 12) : h0} onChange={(e) => {
            const v = Number(e.target.value);
            if (timeFmt === "ampm") { const isPM = h0 >= 12; let h = v % 12; if (isPM) h += 12; setH(h); } else setH(v);
          }} style={selectStyle}>
            {(timeFmt === "ampm" ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 24 }, (_, i) => i)).map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}시</option>
            ))}
          </select>
          <select value={m0} onChange={(e) => setM(Number(e.target.value))} style={selectStyle}>
            {minuteOptions.map((mm) => <option key={mm} value={mm}>{String(mm).padStart(2, "0")}분</option>)}
          </select>
        </div>
      </div>
  );
  if (bare) return row;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px" }}>
      {row}
      <div style={{ textAlign: "right", fontSize: 10.5, color: C.muted, marginTop: 6 }}>{fmtTime(time, timeFmt)}</div>
    </div>
  );
}

export function BottomSheet({ title, onClose, maxHeight = "78%", children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", maxHeight, borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 18px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* =====================================================================
   기록 탭
   ===================================================================== */
export function Chip({ children, cat, tone = "default", onClick, onDelete }) {
  const tones = { default: { bg: C.sageLight, fg: C.sageDeep }, warn: { bg: C.apricotLight, fg: C.apricot } };
  const tn = (cat && CATEGORY[cat]) ? { bg: CATEGORY[cat].light, fg: CATEGORY[cat].color } : tones[tone];
  return (
    <span className="flex items-center" style={{ background: tn.bg, borderRadius: 999, overflow: "hidden" }}>
      <button onClick={onClick} disabled={!onClick} style={{ background: "none", border: "none", padding: onDelete ? "5px 4px 5px 10px" : "5px 10px",
        fontSize: 11.5, fontWeight: 600, color: tn.fg, cursor: onClick ? "pointer" : "default" }}>
        {children}
      </button>
      {onDelete && (
        <button onClick={onDelete} style={{ background: "rgba(0,0,0,0.08)", border: "none", width: 16, height: 16, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, marginRight: 5, flexShrink: 0 }}>
          <X size={9} color={tn.fg} />
        </button>
      )}
    </span>
  );
}
