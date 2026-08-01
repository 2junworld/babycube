/* 식단 자동 생성 - 생성 플로우 UI (PR B: ① 기간 선택 → ② 재료 풀 확인/편집 → ③ 규칙 확인/조정)
   실제 생성 알고리즘 실행·미리보기·확정저장은 PR C에서 이어서 구현. 여기서는 규칙을 확정해
   state.settings.autoGenRules에 저장(다음에 열 때 이어서 프리필)하는 데까지만 담당한다. */
import React, { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Refrigerator, Snowflake, Tag, X } from "lucide-react";
import { C, primaryBtn } from "../theme";
import { WD, addDaysISO, pad2, todayISO, uid } from "../lib/dates";
import { catOf, categoryList, currentUnitGOf, stockFridgeG, stockTotalCubes, totalG } from "../state/appState";
import { useStore } from "../store";
import { MealItemList, NumInput, Segmented, SubHeader, BottomSheet } from "../components/common";
import { IngredientPicker } from "../components/pickers";
import { PlanItemsEditor, usePlanItemsEditor } from "../components/planEditor";
import {
  COMMON_FISH_NAMES,
  INGREDIENT_RULE_PRESETS,
  avgServingGFromLogs,
  buildIngredientPool,
  checkRuleConflicts,
  enumerateDates,
  generatePlan,
  stapleComboTotalG,
  stapleStorageTypeOf,
  validateAutoGenRules,
  withStockOnly,
} from "../lib/autoGen";

/* =====================================================================
   ① 기간 선택 - 범위(시작~끝) 캘린더 + N일/N주 빠른 선택. 과거 날짜는 선택 불가.
   캘린더는 두 번 클릭으로 시작~종료를 지정(첫 클릭=시작, 두 번째 클릭=종료 - 시작보다 이르면 스왑)
   ===================================================================== */
