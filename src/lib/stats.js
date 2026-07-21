/* 급여 통계 (주간 섭취율·월간 리포트·제조량) */
import React from "react";
import { addDaysISO, todayISO } from "./dates";
import { catOf, gOf, logProvideG, productCatSplit } from "../state/appState";
import { CATEGORIES } from "../theme";

export function weeklyRates(state) {
  const t = todayISO();
  const out = [];
  for (let w = 3; w >= 0; w--) {
    let provSum = 0, intSum = 0;
    for (let d = 0; d < 7; d++) {
      const iso = addDaysISO(t, -(w * 7 + d));
      (state.logs[iso] || []).forEach((log) => {
        const prov = logProvideG(log);
        provSum += prov; intSum += log.intakeG;
      });
    }
    out.push({ week: addDaysISO(t, -(w * 7 + 6)).slice(5), rate: provSum ? Math.round((intSum / provSum) * 100) : null });
  }
  return out;
}

/* 월간 리포트: 급여 횟수 · 평균 섭취율 · 카테고리별/재료별 추정 섭취 비율(제공량 × 전체 섭취율)
   시판 제품 항목은 포함 재료(또는 등록이 없으면 일반적인 이유식 비율 추정)를 기준으로 카테고리 집계에
   함께 반영하고(productCatSplit), 재료별(topIngredients) 집계는 함량을 정확히 알 수 없어 기존대로 제외.
   "제작 vs 시판" 비율(끼니 수 기준)은 별도로 함께 집계한다 */
export function monthStats(state, year, month) {
  const catTotals = {}; CATEGORIES.forEach((c) => { catTotals[c] = 0; });
  const ingredientTotals = {}; // 재료명 -> 추정 섭취 g
  let totalProv = 0, totalIntake = 0, count = 0, productMealCount = 0;
  Object.keys(state.logs).forEach((d) => {
    const dt = new Date(d + "T00:00:00");
    if (dt.getFullYear() !== year || dt.getMonth() !== month) return;
    (state.logs[d] || []).forEach((log) => {
      const prov = logProvideG(log);
      const rate = prov ? log.intakeG / prov : 0;
      totalProv += prov;
      totalIntake += log.intakeG;
      count += 1;
      let hasProduct = false;
      log.items.forEach((it) => {
        if (it.source === "product") {
          hasProduct = true;
          const split = productCatSplit(state, it.productId, gOf(state, it) * rate);
          Object.entries(split).forEach(([c, g]) => { catTotals[c] = (catTotals[c] || 0) + g; });
          return;
        }
        const g = it.source === "fridge" ? it.qty : it.qty * it.unitG;
        const cat = catOf(state, it.name);
        catTotals[cat] = (catTotals[cat] || 0) + g * rate;
        ingredientTotals[it.name] = (ingredientTotals[it.name] || 0) + g * rate;
      });
      if (hasProduct) productMealCount += 1;
    });
  });
  const avgRate = totalProv ? Math.round((totalIntake / totalProv) * 100) : null;
  const topIngredients = Object.entries(ingredientTotals)
    .map(([name, g]) => ({ name, g: Math.round(g) }))
    .filter((x) => x.g > 0)
    .sort((a, b) => b.g - a.g)
    .slice(0, 5);
  const productMealRate = count > 0 ? Math.round((productMealCount / count) * 100) : null;
  return { count, totalProv: Math.round(totalProv), totalIntake: Math.round(totalIntake), avgRate, catTotals, topIngredients, productMealCount, productMealRate };
}

/* 해당 월에 제조된 총량(g) — 재료별 배치의 제조 당시 기록(frozenOriginal/fridgeOriginal) 기준. 이 필드가 없는 옛 배치는 집계에서 제외됨 */
export function monthProducedG(state, year, month) {
  let total = 0;
  Object.values(state.stock).forEach((entry) => {
    (entry.batches || []).forEach((b) => {
      const dt = new Date(b.date + "T00:00:00");
      if (dt.getFullYear() !== year || dt.getMonth() !== month) return;
      if (b.frozenOriginal != null) total += b.frozenOriginal * (b.unitG || 15);
      if (b.fridgeOriginal != null) total += b.fridgeOriginal;
    });
  });
  return Math.round(total);
}
