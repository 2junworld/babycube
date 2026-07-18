/* 재고 탭 - 재고 목록·제조 기록·재고 상세·제조 이력·장보기·재료 정보(위키) */
import React, { useState } from "react";
import { ChevronRight, Plus, Trash2, X, Check, Refrigerator, Snowflake, ShoppingCart, AlertTriangle, Search } from "lucide-react";
import { db } from "../firebase";
import { C, CATEGORIES, primaryBtn, selectStyle } from "../theme";
import { addDaysISO, todayISO } from "../lib/dates";
import { NUTRIENT_TAGS, TAG_KEYS, TAG_LABELS } from "../data/nutrition";
import { catOf, sortByCategory, stockBatches, stockFridgeG, stockTotalCubes, stockTotalFrozenG, unitGOf } from "../state/appState";
import { useStore } from "../store";
import { CatDot, ConfirmModal, CubeGrid, NumInput, ScreenHeader, Segmented, SubHeader } from "../components/common";
import { UI_STATE, readStockPref, writeStockPref } from "./uiPrefs";
import { ingredientPairsFor, suggestBaseFor, tagsOf } from "../lib/pairing";
import { frozenAlerts, urgentStockNames } from "../lib/stockAlerts";
import { IngredientPicker } from "../components/pickers";
import { IntroEditModal } from "./RecordTab";

/* =====================================================================
   제조 기록 모달 (재고 입고)
   ===================================================================== */
export function BatchModal({ presetName, onClose }) {
  const { state, dispatch } = useStore();
  const t = todayISO();
  const [name, setName] = useState(presetName || "");
  const [picker, setPicker] = useState(!presetName);
  const [cat, setCat] = useState("채소");
  const [date, setDate] = useState(t);
  const [unitG, setUnitG] = useState(name ? unitGOf(state, name) : 15);
  const [frozen, setFrozen] = useState(10);
  const [fridgeG, setFridgeG] = useState(0);
  const keep = state.settings.fridgeKeepDays;

  const save = () => {
    if (!name) return;
    dispatch({ type: "STOCK_ADD_BATCH", name, cat,
      // frozenOriginal/fridgeOriginal: 제조 당시 생산량 기록(이후 소비돼도 변하지 않음) — 제조 이력 화면에서 사용
      batch: { date, unitG: Number(unitG), frozen: Number(frozen), fridgeG: Number(fridgeG),
        frozenOriginal: Number(frozen), fridgeOriginal: Number(fridgeG),
        frozenExp: addDaysISO(date, 14), fridgeExp: Number(fridgeG) > 0 ? addDaysISO(date, keep) : null } });
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", borderRadius: "20px 20px 0 0", padding: "16px 18px 26px", position: "relative" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>제조 기록 추가</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <button onClick={() => setPicker(true)} className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>재료</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: name ? C.ink : C.muted }}>{name || "선택"}</span>
          </button>
          {name && !state.ingredients[name] && (
            <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
              <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>카테고리</span>
              <select value={cat} onChange={(e) => setCat(e.target.value)} style={selectStyle}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
          )}
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>제조일</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ border: "none", background: "transparent", fontSize: 12.5, color: C.ink, fontWeight: 700, outline: "none" }} />
          </div>
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>1큐브 기준</span>
            <NumInput value={Number(unitG) || 0} onChange={setUnitG} width={46} suffix="g" />
          </div>
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <span className="flex items-center" style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, gap: 5 }}><Snowflake size={13} color={C.sageDeep} /> 냉동 큐브</span>
            <NumInput value={Number(frozen) || 0} onChange={setFrozen} width={46} suffix="큐브" />
          </div>
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <span className="flex items-center" style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, gap: 5 }}><Refrigerator size={13} color={C.apricot} /> 냉장 보관</span>
            <NumInput value={Number(fridgeG) || 0} onChange={setFridgeG} width={46} suffix="g" />
          </div>
          <div style={{ fontSize: 10.5, color: C.muted, padding: "0 2px" }}>
            냉동 만료 ~{addDaysISO(date, 14).slice(5)} · {Number(fridgeG) > 0 ? `냉장 만료 ~${addDaysISO(date, keep).slice(5)}` : "냉장 없음"}
          </div>
          <button onClick={save} style={primaryBtn}>저장</button>
        </div>
        {picker && <IngredientPicker onPick={(n, c) => { setName(n); setUnitG(unitGOf(state, n)); if (c) setCat(c); setPicker(false); }} onClose={() => setPicker(false)} />}
      </div>
    </div>
  );
}

/* =====================================================================
   재고 탭
   ===================================================================== */
// 재고 탭 필터 칩: 전체 / 소진임박(urgentStockNames) / 냉동(냉동 수량 있음) / 냉장(냉장 수량 있음) / 카테고리별
export const STOCK_FILTERS = ["전체", "소진임박", "냉동", "냉장", ...CATEGORIES];