function PeriodStep({ range, setRange, onNext }) {
  const { state } = useStore();
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [quickN, setQuickN] = useState(1);
  const [quickUnit, setQuickUnit] = useState("week"); // "day" | "week"
  const t = todayISO();
  const year = monthCursor.getFullYear(), month = monthCursor.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const isoOf = (d) => `${year}-${pad2(month + 1)}-${pad2(d)}`;
  const shiftMonth = (n) => setMonthCursor(new Date(year, month + n, 1));

  // 첫 클릭은 시작일(종료일 미확정 상태로), 두 번째 클릭이 종료일을 확정(시작일보다 이르면 서로 바꿈).
  // 이미 시작~종료가 다 정해진 상태에서 또 클릭하면 그 날짜로 새로 시작
  const pickDate = (iso) => {
    if (iso < t) return; // 과거 선택 불가
    if (!range.start || range.end) { setRange({ start: iso, end: null }); return; }
    if (iso < range.start) { setRange({ start: iso, end: range.start }); return; }
    setRange({ start: range.start, end: iso });
  };
  const applyQuick = () => {
    const n = Math.max(1, Number(quickN) || 1);
    const days = quickUnit === "week" ? n * 7 : n;
    setRange({ start: t, end: addDaysISO(t, days - 1) });
  };
  const inRange = (iso) => range.start && range.end && iso >= range.start && iso <= range.end;
  const dayCount = range.start && range.end ? (Math.round((new Date(range.end) - new Date(range.start)) / 86400000) + 1) : 0;

  return (
    <div style={{ padding: "10px 18px 100px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}>
        식단을 자동으로 채울 기간을 골라주세요. 이미 계획이 있는 날짜에도 새로 생성할 수 있어요(기존 끼니는 그대로 두고 채워지지 않은 끼니만 추가돼요).
      </div>

      <div style={{ background: C.sageLight, borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, marginBottom: 8 }}>오늘부터 빠른 선택</div>
        <div className="flex items-center" style={{ gap: 8 }}>
          <NumInput value={quickN} onChange={setQuickN} width={44} min={1} max={52} />
          <Segmented value={quickUnit} onChange={setQuickUnit} options={[{ value: "day", label: "일" }, { value: "week", label: "주" }]} />
          <button onClick={applyQuick} style={{ flex: 1, background: C.sage, border: "none", borderRadius: 10, padding: "9px 0", fontSize: 12.5, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
            적용
          </button>
        </div>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <button onClick={() => shiftMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronLeft size={16} color={C.muted} /></button>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{year}년 {month + 1}월</span>
          <button onClick={() => shiftMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronRight size={16} color={C.muted} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {WD.map((d) => <span key={d} style={{ fontSize: 10, color: C.muted, fontWeight: 700, textAlign: "center" }}>{d}</span>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const iso = isoOf(d);
            const isPast = iso < t;
            const isToday = iso === t;
            const sel = inRange(iso);
            const isEdge = iso === range.start || iso === range.end;
            const hasPlan = (state.plans[iso] || []).length > 0;
            return (
              <button key={i} disabled={isPast} onClick={() => pickDate(iso)} className="flex flex-col items-center justify-center"
                style={{ height: 38, borderRadius: 9, cursor: isPast ? "default" : "pointer", opacity: isPast ? 0.35 : 1,
                  background: isEdge ? C.sage : sel ? C.sageLight : "transparent",
                  border: isToday && !isEdge ? `1.5px solid ${C.sage}` : "1px solid transparent" }}>
                <span style={{ fontSize: 11.5, fontWeight: isEdge ? 700 : 500, color: isEdge ? "#fff" : C.inkSoft }}>{d}</span>
                <div style={{ width: 4, height: 4, borderRadius: 999, marginTop: 2, background: hasPlan ? (isEdge ? "#fff" : C.sage) : "transparent" }} />
              </button>
            );
          })}
        </div>
        <div className="flex items-center" style={{ gap: 14, marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}`, flexWrap: "wrap" }}>
          <div className="flex items-center" style={{ gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: C.sage, display: "inline-block" }} /><span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>선택 범위</span></div>
          <div className="flex items-center" style={{ gap: 5 }}><span style={{ width: 4, height: 4, borderRadius: 999, background: C.sage, display: "inline-block" }} /><span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>계획 있음</span></div>
        </div>
      </div>

      {range.start && (
        <div style={{ background: C.sageLight, borderRadius: 12, padding: "10px 14px", fontSize: 12.5, fontWeight: 700, color: C.sageDeep, textAlign: "center" }}>
          {!range.end ? `${range.start} 선택됨 - 종료일을 눌러주세요` : range.start === range.end ? `${range.start} (1일)` : `${range.start} ~ ${range.end} (${dayCount}일)`}
        </div>
      )}

      <button onClick={onNext} disabled={!range.start || !range.end} style={{ ...primaryBtn,
        background: range.start && range.end ? C.sage : C.sageLight, color: range.start && range.end ? "#fff" : C.muted, cursor: range.start && range.end ? "pointer" : "default" }}>
        다음
      </button>
    </div>
  );
}

/* =====================================================================
   ② 재료 풀 확인/편집 - 재고가 있는 재료를 기본으로 보여주고(체크됨), 재고 없는 재료는
   "재료 선택" 버튼(식단표 재료 추가와 동일한 피커)으로 필요할 때만 추가. 한 줄짜리 압축 카드로
   냉동/냉장 유형(아이콘 토글) + 1회 급여량(급여 기록 있으면 평균으로 프리필) + 라벨을 다룸.
   ===================================================================== */
function PoolStep({ checked, setChecked, includeObserving, setIncludeObserving, includeCaution, setIncludeCaution, perIngredientG, setPerIngredientG, perIngredientType, setPerIngredientType, onBack, onNext }) {
  const { state, dispatch } = useStore();
  const [picker, setPicker] = useState(false);
  const [labelInputFor, setLabelInputFor] = useState(null);
  const [labelDraft, setLabelDraft] = useState("");

  const introOf = (name) => (state.intros || []).find((it) => it.name === name);
  // 기본 노출: 이상없음(+토글 켜면 관찰중·주의)이면서 실제 재고가 있는 재료만. 나머지는 아래
  // "재료 선택" 버튼으로 필요할 때만 불러옴 - 그렇게 고른 재료(checked)는 재고가 없어도 계속 보여줌.
  // 탄수화물(주식) 재료는 여기서 다루지 않음 - 주식은 다음 단계(규칙 확인)에서 조합으로 따로 구성함
  const stockNames = useMemo(
    () => withStockOnly(state, buildIngredientPool(state, { includeObserving, includeCaution })).filter((n) => catOf(state, n) !== "탄수화물"),
    [state.intros, state.stock, includeObserving, includeCaution]
  );
  const allVisible = useMemo(() => [...new Set([...stockNames, ...checked])].filter((n) => catOf(state, n) !== "탄수화물"), [stockNames, checked]);
  const cats = categoryList(state).filter((c) => c.name !== "탄수화물");
  const grouped = cats.map((c) => ({ cat: c, names: allVisible.filter((n) => catOf(state, n) === c.name) })).filter((g) => g.names.length > 0);

  const toggleName = (n) => setChecked((prev) => { const next = new Set(prev); if (next.has(n)) next.delete(n); else next.add(n); return next; });
  // 피커에서 고른 재료를 추가 - "중단" 상태 재료는 자동 생성에서 항상 제외되므로 안전하게 걸러내고,
  // 탄수화물(주식)은 이 화면에서 다루지 않으므로 함께 걸러냄(다음 단계에서 조합으로 설정)
  const addFromPicker = (names) => {
    setPicker(false);
    const blocked = new Set((state.intros || []).filter((it) => it.status === "중단").map((it) => it.name));
    setChecked((p) => new Set([...p, ...names.filter((n) => !blocked.has(n) && catOf(state, n) !== "탄수화물")]));
  };

  const addLabel = (name, label) => {
    const trimmed = (label || "").trim();
    if (!trimmed) return;
    const cur = state.ingredients[name]?.labels || [];
    if (cur.includes(trimmed)) return;
    dispatch({ type: "INGREDIENT_SET_META", name, patch: { labels: [...cur, trimmed] } });
  };
  const removeLabel = (name, label) => {
    const cur = state.ingredients[name]?.labels || [];
    dispatch({ type: "INGREDIENT_SET_META", name, patch: { labels: cur.filter((l) => l !== label) } });
  };
  // 앱 전체 재료에 이미 쓰인 라벨 목록 - 새 라벨을 매번 새로 타이핑하지 않고 골라 쓸 수 있게
  const allLabels = useMemo(() => {
    const s = new Set();
    Object.values(state.ingredients || {}).forEach((ing) => (ing?.labels || []).forEach((l) => s.add(l)));
    return [...s].sort((a, b) => a.localeCompare(b, "ko"));
  }, [state.ingredients]);
  const suggestionsFor = (n) => {
    const cur = state.ingredients[n]?.labels || [];
    const q = labelDraft.trim();
    return allLabels.filter((l) => !cur.includes(l) && (!q || l.includes(q))).slice(0, 8);
  };

  // 재료 유형(냉동/냉장) - 아직 사용자가 고르지 않았다면 실제 재고 구성을 보고 화면에서만 똑똑하게
  // 기본값을 잡아줌(냉장 재고뿐이면 냉장, 그 외엔 냉동) - 저장은 사용자가 실제로 건드렸을 때만 됨.
  // 유형에 따라 입력창 단위가 큐브 개수 ↔ 중량(g)으로 바뀌지만, 내부적으로는 항상 그램(perIngredientG)
  // 으로 환산해 저장(생성 시점엔 resolveStorageType이 실제 재고를 기준으로 다시 판단함)
  const typeOf = (n) => {
    if (perIngredientType[n]) return perIngredientType[n];
    return stockTotalCubes(state, n) === 0 && stockFridgeG(state, n) > 0 ? "fridge" : "frozen";
  };
  const setType = (n, type) => setPerIngredientType((p) => ({ ...p, [n]: type }));
  const unitGOfName = (n) => currentUnitGOf(state, n) || 15;
  const displayQty = (n) => {
    const g = perIngredientG[n];
    if (g == null) return 0;
    return typeOf(n) === "frozen" ? Math.round(g / unitGOfName(n)) : g;
  };
  const setQty = (n, v) => setPerIngredientG((p) => {
    const next = { ...p };
    if (!v) { delete next[n]; return next; }
    next[n] = typeOf(n) === "frozen" ? v * unitGOfName(n) : v;
    return next;
  });
  // 급여 기록이 있으면 평균값을 "입력해두는" 대신 회색 placeholder 힌트로만 보여줌 - 예전엔 실제
  // 입력값으로 채워 넣었는데, 그러면 재료 대부분이 이 값으로 강제 고정돼서(재료별 값이 끼니별 목표
  // 총량보다 항상 우선함) 다음 단계에서 끼니별 목표 총량을 바꿔도 반영되는 게 거의 없었음(제보 확인).
  // 참고만 하고 싶으면 그대로 두고, 이 재료만 특별히 고정하고 싶을 때만 직접 입력하면 됨
  const hintQty = (n) => {
    const avg = avgServingGFromLogs(state, n);
    if (avg == null) return undefined;
    return String(typeOf(n) === "frozen" ? Math.max(1, Math.round(avg / unitGOfName(n))) : avg);
  };

  return (
    <div style={{ padding: "10px 18px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}>
        재고가 있는 재료를 기본으로 보여드려요. 재고가 없는 재료를 쓰려면 아래 '재료 선택'으로 추가해 주세요.
        1회 급여량은 비워두면 다음 단계에서 정할 '끼니당 목표 총량'을 재료 수만큼 나눠서 쓰고, 직접 입력하면 그 재료는 항상 그 양으로 고정돼요(급여 기록이 있으면 회색 숫자로 평균치를 참고만 보여드려요).
      </div>
      <div style={{ background: C.sageLight, borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: C.sageDeep, lineHeight: 1.5 }}>
        밥·죽 같은 주식(탄수화물)은 여기서 고르지 않아요 - 다음 단계인 '규칙 확인'에서 따로 설정할 수 있어요.
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>관찰중 재료 포함</span>
          <Segmented value={includeObserving ? "on" : "off"} onChange={(v) => setIncludeObserving(v === "on")} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
        </div>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>주의 재료 포함</span>
          <Segmented value={includeCaution ? "on" : "off"} onChange={(v) => setIncludeCaution(v === "on")} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
        </div>
      </div>

      {grouped.map(({ cat, names }) => (
        <div key={cat.id}>
          <div className="flex items-center" style={{ gap: 6, marginBottom: 4, padding: "0 2px" }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: cat.color, display: "inline-block" }} />
            <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>{cat.name}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {names.map((n) => {
              const st = introOf(n)?.status;
              const labels = state.ingredients[n]?.labels || [];
              const suggestFish = COMMON_FISH_NAMES.includes(n) && !labels.includes("생선");
              const type = typeOf(n);
              const hasLabelUi = labels.length > 0 || labelInputFor === n || suggestFish;
              return (
                <div key={n} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "5px 8px" }}>
                  <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
                    <button onClick={() => toggleName(n)} style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${checked.has(n) ? C.sage : C.border}`, background: checked.has(n) ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", padding: 0 }}>
                      {checked.has(n) && <span style={{ width: 6, height: 6, background: "#fff", borderRadius: 1.5 }} />}
                    </button>
                    <span onClick={() => toggleName(n)} style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, cursor: "pointer" }}>{n}</span>
                    {(st === "관찰중" || st === "주의") && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: st === "주의" ? C.apricot : C.sageDeep, background: st === "주의" ? C.apricotLight : C.sageLight, borderRadius: 999, padding: "1.5px 5px" }}>{st}</span>
                    )}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setType(n, type === "frozen" ? "fridge" : "frozen")} title={type === "frozen" ? "냉동" : "냉장"}
                      style={{ width: 22, height: 22, borderRadius: 6, background: C.sageLight, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      {type === "frozen" ? <Snowflake size={12} color={C.sageDeep} /> : <Refrigerator size={12} color={C.sageDeep} />}
                    </button>
                    <NumInput value={displayQty(n)} onChange={(v) => setQty(n, v)} placeholder={hintQty(n) || "0"} suffix={type === "frozen" ? "큐브" : "g"} width={34} max={type === "frozen" ? 50 : 2000} />
                    <button onClick={() => { setLabelInputFor(labelInputFor === n ? null : n); setLabelDraft(""); }} style={{ background: "transparent", border: "none", padding: 2, cursor: "pointer", display: "flex", flexShrink: 0 }}>
                      <Tag size={12} color={labels.length > 0 ? C.sageDeep : C.muted} />
                    </button>
                  </div>
                  {hasLabelUi && (
                    <div style={{ marginTop: 4, paddingLeft: 20 }}>
                      <div className="flex items-center" style={{ gap: 4, flexWrap: "wrap" }}>
                        {labels.map((l) => (
                          <span key={l} className="flex items-center" style={{ gap: 2, fontSize: 9.5, fontWeight: 700, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "2px 3px 2px 6px" }}>
                            {l}
                            <button onClick={() => removeLabel(n, l)} style={{ background: "none", border: "none", padding: 1, cursor: "pointer", display: "flex" }}><X size={8} color={C.sageDeep} /></button>
                          </span>
                        ))}
                        {labelInputFor === n && (
                          <input autoFocus value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { addLabel(n, labelDraft); setLabelDraft(""); } if (e.key === "Escape") setLabelInputFor(null); }}
                            onBlur={() => { addLabel(n, labelDraft); setLabelDraft(""); setLabelInputFor(null); }}
                            placeholder="라벨 입력 또는 아래에서 선택" style={{ width: 140, fontSize: 10.5, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px", outline: "none" }} />
                        )}
                        {suggestFish && labelInputFor !== n && (
                          <button onClick={() => addLabel(n, "생선")} style={{ fontSize: 9.5, fontWeight: 700, color: C.apricot, background: C.apricotLight, border: "none", borderRadius: 999, padding: "2px 6px", cursor: "pointer" }}>
                            생선 라벨 +
                          </button>
                        )}
                      </div>
                      {labelInputFor === n && suggestionsFor(n).length > 0 && (
                        <div className="flex items-center" style={{ gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                          {suggestionsFor(n).map((l) => (
                            <button key={l} onMouseDown={(e) => e.preventDefault()} onClick={() => { addLabel(n, l); setLabelDraft(""); }}
                              style={{ fontSize: 9.5, fontWeight: 600, color: C.inkSoft, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px", cursor: "pointer" }}>
                              {l}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button onClick={() => setPicker(true)} className="flex items-center justify-center" style={{ width: "100%", gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
        <Plus size={14} /> 재료 선택 (재고 없는 재료 추가)
      </button>

      <div className="flex items-center" style={{ gap: 8 }}>
        <button onClick={onBack} style={{ ...primaryBtn, flex: 1, background: C.sageLight, color: C.inkSoft }}>이전</button>
        <button onClick={onNext} disabled={checked.size === 0} style={{ ...primaryBtn, flex: 2, background: checked.size > 0 ? C.sage : C.sageLight, color: checked.size > 0 ? "#fff" : C.muted, cursor: checked.size > 0 ? "pointer" : "default" }}>
          다음 ({checked.size}개 선택됨)
        </button>
      </div>
      {picker && (
        <IngredientPicker multi onPick={addFromPicker} alreadyAdded={[...checked]} onClose={() => setPicker(false)} />
      )}
    </div>
  );
}

/* =====================================================================
   ③ 규칙 확인/조정 - 카테고리별 개수, 주식 설정, 의학적 권고 프리셋(토글+근거),
   다양성 규칙, 재고 우선순위, 시판 제품 포함 여부. 확인 시 settings.autoGenRules에 저장.
   ===================================================================== */
function RulesStep({ rules, setRules, pool, removedNotice, onBack, onFinish }) {
  const { state, notify } = useStore();
  const cats = categoryList(state).filter((c) => c.name !== "탄수화물"); // 탄수화물은 카테고리 슬롯이 아니라 아래 주식 조합으로 따로 다룸
  const conflicts = useMemo(() => checkRuleConflicts(state, rules, pool), [state, rules, pool]);
  const [comboPicker, setComboPicker] = useState(false);

  const setCatRange = (id, patch) => setRules((r) => ({ ...r, perMeal: { ...r.perMeal, categoryCounts: { ...r.perMeal.categoryCounts, [id]: { ...r.perMeal.categoryCounts[id], ...patch } } } }));
  const setIngredientRule = (id, patch) => setRules((r) => ({ ...r, ingredientRules: r.ingredientRules.map((ir) => (ir.id === id ? { ...ir, ...patch } : ir)) }));
  const setMealTargetG = (label, v) => setRules((r) => {
    const next = { ...r.perMeal.targetGByLabel };
    if (!v) delete next[label]; else next[label] = v;
    return { ...r, perMeal: { ...r.perMeal, targetGByLabel: next } };
  });
  const ruleFor = (preset) => rules.ingredientRules.find((ir) => ir.preset === preset);

  // 주식 재료도 재료 풀과 같은 저장형태(냉동 큐브/냉장 계량) 선택을 공유(rules.perMeal.perIngredientType).
  // generatePlan()이 실제 생성 시점에 쓰는 stapleStorageTypeOf()와 반드시 같은 판단을 써야 함 - 예전엔
  // 화면은 이 로직을 따로 복제해서 쓰고 generatePlan은 resolveStorageType(재고가 사용자 선택을 덮어씀)을
  // 써서, 화면엔 "냉장"으로 보여도 실제로는 남아있는 냉동 재고 때문에 큐브로 반올림돼 생성되는
  // 불일치가 있었음(사용자가 실제로 겪은 문제)
  const stapleTypeOf = (name) => stapleStorageTypeOf(state, name, rules);
  const setStapleType = (name, type) => setRules((r) => ({ ...r, perMeal: { ...r.perMeal, perIngredientType: { ...r.perMeal.perIngredientType, [name]: type } } }));
  const comboUnitGOf = (name) => currentUnitGOf(state, name) || 15;
  // 냉동(큐브) 재료는 실제로는 항상 "큐브 개수 x 큐브 중량"으로만 배치될 수 있어서, 여기서 그램을
  // 그대로 저장해두면 생성 시점에 큐브 개수로 반올림되면서 화면에 입력한 값과 실제 생성된 양이
  // 달라 보이는 문제가 있었음(예: 80g을 넣었는데 큐브 중량이 37g이면 2개(74g)로만 배치됨).
  // 큐브 단위로 딱 맞게 미리 반올림해서 저장하면 입력값 = 실제 생성값이 항상 일치함
  const alignToStorageUnit = (name, g) => (stapleTypeOf(name) === "frozen" ? Math.max(1, Math.round(g / comboUnitGOf(name))) * comboUnitGOf(name) : g);

  // 주식 조합 추가/삭제 - 여러 재료를 하나의 조합으로 묶어 쓰는 경우(예: 잡곡밥+오트밀)를 지원.
  // 피커에서 고른 재료 중 탄수화물이 아닌 게 섞여 있으면 조용히 걸러내고 안내(주식 조합은 탄수화물 재료로만 구성)
  const addCombo = (names) => {
    setComboPicker(false);
    const carbNames = names.filter((n) => catOf(state, n) === "탄수화물");
    if (carbNames.length === 0) { notify("주식 조합은 탄수화물 카테고리 재료로만 구성할 수 있어요"); return; }
    if (carbNames.length < names.length) notify("탄수화물이 아닌 재료는 조합에서 제외했어요");
    const perMemberG = Math.max(10, Math.round(rules.staple.defaultG / carbNames.length));
    const gramsByName = {};
    carbNames.forEach((n) => { gramsByName[n] = alignToStorageUnit(n, perMemberG); });
    setRules((r) => ({ ...r, staple: { ...r.staple, combos: [...(r.staple.combos || []), { id: uid(), names: carbNames, gramsByName }] } }));
  };
  const removeCombo = (comboId) => setRules((r) => ({ ...r, staple: { ...r.staple, combos: r.staple.combos.filter((c) => c.id !== comboId) } }));
  const setComboGram = (comboId, name, v) => setRules((r) => ({
    ...r,
    staple: { ...r.staple, combos: r.staple.combos.map((c) => (c.id === comboId ? { ...c, gramsByName: { ...c.gramsByName, [name]: v } } : c)) },
  }));
  // 재료 풀 화면과 동일하게, 냉동(큐브) 재료는 입력창에 그램이 아니라 큐브 개수를 보여주고 그 개수를
  // 그대로 저장(내부적으로는 항상 그램으로 환산해 gramsByName에 저장) - 이러면 입력창에 보이는 숫자와
  // 실제 생성 결과가 항상 정확히 일치함(중간에 그램->큐브 반올림이 안 보이는 곳에서 몰래 끼어들지 않음)
  const comboDisplayQty = (name, g) => {
    if (g == null) return 0;
    return stapleTypeOf(name) === "frozen" ? Math.round(g / comboUnitGOf(name)) : g;
  };
  const setComboQty = (comboId, name, v) => setComboGram(comboId, name, stapleTypeOf(name) === "frozen" ? v * comboUnitGOf(name) : v);
  const canFinish = !rules.staple.includeEveryMeal || (rules.staple.combos || []).length > 0;
  // 조합 총 급여량이 어느 끼니의 목표 총량보다 많으면 그 끼니는 다른 재료가 들어갈 자리가 부족해짐 -
  // 재료별 급여량을 조정하는 동안 바로바로 알 수 있게 조합 카드에 인라인으로 표시
  const mealTargets = useMemo(
    () => (state.mealSlots.length > 0 ? state.mealSlots : [{ label: "끼니" }]).map((s) => ({
      label: s.label,
      g: (rules.perMeal.targetGByLabel && rules.perMeal.targetGByLabel[s.label]) || rules.perMeal.targetTotalG,
    })),
    [state.mealSlots, rules.perMeal.targetGByLabel, rules.perMeal.targetTotalG]
  );

  return (
    <div style={{ padding: "10px 18px 100px", display: "flex", flexDirection: "column", gap: 16 }}>
      {removedNotice > 0 && (
        <div style={{ background: C.apricotLight, borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: "#9A4A1E", lineHeight: 1.5 }}>
          삭제된 카테고리를 참조하던 규칙 {removedNotice}개를 정리했어요.
        </div>
      )}
      {conflicts.map((w, i) => (
        <div key={i} style={{ background: C.apricotLight, borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: "#9A4A1E", lineHeight: 1.5 }}>{w}</div>
      ))}

      <div style={{ background: C.sageLight, borderRadius: 10, padding: "10px 12px", fontSize: 11, color: C.sageDeep, lineHeight: 1.5 }}>
        재료 선택 시 앱의 궁합 정보(예: 철분+비타민C)도 함께 고려해요 - 궁합 좋은 재료를 우선 배치하고, 주의가 필요한 조합은 최대한 피해요.
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 4 }}>끼니당 목표 총량</div>
        <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 8, lineHeight: 1.4 }}>재료 풀 화면에서 직접 양을 지정한 재료는 여기 목표 총량과 무관하게 그 양 그대로 들어가요. 여기 값은 양을 따로 지정 안 한 재료에만 적용돼요.</div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>기본값</span>
            <NumInput value={rules.perMeal.targetTotalG} onChange={(v) => setRules((r) => ({ ...r, perMeal: { ...r.perMeal, targetTotalG: v } }))} suffix="g" width={44} max={2000} />
          </div>
          {state.mealSlots.map((slot) => (
            <div key={slot.id} className="flex items-center justify-between" style={{ paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
              <span style={{ fontSize: 12, color: C.inkSoft }}>{slot.label}</span>
              <NumInput value={rules.perMeal.targetGByLabel[slot.label] ?? 0} onChange={(v) => setMealTargetG(slot.label, v)} suffix="g (비우면 기본값)" width={44} max={2000} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 8 }}>끼니당 카테고리 구성</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {cats.map((c) => {
            const r = rules.perMeal.categoryCounts[c.id] || { min: 0, max: 0 };
            return (
              <div key={c.id} className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px" }}>
                <div className="flex items-center" style={{ gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: c.color, display: "inline-block" }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{c.name}</span>
                </div>
                <div className="flex items-center" style={{ gap: 10 }}>
                  <NumInput value={r.min} onChange={(v) => setCatRange(c.id, { min: v, max: Math.max(v, r.max) })} suffix="최소" width={34} max={20} />
                  <NumInput value={r.max} onChange={(v) => setCatRange(c.id, { max: v, min: Math.min(v, r.min) })} suffix="최대" width={34} max={20} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center" style={{ gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>주식 설정</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.apricot }}>*필수</span>
        </div>
        <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 8, lineHeight: 1.4 }}>밥·죽 같은 주식 재료(들)를 조합으로 등록해두면, 끼니마다 그중 하나를 골라 함께 넣어요. 예: 잡곡밥+오트밀처럼 여러 재료를 묶어 하나의 조합으로 쓸 수 있어요. 조합 추가 시 재료별 급여량은 끼니당 급여량을 구성원 수로 나눠 채워지며, 필요하면 재료별로 직접 조정할 수 있어요.</div>
        {!canFinish && (
          <div style={{ background: C.apricotLight, borderRadius: 10, padding: "8px 10px", fontSize: 11, color: "#9A4A1E", lineHeight: 1.5, marginBottom: 8 }}>
            '매 끼니 자동 포함'이 켜져 있으면 주식 조합을 최소 1개 등록해야 다음으로 진행할 수 있어요. (필요 없으면 자동 포함을 꺼주세요)
          </div>
        )}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>매 끼니 자동 포함</span>
            <Segmented value={rules.staple.includeEveryMeal ? "on" : "off"} onChange={(v) => setRules((r) => ({ ...r, staple: { ...r.staple, includeEveryMeal: v === "on" } }))} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>끼니당 급여량</span>
            <NumInput value={rules.staple.defaultG} onChange={(v) => setRules((r) => ({ ...r, staple: { ...r.staple, defaultG: v } }))} suffix="g" width={44} max={2000} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: (rules.staple.combos || []).length > 0 ? 4 : 0, borderTop: (rules.staple.combos || []).length > 0 ? `1px dashed ${C.border}` : "none" }}>
            {(rules.staple.combos || []).map((combo) => {
              const comboTotal = stapleComboTotalG(state, rules, combo);
              const exceeded = mealTargets.filter((t) => comboTotal > t.g);
              return (
                <div key={combo.id} style={{ background: C.sageLight, borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.sageDeep }}>{combo.names.join(" + ")}</span>
                    <button onClick={() => removeCombo(combo.id)} style={{ fontSize: 11, color: C.muted, background: "none", border: "none", padding: "2px 4px" }}>삭제</button>
                  </div>
                  {combo.names.map((name) => {
                    const type = stapleTypeOf(name);
                    const curG = (combo.gramsByName || {})[name] ?? 0;
                    return (
                      <div key={name} className="flex items-center justify-between" style={{ gap: 6 }}>
                        <span style={{ fontSize: 11.5, color: C.inkSoft }}>{name}</span>
                        <div className="flex items-center" style={{ gap: 6 }}>
                          <button
                            onClick={() => {
                              const nextType = type === "frozen" ? "fridge" : "frozen";
                              setStapleType(name, nextType);
                              // 냉동으로 바꾸면 지금 그램 값을 큐브 개수에 딱 맞게 다시 맞춰서, 입력창에
                              // 보이는 숫자와 실제 생성 결과가 어긋나지 않게 함
                              if (nextType === "frozen") setComboGram(combo.id, name, Math.max(1, Math.round(curG / comboUnitGOf(name))) * comboUnitGOf(name));
                            }}
                            title={type === "frozen" ? "냉동" : "냉장"}
                            style={{ width: 22, height: 22, borderRadius: 6, background: C.surface, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                            {type === "frozen" ? <Snowflake size={12} color={C.sageDeep} /> : <Refrigerator size={12} color={C.sageDeep} />}
                          </button>
                          <NumInput value={comboDisplayQty(name, curG)} onChange={(v) => setComboQty(combo.id, name, v)} suffix={type === "frozen" ? "큐브" : "g"} width={44} max={type === "frozen" ? 50 : 2000} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between" style={{ paddingTop: 4, borderTop: `1px dashed ${C.border}` }}>
                    <span style={{ fontSize: 10.5, color: C.muted }}>조합 합계</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: exceeded.length > 0 ? "#9A4A1E" : C.inkSoft }}>{comboTotal}g</span>
                  </div>
                  {Math.abs(comboTotal - rules.staple.defaultG) > combo.names.length && (
                    <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.4 }}>
                      끼니당 급여량({rules.staple.defaultG}g)과 달라요 - 이 조합은 재료별로 지정한 값의 합({comboTotal}g)으로 생성돼요.
                    </div>
                  )}
                  {exceeded.length > 0 && (
                    <div style={{ fontSize: 10.5, color: "#9A4A1E", lineHeight: 1.4 }}>
                      ⚠ '{exceeded.reduce((a, b) => (a.g < b.g ? a : b)).label}' 목표 총량({exceeded.reduce((a, b) => (a.g < b.g ? a : b)).g}g)보다 많아요 - 다른 재료가 들어갈 자리가 부족해질 수 있어요.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={() => setComboPicker(true)} style={{ fontSize: 12, fontWeight: 700, color: C.sageDeep, background: "none", border: `1px dashed ${C.sage}`, borderRadius: 8, padding: "8px 0" }}>+ 조합 추가</button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 8 }}>의학적 권고 규칙</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {INGREDIENT_RULE_PRESETS.map((preset) => {
            const rule = ruleFor(preset.preset);
            if (!rule) return null;
            return (
              <div key={preset.preset} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{preset.label}</span>
                  <Segmented value={rule.enabled ? "on" : "off"} onChange={(v) => setIngredientRule(rule.id, { enabled: v === "on" })} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
                </div>
                <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.5, marginTop: 4 }}>{preset.rationale}</div>
                {rule.enabled && rule.type === "requireDaily" && (
                  <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>대상 재료</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep }}>{rule.ingredient}</span>
                  </div>
                )}
                {rule.enabled && rule.type === "maxPerWeek" && (
                  <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>대상 라벨 '{rule.label}'</span>
                    <div className="flex items-center" style={{ gap: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.ink }}>주당 최대</span>
                      <NumInput value={rule.value} onChange={(v) => setIngredientRule(rule.id, { value: v })} suffix="회" width={34} max={21} />
                    </div>
                  </div>
                )}
                {rule.enabled && rule.type === "categoryFloor" && (
                  <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>끼니당 '{rule.categoryName}' 최소 개수</span>
                    <NumInput value={rule.value} onChange={(v) => setIngredientRule(rule.id, { value: v })} suffix="종" width={34} max={20} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 8 }}>다양성</div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>연속 끼니 반복 금지</span>
              <Segmented value={rules.variety.noConsecutiveMeals ? "on" : "off"} onChange={(v) => setRules((r) => ({ ...r, variety: { ...r.variety, noConsecutiveMeals: v === "on" } }))} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>바로 이전 끼니에 나온 재료는 이번 끼니에서 피해요(주식 제외)</div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>같은 날 반복 허용</span>
              <Segmented value={rules.variety.allowSameDayRepeat ? "on" : "off"} onChange={(v) => setRules((r) => ({ ...r, variety: { ...r.variety, allowSameDayRepeat: v === "on" } }))} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>켜면 같은 날 안에서 같은 재료가 여러 끼니에 반복될 수 있어요(꺼두면 하루 안에서는 최대한 안 겹치게 배치)</div>
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 8 }}>재고</div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>재고 기준으로 생성</span>
            <Segmented value={rules.stock.mode} onChange={(v) => setRules((r) => ({ ...r, stock: { ...r.stock, mode: v } }))} options={[{ value: "stockFirst", label: "재고 우선" }, { value: "ignoreStock", label: "재고 무시" }]} />
          </div>
        </div>
      </div>

      <div className="flex items-center" style={{ gap: 8 }}>
        <button onClick={onBack} style={{ ...primaryBtn, flex: 1, background: C.sageLight, color: C.inkSoft }}>이전</button>
        <button onClick={onFinish} disabled={!canFinish} style={{ ...primaryBtn, flex: 2, background: canFinish ? C.sage : C.sageLight, color: canFinish ? "#fff" : C.muted, cursor: canFinish ? "pointer" : "default" }}>규칙 확인 완료</button>
      </div>
      {comboPicker && (
        <IngredientPicker multi onPick={addCombo} onClose={() => setComboPicker(false)} />
      )}
    </div>
  );
}

/* =====================================================================
   ④ 미리보기 - 생성 결과를 날짜별로 보여줌. 재고가 모자란 항목엔 배지(MealItemList의
   _noStock 처리)가 붙고, 재고 소진 시작일엔 별도 안내가 뜸. 이미 같은 이름의 끼니가 있는
   날짜는 "건너뜀"으로 표시하고 저장 대상에서 제외(기존 계획은 안 건드림).
   ===================================================================== */
function PreviewStep({ dates, genResult, editedPlans, onEditMeal, onRegenerate, onBack, onConfirm }) {
  const { state } = useStore();
  const [showWarnings, setShowWarnings] = useState(false);
  const alreadyExists = (date, label) => (state.plans[date] || []).some((m) => m.label === label);
  const saveCount = dates.reduce((s, d) => s + (editedPlans[d] || []).filter((m) => !alreadyExists(d, m.label)).length, 0);

  return (
    <div style={{ padding: "10px 18px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}>
        생성된 식단을 확인하고 필요하면 끼니별로 수정한 뒤 저장해 주세요. 이미 같은 이름의 끼니가 있는 날짜는 건드리지 않고 건너뛰어요.
      </div>

      {genResult.firstNoStockDate && (
        <div style={{ background: C.apricotLight, borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: "#9A4A1E", lineHeight: 1.5 }}>
          {genResult.firstNoStockDate}부터는 일부 재료의 재고가 모자라요. 그래도 계속 생성은 되고, ⚠ 표시된 재료가 그 대상이에요.
        </div>
      )}
      {genResult.warnings.length > 0 && (
        <div style={{ background: C.sageLight, borderRadius: 10, padding: "10px 12px" }}>
          <button onClick={() => setShowWarnings((v) => !v)} className="flex items-center justify-between" style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep }}>참고할 내용 {genResult.warnings.length}개</span>
            <span style={{ fontSize: 11, color: C.sageDeep }}>{showWarnings ? "접기" : "펼치기"}</span>
          </button>
          {showWarnings && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {genResult.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 10.5, color: C.inkSoft, lineHeight: 1.4 }}>· {w}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {dates.map((date) => {
        const meals = editedPlans[date] || [];
        return (
          <div key={date}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 6, padding: "0 2px" }}>
              {date} ({WD[new Date(date + "T00:00:00").getDay()]})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {meals.map((meal) => {
                const already = alreadyExists(date, meal.label);
                const mT = totalG(state, meal.items);
                return (
                  <div key={meal.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", opacity: already ? 0.55 : 1 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                      <div className="flex items-center" style={{ gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{meal.label}</span>
                        <span style={{ fontSize: 11, color: C.muted }}>{meal.time}</span>
                      </div>
                      {already ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, background: C.sageLight, borderRadius: 999, padding: "2px 7px" }}>이미 있음 - 건너뜀</span>
                      ) : (
                        <button onClick={() => onEditMeal(date, meal)} className="flex items-center" style={{ gap: 3, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                          <Pencil size={12} color={C.muted} /><span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>수정</span>
                        </button>
                      )}
                    </div>
                    <MealItemList items={meal.items} fontSize={12} wrap />
                    <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, marginTop: 6 }}>{mT}g</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <button onClick={onRegenerate} className="flex items-center justify-center" style={{ width: "100%", gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
        다시 생성
      </button>

      <div className="flex items-center" style={{ gap: 8 }}>
        <button onClick={onBack} style={{ ...primaryBtn, flex: 1, background: C.sageLight, color: C.inkSoft }}>이전</button>
        <button onClick={onConfirm} disabled={saveCount === 0} style={{ ...primaryBtn, flex: 2, background: saveCount > 0 ? C.sage : C.sageLight, color: saveCount > 0 ? "#fff" : C.muted, cursor: saveCount > 0 ? "pointer" : "default" }}>
          {saveCount > 0 ? `확정 저장 (${saveCount}개 끼니)` : "저장할 끼니가 없어요"}
        </button>
      </div>
    </div>
  );
}

// 미리보기 화면에서 끼니 하나를 부분 수정 - 식단표 끼니 편집과 같은 PlanItemsEditor를 재사용
function MealEditOverlay({ date, meal, onSave, onCancel }) {
  const { state } = useStore();
  const editor = usePlanItemsEditor(meal.items);
  const [picker, setPicker] = useState(false);
  const total = totalG(state, editor.items);
  const addItems = (names) => { setPicker(false); editor.addNames(names); };

  return (
    <BottomSheet title={`${meal.label} 수정 (${date.slice(5)})`} onClose={onCancel} maxHeight="85%">
      <div style={{ padding: "0 18px 18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="flex items-center justify-between" style={{ padding: "0 2px" }}>
          <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>끼니 총량</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{total}g</span>
        </div>
        <PlanItemsEditor editor={editor} />
        <button onClick={() => { setPicker(true); }} className="flex items-center justify-center" style={{ width: "100%", gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
          <Plus size={14} /> 재료 추가
        </button>
        <button onClick={() => onSave(editor.items)} style={primaryBtn}>이 끼니 수정 완료</button>
      </div>
      {picker && (
        <IngredientPicker multi onPick={addItems} alreadyAdded={editor.items.filter((it) => it.source !== "product").map((it) => it.name)} onClose={() => setPicker(false)} />
      )}
    </BottomSheet>
  );
}

/* =====================================================================
   전체 플로우
   ===================================================================== */
export function AutoGenFlowScreen({ onBack }) {
  const { state, dispatch } = useStore();
  const [step, setStep] = useState("period");
  const [range, setRange] = useState({ start: null, end: null });
  const [checked, setChecked] = useState(() => new Set(withStockOnly(state, buildIngredientPool(state)).filter((n) => catOf(state, n) !== "탄수화물")));
  const [includeObserving, setIncludeObserving] = useState(false);
  const [includeCaution, setIncludeCaution] = useState(false);
  const [perIngredientGDraft, setPerIngredientGDraft] = useState({});
  const [perIngredientTypeDraft, setPerIngredientTypeDraft] = useState({});
  const [rulesState, setRulesState] = useState(null);
  const [removedNotice, setRemovedNotice] = useState(0);
  const [genResult, setGenResult] = useState(null); // { plansByDate, firstNoStockDate, warnings }
  const [editedPlans, setEditedPlans] = useState(null); // date -> meals[] (미리보기에서 부분 수정한 결과)
  const [editingMeal, setEditingMeal] = useState(null); // { date, meal }
  const [saveResult, setSaveResult] = useState(null); // { applied, skipped }

  const dates = useMemo(() => (range.start && range.end ? enumerateDates(range.start, range.end) : []), [range.start, range.end]);

  const enterRules = () => {
    const { rules, removedCount } = validateAutoGenRules(state, state.settings.autoGenRules);
    setRulesState({
      ...rules,
      perMeal: {
        ...rules.perMeal,
        perIngredientG: { ...rules.perMeal.perIngredientG, ...perIngredientGDraft },
        perIngredientType: { ...rules.perMeal.perIngredientType, ...perIngredientTypeDraft },
      },
    });
    setRemovedNotice(removedCount);
    setStep("rules");
  };

  const runGenerate = (rules) => {
    const result = generatePlan(state, { dates, pool: [...checked], rules });
    setGenResult(result);
    setEditedPlans(structuredClone(result.plansByDate));
  };

  const finish = () => {
    dispatch({ type: "AUTOGEN_RULES_SAVE", rules: rulesState });
    runGenerate(rulesState);
    setStep("preview");
  };

  const saveMealEdit = (items) => {
    setEditedPlans((p) => ({
      ...p,
      [editingMeal.date]: p[editingMeal.date].map((m) => (m.id === editingMeal.meal.id ? { ...m, items } : m)),
    }));
    setEditingMeal(null);
  };

  const confirmSave = () => {
    let applied = 0, skipped = 0;
    dates.forEach((date) => {
      (editedPlans[date] || []).forEach((meal) => {
        if ((state.plans[date] || []).some((m) => m.label === meal.label)) { skipped++; return; }
        const items = meal.items.map((it) => ({ name: it.name, qty: it.qty, unitG: it.unitG, gramsOverride: it.gramsOverride != null ? it.gramsOverride : null }));
        dispatch({ type: "PLAN_SAVE_MEAL", date, meal: { id: meal.id, label: meal.label, time: meal.time, items, fromAutoGen: true } });
        applied++;
      });
    });
    setSaveResult({ applied, skipped });
    setStep("done");
  };

  const titles = { period: "자동 생성 - 기간 선택", pool: "자동 생성 - 재료 풀", rules: "자동 생성 - 규칙 확인", preview: "자동 생성 - 미리보기", done: "자동 생성 완료" };
  const backOf = { period: onBack, pool: () => setStep("period"), rules: () => setStep("pool"), preview: () => setStep("rules"), done: onBack };

  if (step === "done" && saveResult) {
    return (
      <div style={{ paddingBottom: 90 }}>
        <SubHeader title={titles.done} onBack={onBack} />
        <div style={{ padding: "30px 24px", display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center" }}>
          <Check size={34} color={C.sage} />
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, lineHeight: 1.5 }}>
            {saveResult.applied}개 끼니를 저장했어요{saveResult.skipped > 0 ? `\n(${saveResult.skipped}개는 이미 있는 끼니라 건너뜀)` : ""}
          </div>
          <button onClick={onBack} style={{ ...primaryBtn, maxWidth: 200 }}>확인</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <SubHeader title={titles[step]} onBack={backOf[step]} />
      {step === "period" && <PeriodStep range={range} setRange={setRange} onNext={() => setStep("pool")} />}
      {step === "pool" && (
        <PoolStep
          checked={checked} setChecked={setChecked}
          includeObserving={includeObserving} setIncludeObserving={setIncludeObserving}
          includeCaution={includeCaution} setIncludeCaution={setIncludeCaution}
          perIngredientG={perIngredientGDraft} setPerIngredientG={setPerIngredientGDraft}
          perIngredientType={perIngredientTypeDraft} setPerIngredientType={setPerIngredientTypeDraft}
          onBack={() => setStep("period")} onNext={enterRules}
        />
      )}
      {step === "rules" && rulesState && (
        <RulesStep rules={rulesState} setRules={setRulesState} pool={[...checked]} removedNotice={removedNotice} onBack={() => setStep("pool")} onFinish={finish} />
      )}
      {step === "preview" && genResult && editedPlans && (
        <PreviewStep
          dates={dates} genResult={genResult} editedPlans={editedPlans}
          onEditMeal={(date, meal) => setEditingMeal({ date, meal })}
          onRegenerate={() => runGenerate(rulesState)}
          onBack={() => setStep("rules")} onConfirm={confirmSave}
        />
      )}
      {editingMeal && (
        <MealEditOverlay date={editingMeal.date} meal={editingMeal.meal} onSave={saveMealEdit} onCancel={() => setEditingMeal(null)} />
      )}
    </div>
  );
}
