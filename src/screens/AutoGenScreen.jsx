/* 식단 자동 생성 - 생성 플로우 UI (PR B: ① 기간 선택 → ② 재료 풀 확인/편집 → ③ 규칙 확인/조정)
   실제 생성 알고리즘 실행·미리보기·확정저장은 PR C에서 이어서 구현. 여기서는 규칙을 확정해
   state.settings.autoGenRules에 저장(다음에 열 때 이어서 프리필)하는 데까지만 담당한다. */
import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { C, primaryBtn } from "../theme";
import { WD, addDaysISO, pad2, todayISO } from "../lib/dates";
import { catOf, categoryList } from "../state/appState";
import { useStore } from "../store";
import { NumInput, Segmented, SubHeader } from "../components/common";
import { IngredientPicker } from "../components/pickers";
import {
  COMMON_FISH_NAMES,
  INGREDIENT_RULE_PRESETS,
  buildIngredientPool,
  checkRuleConflicts,
  sourceTypeOf,
  validateAutoGenRules,
} from "../lib/autoGen";

const QUICK_RANGES = [{ label: "3일", days: 3 }, { label: "1주", days: 7 }, { label: "2주", days: 14 }];

/* =====================================================================
   ① 기간 선택 - 범위(시작~끝) 캘린더 + 빠른 칩. 과거 날짜는 선택 불가.
   ===================================================================== */
function PeriodStep({ range, setRange, onNext }) {
  const { state } = useStore();
  const [monthCursor, setMonthCursor] = useState(new Date());
  const t = todayISO();
  const year = monthCursor.getFullYear(), month = monthCursor.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const isoOf = (d) => `${year}-${pad2(month + 1)}-${pad2(d)}`;
  const shiftMonth = (n) => setMonthCursor(new Date(year, month + n, 1));

  const pickDate = (iso) => {
    if (iso < t) return; // 과거 선택 불가
    if (!range.start || (range.start && range.end)) { setRange({ start: iso, end: iso }); return; }
    if (iso < range.start) { setRange({ start: iso, end: range.start }); return; }
    setRange({ start: range.start, end: iso });
  };
  const pickQuick = (days) => setRange({ start: t, end: addDaysISO(t, days - 1) });
  const inRange = (iso) => range.start && range.end && iso >= range.start && iso <= range.end;
  const dayCount = range.start && range.end ? (Math.round((new Date(range.end) - new Date(range.start)) / 86400000) + 1) : 0;

  return (
    <div style={{ padding: "10px 18px 100px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}>
        식단을 자동으로 채울 기간을 골라주세요. 이미 계획이 있는 날짜에도 새로 생성할 수 있어요(기존 끼니는 그대로 두고 채워지지 않은 끼니만 추가돼요).
      </div>

      <div className="flex items-center" style={{ gap: 8 }}>
        {QUICK_RANGES.map((q) => (
          <button key={q.label} onClick={() => pickQuick(q.days)} style={{ flex: 1, background: C.sageLight, border: "none", borderRadius: 10, padding: "9px 0", fontSize: 12.5, fontWeight: 700, color: C.sageDeep, cursor: "pointer" }}>
            {q.label}
          </button>
        ))}
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
          {range.start === range.end ? range.start : `${range.start} ~ ${range.end}`} ({dayCount}일)
        </div>
      )}

      <button onClick={onNext} disabled={!range.start} style={{ ...primaryBtn,
        background: range.start ? C.sage : C.sageLight, color: range.start ? "#fff" : C.muted, cursor: range.start ? "pointer" : "default" }}>
        다음
      </button>
    </div>
  );
}

/* =====================================================================
   ② 재료 풀 확인/편집 - intros 상태 기준 체크박스(카테고리별), 관찰중·주의 토글,
   재료별 라벨(중복 가능) 편집, 재료별 1회 급여량(g) 직접 입력, 직접 추가.
   ===================================================================== */