// 재고 탭 정렬 옵션: 기본은 카테고리순(카테고리 → 가나다순), 그 외 이름순/재고량순 선택 가능
export const STOCK_SORT_OPTIONS = [
  { key: "cat", label: "카테고리순" },
  { key: "name", label: "이름순" },
  { key: "stockDesc", label: "재고 많은순" },
  { key: "stockAsc", label: "재고 적은순" },
];

// 재고 탭 표시 방식: 한줄 리스트 / 2열 그리드 / 3열 그리드
export const STOCK_LAYOUTS = [
  { key: "row", label: "한줄" },
  { key: "grid2", label: "2열" },
  { key: "grid3", label: "3열" },
];

// 소진임박 재료의 데드라인 텍스트 - 냉장 보관중이면 냉장 만료 기준, 아니면 냉동 만료 기준
export function urgentDeadlineText(u) {
  if (u.fg > 0) {
    if (u.fridgeDaysLeft == null) return "냉장 보관중";
    if (u.fridgeDaysLeft < 0) return "냉장 기한 지남";
    return u.fridgeDaysLeft === 0 ? "냉장 오늘까지" : `냉장 ~${u.fridgeDaysLeft}일`;
  }
  if (u.frozenDaysLeft == null) return null;
  if (u.frozenDaysLeft < 0) return "기한 지남";
  return u.frozenDaysLeft === 0 ? "오늘까지" : `~${u.frozenDaysLeft}일`;
}

