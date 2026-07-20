/* 재고 소진 예측·알림 계산 */
import React from "react";
import { addDaysISO, todayISO } from "./dates";
import { stockBatches, stockFridgeG, stockTotalCubes, stockTotalFrozenG } from "../state/appState";

/* =====================================================================
   소진 예측 / 알림 계산
   ===================================================================== */
export function avgDailyUse(state, name, days = 14) {
  const t = todayISO();
  let total = 0;
  for (let i = 1; i <= days; i++) {
    const d = addDaysISO(t, -i);
    (state.logs[d] || []).forEach((log) => {
      log.items.forEach((it) => {
        if (it.name !== name) return;
        if (it.source === "fridge") total += it.qty; else total += it.qty * it.unitG;
      });
    });
  }
  return total / days; // g/day
}

export function daysLeft(state, name) {
  const g = stockTotalFrozenG(state, name);
  const avg = avgDailyUse(state, name);
  if (avg <= 0) return null;
  return Math.floor(g / avg);
}

// 냉동 재료의 보관 마지노선(제조일 기준 14일)까지 남은 일수 — 가장 임박한 배치 기준
export function frozenStorageDaysLeft(state, name) {
  const batches = stockBatches(state, name).filter((b) => b.frozen > 0 && b.frozenExp);
  if (batches.length === 0) return null;
  const nearestExp = batches.reduce((min, b) => (b.frozenExp < min ? b.frozenExp : min), batches[0].frozenExp);
  const t = todayISO();
  const diffMs = new Date(nearestExp + "T00:00:00") - new Date(t + "T00:00:00");
  return Math.round(diffMs / 86400000);
}

// 냉장 보관 재료의 보관 마지노선까지 남은 일수 — 가장 임박한 배치 기준 (냉동과 동일한 방식)
export function fridgeStorageDaysLeft(state, name) {
  const batches = stockBatches(state, name).filter((b) => (b.fridgeG || 0) > 0 && b.fridgeExp);
  if (batches.length === 0) return null;
  const nearestExp = batches.reduce((min, b) => (b.fridgeExp < min ? b.fridgeExp : min), batches[0].fridgeExp);
  const t = todayISO();
  const diffMs = new Date(nearestExp + "T00:00:00") - new Date(t + "T00:00:00");
  return Math.round(diffMs / 86400000);
}

// "냉장고 비우기" 대상 재료: 냉장 보관 중(항상 임박으로 취급)이거나, 냉동 보관기한이 며칠 안 남은 재료
export function urgentStockNames(state, frozenDaysThreshold = 3) {
  return Object.keys(state.stock)
    .map((name) => {
      const fg = stockFridgeG(state, name);
      const fd = frozenStorageDaysLeft(state, name);
      const urgent = fg > 0 || (fd != null && fd <= frozenDaysThreshold);
      if (!urgent) return null;
      // 정렬용 우선순위: 냉장 보관 중이면 가장 급함(-1), 아니면 냉동 보관기한 일수
      const rank = fg > 0 ? -1 : fd;
      return { name, fg, frozenDaysLeft: fd, fridgeDaysLeft: fg > 0 ? fridgeStorageDaysLeft(state, name) : null, rank };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank);
}

export function frozenAlerts(state) {
  return Object.keys(state.stock).map((name) => {
    const cubes = stockTotalCubes(state, name);
    // 냉동 큐브가 없어도 냉장 보관분이 남아있으면 실제로는 소진된 게 아니므로 이 알림에서 제외
    // (버그: 냉장 재고만 있는 재료도 무조건 "소진"으로 뜨던 문제 - 냉동 재고 기준 알림이라
    // 냉장으로 커버되는 동안은 "곧 떨어짐" 대상이 아님)
    if (cubes <= 0 && stockFridgeG(state, name) > 0) return null;
    // 재고가 완전히 소진된 재료는 예측(daysLeft) 없이 항상 0일로 취급해 알림에 포함
    // (예전엔 cubes<=0이면 통째로 제외돼서, 정작 다 떨어진 순간 알림이 사라지는 문제가 있었음)
    const dl = cubes > 0 ? daysLeft(state, name) : 0;
    return { name, cubes, g: stockTotalFrozenG(state, name), daysLeft: dl };
  }).filter((x) => x && x.daysLeft != null && x.daysLeft <= 5).sort((a, b) => a.daysLeft - b.daysLeft);
}

export function fridgeAlerts(state) {
  const t = todayISO();
  const out = [];
  Object.keys(state.stock).forEach((name) => {
    stockBatches(state, name).forEach((b) => {
      if ((b.fridgeG || 0) > 0 && b.fridgeExp) {
        const left = Math.round((new Date(b.fridgeExp) - new Date(t)) / 86400000);
        if (left <= state.settings.fridgeAlertDays + 1) out.push({ name, g: b.fridgeG, left });
      }
    });
  });
  return out;
}
