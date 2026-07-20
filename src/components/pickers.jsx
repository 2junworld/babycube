/* 선택기 모달 - 재료·끼니 종류·식단 복사 */
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Check, Search, Star, Info } from "lucide-react";
import { C, CATEGORIES } from "../theme";
import { fmtTime, todayISO, uid } from "../lib/dates";
import { DB_CATEGORY } from "../data/nutrition";
import { catOf, normalizeIngredientName, productStockPacks, stockFridgeG, stockTotalCubes, stockTotalFrozenG } from "../state/appState";
import { useStore } from "../store";
import { BottomSheet, CatDot, ConfirmModal, MealItemList, NumInput, ProductDot, Segmented, useVisualViewport } from "./common";
import { pairingInfoFor, pairingRankFor, suggestBaseFor, usedTodayMap } from "../lib/pairing";
import { primaryBtn } from "../theme";
import { IngredientInfoScreen } from "../screens/StockTab";

// 재료 선택 ↔ 시판 제품 선택 시트를 좌우로 스와이프해서 전환하는 제스처 - 세로 스크롤(목록)과
// 헷갈리지 않도록 가로 이동이 세로 이동보다 뚜렷할 때만 반응하고, 전환 콜백이 없는 방향은 살짝만
// 저항감 있게 움직이다 원위치로 튕겨 "이 방향으로는 전환할 게 없다"는 느낌을 줌
const SWIPE_THRESHOLD = 70;
function useSwitchSwipe({ onSwipeLeft, onSwipeRight }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(null);
  // 빠르게 연속으로 들어오는 pointermove 이벤트는 React 리렌더보다 앞서갈 수 있어, pointerup 시점에
  // state(dragX)를 그대로 읽으면 오래된 값을 참조하는 경우가 있음 - ref로 최신값을 동기적으로 추적
  const dragXRef = useRef(0);
  const onPointerDown = (e) => { startRef.current = { x: e.clientX, y: e.clientY }; setDragging(true); };
  const onPointerMove = (e) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dy) > Math.abs(dx) + 10) return;
    let d = dx;
    if (d < 0 && !onSwipeLeft) d *= 0.25;
    if (d > 0 && !onSwipeRight) d *= 0.25;
    const clamped = Math.max(-140, Math.min(140, d));
    dragXRef.current = clamped;
    setDragX(clamped);
  };
  const endDrag = () => {
    if (!startRef.current) return;
    startRef.current = null;
    setDragging(false);
    const final = dragXRef.current;
    if (final <= -SWIPE_THRESHOLD && onSwipeLeft) onSwipeLeft();
    else if (final >= SWIPE_THRESHOLD && onSwipeRight) onSwipeRight();
    dragXRef.current = 0;
    setDragX(0);
  };
  return { dragX, dragging, handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerLeave: endDrag } };
}
// 시트가 뜰 때 살짝 옆에서 밀려들어오는 듯한 진입 애니메이션 - 스와이프 방향 감각과 일치하도록
// 재료 피커는 왼쪽에서, 시판 피커는 오른쪽에서 들어옴(둘 다 스와이프로 서로를 향해 있다는 표시)
function useSlideIn() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return entered;
}

// 재료 선택 정렬 칩 상태를 기기에 저장 - 매번 열 때마다 디폴트로 돌아가지 않고 마지막으로 고른 조합 유지
const SORT_PREF_KEY = "bc_ingredient_picker_sort";
const DEFAULT_SORT_SEL = { fav: false, excludeUsedToday: false, pairing: false, stock: null, cat: true };
function readSortPref() {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_PREF_KEY));
    if (!v || typeof v !== "object") return DEFAULT_SORT_SEL;
    return {
      fav: !!v.fav, excludeUsedToday: !!v.excludeUsedToday, pairing: !!v.pairing,
      stock: v.stock === "asc" || v.stock === "desc" ? v.stock : null,
      cat: v.cat !== false,
    };
  } catch { return DEFAULT_SORT_SEL; }
}
function writeSortPref(v) {
  try { localStorage.setItem(SORT_PREF_KEY, JSON.stringify(v)); } catch { /* 저장 불가 환경이면 무시 */ }
}

/* =====================================================================
   재료 선택 모달
   ===================================================================== */