// 재료 목록 항목 - layout("row"|"grid2"|"grid3")에 따라 한 줄 행 또는 카드형 그리드로 표시.
// 소진임박 재료도 별도 섹션/디자인 없이 이 컴포넌트를 그대로 쓰고, urgent=true면 테두리 강조 + 데드라인 텍스트만 붙임
export function StockItem({ name, onClick, urgent, deadlineText, layout }) {
  const { state } = useStore();
  const cubes = stockTotalCubes(state, name), fg = stockFridgeG(state, name);
  const border = `1px solid ${urgent ? C.apricot : C.border}`;
  const badge = urgent && deadlineText ? (
    <span style={{ fontSize: 9.5, fontWeight: 700, color: C.apricot, background: C.apricotLight, borderRadius: 999, padding: "1px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>{deadlineText}</span>
  ) : null;

  if (layout === "row") {
    return (
      <button onClick={onClick} className="flex items-center justify-between" style={{ width: "100%", textAlign: "left", background: C.surface, border, borderRadius: 12, padding: "10px 12px", cursor: "pointer" }}>
        <div className="flex items-center" style={{ gap: 8, minWidth: 0, flex: 1 }}>
          <CatDot name={name} size={7} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
          {badge}
        </div>
        <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
          {cubes > 0 && <CubeGrid filled={Math.min(cubes, 10)} total={10} size={6} gap={2} />}
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
            {cubes > 0 ? `${cubes}큐브` : ""}{cubes > 0 && fg > 0 ? " · " : ""}{fg > 0 ? `${fg}g` : ""}
          </span>
          <ChevronRight size={13} color={C.muted} />
        </div>
      </button>
    );
  }

  // grid2 / grid3: 세로 배치 카드형
  return (
    <button onClick={onClick} style={{ textAlign: "left", background: C.surface, border, borderRadius: 12, padding: layout === "grid3" ? "9px 8px" : "10px 10px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <div className="flex items-center" style={{ gap: 5, minWidth: 0 }}>
        <CatDot name={name} size={6} />
        <span style={{ fontSize: layout === "grid3" ? 11.5 : 12.5, fontWeight: 700, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{name}</span>
      </div>
      {cubes > 0 && <CubeGrid filled={Math.min(cubes, 10)} total={10} size={5} gap={1.5} />}
      <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>
        {cubes > 0 ? `${cubes}큐브` : ""}{cubes > 0 && fg > 0 ? " · " : ""}{fg > 0 ? `${fg}g` : ""}
      </span>
      {badge && <span style={{ alignSelf: "flex-start" }}>{badge}</span>}
    </button>
  );
}

export function StockTab({ go }) {
  const { state } = useStore();
  const [batchModal, setBatchModal] = useState(false);
  const [filter, setFilter] = useState("전체");
  // 서브탭: 재고 / 재료 정보(위키). 하위 화면에 다녀와도 보던 서브탭으로 복귀
  const [subTab, setSubTabRaw] = useState(UI_STATE.stockSubTab);
  const setSubTab = (v) => { UI_STATE.stockSubTab = v; setSubTabRaw(v); };
  const [sortMode, setSortModeRaw] = useState(() => readStockPref("bc_stock_sort", "cat", STOCK_SORT_OPTIONS.map((o) => o.key)));
  const [layout, setLayoutRaw] = useState(() => readStockPref("bc_stock_layout", "row", STOCK_LAYOUTS.map((l) => l.key)));
  const setSortMode = (v) => { setSortModeRaw(v); writeStockPref("bc_stock_sort", v); };
  const setLayout = (v) => { setLayoutRaw(v); writeStockPref("bc_stock_layout", v); };

  const allNames = Object.keys(state.stock).filter((n) => stockTotalCubes(state, n) > 0 || stockFridgeG(state, n) > 0);
  const urgent = urgentStockNames(state); // 이미 긴급도순으로 정렬돼 있음(냉장 보관중 > 냉동 보관기한 임박순)
  const urgentMap = new Map(urgent.map((u) => [u.name, u]));

  const matchesFilter = (n) => {
    if (filter === "전체") return true;
    if (filter === "소진임박") return urgentMap.has(n);
    if (filter === "냉동") return stockTotalCubes(state, n) > 0;
    if (filter === "냉장") return stockFridgeG(state, n) > 0;
    return catOf(state, n) === filter; // 카테고리 필터
  };
  const stockAmt = (n) => stockTotalFrozenG(state, n) + stockFridgeG(state, n);
  const sortNames = (list) => {
    if (sortMode === "cat") return sortByCategory(state, list, (n) => n);
    if (sortMode === "name") return [...list].sort((a, b) => a.localeCompare(b, "ko"));
    return [...list].sort((a, b) => sortMode === "stockAsc" ? stockAmt(a) - stockAmt(b) : stockAmt(b) - stockAmt(a));
  };

  // 필터를 통과한 재료를 정렬해서 하나의 리스트로 표시. 소진임박 재료도 별도 섹션으로 분리하지 않고
  // 같은 리스트 안에서 테두리 강조 + 데드라인 텍스트로만 구분 (필터를 냉동/냉장/카테고리로 바꿔도 계속 보임)
  const names = sortNames(allNames.filter(matchesFilter));
  const isEmpty = names.length === 0;
  const gridStyle = layout === "row"
    ? { display: "flex", flexDirection: "column", gap: 8 }
    : { display: "grid", gridTemplateColumns: layout === "grid2" ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8 };

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <ScreenHeader title="재고" right={<button onClick={() => go("shopping")} style={{ background: "none", border: "none", cursor: "pointer" }}><ShoppingCart size={18} color={C.inkSoft} /></button>} />
      <div style={{ padding: "0 18px 12px" }}>
        <Segmented value={subTab} onChange={setSubTab} options={[{ value: "stock", label: "재고" }, { value: "wiki", label: "재료 정보" }]} />
      </div>
      {subTab === "wiki" && <IngredientWikiPanel go={go} />}
      {subTab === "stock" && (
        <>
          <div style={{ position: "sticky", top: 0, zIndex: 15, background: C.bg, padding: "0 18px 10px" }}>
            <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
              {STOCK_FILTERS.map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                  border: "none", background: filter === f ? C.sage : C.sageLight, color: filter === f ? "#fff" : C.sageDeep }}>{f}</button>
              ))}
            </div>
            <button onClick={() => setBatchModal(true)} className="flex items-center justify-center" style={{ gap: 7, background: C.sage, border: "none", borderRadius: 14, padding: "11px 0", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", width: "100%" }}>
              <Plus size={15} /> 제조 기록 추가
            </button>
          </div>
          <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 6 }}>
              <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginRight: 1 }}>정렬</span>
                {STOCK_SORT_OPTIONS.map((o) => (
                  <button key={o.key} onClick={() => setSortMode(o.key)} style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${sortMode === o.key ? C.sage : C.border}`, background: sortMode === o.key ? C.sageLight : "transparent", color: sortMode === o.key ? C.sageDeep : C.muted }}>{o.label}</button>
                ))}
              </div>
              <div className="flex items-center" style={{ gap: 4 }}>
                {STOCK_LAYOUTS.map((l) => (
                  <button key={l.key} onClick={() => setLayout(l.key)} style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${layout === l.key ? C.sage : C.border}`, background: layout === l.key ? C.sageLight : "transparent", color: layout === l.key ? C.sageDeep : C.muted }}>{l.label}</button>
                ))}
              </div>
            </div>
            {!isEmpty && (
              <div style={gridStyle}>
                {names.map((name) => {
                  const u = urgentMap.get(name);
                  return (
                    <StockItem
                      key={name}
                      name={name}
                      layout={layout}
                      urgent={!!u}
                      deadlineText={u ? urgentDeadlineText(u) : null}
                      onClick={() => go("stockDetail", { name })}
                    />
                  );
                })}
              </div>
            )}
            {isEmpty && <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted }}>{filter === "전체" ? "재고가 없습니다. 제조 기록을 추가해 보세요." : "해당하는 재료가 없습니다."}</div>}
          </div>
        </>
      )}
      {batchModal && <BatchModal onClose={() => setBatchModal(false)} />}
    </div>
  );
}

/* =====================================================================
   재고 상세 (카드 탭 → 배치별 바로 수정/삭제)
   ===================================================================== */
