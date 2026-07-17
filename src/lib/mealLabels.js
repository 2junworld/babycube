/* 주간 그리드의 끼니 열 순서 계산 (식단표·급여표 공용) */
import React from "react";

// 해당 주간의 끼니 열 순서: 설정된 끼니 종류(mealSlots)를 시간순으로 기본 배치하고,
// 그 외 라벨(직접 입력 등)은 첫 등장 시간순으로 뒤에 추가
export function weekMealLabels(state, days) {
  const configured = [...state.mealSlots].sort((a, b) => a.time.localeCompare(b.time)).map((s) => s.label);
  const extra = new Map();
  days.forEach((iso) => (state.plans[iso] || []).forEach((m) => {
    if (configured.includes(m.label)) return;
    if (!extra.has(m.label) || m.time < extra.get(m.label)) extra.set(m.label, m.time || "99:99");
  }));
  const extraLabels = Array.from(extra.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([l]) => l);
  return [...configured, ...extraLabels];
}

// 급여표(실제 기록) 그리드의 열 순서: 계획 라벨(weekMealLabels) 기준에, 그 주에 실제 기록만
// 있고 계획은 없는 라벨(예: 계획을 나중에 삭제했지만 기록은 남아있는 경우)을 뒤에 합쳐서(union)
// 계산함 - 계획 라벨만 쓰면 이런 "계획 없는 기록"이 급여표에서 조용히 안 보이게 됨
export function weekLogLabels(state, days) {
  const planLabels = weekMealLabels(state, days);
  const extra = new Map();
  days.forEach((iso) => (state.logs[iso] || []).forEach((l) => {
    if (planLabels.includes(l.label) || extra.has(l.label)) return;
    extra.set(l.label, l.time || "99:99");
  }));
  const extraLabels = Array.from(extra.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([l]) => l);
  return [...planLabels, ...extraLabels];
}
