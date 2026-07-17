/* 식단표 탭 - 일/주/월 뷰, 끼니 편집, 여러 날짜 일괄 저장 */
import React, { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Check } from "lucide-react";
import { C } from "../theme";
import { WD, addDaysISO, fmtTime, pad2, todayISO, uid } from "../lib/dates";
import { totalG, unitGOf } from "../state/appState";
import { useStore } from "../store";
import { CategoryBar, CategoryLegend, FromRecordBadge, IngredientTable, MealItemList, NumInput, ScreenHeader, Segmented, SubHeader, TimePicker } from "../components/common";
import { useDetailView } from "./uiPrefs";
import { weekMealLabels } from "../lib/mealLabels";
import { GrowthStageHint, MealTipsPanel } from "../components/hints";
import { IngredientPicker, MealCopyPicker, MealSlotPicker } from "../components/pickers";
import { PlanItemsEditor, usePlanItemsEditor } from "../components/planEditor";
import { primaryBtn } from "../theme";

/* =====================================================================
   끼니 편집 화면 (식단 계획용)
   ===================================================================== */
export function MealEditScreen({ date, meal, onBack }) {
  const { state, dispatch } = useStore();
  const timeFmt = state.settings.timeFmt;
  const [label, setLabel] = useState(meal.label || "");
  const [time, setTime] = useState(meal.time || "12:00");
  const editor = usePlanItemsEditor(meal.items.map((it) => ({
    ...it,
    unitG: it.unitG != null ? it.unitG : unitGOf(state, it.name),
    gramsOverride: it.gramsOverride != null ? it.gramsOverride : null,
  })));
  const { items } = editor;
  const [picker, setPicker] = useState(false);
  const [slotPicker, setSlotPicker] = useState(false);
  const [copyPicker, setCopyPicker] = useState(false);

  const addItems = (names) => { setPicker(false); editor.addNames(names); };
  const copyMeal = (srcMeal) => editor.replaceFrom(srcMeal.items);
  const total = totalG(state, items);

  const pickSlot = (slotLabel, slotTime) => {
    setLabel(slotLabel);
    if (slotTime) setTime(slotTime); // 미리 정해둔 시간으로 자동 입력 (이후 직접 수정 가능)
    setSlotPicker(false);
  };

  const save = () => {
    if (!label) return; // 끼니 종류 미선택 - 아래 저장 버튼이 비활성화·안내 문구로 바뀌므로 여기까지 오지 않음
    // fromRecord: 바로기록으로 생긴 끼니를 편집해도 '바로기록' 구분 표시는 유지
    dispatch({ type: "PLAN_SAVE_MEAL", date, meal: { id: meal.id || uid(), label, time, items: items.map(({ name, qty, unitG, gramsOverride }) => ({ name, qty, unitG, gramsOverride: gramsOverride != null ? gramsOverride : null })), ...(meal.fromRecord ? { fromRecord: true } : {}) } });
    onBack();
  };

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title={meal.id ? "끼니 수정" : "새 끼니 추가"} onBack={onBack} />

      <div style={{ position: "sticky", top: 0, zIndex: 15, background: C.bg, padding: "0 18px 10px" }}>
        <div className="flex items-center justify-between" style={{ padding: "0 2px 8px" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{date} ({WD[new Date(date + "T00:00:00").getDay()]})</span>
        </div>
        {/* 끼니 종류 · 시간 · 총량을 하나의 상단 고정 카드로 통합 */}
        <div style={{ background: C.sageLight, borderRadius: 14, padding: 14, boxShadow: "0 4px 10px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", gap: 9 }}>
          <button onClick={() => setSlotPicker(true)} className="flex items-center justify-between" style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, color: C.sageDeep, fontWeight: 600 }}>끼니 종류</span>
            <span className="flex items-center" style={{ gap: 5, fontSize: 13, fontWeight: 800, color: label ? C.sageDeep : C.muted }}>{label || "선택"} <ChevronRight size={14} color={C.sageDeep} /></span>
          </button>
          <TimePicker bare time={time} setTime={setTime} timeFmt={timeFmt} labelColor={C.sageDeep} />
          <div style={{ borderTop: `1px dashed ${C.sage}`, paddingTop: 9 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.sageDeep }}>끼니 총량</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: C.sageDeep }}>{total}g</span>
            </div>
            <CategoryBar items={items} height={8} />
          </div>
        </div>
      </div>

      <div style={{ padding: "0 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        <GrowthStageHint birth={state.baby.birth} />
        <button onClick={() => setCopyPicker(true)} className="flex items-center justify-center" style={{ gap: 6, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 0", fontSize: 12, fontWeight: 700, color: C.sageDeep, background: C.sageLight, cursor: "pointer" }}>
          다른 날짜 식단 복사해오기
        </button>
        <MealTipsPanel currentNames={items.map((it) => it.name)} onAdd={(name) => addItems([name])} date={date} />

        <PlanItemsEditor editor={editor} />

        <button onClick={() => setPicker(true)} className="flex items-center justify-center" style={{ gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
          <Plus size={14} /> 재료 추가
        </button>

        <button onClick={save} disabled={!label} style={{ ...primaryBtn, background: label ? C.sage : C.sageLight, color: label ? "#fff" : C.muted, cursor: label ? "pointer" : "default" }}>
          {label ? "저장" : "끼니 종류를 선택하세요"}
        </button>
      </div>
      {picker && <IngredientPicker multi onPick={addItems} alreadyAdded={items.map((it) => it.name)} onClose={() => setPicker(false)} date={date} />}
      {slotPicker && <MealSlotPicker slots={state.mealSlots} timeFmt={timeFmt} onPick={pickSlot} onClose={() => setSlotPicker(false)} />}
      {copyPicker && <MealCopyPicker onPick={copyMeal} onClose={() => setCopyPicker(false)} />}
    </div>
  );
}

/* =====================================================================
   여러 날짜에 일괄 저장 (식단표 주별/월별 뷰에서 진입)
   - 기존 PLAN_SAVE_MEAL 액션을 그대로 재사용 → 상태 구조 변경 없음
   - 같은 이름(label)의 끼니가 이미 있는 날짜는 건드리지 않고 건너뜀
   ===================================================================== */
export function BulkSaveScreen({ initialCursor, onBack }) {
  const { state, dispatch } = useStore();
  const timeFmt = state.settings.timeFmt;
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("07:00");
  const editor = usePlanItemsEditor([]);
  const { items } = editor;
  const [picker, setPicker] = useState(false);
  const [slotPicker, setSlotPicker] = useState(false);
  const [copyPicker, setCopyPicker] = useState(false);
  const [monthCursor, setMonthCursor] = useState(initialCursor);
  const [selectedDates, setSelectedDates] = useState([]);
  const [result, setResult] = useState(null); // { applied, skipped }
  const [intervalStart, setIntervalStart] = useState(todayISO());
  const [intervalDays, setIntervalDays] = useState(1);
  const [intervalCount, setIntervalCount] = useState(4);
  // "오늘 사용 재료" 기준 날짜: 아직 선택한 날짜가 없으면 실제 오늘, 있으면 그중 가장 이른 날짜를 기준으로 함
  const tipsDate = selectedDates.length > 0 ? [...selectedDates].sort()[0] : todayISO();

  const addItems = (names) => { setPicker(false); editor.addNames(names); };
  const copyMeal = (srcMeal) => {
    editor.replaceFrom(srcMeal.items);
    if (!label) setLabel(srcMeal.label);
  };

  const pickSlot = (slotLabel, slotTime) => {
    setLabel(slotLabel);
    if (slotTime) setTime(slotTime);
    setSlotPicker(false);
  };

  const year = monthCursor.getFullYear(), month = monthCursor.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const isoOf = (d) => `${year}-${pad2(month + 1)}-${pad2(d)}`;
  const t = todayISO();

  const toggleDate = (iso) => setSelectedDates((p) => p.includes(iso) ? p.filter((x) => x !== iso) : [...p, iso]);
  const shiftMonth = (n) => setMonthCursor(new Date(year, month + n, 1));
  const hasLabel = (iso) => label && (state.plans[iso] || []).some((m) => m.label === label);
  const clearDates = () => setSelectedDates([]);
  // N일 간격으로 시작일부터 지정 횟수만큼 자동으로 날짜를 선택(기존 선택에 추가)
  const applyInterval = () => {
    const days = Math.max(1, Number(intervalDays) || 1);
    const count = Math.max(1, Math.min(60, Number(intervalCount) || 1));
    const dates = Array.from({ length: count }, (_, i) => addDaysISO(intervalStart, i * days));
    setSelectedDates((p) => Array.from(new Set([...p, ...dates])));
    const [sy, sm] = intervalStart.split("-").map(Number);
    setMonthCursor(new Date(sy, sm - 1, 1));
  };

  const canSave = label && items.length > 0 && selectedDates.length > 0;

  const save = () => {
    let applied = 0, skipped = 0;
    selectedDates.forEach((iso) => {
      if (hasLabel(iso)) { skipped++; return; }
      dispatch({
        type: "PLAN_SAVE_MEAL",
        date: iso,
        meal: { id: uid(), label, time, items: items.map(({ name, qty, unitG, gramsOverride }) => ({ name, qty, unitG, gramsOverride: gramsOverride != null ? gramsOverride : null })) },
      });
      applied++;
    });
    setResult({ applied, skipped });
  };

  if (result) {
    return (
      <div style={{ paddingBottom: 90 }}>
        <SubHeader title="여러 날짜에 저장" onBack={onBack} />
        <div style={{ padding: "30px 24px", display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center" }}>
          <Check size={34} color={C.sage} />
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, lineHeight: 1.5 }}>
            {result.applied}개 날짜에 저장했습니다{result.skipped > 0 ? `\n(${result.skipped}개는 이미 '${label}' 끼니가 있어 건너뜀)` : ""}
          </div>
          <button onClick={onBack} style={{ ...primaryBtn, maxWidth: 200 }}>확인</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 100, position: "relative" }}>
      <SubHeader title="여러 날짜에 저장" onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>

        <div>
          <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginBottom: 6, padding: "0 2px" }}>어떤 끼니를 저장할까요</div>
          <button onClick={() => setSlotPicker(true)} className="flex items-center justify-between" style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", cursor: "pointer", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>끼니 종류</span>
            <span className="flex items-center" style={{ gap: 5, fontSize: 13, fontWeight: 700, color: label ? C.ink : C.muted }}>{label || "선택"} <ChevronRight size={14} color={C.muted} /></span>
          </button>
          <TimePicker time={time} setTime={setTime} timeFmt={timeFmt} />
          <button onClick={() => setCopyPicker(true)} className="flex items-center justify-center" style={{ gap: 6, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 0", fontSize: 12, fontWeight: 700, color: C.sageDeep, background: C.sageLight, cursor: "pointer", marginTop: 8, width: "100%" }}>
            다른 날짜 식단 복사해오기
          </button>
          <div style={{ marginTop: 8 }}>
            <MealTipsPanel currentNames={items.map((it) => it.name)} onAdd={(name) => addItems([name])} date={tipsDate} />
          </div>
        </div>

        <div>
          <PlanItemsEditor editor={editor} />
          <button onClick={() => setPicker(true)} className="flex items-center justify-center" style={{ gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer", marginTop: 8, width: "100%" }}>
            <Plus size={14} /> 재료 추가
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>적용할 날짜 선택</span>
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 11.5, color: C.sageDeep, fontWeight: 700 }}>{selectedDates.length}일 선택됨</span>
              {selectedDates.length > 0 && (
                <button onClick={clearDates} style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer", padding: 0 }}>초기화</button>
              )}
            </div>
          </div>

          <div style={{ background: C.sageLight, borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, marginBottom: 8 }}>N일 간격으로 자동 선택</div>
            <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              <input type="date" value={intervalStart} onChange={(e) => setIntervalStart(e.target.value)}
                style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 12, color: C.ink, outline: "none", background: C.surface }} />
              <div className="flex items-center" style={{ gap: 4 }}>
                <NumInput value={intervalDays} onChange={setIntervalDays} width={34} suffix="일 간격" />
              </div>
              <div className="flex items-center" style={{ gap: 4 }}>
                <NumInput value={intervalCount} onChange={setIntervalCount} width={34} suffix="회" />
              </div>
            </div>
            <button onClick={applyInterval} style={{ ...primaryBtn, padding: "8px 0", fontSize: 12 }}>자동 선택 적용</button>
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
                const isToday = iso === t;
                const isSel = selectedDates.includes(iso);
                const already = hasLabel(iso);
                return (
                  <button key={i} onClick={() => toggleDate(iso)} className="flex flex-col items-center justify-center"
                    style={{ height: 36, borderRadius: 9, cursor: "pointer",
                      background: isSel ? C.sage : "transparent",
                      border: isToday ? `1.5px solid ${C.sage}` : already ? `1px solid ${C.border}` : "1px solid transparent" }}>
                    <span style={{ fontSize: 11.5, fontWeight: isSel ? 700 : 500, color: isSel ? "#fff" : C.inkSoft }}>{d}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center" style={{ gap: 14, marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}`, flexWrap: "wrap" }}>
              <div className="flex items-center" style={{ gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: C.sage, display: "inline-block" }} /><span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>선택됨</span></div>
              <div className="flex items-center" style={{ gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 999, border: `1px solid ${C.border}`, display: "inline-block" }} /><span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>'{label || "끼니"}' 이미 있음</span></div>
            </div>
          </div>
        </div>

        {label && selectedDates.some((iso) => hasLabel(iso)) && (
          <div style={{ background: C.apricotLight, borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#9A4A1E", lineHeight: 1.5 }}>
            선택한 날짜 중 이미 '{label}' 끼니가 있는 날짜는 건드리지 않고 건너뛰고, 나머지 날짜에만 저장됩니다.
          </div>
        )}

        <button onClick={save} disabled={!canSave} style={{ ...primaryBtn, background: canSave ? C.sage : C.sageLight, color: canSave ? "#fff" : C.muted, cursor: canSave ? "pointer" : "default" }}>
          {selectedDates.length > 0 ? `${selectedDates.length}개 날짜에 저장` : "날짜를 선택하세요"}
        </button>
      </div>
      {picker && <IngredientPicker multi onPick={addItems} alreadyAdded={items.map((it) => it.name)} onClose={() => setPicker(false)} date={tipsDate} />}
      {slotPicker && <MealSlotPicker slots={state.mealSlots} timeFmt={timeFmt} onPick={pickSlot} onClose={() => setSlotPicker(false)} />}
      {copyPicker && <MealCopyPicker onPick={copyMeal} onClose={() => setCopyPicker(false)} />}
    </div>
  );
}

export function WeekTable({ startISO, onPickDay }) {
  const { state } = useStore();
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(startISO, i));
  const labels = weekMealLabels(state, days);
  const wide = labels.length > 3;
  const cols = `34px repeat(${labels.length}, minmax(58px, 1fr))`;
  const t = todayISO();
  return (
    <div style={{ overflowX: wide ? "auto" : "visible" }}>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", minWidth: wide ? 34 + labels.length * 68 : "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, background: C.sageLight, padding: "9px 6px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep }}>요일</span>
          {labels.map((h) => <span key={h} style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, textAlign: "center" }}>{h}</span>)}
        </div>
        {days.map((iso, i) => {
          const meals = state.plans[iso] || [];
          const dow = new Date(iso + "T00:00:00").getDay();
          const isToday = iso === t;
          const find = (lab) => meals.find((m) => m.label === lab) || {};
          return (
            <button key={iso} onClick={() => onPickDay(iso)} style={{ display: "grid", gridTemplateColumns: cols, padding: "13px 6px", width: "100%", textAlign: "left",
              borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: isToday ? C.sageLight : C.surface, border: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}><div style={{ fontSize: 13, fontWeight: 800, color: isToday ? C.sageDeep : C.ink }}>{WD[dow]}</div><div style={{ fontSize: 10.5, color: C.muted }}>{iso.slice(5)}</div></div>
              {labels.map((lab) => {
                const meal = find(lab);
                const its = meal.items;
                return (
                  <div key={lab} style={{ padding: "0 4px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 3 }}>
                    {meal.fromRecord && <FromRecordBadge small />}
                    <MealItemList items={its} fontSize={11.5} />
                    {its && its.length > 0 && <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, marginTop: 2 }}>{totalG(state, its)}g</div>}
                  </div>
                );
              })}
            </button>
          );
        })}
      </div>
      {wide && <div style={{ fontSize: 9.5, color: C.muted, textAlign: "center", marginTop: 4 }}>← 옆으로 밀어서 더 보기 →</div>}
    </div>
  );
}

export function MonthView({ monthDate, selected, setSelected }) {
  const { state } = useStore();
  const t = todayISO();
  const year = monthDate.getFullYear(), month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const iso = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const selMeals = state.plans[selected] || [];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {WD.map((d) => <span key={d} style={{ fontSize: 10, color: C.muted, fontWeight: 700, textAlign: "center" }}>{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const di = iso(d);
          const has = (state.plans[di] || []).length > 0;
          const isToday = di === t, isSel = di === selected;
          return (
            <button key={i} onClick={() => setSelected(di)} className="flex flex-col items-center justify-center"
              style={{ height: 42, borderRadius: 10, background: isSel ? C.sageLight : "transparent", cursor: "pointer",
                border: isToday ? `1.5px solid ${C.sage}` : isSel ? `1px solid ${C.sage}` : "1px solid transparent" }}>
              <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? C.sageDeep : C.inkSoft }}>{d}</span>
              <div style={{ width: 5, height: 5, borderRadius: 999, marginTop: 4, background: has ? C.sage : "transparent" }} />
            </button>
          );
        })}
      </div>
      <div className="flex items-center" style={{ gap: 14, marginTop: 12, padding: "0 4px" }}>
        <div className="flex items-center" style={{ gap: 5 }}><span style={{ width: 5, height: 5, borderRadius: 999, background: C.sage, display: "inline-block" }} /><span style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>계획 있음</span></div>
        <div className="flex items-center" style={{ gap: 5 }}><span style={{ width: 5, height: 5, borderRadius: 999, border: `1px solid ${C.border}`, display: "inline-block" }} /><span style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>계획 없음</span></div>
      </div>
      <div style={{ marginTop: 16 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8, padding: "4px 6px" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{selected.slice(5)}</span>
          {selMeals.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>{totalG(state, selMeals.flatMap((m) => m.items))}g</span>}
        </div>
        {selMeals.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selMeals.map((m) => (
              <div key={m.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <div className="flex items-center" style={{ gap: 6 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>{m.label}</span>
                    {m.fromRecord && <FromRecordBadge small />}
                  </div>
                  <span style={{ fontSize: 10.5, color: C.muted }}>{totalG(state, m.items)}g</span>
                </div>
                <MealItemList items={m.items} fontSize={11} wrap />
              </div>
            ))}
          </div>
        ) : <div style={{ textAlign: "center", padding: "22px 0", fontSize: 12, color: C.muted }}>이 날짜엔 계획된 식단이 없습니다</div>}
      </div>
    </div>
  );
}

export function MealPlanTab() {
  const { state, dispatch, notify } = useStore();
  const timeFmt = state.settings.timeFmt;
  const [range, setRange] = useState("day");
  const [detail, setDetail] = useDetailView("bc_plan_view");
  const [cursor, setCursor] = useState(todayISO());
  const [editing, setEditing] = useState(null);
  const [monthSel, setMonthSel] = useState(todayISO());
  const [bulkOpen, setBulkOpen] = useState(false);

  if (editing) {
    return <MealEditScreen date={editing.date} meal={editing.meal} onBack={() => setEditing(null)} />;
  }
  if (bulkOpen) {
    return <BulkSaveScreen initialCursor={new Date(cursor + "T00:00:00")} onBack={() => setBulkOpen(false)} />;
  }

  const shift = (n) => {
    if (range === "day") setCursor(addDaysISO(cursor, n));
    else if (range === "week") setCursor(addDaysISO(cursor, n * 7));
    else { const [y, m, day] = cursor.split("-").map(Number); const d = new Date(y, m - 1, day); d.setMonth(d.getMonth() + n); setCursor(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`); }
  };

  const dayMeals = state.plans[cursor] || [];
  const dayTotal = totalG(state, dayMeals.flatMap((m) => m.items));
  const weekStart = addDaysISO(cursor, -new Date(cursor + "T00:00:00").getDay());

  const headLabel = range === "day"
    ? `${cursor} (${WD[new Date(cursor + "T00:00:00").getDay()]})`
    : range === "week"
    ? `${weekStart.slice(5)} ~ ${addDaysISO(weekStart, 6).slice(5)}`
    : `${cursor.slice(0, 4)}년 ${Number(cursor.slice(5, 7))}월`;

  return (
    <div style={{ paddingBottom: 90 }}>
      <ScreenHeader title="식단표" />
      <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <Segmented value={range} onChange={setRange} options={[{ value: "day", label: "일" }, { value: "week", label: "주" }, { value: "month", label: "월" }]} />
        <div className="flex items-center justify-between">
          <div className="flex items-center" style={{ gap: 10 }}>
            <button onClick={() => shift(-1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronLeft size={17} color={C.muted} /></button>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{headLabel}</span>
            <button onClick={() => shift(1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronRight size={17} color={C.muted} /></button>
          </div>
          {range === "day" && (
            <button onClick={() => setDetail((v) => !v)} style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep, background: C.sageLight, border: "none", borderRadius: 999, padding: "5px 10px", cursor: "pointer" }}>
              {detail ? "심플뷰로 보기" : "디테일뷰로 보기"}
            </button>
          )}
        </div>

        {range !== "day" && (
          <button onClick={() => setBulkOpen(true)} className="flex items-center justify-center" style={{ gap: 6, background: C.sageLight, border: "none", borderRadius: 12, padding: "9px 0", fontSize: 12, fontWeight: 700, color: C.sageDeep, cursor: "pointer" }}>
            <CalendarDays size={14} /> 여러 날짜에 저장
          </button>
        )}

        <CategoryLegend />

        {range === "day" && (
          <>
            {dayMeals.map((m) => {
              const mT = totalG(state, m.items);
              return (
                <div key={m.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{m.label}</span>
                      <span style={{ fontSize: 12, color: C.muted }}>{fmtTime(m.time, timeFmt)}</span>
                      {m.fromRecord && <FromRecordBadge />}
                    </div>
                    <div className="flex items-center" style={{ gap: 12 }}>
                      <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>{mT}g</span>
                      <button onClick={() => setEditing({ date: cursor, meal: m })} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Pencil size={14} color={C.muted} /></button>
                      <button onClick={() => {
                        dispatch({ type: "PLAN_DELETE_MEAL", date: cursor, mealId: m.id });
                        notify(`'${m.label}' 끼니를 삭제했습니다`, () => dispatch({ type: "RESTORE_MEAL", date: cursor, meal: m }));
                      }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Trash2 size={14} color={C.apricot} /></button>
                    </div>
                  </div>
                  {detail ? <IngredientTable items={m.items} total={mT} /> : <div style={{ marginBottom: 9 }}><MealItemList items={m.items} fontSize={12.5} wrap /></div>}
                  <div style={{ marginTop: 10 }}><CategoryBar items={m.items} /></div>
                </div>
              );
            })}
            {dayMeals.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12.5, color: C.muted }}>계획된 끼니가 없습니다</div>}
            <button onClick={() => setEditing({ date: cursor, meal: { label: "", time: "12:00", items: [] } })} className="flex items-center justify-center" style={{ gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 14, padding: "11px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
              <Plus size={14} /> 끼니 추가
            </button>
            {dayMeals.length > 0 && (
              <div style={{ background: C.sageLight, borderRadius: 14, padding: "12px 16px" }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.sageDeep }}>하루 총 이유식</span>
                  <span style={{ fontSize: 15, fontWeight: 900, color: C.sageDeep }}>{dayTotal}g · {dayMeals.length}끼</span>
                </div>
                <CategoryBar items={dayMeals.flatMap((m) => m.items)} height={7} />
              </div>
            )}
          </>
        )}

        {range === "week" && <WeekTable startISO={weekStart} onPickDay={(iso) => { setCursor(iso); setRange("day"); }} />}
        {range === "month" && <MonthView monthDate={new Date(cursor + "T00:00:00")} selected={monthSel} setSelected={setMonthSel} />}
      </div>
    </div>
  );
}