export function StockDetailScreen({ name, onBack }) {
  const { state, dispatch, notify } = useStore();
  const [addOpen, setAddOpen] = useState(false);
  const [delTarget, setDelTarget] = useState(null); // 삭제 확인 대상 batchId
  const batches = stockBatches(state, name).slice().sort((a, b) => a.date.localeCompare(b.date));
  const cubes = stockTotalCubes(state, name), fg = stockFridgeG(state, name);

  const patch = (batchId, p) => dispatch({ type: "STOCK_UPDATE_BATCH", name, batchId, patch: p });
  const confirmDel = () => {
    const batch = stockBatches(state, name).find((b) => b.id === delTarget);
    dispatch({ type: "STOCK_DELETE_BATCH", name, batchId: delTarget });
    setDelTarget(null);
    if (batch) notify("배치를 삭제했습니다", () => dispatch({ type: "RESTORE_BATCH", name, batch }));
  };

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title={`${name} 재고`} onBack={onBack} />
      <div style={{ padding: "6px 18px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="flex items-center justify-between" style={{ background: C.sageLight, borderRadius: 14, padding: "12px 14px" }}>
          <div className="flex items-center" style={{ gap: 8 }}><CatDot name={name} size={9} /><span style={{ fontSize: 14, fontWeight: 800, color: C.sageDeep }}>{name}</span></div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep }}>냉동 {cubes}큐브{fg > 0 ? ` · 냉장 ${fg}g` : ""}</span>
        </div>

        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, padding: "0 2px" }}>제조 배치 ({batches.length})</div>
        {batches.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12.5, color: C.muted }}>제조 배치가 없습니다.</div>}
        {batches.map((b) => (
          <div key={b.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 13, display: "flex", flexDirection: "column", gap: 9 }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{b.date} 제조</span>
              <button onClick={() => setDelTarget(b.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Trash2 size={14} color={C.apricot} /></button>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11.5, color: C.inkSoft }}>1큐브 기준</span>
              <NumInput value={b.unitG} onChange={(v) => patch(b.id, { unitG: v })} width={44} suffix="g" />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center" style={{ fontSize: 11.5, color: C.inkSoft, gap: 5 }}><Snowflake size={12} color={C.sageDeep} /> 냉동 큐브</span>
              <NumInput value={b.frozen} onChange={(v) => patch(b.id, { frozen: v })} width={44} suffix="큐브" />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center" style={{ fontSize: 11.5, color: C.inkSoft, gap: 5 }}><Refrigerator size={12} color={C.apricot} /> 냉장 보관</span>
              <NumInput value={b.fridgeG || 0} onChange={(v) => patch(b.id, { fridgeG: v, fridgeExp: v > 0 ? (b.fridgeExp || addDaysISO(b.date, state.settings.fridgeKeepDays)) : b.fridgeExp })} width={44} suffix="g" />
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>
              냉동 만료 ~{b.frozenExp ? b.frozenExp.slice(5) : "-"} · {(b.fridgeG || 0) > 0 ? `냉장 만료 ~${b.fridgeExp ? b.fridgeExp.slice(5) : "-"}` : "냉장 없음"}
            </div>
          </div>
        ))}

        <button onClick={() => setAddOpen(true)} className="flex items-center justify-center" style={{ gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 14, padding: "11px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
          <Plus size={14} /> 제조 기록 추가
        </button>
      </div>
      {addOpen && <BatchModal presetName={name} onClose={() => setAddOpen(false)} />}
      {delTarget && (
        <ConfirmModal
          title="이 배치를 삭제할까요?"
          message="되돌릴 수 없습니다."
          onConfirm={confirmDel}
          onCancel={() => setDelTarget(null)}
        />
      )}
    </div>
  );
}

/* =====================================================================
   제조 이력 화면 — 모든 재료의 제조 배치를 날짜순으로 모아 보여줌
   (배치는 소진돼도 삭제되지 않고 수량만 0으로 남으므로, 이미 있는 데이터를 그대로 활용)
   ===================================================================== */
