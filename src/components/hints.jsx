/* 끼니 편집·기록 화면의 도움말 컴포넌트 (성장 단계·궁합·재고·오늘 사용 재료) */
import React, { useState } from "react";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { C } from "../theme";
import { ageMonths, todayISO } from "../lib/dates";
import { GROWTH_STAGES, growthStageOf } from "../data/nutrition";
import { productStockPacks, sortByCategory, stockFridgeG, stockTotalCubes } from "../state/appState";
import { useStore } from "../store";
import { CatDot } from "./common";
import { pairingSuggestions, usedTodayMap } from "../lib/pairing";
import { urgentStockNames } from "../lib/stockAlerts";

// 식단 편집 화면 등에서 보여줄 "참고용" 성장 단계 안내 카드 - 값을 자동으로 적용하지 않고 정보만 표시함.
// 카드를 탭하면 전체 시기의 팁이 리스트로 펼쳐짐 (현재 시기는 강조 표시)
export function GrowthStageHint({ birth }) {
  const months = ageMonths(birth);
  const [expanded, setExpanded] = useState(false);
  const g = months == null ? null : growthStageOf(months);
  const stageRange = (s) => (s.max >= 999 ? `${s.min}개월~` : `${s.min}~${s.max}개월`);
  return (
    <div style={{ background: C.sageLight, border: `1px dashed ${C.sage}`, borderRadius: 12, overflow: "hidden" }}>
      <button onClick={() => setExpanded((v) => !v)} className="flex items-center justify-between"
        style={{ width: "100%", background: "none", border: "none", padding: "10px 12px", cursor: "pointer", textAlign: "left", gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: C.sageDeep }}>
          {g ? `생후 ${months}개월 · ${g.stage} 참고 정보` : "이유식 단계별 참고 정보"}
        </span>
        <ChevronRight size={14} color={C.sageDeep} style={{ flexShrink: 0, transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
      </button>
      {!expanded && (
        <div style={{ padding: "0 12px 10px" }}>
          {g ? (
            <div style={{ fontSize: 11, color: C.sageDeep, lineHeight: 1.6 }}>
              일반적으로 하루 {g.mealsPerDay} · 1회 {g.perMealG} 정도가 참고돼요. {g.note}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: C.sageDeep, lineHeight: 1.6 }}>
              더보기 &gt; 설정에서 아기 생년월일을 입력하면 지금 개월수에 맞는 팁을 바로 보여드려요. 탭하면 전체 시기 팁을 볼 수 있어요.
            </div>
          )}
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>* 일반적인 참고 정보이며, 정확한 급여량·시기는 소아과 상담을 따라주세요. (탭하면 다른 시기 팁도 보여요)</div>
        </div>
      )}
      {expanded && (
        <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          {GROWTH_STAGES.map((s) => {
            const current = g && s.stage === g.stage;
            return (
              <div key={s.stage} style={{ background: current ? C.surface : "transparent", border: current ? `1px solid ${C.sage}` : `1px solid transparent`, borderRadius: 10, padding: "8px 10px" }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 3, gap: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: C.sageDeep }}>
                    {s.stage} <span style={{ fontWeight: 600, color: C.muted, fontSize: 10.5 }}>({stageRange(s)})</span>
                  </span>
                  {current && <span style={{ fontSize: 9.5, fontWeight: 800, background: C.sage, color: "#fff", padding: "2px 8px", borderRadius: 999, flexShrink: 0 }}>지금 시기</span>}
                </div>
                <div style={{ fontSize: 10.5, color: C.sageDeep, lineHeight: 1.55 }}>
                  하루 {s.mealsPerDay} · 1회 {s.perMealG}. {s.note}
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 10, color: C.muted }}>* 일반적인 참고 정보이며, 정확한 급여량·시기는 소아과 상담을 따라주세요.</div>
        </div>
      )}
    </div>
  );
}

// 끼니 편집 화면에서 현재 재료 조합 기준 궁합 추천/주의 안내 카드
export function PairingHint({ currentNames, onAdd }) {
  const { state } = useStore();
  const { good, avoid } = pairingSuggestions(state, currentNames);
  if (currentNames.length === 0 || (good.length === 0 && avoid.length === 0)) return null;
  const gradeBadge = (g) => (
    <span style={{ fontSize: 8.5, fontWeight: 800, color: g === "A" ? C.sageDeep : "#9A7416", background: g === "A" ? C.sageLight : C.butterLight, borderRadius: 4, padding: "1px 4px", flexShrink: 0 }}>근거 {g}</span>
  );
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 }}>재료 궁합 — 지금 재고에서 추천</div>
      {good.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: avoid.length > 0 ? 10 : 0 }}>
          {good.map((g) => (
            <div key={g.name} className="flex items-center justify-between" style={{ gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex items-center" style={{ gap: 5, marginBottom: 1 }}>
                  <CatDot name={g.name} size={7} />
                  <span style={{ fontSize: 12, color: C.ink, fontWeight: 700 }}>{g.name}</span>
                  {gradeBadge(g.grade)}
                </div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{g.withNames.join("·")}와(과) 함께 — {g.text}</div>
              </div>
              <button onClick={() => onAdd(g.name)} style={{ background: "none", border: `1px solid ${C.sage}`, borderRadius: 8, padding: "3px 9px", fontSize: 11, fontWeight: 700, color: C.sageDeep, cursor: "pointer", flexShrink: 0 }}>추가</button>
            </div>
          ))}
        </div>
      )}
      {avoid.map((a, i) => (
        <div key={i} style={{ background: C.apricotLight, borderRadius: 8, padding: "7px 9px", marginBottom: 4 }}>
          <div className="flex items-center" style={{ gap: 5, marginBottom: 1 }}>
            <AlertTriangle size={11} color={C.apricot} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9A4A1E" }}>{a.a.join("·")} + {a.b.join("·")}</span>
            {gradeBadge(a.grade)}
          </div>
          <div style={{ fontSize: 10, color: "#A85B30", lineHeight: 1.4 }}>{a.text}</div>
        </div>
      ))}
      <div style={{ fontSize: 9.5, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>* 확립된 영양소 상호작용만 안내하는 참고 정보예요. 흡수율에 관한 내용으로, 함께 먹여도 위험한 조합은 아니에요.</div>
    </div>
  );
}