// multi=true면 체크박스로 여러 재료를 한 번에 골라 onPick(names[])으로 전달, false면 기존처럼 탭 즉시 onPick(name) 1건
// 정렬은 여러 기준을 동시에 켤 수 있음(중복 선택) — 아래 고정된 우선순위(즐겨찾기 > 오늘 사용 재료 > 궁합 좋은 재료 >
// 재고순 > 카테고리순) 순서로 앞 기준이 같을 때만 다음 기준으로 넘어가며, 마지막엔 항상 이름순으로 마무리함.
// 재고순만 한 칩을 반복 클릭하면 꺼짐→적은순→많은순→꺼짐 순으로 도는 3단 토글.
// onSwitchToProduct가 있으면 검색창 아래 "시판 제품에서 찾기" 링크가 나타나 눌렀을 때 입력 중이던
// 검색어(q)와 함께 호출됨 - 급여 기록·식단표처럼 재료·시판 제품을 함께 담는 화면에서만 전달되고,
// 재료만 다뤄야 하는 나머지 사용처(제조 기록·기본 재료 연결·혼합 큐브 구성 등)는 그대로 재료만 노출
export function IngredientPicker({ onPick, onClose, multi = false, alreadyAdded = [], pairingNames = alreadyAdded, date = todayISO(), onSwitchToProduct, initialQuery = "" }) {
  const { state, dispatch } = useStore();
  const vv = useVisualViewport();
  const [q, setQ] = useState(initialQuery);
  const [cat, setCat] = useState("전체");
  const [newCat, setNewCat] = useState("채소");
  const [selected, setSelected] = useState([]);
  const [sortSel, setSortSelRaw] = useState(readSortPref);
  const setSortSel = (updater) => setSortSelRaw((s) => {
    const next = typeof updater === "function" ? updater(s) : updater;
    writeSortPref(next);
    return next;
  });
  const [linkBase, setLinkBase] = useState(true); // 변형 재료 자동 연결 여부 (기본 켬)
  const [infoFor, setInfoFor] = useState(null); // 재료 정보를 바로 보고 수정할 재료명
  const entered = useSlideIn();
  const { dragX, dragging, handlers: swipeHandlers } = useSwitchSwipe({ onSwipeLeft: onSwitchToProduct ? () => onSwitchToProduct(q) : null });
  const names = Object.keys(state.ingredients);
  // 새 재료 입력 시: 영양 DB에 있으면 카테고리 자동 선택, 변형 재료로 보이면 기본 재료의 카테고리를 미리 선택
  const newSuggestion = q && !names.includes(q) ? suggestBaseFor(state, q) : null;
  useEffect(() => {
    setLinkBase(true);
    if (DB_CATEGORY[q]) setNewCat(DB_CATEGORY[q]);
    else if (newSuggestion) setNewCat(catOf(state, newSuggestion));
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const stockAmt = (n) => stockTotalFrozenG(state, n) + stockFridgeG(state, n);
  const isFavorite = (n) => !!(state.ingredients[n] && state.ingredients[n].favorite);
  const usedTodayG = usedTodayMap(state, date);
  const toggleSortFav = () => setSortSel((s) => ({ ...s, fav: !s.fav }));
  const toggleExcludeUsedToday = () => setSortSel((s) => ({ ...s, excludeUsedToday: !s.excludeUsedToday }));
  const toggleSortPairing = () => setSortSel((s) => ({ ...s, pairing: !s.pairing }));
  const toggleSortStock = () => setSortSel((s) => ({ ...s, stock: s.stock === null ? "asc" : s.stock === "asc" ? "desc" : null }));
  const toggleSortCat = () => setSortSel((s) => ({ ...s, cat: !s.cat }));
  // "오늘 사용 재료 제외"는 정렬이 아니라 목록 자체에서 걸러내는 필터
  const base = names.filter((n) => (cat === "전체" || catOf(state, n) === cat) && n.includes(q) && (!sortSel.excludeUsedToday || !usedTodayG.has(n)));
  const sortChain = [];
  // 방금 선택(체크)한 재료는 다른 정렬 기준보다 항상 최우선으로 맨 위에 - 새로 추가한 재료를 바로
  // 찾아 "재료 정보" 버튼으로 혼합 큐브 등 정보를 이어서 입력할 수 있게 하기 위함
  if (multi) sortChain.push((a, b) => { const sa = selected.includes(a), sb = selected.includes(b); return sa !== sb ? (sa ? -1 : 1) : 0; });
  if (sortSel.fav) sortChain.push((a, b) => { const fa = isFavorite(a), fb = isFavorite(b); return fa !== fb ? (fa ? -1 : 1) : 0; });
  if (sortSel.pairing) sortChain.push((a, b) => {
    const ra = pairingRankFor(state, pairingNames, a), rb = pairingRankFor(state, pairingNames, b);
    if (ra === rb) return 0;
    if (ra === null) return 1;
    if (rb === null) return -1;
    return ra - rb; // 궁합 근거 A(0) > B(1)
  });
  if (sortSel.stock) sortChain.push((a, b) => {
    const sa = stockAmt(a), sb = stockAmt(b);
    const aHas = sa > 0, bHas = sb > 0;
    if (aHas !== bHas) return aHas ? -1 : 1; // 재고 있는 재료가 항상 먼저
    return sortSel.stock === "asc" ? sa - sb : sb - sa;
  });
  if (sortSel.cat) sortChain.push((a, b) => CATEGORIES.indexOf(catOf(state, a)) - CATEGORIES.indexOf(catOf(state, b)));
  sortChain.push((a, b) => a.localeCompare(b, "ko")); // 최종 안정 정렬(동률 시 이름순)
  const filtered = [...base].sort((a, b) => {
    for (const cmp of sortChain) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  });
  const isNew = (q || "").trim() && !names.includes((q || "").trim());
  const addedSet = new Set(alreadyAdded);

  const confirmNew = () => {
    // 이후 식단·기록에 들어가는 이름과 재료 마스터 키가 일치하도록 등록 전에 정규화(공백 제거)
    const name = normalizeIngredientName(q);
    if (!name) return;
    // 변형 재료 연결이 켜져 있으면 baseOf까지 함께 등록 → 영양 태그·궁합 특성이 즉시 따라옴
    dispatch({ type: "INGREDIENT_ENSURE", name, cat: newCat, baseOf: linkBase && newSuggestion ? newSuggestion : undefined });
    dispatch({ type: "INGREDIENT_TOUCH", name });
    if (multi) {
      setSelected((p) => p.includes(name) ? p : [...p, name]);
      setQ("");
    } else {
      onPick(name, newCat);
    }
  };

  const pickOne = (n) => { dispatch({ type: "INGREDIENT_TOUCH", name: n }); onPick(n); };
  const toggleFavorite = (n, e) => { e.stopPropagation(); dispatch({ type: "INGREDIENT_TOGGLE_FAVORITE", name: n }); };
  const toggle = (n) => setSelected((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n]);
  const confirmSelection = () => { dispatch({ type: "INGREDIENT_TOUCH", names: selected }); onPick(selected); onClose(); };

  return (
    <div style={{ position: "fixed", top: vv.offsetTop, left: 0, right: 0, height: vv.height, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} {...swipeHandlers} style={{ background: C.bg, width: "100%", maxHeight: "78%", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom)", touchAction: "pan-y",
        transform: `translateX(${entered ? dragX : -36}px)`, opacity: entered ? 1 - Math.min(Math.abs(dragX) / 400, 0.3) : 0,
        transition: dragging ? "none" : "transform 0.22s ease, opacity 0.22s ease" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 18px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{multi ? `재료 선택${selected.length ? ` (${selected.length})` : ""}` : "재료 선택"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ padding: "0 18px 10px" }}>
          <div className="flex items-center" style={{ gap: 7, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px", marginBottom: 9 }}>
            <Search size={15} color={C.muted} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="재료 검색 또는 새 재료 입력"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.ink, width: "100%" }} />
          </div>
          {onSwitchToProduct && (
            <div style={{ marginBottom: 9 }}>
              <Segmented value="ingredient" onChange={(v) => v === "product" && onSwitchToProduct(q)}
                options={[{ value: "ingredient", label: "재료" }, { value: "product", label: "시판 제품" }]} />
              <div style={{ fontSize: 9.5, color: C.muted, textAlign: "center", marginTop: 4 }}>← 옆으로 밀어도 전환돼요</div>
            </div>
          )}
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {["전체", ...CATEGORIES].map((c) => (
              <button key={c} onClick={() => setCat(c)} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                border: "none", background: cat === c ? C.sage : C.sageLight, color: cat === c ? "#fff" : C.sageDeep }}>{c}</button>
            ))}
          </div>
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginRight: 1 }}>정렬(중복 선택 가능)</span>
            {[
              { on: sortSel.fav, onClick: toggleSortFav, label: "즐겨찾기" },
              { on: sortSel.excludeUsedToday, onClick: toggleExcludeUsedToday, label: "오늘 사용 재료 제외" },
              { on: sortSel.pairing, onClick: toggleSortPairing, label: "궁합 좋은 재료" },
              { on: sortSel.stock !== null, onClick: toggleSortStock, label: sortSel.stock === "desc" ? "재고 많은순" : sortSel.stock === "asc" ? "재고 적은순" : "재고순" },
              { on: sortSel.cat, onClick: toggleSortCat, label: "카테고리순" },
            ].map((o, i) => (
              <button key={i} onClick={o.onClick} style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${o.on ? C.sage : C.border}`, background: o.on ? C.sageLight : "transparent", color: o.on ? C.sageDeep : C.muted }}>{o.label}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: "0 18px 24px" }}>
          {isNew && (
            <div style={{ marginBottom: 10, background: C.sageLight, border: `1px dashed ${C.sage}`, borderRadius: 12, padding: "11px 12px" }}>
              <div className="flex items-center" style={{ gap: 8, marginBottom: 9 }}>
                <Plus size={15} color={C.sageDeep} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sageDeep }}>'{q}' 새 재료로 추가</span>
              </div>
              <div style={{ fontSize: 10.5, color: C.sageDeep, fontWeight: 700, marginBottom: 6 }}>카테고리</div>
              <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {CATEGORIES.map((c) => (
                  <button key={c} onClick={() => setNewCat(c)} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                    border: "none", background: newCat === c ? C.sage : C.surface, color: newCat === c ? "#fff" : C.sageDeep }}>{c}</button>
                ))}
              </div>
              {newSuggestion && (
                <button onClick={() => setLinkBase((v) => !v)} className="flex items-center" style={{ gap: 8, background: C.surface, border: "none", borderRadius: 10, padding: "8px 10px", marginBottom: 10, width: "100%", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${linkBase ? C.sage : C.border}`,
                    background: linkBase ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {linkBase && <Check size={12} color="#fff" />}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.sageDeep, lineHeight: 1.4 }}>'{newSuggestion}'의 변형으로 연결 — 영양·궁합 특성을 물려받아요</span>
                </button>
              )}
              <button onClick={confirmNew} style={{ ...primaryBtn, padding: "9px 0", fontSize: 12.5 }}>'{q}' 추가하기</button>
              <div style={{ fontSize: 9.5, color: C.sageDeep, marginTop: 8, lineHeight: 1.4, opacity: 0.8 }}>
                여러 재료가 섞인 혼합 큐브라면, 추가 후 재고 탭 → 재료 정보에서 구성 재료를 지정하면 궁합 계산에 반영돼요.
              </div>
            </div>
          )}
          {filtered.map((n) => {
            const cubes = stockTotalCubes(state, n), fg = stockFridgeG(state, n);
            const already = multi && addedSet.has(n);
            const checked = selected.includes(n);
            const fav = isFavorite(n);
            const pairInfo = sortSel.pairing ? pairingInfoFor(state, pairingNames, n) : null;
            // disabled 대신 onClick 내부 already 체크로 막음 - 네이티브 disabled는 중첩된 즐겨찾기·정보
            // 버튼까지 클릭이 안 먹는 문제가 있어(이미 담긴 재료도 정보 확인은 가능해야 함) 사용하지 않음
            return (
              <button key={n} onClick={() => (multi ? (already ? null : toggle(n)) : pickOne(n))}
                className="flex items-center justify-between" style={{ width: "100%", padding: "11px 12px",
                borderBottom: `1px solid ${C.border}`, background: "transparent", border: "none", borderBottomStyle: "solid",
                cursor: already ? "default" : "pointer", opacity: already ? 0.45 : 1 }}>
                <div className="flex items-center" style={{ gap: multi ? 9 : 6, minWidth: 0 }}>
                  {multi && (
                    <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${checked ? C.sage : C.border}`,
                      background: checked ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {checked && <Check size={12} color="#fff" />}
                    </span>
                  )}
                  <span role="button" onClick={(e) => toggleFavorite(n, e)} style={{ display: "flex", padding: 2, cursor: "pointer" }}>
                    <Star size={13} color={fav ? C.apricot : C.border} fill={fav ? C.apricot : "none"} />
                  </span>
                  <CatDot name={n} size={8} /><span style={{ fontSize: 13, color: C.ink }}>{n}</span>
                  {usedTodayG.has(n) && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "1px 6px", flexShrink: 0 }}>오늘 {Math.round(usedTodayG.get(n))}g</span>
                  )}
                  {pairInfo && pairInfo.goodWith.length > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "1px 6px", flexShrink: 0 }}>{pairInfo.goodWith.join("·")}와 궁합</span>
                  )}
                  {pairInfo && pairInfo.avoidWith.length > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#9A4A1E", background: C.apricotLight, borderRadius: 999, padding: "1px 6px", flexShrink: 0 }}>{pairInfo.avoidWith.join("·")}와 비추천</span>
                  )}
                </div>
                <div className="flex items-center" style={{ gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: cubes || fg ? C.muted : C.apricot }}>
                    {already ? "이미 담김" : cubes || fg ? `냉동 ${cubes}${fg ? ` · 냉장 ${fg}g` : ""}` : "재고없음"}
                  </span>
                  <span role="button" aria-label="재료 정보" onClick={(e) => { e.stopPropagation(); setInfoFor(n); }} style={{ display: "flex", padding: 2, cursor: "pointer" }}>
                    <Info size={13} color={C.muted} />
                  </span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && !isNew && (
            <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12, color: C.muted }}>검색 결과가 없습니다</div>
          )}
        </div>
        {multi && (
          <div style={{ padding: "10px 18px 20px", borderTop: `1px solid ${C.border}` }}>
            <button onClick={confirmSelection} disabled={selected.length === 0}
              style={{ ...primaryBtn, background: selected.length ? C.sage : C.sageLight, color: selected.length ? "#fff" : C.muted, cursor: selected.length ? "pointer" : "default" }}>
              {selected.length > 0 ? `${selected.length}개 재료 추가` : "재료를 선택하세요"}
            </button>
          </div>
        )}
      </div>
      {/* 재료 정보 버튼 - 피커를 닫지 않고 그 위에 재료 정보 화면을 띄워 바로 수정 후 피커로 복귀 가능 */}
      {infoFor && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: C.bg, overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
          <IngredientInfoScreen name={infoFor} onBack={() => setInfoFor(null)} />
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   시판 제품 등록/수정 폼 - 필드·저장 로직만 담당(공용). ProductEditSheet가 BottomSheet로 감싸
   독립 화면처럼 쓰고, ProductPicker는 embedded=true로 검색 결과 목록과 같은 화면 안에 인라인으로
   붙여서 쓴다(재료 선택기의 "검색어로 바로 새 재료 추가"와 동일한 경험을 시판 제품에도 제공)
   ===================================================================== */
function ProductEditForm({ product, initialName, onSaved, onClose, go, embedded = false }) {
  const { state, dispatch, notify } = useStore();
  const isNew = product === "new";
  const base = isNew ? {} : product;
  const [name, setName] = useState(base.name || initialName || "");
  const [brand, setBrand] = useState(base.brand || "");
  const [packG, setPackG] = useState(base.packG || 100);
  const [ingredients, setIngredients] = useState(base.ingredients || []);
  const [memo, setMemo] = useState(base.memo || "");
  const [picker, setPicker] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const canSave = name.trim() && ingredients.length > 0;

  const save = () => {
    if (!canSave) return;
    // id를 미리 만들어 리듀서와 onSaved 콜백이 같은 제품을 가리키게 함(급여기록·식단표에서
    // 등록 직후 바로 선택 처리할 때 필요)
    const id = isNew ? uid() : base.id;
    dispatch({ type: "PRODUCT_UPSERT", product: { id, name, brand, packG: Number(packG) || 0, ingredients, memo } });
    if (onSaved) onSaved({ id, name: normalizeIngredientName(name) || name.trim(), brand: brand.trim(), packG: Number(packG) || 0, ingredients });
    onClose();
  };
  const del = () => {
    dispatch({ type: "PRODUCT_DELETE", id: base.id });
    notify(`'${base.name}' 제품을 삭제했습니다`, () => dispatch({ type: "RESTORE_PRODUCT", product: base }));
    onClose();
  };

  return (
    <>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }}>제품명</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 소고기미역진밥"
          style={{ width: "100%", border: "none", outline: "none", fontSize: 13, fontWeight: 700, color: C.ink, background: "transparent" }} />
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }}>브랜드 (선택)</div>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="예: 배○밀"
          style={{ width: "100%", border: "none", outline: "none", fontSize: 13, color: C.ink, background: "transparent" }} />
      </div>
      <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
        <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>1팩 용량</span>
        <NumInput value={Number(packG) || 0} onChange={setPackG} width={52} suffix="g" />
      </div>
      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>포함 재료 ({ingredients.length})</span>
          <button onClick={() => setPicker(true)} style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, background: C.sageLight, border: "none", borderRadius: 999, padding: "4px 10px", cursor: "pointer" }}>선택</button>
        </div>
        {ingredients.length === 0 ? (
          <div style={{ fontSize: 11.5, color: C.apricot }}>최소 1개 이상 선택해 주세요</div>
        ) : (
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
            {ingredients.map((n) => (
              <span key={n} className="flex items-center" style={{ gap: 4, fontSize: 11, fontWeight: 700, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "3px 5px 3px 9px" }}>
                {n}
                <button onClick={() => setIngredients(ingredients.filter((x) => x !== n))} style={{ background: "rgba(0,0,0,0.08)", border: "none", width: 14, height: 14, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><X size={8} color={C.sageDeep} /></button>
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 9.5, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>
          포함 재료의 궁합(상성) 정보는 혼합 큐브와 같은 방식으로 합쳐져서 제품 상세 화면에 표시돼요.
        </div>
      </div>
      <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" rows={2}
        style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: C.ink, outline: "none", resize: "none", fontFamily: "inherit" }} />
      <button onClick={save} disabled={!canSave} style={{ ...primaryBtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "default" }}>{isNew ? "추가" : "저장"}</button>
      {embedded && <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0" }}>취소</button>}
      {!isNew && state.settings.productStockEnabled && (
        <button onClick={() => { onClose(); go && go("productStockDetail", { productId: base.id }); }}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 0", fontSize: 12, fontWeight: 700, color: C.sageDeep, cursor: "pointer" }}>재고 관리로 이동</button>
      )}
      {!isNew && <button onClick={() => setConfirmDel(true)} style={{ background: "none", border: "none", color: C.apricot, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0" }}>이 제품 삭제</button>}
      {/* document.body에 포털로 렌더링 - embedded(ProductPicker 인라인) 경로에서는 이 폼의 조상에 스와이프용
          CSS transform이 걸려 있어, 포털 없이 중첩 렌더링하면 그 조상이 position:fixed의 새 컨테이닝 블록이
          되어 버려 이 피커가 화면 밖으로 밀려나는 문제가 있었음(뷰포트 기준으로 항상 고정되도록 포털 사용) */}
      {picker && createPortal(
        <IngredientPicker multi alreadyAdded={ingredients} onPick={(names) => { setIngredients(Array.from(new Set([...ingredients, ...names]))); setPicker(false); }} onClose={() => setPicker(false)} />,
        document.body
      )}
      {confirmDel && (
        <ConfirmModal
          title={`'${name}' 제품을 삭제할까요?`}
          message="과거 급여 기록의 제품 참조는 그대로 남아 이름으로 표시됩니다."
          onConfirm={del}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </>
  );
}

/* =====================================================================
   시판 제품 등록/수정 시트 - 재료 정보 화면의 제품 관리 카테고리에서 독립 화면처럼 쓰는 래퍼
   (ProductEditForm에 BottomSheet를 씌운 것). 급여기록·식단표의 ProductPicker는 이 시트를 쓰지
   않고 ProductEditForm을 직접 인라인으로 붙여 쓴다(아래 ProductPicker 참고)
   ===================================================================== */
export function ProductEditSheet({ product, onClose, go, onSaved, initialName }) {
  const isNew = product === "new";
  return (
    <BottomSheet title={isNew ? "시판 제품 추가" : "시판 제품 수정"} onClose={onClose}>
      <div style={{ padding: "0 18px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <ProductEditForm product={product} initialName={initialName} onSaved={onSaved} onClose={onClose} go={go} />
      </div>
    </BottomSheet>
  );
}

/* =====================================================================
   시판 제품 선택 모달 - 급여 기록·식단표 편집 화면에서 "시판 제품 추가" 진입점 (시판 이유식 기능)
   재료 선택기(IngredientPicker)와 별도 경량 컴포넌트로 분리 - 정렬·다중선택 등 복잡한
   로직을 건드리지 않고 안전하게 추가하기 위한 구현 선택. "새 제품 등록"을 누르면 별도 화면으로
   넘어가지 않고 같은 시트 안에 등록 폼이 인라인으로 펼쳐져 그 자리에서 바로 입력·저장하고
   이어서 선택됨(ProductEditForm embedded + onSaved). initialQuery는 IngredientPicker에서
   "시판 제품에서 찾기"로 넘어올 때 입력 중이던 검색어를 그대로 이어받아 검색·신규 등록 이름에
   함께 반영(재료 선택기의 "입력하면 바로 새로 추가" 경험과 동일하게)
   ===================================================================== */
export function ProductPicker({ onPick, onClose, initialQuery = "", onSwitchToIngredient }) {
  const { state } = useStore();
  const vv = useVisualViewport();
  const [q, setQ] = useState(initialQuery);
  const [creating, setCreating] = useState(false);
  const entered = useSlideIn();
  const { dragX, dragging, handlers: swipeHandlers } = useSwitchSwipe({ onSwipeRight: onSwitchToIngredient ? () => onSwitchToIngredient(q) : null });
  const list = Object.values(state.products)
    .filter((p) => !q || p.name.includes(q) || (p.brand || "").includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const stockOn = state.settings.productStockEnabled;
  const trimmedQ = q.trim();
  const exactMatch = trimmedQ && list.some((p) => p.name === trimmedQ);

  return (
    <div style={{ position: "fixed", top: vv.offsetTop, left: 0, right: 0, height: vv.height, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} {...swipeHandlers} style={{ background: C.bg, width: "100%", maxHeight: "78%", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom)", touchAction: "pan-y",
        transform: `translateX(${entered ? dragX : 36}px)`, opacity: entered ? 1 - Math.min(Math.abs(dragX) / 400, 0.3) : 0,
        transition: dragging ? "none" : "transform 0.22s ease, opacity 0.22s ease" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 18px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>시판 제품 선택</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ padding: "0 18px 10px" }}>
          <div className="flex items-center" style={{ gap: 7, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px", marginBottom: 9 }}>
            <Search size={15} color={C.muted} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제품명·브랜드로 검색 또는 새 제품 입력"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.ink, width: "100%" }} />
          </div>
          {onSwitchToIngredient && (
            <div style={{ marginBottom: 9 }}>
              <Segmented value="product" onChange={(v) => v === "ingredient" && onSwitchToIngredient(q)}
                options={[{ value: "ingredient", label: "재료" }, { value: "product", label: "시판 제품" }]} />
              <div style={{ fontSize: 9.5, color: C.muted, textAlign: "center", marginTop: 4 }}>옆으로 밀어도 전환돼요 →</div>
            </div>
          )}
          {!creating && (
            <button onClick={() => setCreating(true)} className="flex items-center justify-center" style={{ gap: 6, background: C.sageLight, border: "none", borderRadius: 10, padding: "9px 0", fontSize: 12.5, fontWeight: 700, color: C.sageDeep, cursor: "pointer", width: "100%" }}>
              <Plus size={14} /> {trimmedQ && !exactMatch ? `'${trimmedQ}' 새 제품으로 등록` : "새 시판 제품 등록"}
            </button>
          )}
        </div>
        <div style={{ overflowY: "auto", padding: "0 18px 24px" }}>
          {creating && (
            <div style={{ marginBottom: 10, background: C.sageLight, border: `1px dashed ${C.sage}`, borderRadius: 12, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                <Plus size={15} color={C.sageDeep} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sageDeep }}>{trimmedQ && !exactMatch ? `'${trimmedQ}' 새 제품으로 등록` : "새 시판 제품 등록"}</span>
              </div>
              <ProductEditForm product="new" initialName={trimmedQ} embedded onClose={() => setCreating(false)}
                onSaved={(p) => { setCreating(false); onPick(p); }} />
            </div>
          )}
          {list.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              등록된 시판 제품이 없어요.<br />위 버튼으로 바로 등록할 수 있어요.
            </div>
          )}
          {list.map((p) => {
            const packs = stockOn ? productStockPacks(state, p.id) : null;
            return (
              <button key={p.id} onClick={() => onPick(p)} style={{ width: "100%", textAlign: "left", padding: "11px 12px",
                borderBottom: `1px solid ${C.border}`, background: "transparent", border: "none", borderBottomStyle: "solid", cursor: "pointer" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: 7, minWidth: 0 }}>
                    <ProductDot />
                    <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{p.name}</span>
                    {p.brand && <span style={{ fontSize: 10.5, color: C.muted }}>{p.brand}</span>}
                  </div>
                  <span style={{ fontSize: 11, color: packs != null && packs <= 0 ? C.apricot : C.muted, flexShrink: 0 }}>
                    {packs != null ? `${packs}팩` : `1팩 ${p.packG}g`}
                  </span>
                </div>
                {p.ingredients.length > 0 && (
                  <div className="flex items-center" style={{ gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                    {p.ingredients.map((n) => (
                      <span key={n} style={{ fontSize: 10, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "1px 7px" }}>{n}</span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   끼니 종류 선택 모달 (더보기 → 끼니 설정에서 미리 정의한 목록 중 선택)
   ===================================================================== */
export function MealSlotPicker({ slots, timeFmt, onPick, onClose }) {
  const [custom, setCustom] = useState("");
  const sorted = [...slots].sort((a, b) => a.time.localeCompare(b.time));
  return (
    <BottomSheet title="끼니 종류 선택" onClose={onClose}>
        <div style={{ overflowY: "auto", padding: "0 18px 10px" }}>
          {sorted.map((s) => (
            <button key={s.id} onClick={() => onPick(s.label, s.time)} className="flex items-center justify-between" style={{ width: "100%", padding: "12px 12px",
              borderBottom: `1px solid ${C.border}`, background: "transparent", border: "none", borderBottomStyle: "solid", cursor: "pointer" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{s.label}</span>
              <span style={{ fontSize: 11.5, color: C.muted }}>{fmtTime(s.time, timeFmt)}</span>
            </button>
          ))}
          {sorted.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: C.muted }}>
              등록된 끼니 종류가 없습니다.<br />더보기 → 끼니 설정에서 추가해 보세요.
            </div>
          )}
        </div>
        <div style={{ padding: "10px 18px 24px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, marginBottom: 7 }}>목록에 없는 끼니라면 직접 입력</div>
          <div className="flex items-center" style={{ gap: 8 }}>
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="예: 야식"
              style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: C.ink, outline: "none" }} />
            <button onClick={() => custom && onPick(custom, null)} disabled={!custom}
              style={{ background: custom ? C.sage : C.sageLight, border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 12.5, fontWeight: 700, color: custom ? "#fff" : C.muted, cursor: custom ? "pointer" : "default" }}>선택</button>
          </div>
        </div>
    </BottomSheet>
  );
}

/* =====================================================================
   다른 날짜의 끼니를 복사해오는 선택기 (식단표 재료 재입력 수고를 줄이기 위함)
   ===================================================================== */
export function MealCopyPicker({ onPick, onClose }) {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const timeFmt = state.settings.timeFmt;
  const all = [];
  Object.keys(state.plans).sort((a, b) => b.localeCompare(a)).forEach((d) => {
    (state.plans[d] || []).forEach((m) => all.push({ date: d, meal: m }));
  });
  const filtered = all.filter(({ date, meal }) =>
    !q || meal.label.includes(q) || date.includes(q) || meal.items.some((it) => it.name.includes(q))
  );
  return (
    <BottomSheet title="식단 복사" onClose={onClose}>
        <div style={{ padding: "0 18px 10px" }}>
          <div className="flex items-center" style={{ gap: 7, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px" }}>
            <Search size={15} color={C.muted} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="날짜, 끼니 이름, 재료로 검색"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.ink, width: "100%" }} />
          </div>
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8 }}>선택하면 현재 재료 목록이 해당 끼니 재료로 대체됩니다.</div>
        </div>
        <div style={{ overflowY: "auto", padding: "0 18px 24px" }}>
          {filtered.map(({ date, meal }) => (
            <button key={date + meal.id} onClick={() => { onPick(meal); onClose(); }} className="flex flex-col" style={{ width: "100%", textAlign: "left", padding: "10px 12px",
              borderBottom: `1px solid ${C.border}`, background: "transparent", border: "none", borderBottomStyle: "solid", cursor: "pointer" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{date} · {meal.label}</span>
                <span style={{ fontSize: 10.5, color: C.muted }}>{fmtTime(meal.time, timeFmt)}</span>
              </div>
              <MealItemList items={meal.items} fontSize={10.5} wrap />
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12, color: C.muted }}>복사할 수 있는 끼니 기록이 없습니다</div>
          )}
        </div>
    </BottomSheet>
  );
}