export function ManufactureHistoryScreen({ onBack }) {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const all = [];
  Object.keys(state.stock).forEach((name) => {
    (state.stock[name].batches || []).forEach((b) => all.push({ name, ...b }));
  });
  const filtered = all
    .filter((b) => !q || b.name.includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));

  return (
    <div style={{ paddingBottom: 90 }}>
      <SubHeader title="제조 이력" onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="flex items-center" style={{ gap: 7, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px" }}>
          <Search size={15} color={C.muted} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="재료명으로 검색"
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.ink, width: "100%" }} />
        </div>
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted }}>제조 이력이 없습니다</div>}
        {filtered.map((b) => {
          const tracked = b.frozenOriginal != null; // 제조량 기록 이후 만든 배치인지 (이전 배치는 원본 수량을 모름)
          const usedUp = (b.frozen || 0) <= 0 && (b.fridgeG || 0) <= 0;
          return (
            <div key={b.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 13, opacity: usedUp ? 0.55 : 1 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <div className="flex items-center"><CatDot name={b.name} size={8} /><span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{b.name}</span></div>
                <span style={{ fontSize: 11, color: C.muted }}>{b.date} 제조</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.inkSoft, lineHeight: 1.5 }}>
                {tracked
                  ? <>냉동 {b.frozenOriginal}큐브 제조 → 현재 {b.frozen}큐브{b.fridgeOriginal ? <><br />냉장 {b.fridgeOriginal}g 제조 → 현재 {b.fridgeG || 0}g</> : ""}</>
                  : <>현재 냉동 {b.frozen}큐브{b.fridgeG ? ` · 냉장 ${b.fridgeG}g` : ""} <span style={{ color: C.muted }}>(제조 당시 수량 기록 이전 배치)</span></>}
              </div>
              {usedUp && <div style={{ fontSize: 10, color: C.muted, marginTop: 5, fontWeight: 700 }}>소진됨</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =====================================================================
   장보기 / 제조 목록 화면
   ===================================================================== */
export function ShoppingScreen({ onBack }) {
  const { state, dispatch } = useStore();
  const [batchFor, setBatchFor] = useState(null);
  const [adding, setAdding] = useState(false);
  // 재고 임박 항목도 합류
  const lowStock = frozenAlerts(state).filter((a) => a.daysLeft <= 3).map((a) => ({ id: "low-" + a.name, name: a.name, reason: a.cubes <= 0 ? "재고 소진" : `재고 임박 (~${a.daysLeft}일)`, done: false, low: true }));
  const list = [...state.shopping, ...lowStock.filter((l) => !state.shopping.some((s) => s.name === l.name && !s.done))];

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title="장보기 · 제조 목록" onBack={onBack} right={
        <button onClick={() => dispatch({ type: "SHOP_CLEAR_DONE" })} style={{ fontSize: 11, fontWeight: 700, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>완료 정리</button>
      } />
      <div style={{ padding: "8px 18px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {list.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted }}>목록이 비어 있습니다</div>}
        {list.map((s) => (
          <div key={s.id} className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 13px" }}>
            <button onClick={() => !s.low && dispatch({ type: "SHOP_TOGGLE", id: s.id })} className="flex items-center" style={{ gap: 10, background: "none", border: "none", cursor: s.low ? "default" : "pointer", flex: 1, textAlign: "left" }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${s.done ? C.sage : C.border}`, background: s.done ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {s.done && <Check size={13} color="#fff" />}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: s.done ? C.muted : C.ink, textDecoration: s.done ? "line-through" : "none" }}>{s.name}</div>
                <div style={{ fontSize: 10.5, color: C.muted }}>{s.reason}</div>
              </div>
            </button>
            <button onClick={() => setBatchFor(s.name)} style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, background: C.sageLight, border: "none", borderRadius: 999, padding: "5px 10px", cursor: "pointer" }}>제조 기록</button>
          </div>
        ))}
        <button onClick={() => setAdding(true)} className="flex items-center justify-center" style={{ gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
          <Plus size={14} /> 항목 직접 추가
        </button>
      </div>
      {batchFor && <BatchModal presetName={batchFor} onClose={() => setBatchFor(null)} />}
      {adding && <IngredientPicker onPick={(n) => { dispatch({ type: "SHOP_ADD", name: n }); setAdding(false); }} onClose={() => setAdding(false)} />}
    </div>
  );
}

/* =====================================================================
   재료 정보 화면 - 영양 태그(편집 가능) · 궁합 좋은 재료/주의 조합 · 재고 · 최근 급여 이력
   (기록 탭 '지금까지 먹어본 재료'에서 재료를 탭하면 진입)
   ===================================================================== */
export function IngredientInfoScreen({ name, onBack }) {
  const { state, dispatch } = useStore();
  const [editIntro, setEditIntro] = useState(false);
  const [basePicker, setBasePicker] = useState(false);
  const [compPicker, setCompPicker] = useState(false);
  const intro = state.intros.find((it) => it.name === name);
  const cubes = stockTotalCubes(state, name), fg = stockFridgeG(state, name);
  const myTags = tagsOf(state, name);
  const { good, avoid } = ingredientPairsFor(state, name);
  const isCustomized = !!(state.ingredientTags && state.ingredientTags[name] && state.ingredientTags[name].length > 0);

  // 분류: 변형 재료(기본 재료 연결) · 혼합 큐브(구성 재료)
  const meta = state.ingredients[name] || {};
  const baseOf = meta.baseOf || null;
  const components = meta.components || [];
  const setMeta = (patch) => dispatch({ type: "INGREDIENT_SET_META", name, patch });
  // 자동 제안: 이름이 다른 재료명으로 시작하면 변형일 가능성 (예: '사과퓨레' → '사과')
  const baseSuggestion = (!baseOf && components.length === 0) ? suggestBaseFor(state, name) : null;
  // 태그 출처 (안내 문구용)
  const tagSource = isCustomized ? "custom" : NUTRIENT_TAGS[name] ? "db" : baseOf ? "base" : components.length > 0 ? "blend" : "none";

  const toggleTag = (t) => {
    const next = myTags.includes(t) ? myTags.filter((x) => x !== t) : [...myTags, t];
    dispatch({ type: "INGREDIENT_TAGS_SET", name, tags: next });
  };

  // 최근 급여 이력 (최신순 5회)
  const history = [];
  Object.keys(state.logs).sort((a, b) => b.localeCompare(a)).forEach((d) => {
    (state.logs[d] || []).forEach((log) => {
      log.items.forEach((it) => {
        if (it.name !== name) return;
        history.push({ date: d, label: log.label, g: it.source === "fridge" ? it.qty : it.qty * it.unitG });
      });
    });
  });
  const recent = history.slice(0, 5);

  const gradeBadge = (g) => (
    <span style={{ fontSize: 8.5, fontWeight: 800, color: g === "A" ? C.sageDeep : "#9A7416", background: g === "A" ? C.sageLight : C.butterLight, borderRadius: 4, padding: "1px 4px", flexShrink: 0 }}>근거 {g}</span>
  );
  const stockBadge = (inStock) => (
    <span style={{ fontSize: 9.5, fontWeight: 700, color: inStock ? C.sageDeep : C.muted, border: `1px solid ${inStock ? C.sage : C.border}`, borderRadius: 8, padding: "2px 8px", flexShrink: 0, whiteSpace: "nowrap" }}>{inStock ? "재고 있음" : "재고 없음"}</span>
  );

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title={`${name} 재료 정보`} onBack={onBack} />
      <div style={{ padding: "6px 18px 0", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* 요약 카드 */}
        <div className="flex items-center justify-between" style={{ background: C.sageLight, borderRadius: 14, padding: "12px 14px" }}>
          <div className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
            <CatDot name={name} size={9} />
            <span style={{ fontSize: 14, fontWeight: 800, color: C.sageDeep }}>{name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, background: C.surface, color: C.sageDeep, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
              {catOf(state, name)}{intro ? ` · ${intro.status}` : ""}
            </span>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep, flexShrink: 0 }}>
            {cubes > 0 || fg > 0 ? `냉동 ${cubes}큐브${fg > 0 ? ` · 냉장 ${fg}g` : ""}` : "재고 없음"}
          </span>
        </div>

        {/* 재료 분류 - 변형(기본 재료 연결) · 혼합 큐브 구성 */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 }}>재료 분류</div>
          {baseSuggestion && (
            <div className="flex items-center justify-between" style={{ background: C.sageLight, borderRadius: 8, padding: "7px 9px", marginBottom: 8, gap: 8 }}>
              <span style={{ fontSize: 11, color: C.sageDeep, lineHeight: 1.4 }}>'{baseSuggestion}'를 조리 방식만 바꾼 재료인가요? 연결하면 영양·궁합 정보를 물려받아요.</span>
              <button onClick={() => setMeta({ baseOf: baseSuggestion })} style={{ background: C.sage, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer", flexShrink: 0 }}>연결</button>
            </div>
          )}
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.inkSoft }}>기본 재료 연결 <span style={{ fontSize: 9.5, color: C.muted }}>(변형 재료용)</span></span>
            {baseOf ? (
              <span className="flex items-center" style={{ gap: 6 }}>
                <span className="flex items-center" style={{ fontSize: 12, fontWeight: 700, color: C.sageDeep }}><CatDot name={baseOf} size={7} />{baseOf}</span>
                <button onClick={() => setMeta({ baseOf: null })} style={{ background: "none", border: "none", fontSize: 10, color: C.muted, cursor: "pointer", padding: 0, textDecoration: "underline" }}>해제</button>
              </span>
            ) : (
              <button onClick={() => setBasePicker(true)} style={{ background: C.sageLight, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: C.sageDeep, cursor: "pointer" }}>선택</button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12, color: C.inkSoft }}>혼합 큐브 구성 <span style={{ fontSize: 9.5, color: C.muted }}>(여러 재료 섞인 큐브용)</span></span>
            <button onClick={() => setCompPicker(true)} style={{ background: C.sageLight, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: C.sageDeep, cursor: "pointer" }}>{components.length > 0 ? "추가" : "선택"}</button>
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
            <span style={{ fontSize: 12, color: C.inkSoft }}>주식(밥·죽) 재료 <span style={{ fontSize: 9.5, color: C.muted }}>(장보기 자동 등록·여행 계산 제외)</span></span>
            <button onClick={() => setMeta({ staple: !meta.staple })}
              style={{ background: meta.staple ? C.sage : C.sageLight, border: "none", borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: meta.staple ? "#fff" : C.sageDeep, cursor: "pointer" }}>
              {meta.staple ? "켜짐" : "꺼짐"}
            </button>
          </div>
          {components.length > 0 && (
            <div className="flex items-center" style={{ gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {components.map((c) => (
                <span key={c} className="flex items-center" style={{ gap: 4, fontSize: 11, fontWeight: 700, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "3px 5px 3px 9px" }}>
                  <CatDot name={c} size={6} />{c}
                  <button onClick={() => setMeta({ components: components.filter((x) => x !== c) })} style={{ background: "rgba(0,0,0,0.08)", border: "none", width: 14, height: 14, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><X size={8} color={C.sageDeep} /></button>
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 9.5, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>
            변형 재료(예: 사과퓨레→사과)는 기본 재료의 영양·궁합 정보를 물려받고, 혼합 큐브(예: 감뚝큐브=배·무·양파)는 구성 재료의 정보를 합쳐서 계산해요. 재고와 급여 기록은 이 재료 단위로 그대로 관리돼요.
          </div>
        </div>

        {/* 영양 태그 (탭해서 편집) */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.ink }}>영양 태그 <span style={{ fontWeight: 400, color: C.muted }}>— 탭해서 켜고 끄기</span></span>
            {isCustomized && (
              <button onClick={() => dispatch({ type: "INGREDIENT_TAGS_SET", name, tags: null })} style={{ background: "none", border: "none", fontSize: 10, color: C.muted, cursor: "pointer", padding: 0, textDecoration: "underline" }}>기본값으로</button>
            )}
          </div>
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
            {TAG_KEYS.map((t) => {
              const on = myTags.includes(t);
              return (
                <button key={t} onClick={() => toggleTag(t)} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                  border: "none", background: on ? C.sage : C.sageLight, color: on ? "#fff" : C.sageDeep }}>{TAG_LABELS[t]}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 9.5, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>
            {tagSource === "custom" ? "직접 지정한 태그를 사용 중이에요. '기본값으로'를 누르면 자동 계산으로 돌아가요."
              : tagSource === "db" ? "기본 영양 DB에 등록된 재료예요. 태그는 궁합 추천 계산에 바로 반영돼요."
              : tagSource === "base" ? `기본 재료 '${baseOf}'의 태그를 물려받고 있어요. 태그를 직접 바꾸면 이 재료만의 태그로 저장돼요.`
              : tagSource === "blend" ? "혼합 큐브라서 구성 재료의 태그를 합쳐서 계산 중이에요. 직접 바꾸면 그 값이 우선돼요."
              : "기본 DB에 없는 재료예요. 영양 태그를 지정하거나 위 '재료 분류'에서 기본 재료를 연결하면 궁합 추천에 포함돼요."}
          </div>
        </div>

        {/* 궁합 좋은 재료 / 주의 조합 */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, marginBottom: 8 }}>궁합 좋은 재료 ({good.length})</div>
          {good.length === 0 && <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>등록된 재료 중 궁합 정보가 있는 재료가 없어요</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {good.map((g) => (
              <div key={g.name} className="flex items-center justify-between" style={{ gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="flex items-center" style={{ gap: 5 }}>
                    <CatDot name={g.name} size={7} />
                    <span style={{ fontSize: 12, color: C.ink, fontWeight: 700 }}>{g.name}</span>
                    {gradeBadge(g.grade)}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4, marginTop: 1 }}>{g.text}</div>
                </div>
                {stockBadge(g.inStock)}
              </div>
            ))}
          </div>
          {avoid.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.apricot, margin: "12px 0 6px" }}>주의 조합 ({avoid.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {avoid.map((a) => (
                  <div key={a.name} style={{ background: C.apricotLight, borderRadius: 8, padding: "7px 9px" }}>
                    <div className="flex items-center justify-between" style={{ gap: 8 }}>
                      <div className="flex items-center" style={{ gap: 5 }}>
                        <AlertTriangle size={11} color={C.apricot} />
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#9A4A1E" }}>{a.name}</span>
                        {gradeBadge(a.grade)}
                      </div>
                      {stockBadge(a.inStock)}
                    </div>
                    <div style={{ fontSize: 10, color: "#A85B30", lineHeight: 1.4, marginTop: 2 }}>{a.text}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ fontSize: 9.5, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>* 확립된 영양소 상호작용만 안내하는 참고 정보예요. 흡수율에 관한 내용으로, 함께 먹여도 위험한 조합은 아니에요.</div>
        </div>

        {/* 최근 급여 이력 */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 }}>최근 급여 이력</div>
          {recent.length === 0 ? (
            <div style={{ fontSize: 11.5, color: C.muted }}>아직 급여 기록이 없어요</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {recent.map((h, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span style={{ fontSize: 12, color: C.inkSoft }}>{h.date.slice(5)} · {h.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.sageDeep }}>{h.g}g</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 반응 기록·메모 */}
        {intro ? (
          <button onClick={() => setEditIntro(true)} className="flex items-center justify-between" style={{ width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 13px", cursor: "pointer" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>반응 기록 · 메모 수정</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{intro.status}{intro.memo ? ` — ${intro.memo}` : ""}</div>
            </div>
            <ChevronRight size={15} color={C.muted} />
          </button>
        ) : (
          <button onClick={() => dispatch({ type: "INTRO_UPSERT", intro: { name, cat: catOf(state, name), status: "이상없음", memo: "", date: todayISO() } })}
            className="flex items-center justify-center" style={{ gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "11px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
            <Plus size={14} /> 먹어본 재료로 등록
          </button>
        )}
      </div>
      {editIntro && intro && <IntroEditModal intro={intro} onClose={() => setEditIntro(false)} />}
      {basePicker && <IngredientPicker onPick={(n) => { if (n !== name) setMeta({ baseOf: n }); setBasePicker(false); }} onClose={() => setBasePicker(false)} />}
      {compPicker && <IngredientPicker multi alreadyAdded={[...components, name]} onPick={(names) => { setMeta({ components: Array.from(new Set([...components, ...names.filter((n) => n !== name)])) }); }} onClose={() => setCompPicker(false)} />}
    </div>
  );
}

/* =====================================================================
   재료 정보(위키) - 영양 DB 전체 + 앱에 등록된 재료를 카테고리별로 나열.
   먹어본 재료는 진하게(활성) 표시, 탭하면 재료 정보 화면으로 이동
   ===================================================================== */
export function IngredientWikiPanel({ go }) {
  const { state } = useStore();
  const [q, setQ] = useState("");
  // 먹어본 재료: intros 등록분 + 변형 재료를 먹었다면 그 기본 재료도 먹은 것으로 간주 (예: 사과퓨레 → 사과)
  const eaten = new Set();
  state.intros.forEach((it) => {
    eaten.add(it.name);
    const b = (state.ingredients[it.name] || {}).baseOf;
    if (b) eaten.add(b);
  });
  const warned = new Set(state.intros.filter((it) => it.status === "주의" || it.status === "중단").map((it) => it.name));
  const allNames = Array.from(new Set([...Object.keys(NUTRIENT_TAGS), ...Object.keys(state.ingredients)]));
  const filtered = allNames.filter((n) => !q || n.includes(q));
  const byCat = {};
  CATEGORIES.forEach((c) => { byCat[c] = []; });
  filtered.forEach((n) => { (byCat[catOf(state, n)] || byCat["채소"]).push(n); });
  CATEGORIES.forEach((c) => {
    byCat[c].sort((a, b) => {
      const ea = eaten.has(a), eb = eaten.has(b);
      if (ea !== eb) return ea ? -1 : 1; // 먹어본 재료 먼저
      return a.localeCompare(b, "ko");
    });
  });
  const eatenCount = filtered.filter((n) => eaten.has(n)).length;

  return (
    <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="flex items-center" style={{ gap: 7, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px" }}>
        <Search size={15} color={C.muted} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="재료 검색"
          style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.ink, width: "100%" }} />
      </div>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>먹어본 재료는 진하게 표시돼요 · 탭하면 상세 정보</span>
        <span style={{ fontSize: 10.5, color: C.sageDeep, fontWeight: 700 }}>{eatenCount}/{filtered.length} 먹어봄</span>
      </div>
      {CATEGORIES.map((cat) => byCat[cat].length > 0 && (
        <div key={cat}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, margin: "4px 0 6px", padding: "0 2px" }}>{cat} ({byCat[cat].length})</div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            {byCat[cat].map((n, i) => {
              const isEaten = eaten.has(n);
              const isWarned = warned.has(n);
              const tags = tagsOf(state, n);
              const meta = state.ingredients[n] || {};
              const sub = meta.baseOf ? `${meta.baseOf}의 변형`
                : (meta.components && meta.components.length > 0) ? `혼합: ${meta.components.join("·")}`
                : tags.length > 0 ? tags.map((t) => TAG_LABELS[t]).filter(Boolean).join(" · ") : "";
              return (
                <button key={n} onClick={() => go("ingredientInfo", { name: n })} className="flex items-center justify-between"
                  style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: C.surface, border: "none",
                    borderTop: i === 0 ? "none" : `1px solid ${C.border}`, cursor: "pointer", opacity: isEaten ? 1 : 0.5 }}>
                  <div className="flex items-center" style={{ gap: 7, minWidth: 0, flex: 1 }}>
                    <CatDot name={n} size={7} />
                    <span style={{ fontSize: 12.5, fontWeight: isEaten ? 800 : 500, color: C.ink, whiteSpace: "nowrap" }}>{n}</span>
                    {isEaten && !isWarned && <Check size={12} color={C.sage} />}
                    {isWarned && <span style={{ fontSize: 9, fontWeight: 700, color: C.apricot, background: C.apricotLight, borderRadius: 999, padding: "1px 6px" }}>주의·중단</span>}
                    {sub && <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>}
                  </div>
                  <ChevronRight size={13} color={C.muted} style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 9.5, color: C.muted, lineHeight: 1.5, padding: "0 2px 4px" }}>
        영양 DB {Object.keys(NUTRIENT_TAGS).length}개 재료 + 직접 등록한 재료가 함께 표시돼요. 새 재료는 식단표·제조 기록·기록 탭에서 추가하면 여기에 나타나요.
      </div>
    </div>
  );
}