function PoolStep({ checked, setChecked, includeObserving, setIncludeObserving, includeCaution, setIncludeCaution, perIngredientG, setPerIngredientG, onBack, onNext }) {
  const { state, dispatch } = useStore();
  const [picker, setPicker] = useState(false);
  const [labelInputFor, setLabelInputFor] = useState(null);
  const [labelDraft, setLabelDraft] = useState("");

  const introOf = (name) => (state.intros || []).find((it) => it.name === name);
  const availableNames = useMemo(
    () => buildIngredientPool(state, { includeObserving: true, includeCaution: true }),
    [state.intros]
  );
  const visibleNames = availableNames.filter((n) => {
    const st = introOf(n)?.status;
    if (st === "관찰중" && !includeObserving) return false;
    if (st === "주의" && !includeCaution) return false;
    return true;
  });
  const manualExtra = [...checked].filter((n) => !availableNames.includes(n));
  const allVisible = [...visibleNames, ...manualExtra];
  const cats = categoryList(state);
  const grouped = cats.map((c) => ({ cat: c, names: allVisible.filter((n) => catOf(state, n) === c.name) })).filter((g) => g.names.length > 0);

  const toggleObserving = (on) => {
    setIncludeObserving(on);
    const names = (state.intros || []).filter((it) => it.status === "관찰중").map((it) => it.name);
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) names.forEach((n) => next.add(n)); else names.forEach((n) => next.delete(n));
      return next;
    });
  };
  const toggleCaution = (on) => {
    setIncludeCaution(on);
    const names = (state.intros || []).filter((it) => it.status === "주의").map((it) => it.name);
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) names.forEach((n) => next.add(n)); else names.forEach((n) => next.delete(n));
      return next;
    });
  };
  const toggleName = (n) => setChecked((prev) => { const next = new Set(prev); if (next.has(n)) next.delete(n); else next.add(n); return next; });

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

  return (
    <div style={{ padding: "10px 18px 100px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}>
        체크한 재료만 자동 생성에 사용돼요. '이상없음' 재료는 기본으로 포함되고, '관찰중'·'주의' 재료는 필요할 때만 켜서 포함할 수 있어요.
      </div>

      <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>관찰중 재료 포함</span>
        <Segmented value={includeObserving ? "on" : "off"} onChange={(v) => toggleObserving(v === "on")} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
      </div>
      <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>주의 재료 포함</span>
        <Segmented value={includeCaution ? "on" : "off"} onChange={(v) => toggleCaution(v === "on")} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
      </div>

      {grouped.map(({ cat, names }) => (
        <div key={cat.id}>
          <div className="flex items-center" style={{ gap: 6, marginBottom: 6, padding: "0 2px" }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: cat.color, display: "inline-block" }} />
            <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>{cat.name}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {names.map((n) => {
              const st = introOf(n)?.status;
              const labels = state.ingredients[n]?.labels || [];
              const isFridge = sourceTypeOf(state, n) === "fridge";
              const suggestFish = COMMON_FISH_NAMES.includes(n) && !labels.includes("생선");
              return (
                <div key={n} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 12px" }}>
                  <button onClick={() => toggleName(n)} className="flex items-center justify-between" style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${checked.has(n) ? C.sage : C.border}`, background: checked.has(n) ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {checked.has(n) && <span style={{ width: 7, height: 7, background: "#fff", borderRadius: 2 }} />}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{n}</span>
                      {(st === "관찰중" || st === "주의") && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: st === "주의" ? C.apricot : C.sageDeep, background: st === "주의" ? C.apricotLight : C.sageLight, borderRadius: 999, padding: "2px 6px" }}>{st}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 10.5, color: C.muted }}>{isFridge ? "냉장" : "냉동"}</span>
                  </button>
                  <div className="flex items-center" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {labels.map((l) => (
                      <span key={l} className="flex items-center" style={{ gap: 3, fontSize: 10.5, fontWeight: 700, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "3px 4px 3px 8px" }}>
                        {l}
                        <button onClick={() => removeLabel(n, l)} style={{ background: "none", border: "none", padding: 2, cursor: "pointer", display: "flex" }}><X size={10} color={C.sageDeep} /></button>
                      </span>
                    ))}
                    {labelInputFor === n ? (
                      <input autoFocus value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { addLabel(n, labelDraft); setLabelDraft(""); setLabelInputFor(null); } if (e.key === "Escape") setLabelInputFor(null); }}
                        onBlur={() => { addLabel(n, labelDraft); setLabelDraft(""); setLabelInputFor(null); }}
                        placeholder="라벨 입력 후 Enter" style={{ width: 110, fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px", outline: "none" }} />
                    ) : (
                      <button onClick={() => { setLabelInputFor(n); setLabelDraft(""); }} className="flex items-center" style={{ gap: 2, fontSize: 10.5, fontWeight: 700, color: C.muted, background: "transparent", border: `1px dashed ${C.border}`, borderRadius: 999, padding: "3px 8px", cursor: "pointer" }}>
                        <Plus size={10} /> 라벨
                      </button>
                    )}
                    {suggestFish && labelInputFor !== n && (
                      <button onClick={() => addLabel(n, "생선")} style={{ fontSize: 10.5, fontWeight: 700, color: C.apricot, background: C.apricotLight, border: "none", borderRadius: 999, padding: "3px 8px", cursor: "pointer" }}>
                        '생선' 라벨 추천 +
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between" style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>1회 급여량</span>
                    <NumInput value={perIngredientG[n] ?? 0} onChange={(v) => setPerIngredientG((p) => { const next = { ...p }; if (!v) delete next[n]; else next[n] = v; return next; })} suffix="g (비우면 균등 배분)" width={44} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button onClick={() => setPicker(true)} className="flex items-center justify-center" style={{ width: "100%", gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
        <Plus size={14} /> 재료 직접 추가
      </button>

      <div className="flex items-center" style={{ gap: 8 }}>
        <button onClick={onBack} style={{ ...primaryBtn, flex: 1, background: C.sageLight, color: C.inkSoft }}>이전</button>
        <button onClick={onNext} disabled={checked.size === 0} style={{ ...primaryBtn, flex: 2, background: checked.size > 0 ? C.sage : C.sageLight, color: checked.size > 0 ? "#fff" : C.muted, cursor: checked.size > 0 ? "pointer" : "default" }}>
          다음 ({checked.size}개 선택됨)
        </button>
      </div>
      {picker && (
        <IngredientPicker multi onPick={(names) => { setChecked((p) => new Set([...p, ...names])); setPicker(false); }} alreadyAdded={[...checked]} onClose={() => setPicker(false)} />
      )}
    </div>
  );
}

/* =====================================================================
   ③ 규칙 확인/조정 - 카테고리별 개수, 주식 설정, 의학적 권고 프리셋(토글+근거),
   다양성 규칙, 재고 우선순위, 시판 제품 포함 여부. 확인 시 settings.autoGenRules에 저장.
   ===================================================================== */
function RulesStep({ rules, setRules, pool, removedNotice, onBack, onFinish }) {
  const { state } = useStore();
  const cats = categoryList(state);
  const conflicts = useMemo(() => checkRuleConflicts(state, rules, pool), [state, rules, pool]);

  const setCatRange = (id, patch) => setRules((r) => ({ ...r, perMeal: { ...r.perMeal, categoryCounts: { ...r.perMeal.categoryCounts, [id]: { ...r.perMeal.categoryCounts[id], ...patch } } } }));
  const setIngredientRule = (id, patch) => setRules((r) => ({ ...r, ingredientRules: r.ingredientRules.map((ir) => (ir.id === id ? { ...ir, ...patch } : ir)) }));
  const ruleFor = (preset) => rules.ingredientRules.find((ir) => ir.preset === preset);

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
                  <NumInput value={r.min} onChange={(v) => setCatRange(c.id, { min: v, max: Math.max(v, r.max) })} suffix="최소" width={34} />
                  <NumInput value={r.max} onChange={(v) => setCatRange(c.id, { max: v, min: Math.min(v, r.min) })} suffix="최대" width={34} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 8 }}>주식(탄수화물)</div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>매 끼니 자동 포함</span>
            <Segmented value={rules.staple.includeEveryMeal ? "on" : "off"} onChange={(v) => setRules((r) => ({ ...r, staple: { ...r.staple, includeEveryMeal: v === "on" } }))} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>기본 급여량</span>
            <NumInput value={rules.staple.defaultG} onChange={(v) => setRules((r) => ({ ...r, staple: { ...r.staple, defaultG: v } }))} suffix="g" width={44} />
          </div>
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
                    <span style={{ fontSize: 11, color: C.muted }}>대상 라벨 '{rule.label}' · 주당</span>
                    <NumInput value={rule.value} onChange={(v) => setIngredientRule(rule.id, { value: v })} suffix="회" width={34} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 8 }}>다양성</div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>연속 끼니 반복 금지</span>
            <Segmented value={rules.variety.noConsecutiveMeals ? "on" : "off"} onChange={(v) => setRules((r) => ({ ...r, variety: { ...r.variety, noConsecutiveMeals: v === "on" } }))} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>같은 날 반복 허용</span>
            <Segmented value={rules.variety.allowSameDayRepeat ? "on" : "off"} onChange={(v) => setRules((r) => ({ ...r, variety: { ...r.variety, allowSameDayRepeat: v === "on" } }))} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>주식은 다양성 규칙 예외</span>
            <Segmented value={rules.variety.stapleExemptFromVariety ? "on" : "off"} onChange={(v) => setRules((r) => ({ ...r, variety: { ...r.variety, stapleExemptFromVariety: v === "on" } }))} options={[{ value: "off", label: "끔" }, { value: "on", label: "켬" }]} />
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
        <button onClick={onFinish} style={{ ...primaryBtn, flex: 2 }}>규칙 확인 완료</button>
      </div>
    </div>
  );
}

/* =====================================================================
   전체 플로우
   ===================================================================== */
export function AutoGenFlowScreen({ onBack }) {
  const { state, dispatch, notify } = useStore();
  const [step, setStep] = useState("period");
  const [range, setRange] = useState({ start: null, end: null });
  const [checked, setChecked] = useState(() => new Set(buildIngredientPool(state)));
  const [includeObserving, setIncludeObserving] = useState(false);
  const [includeCaution, setIncludeCaution] = useState(false);
  const [perIngredientGDraft, setPerIngredientGDraft] = useState({});
  const [rulesState, setRulesState] = useState(null);
  const [removedNotice, setRemovedNotice] = useState(0);

  const enterRules = () => {
    const { rules, removedCount } = validateAutoGenRules(state, state.settings.autoGenRules);
    setRulesState({ ...rules, perMeal: { ...rules.perMeal, perIngredientG: { ...rules.perMeal.perIngredientG, ...perIngredientGDraft } } });
    setRemovedNotice(removedCount);
    setStep("rules");
  };

  const finish = () => {
    dispatch({ type: "AUTOGEN_RULES_SAVE", rules: rulesState });
    notify("자동 생성 규칙을 저장했어요. 생성·미리보기는 다음 업데이트에서 제공될 예정이에요.");
    onBack();
  };

  const titles = { period: "자동 생성 - 기간 선택", pool: "자동 생성 - 재료 풀", rules: "자동 생성 - 규칙 확인" };

  return (
    <div style={{ position: "relative" }}>
      <SubHeader title={titles[step]} onBack={step === "period" ? onBack : () => setStep(step === "rules" ? "pool" : "period")} />
      {step === "period" && <PeriodStep range={range} setRange={setRange} onNext={() => setStep("pool")} />}
      {step === "pool" && (
        <PoolStep
          checked={checked} setChecked={setChecked}
          includeObserving={includeObserving} setIncludeObserving={setIncludeObserving}
          includeCaution={includeCaution} setIncludeCaution={setIncludeCaution}
          perIngredientG={perIngredientGDraft} setPerIngredientG={setPerIngredientGDraft}
          onBack={() => setStep("period")} onNext={enterRules}
        />
      )}
      {step === "rules" && rulesState && (
        <RulesStep rules={rulesState} setRules={setRulesState} pool={[...checked]} removedNotice={removedNotice} onBack={() => setStep("pool")} onFinish={finish} />
      )}
    </div>
  );
}