// "냉장고 비우기" 힌트: 냉장 보관 중이거나 냉동 보관기한이 임박한 재료를 식단 편집 화면에서 바로 추가할 수 있게 안내
export function UrgentStockHint({ currentNames, onAdd }) {
  const { state } = useStore();
  const currentSet = new Set(currentNames);
  const urgent = urgentStockNames(state).filter((u) => !currentSet.has(u.name)).slice(0, 5);
  if (urgent.length === 0) return null;
  return (
    <div style={{ background: C.apricotLight, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9A4A1E", marginBottom: 8 }}>냉장고 비우기 — 곧 처리해야 할 재료</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {urgent.map((u) => (
          <div key={u.name} className="flex items-center justify-between">
            <div className="flex items-center" style={{ gap: 6 }}>
              <CatDot name={u.name} size={7} />
              <span style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>{u.name}</span>
              <span style={{ fontSize: 10.5, color: "#9A4A1E" }}>
                {u.fg > 0 ? `냉장 보관 중 (${u.fg}g)` : `보관기한 ~${u.frozenDaysLeft}일`}
              </span>
            </div>
            <button onClick={() => onAdd(u.name)} style={{ background: "none", border: `1px solid #E0A579`, borderRadius: 8, padding: "3px 9px", fontSize: 11, fontWeight: 700, color: "#9A4A1E", cursor: "pointer" }}>추가</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// 오늘 이미 급여 기록에 사용된 재료 힌트 - 끼니를 짤 때 오늘 벌써 준 재료를 참고해서 겹치지 않게 구성할 수 있도록 안내
export function TodayUsedHint({ currentNames, date = todayISO() }) {
  const { state } = useStore();
  const currentSet = new Set(currentNames);
  const usedG = usedTodayMap(state, date); // name -> 해당 날짜에 제공된 총 g
  const usedNames = sortByCategory(state, Array.from(usedG.keys()), (n) => n).filter((n) => !currentSet.has(n));
  if (usedNames.length === 0) return null;
  const label = date === todayISO() ? "오늘 이미 준 재료" : `${date.slice(5)}에 이미 준 재료`;
  return (
    <div style={{ background: C.sageLight, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, marginBottom: 8 }}>{label}</div>
      <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
        {usedNames.map((n) => (
          <span key={n} className="flex items-center" style={{ gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 9px" }}>
            <CatDot name={n} size={6} />
            <span style={{ fontSize: 11, color: C.ink, fontWeight: 600 }}>{n}</span>
            <span style={{ fontSize: 9.5, color: C.muted }}>{Math.round(usedG.get(n))}g</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// 끼니 편집 화면에 뜨는 도움말(재고/궁합/오늘 사용 재료) 표시 여부 선택 칩
export const MEAL_TIP_OPTIONS = [
  { key: "stock", label: "재고" },
  { key: "pairing", label: "궁합" },
  { key: "usedToday", label: "오늘 사용 재료" },
];

export function mealTipsOf(state) {
  return state.settings.mealTips || { stock: true, pairing: true, usedToday: true };
}

// 재고/궁합/오늘 사용 재료 힌트를 하나로 묶어 기본은 접어두고, 필요할 때만 펼쳐보는 패널.
// 세 카드를 항상 펼쳐두면 화면을 너무 많이 차지한다는 피드백을 받아 접이식으로 변경함(2026-07-04).
export function MealTipsPanel({ currentNames, onAdd, date = todayISO() }) {
  const { state, dispatch } = useStore();
  const tips = mealTipsOf(state);
  const [expanded, setExpanded] = useState(false);
  const currentSet = new Set(currentNames);

  const urgentCount = tips.stock !== false ? urgentStockNames(state).filter((u) => !currentSet.has(u.name)).length : 0;
  const { good, avoid } = tips.pairing !== false ? pairingSuggestions(state, currentNames) : { good: [], avoid: [] };
  const usedTodayCount = tips.usedToday !== false ? Array.from(usedTodayMap(state, date).keys()).filter((n) => !currentSet.has(n)).length : 0;
  const totalCount = urgentCount + good.length + avoid.length + usedTodayCount;

  const toggle = (key) => dispatch({ type: "SET_SETTING", key: "mealTips", value: { ...tips, [key]: tips[key] === false } });

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <button onClick={() => setExpanded((v) => !v)} className="flex items-center justify-between" style={{ width: "100%", background: "none", border: "none", padding: "10px 12px", cursor: "pointer" }}>
        <span className="flex items-center" style={{ gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>도움말</span>
          {totalCount > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "1px 7px" }}>{totalCount}</span>}
        </span>
        <ChevronRight size={14} color={C.muted} style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
      </button>
      {expanded && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="flex items-center" style={{ gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginRight: 1 }}>표시</span>
            {MEAL_TIP_OPTIONS.map((o) => {
              const on = tips[o.key] !== false;
              return (
                <button key={o.key} onClick={() => toggle(o.key)} style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${on ? C.sage : C.border}`, background: on ? C.sageLight : "transparent", color: on ? C.sageDeep : C.muted }}>{o.label}</button>
              );
            })}
          </div>
          {tips.stock !== false && <UrgentStockHint currentNames={currentNames} onAdd={onAdd} />}
          {tips.pairing !== false && <PairingHint currentNames={currentNames} onAdd={onAdd} />}
          {tips.usedToday !== false && <TodayUsedHint currentNames={currentNames} date={date} />}
        </div>
      )}
    </div>
  );
}

// 급여 기록 화면에서 재료별로 "저장하면 재고가 어떻게 바뀌는지" 안내 + 재고 반영 여부 체크박스
// (재고가 아예 없는 재료는 반영할 재고 자체가 없으므로 체크박스를 넣지 않음)
export function StockChangeHint({ item, checked, onToggle }) {
  const { state } = useStore();
  const cur = item.source === "frozen" ? stockTotalCubes(state, item.name) : stockFridgeG(state, item.name);
  if (cur <= 0) {
    return <div style={{ textAlign: "right", fontSize: 10, color: C.muted, marginTop: 4 }}>재고에 없는 재료예요</div>;
  }
  const unit = item.source === "frozen" ? "큐브" : "g";
  const used = item.source === "frozen" ? (item.qty || 0) : (item.fridgeG || 0);
  const after = Math.max(0, cur - used);
  const text = `재고 ${cur}${unit} → ${checked ? after : cur}${unit}`;
  return (
    <div className="flex items-center justify-end" style={{ gap: 7, marginTop: 4 }}>
      <span style={{ fontSize: 10, color: C.muted }}>{text}</span>
      <label className="flex items-center" style={{ gap: 4, cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={onToggle}
          style={{ width: 12, height: 12, cursor: "pointer", accentColor: C.sage }} />
        <span style={{ fontSize: 10, color: checked ? C.sageDeep : C.muted, fontWeight: 700 }}>재고 반영</span>
      </label>
    </div>
  );
}

// 시판 제품용 재고 반영 안내 - 전역 토글이 꺼져있으면 재고 반영 개념 자체가 없어 아무것도 표시하지 않음 (확정 정책)
export function ProductStockChangeHint({ item, checked, onToggle }) {
  const { state } = useStore();
  if (!state.settings.productStockEnabled) return null;
  const cur = productStockPacks(state, item.productId);
  if (cur <= 0) {
    return <div style={{ textAlign: "right", fontSize: 10, color: C.muted, marginTop: 4 }}>재고에 없는 제품이에요</div>;
  }
  const after = Math.max(0, cur - (item.qty || 0));
  const text = `재고 ${cur}팩 → ${checked ? after : cur}팩`;
  return (
    <div className="flex items-center justify-end" style={{ gap: 7, marginTop: 4 }}>
      <span style={{ fontSize: 10, color: C.muted }}>{text}</span>
      <label className="flex items-center" style={{ gap: 4, cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={onToggle}
          style={{ width: 12, height: 12, cursor: "pointer", accentColor: C.sage }} />
        <span style={{ fontSize: 10, color: checked ? C.sageDeep : C.muted, fontWeight: 700 }}>재고 반영</span>
      </label>
    </div>
  );
}
