/* 식단 자동 생성 - 순수 로직(React/Firebase 무의존). 규칙 기반 제약 충족 그리디 알고리즘.
   AI(Gemini) 미사용 - 저장된 규칙(state.settings.autoGenRules)과 재료 풀만으로 결정. (작업지시서 PR A)

   범위 밖으로 명시적으로 뺀 것 / 단순화한 것:
   - "생선 빈도 제한" 프리셋은 재료 마스터에 "이 재료는 생선이다" 같은 태그가 없어서, 흔한 생선류 이름을
     하드코딩한 목록(FISH_INGREDIENT_NAMES)으로 대체함. 사용자가 규칙 화면에서 이름을 추가/제거할 수 있음.
   - 생성되는 재료 항목은 항상 냉동 큐브 기준(source 없음)으로만 만듦 - 냉장(fridge) 소스는 다루지 않음
     (기존 PlanItemsEditor의 새 재료 추가 기본값과 동일한 단순화).
   - "동일 조합 반복 간격"은 조합을 미리 예측해 후보를 걸러내지 않고(끼니 하나를 다 채워야 조합이
     정해지므로 사전 필터링 비용이 큼), 끼니를 다 채운 뒤 사후 검사만 해서 위반 시 경고만 남김
     (자리를 비우거나 되돌리지 않음 - 스펙 5번 "그래도 불가하면 경고 표시"에 해당하는 최종 완화 단계로 취급).
*/
import { addDaysISO, uid } from "./dates";
import { catOf, categoryList, currentUnitGOf, deductFrozen, isStaple, stockBatches } from "../state/appState";

// "생선 빈도 제한" 프리셋 기본 대상 - 사용자가 규칙 화면에서 직접 이름을 더하거나 뺄 수 있음
export const FISH_INGREDIENT_NAMES = ["연어", "고등어", "삼치", "장어", "대구살", "가자미", "조기", "참치"];

// 새로 도입(관찰중)된 재료 사이에 두는 최소 간격 - 스펙의 "2~3일"에서 2일로 확정
const NEW_INGREDIENT_COOLDOWN_DAYS = 2;

/* =====================================================================
   의학적 권고 프리셋 (ingredientRules의 preset 필드로 참조) - 근거 문구는 UI 툴팁용
   ===================================================================== */
export const INGREDIENT_RULE_PRESETS = [
  {
    preset: "ironSource",
    type: "requireDaily",
    label: "철분 공급",
    defaultEnabled: true,
    rationale: "생후 6개월 이후 체내 저장철 고갈로 철분이 풍부한 붉은 고기 매일 섭취 권장",
  },
  {
    preset: "fishLimit",
    type: "maxPerWeek",
    label: "생선 빈도 제한",
    defaultEnabled: true,
    rationale: "수은 노출 우려로 생선 섭취 빈도 제한 권고 (특히 대형 어류)",
  },
  {
    preset: "proteinEveryMeal",
    type: "categoryFloor",
    label: "단백질 분산",
    defaultEnabled: true,
    rationale: "후기 이유식 시기 단백질을 세 끼에 분산 공급 권장",
  },
  {
    preset: "newIngredientSpacing",
    type: "newIngredientSpacing",
    label: "신재료 도입 간격",
    defaultEnabled: true,
    rationale: "새 식품은 한 번에 한 가지씩, 2~3일 간격으로 관찰하는 알레르기 관리 원칙. 오전 배치는 반응 관찰이 용이한 실용적 권장사항",
  },
];

const presetById = (id) => INGREDIENT_RULE_PRESETS.find((p) => p.preset === id);

/* =====================================================================
   규칙 기본값 - 카테고리는 이름이 아니라 id로 저장(카테고리 관리에서 이름 변경 가능하므로)
   ===================================================================== */
export function defaultAutoGenRules(state) {
  const cats = categoryList(state);
  const categoryCounts = {};
  cats.forEach((c) => { categoryCounts[c.id] = { min: 0, max: 0 }; }); // 모르는 카테고리는 기본 배치 안 함
  const set = (name, min, max) => { const cat = cats.find((c) => c.name === name); if (cat) categoryCounts[cat.id] = { min, max }; };
  set("탄수화물", 0, 0); // 탄수화물은 staple 규칙이 별도로 담당
  set("단백질", 1, 1);
  set("채소", 2, 3);
  set("과일", 0, 1);
  set("유제품", 0, 1);

  return {
    perMeal: { categoryCounts, targetTotalG: 150 },
    staple: { includeEveryMeal: true, defaultG: 80 },
    ingredientRules: [
      { id: uid(), preset: "ironSource", type: "requireDaily", ingredient: "소고기", enabled: true },
      { id: uid(), preset: "fishLimit", type: "maxPerWeek", names: [...FISH_INGREDIENT_NAMES], value: 2, enabled: true },
      { id: uid(), preset: "proteinEveryMeal", type: "categoryFloor", categoryName: "단백질", value: 1, enabled: true },
      { id: uid(), preset: "newIngredientSpacing", type: "newIngredientSpacing", cooldownDays: NEW_INGREDIENT_COOLDOWN_DAYS, enabled: true },
    ],
    variety: { noConsecutiveMeals: true, allowSameDayRepeat: false, stapleExemptFromVariety: true, comboRepeatGapDays: 3 },
    stock: { mode: "stockFirst", preferExpiring: true, autoShopping: true },
    includeProducts: false,
  };
}

// 카테고리 추가/삭제/이름변경에 규칙을 맞춤 - 삭제된 카테고리의 규칙은 조용히 제거하고(안내 문구는
// 개수만 표시 - 카테고리가 이미 삭제된 뒤라 이름을 복원할 방법이 없음, id는 uid()라 사람이 읽을 수 없음),
// 새로 생긴 카테고리는 {min:0,max:0}(자동 배치 안 함)으로 채워 넣음
export function validateAutoGenRules(state, rules) {
  if (!rules) return { rules: defaultAutoGenRules(state), removedCount: 0 };
  const cats = categoryList(state);
  const validIds = new Set(cats.map((c) => c.id));
  const oldCounts = (rules.perMeal && rules.perMeal.categoryCounts) || {};
  const categoryCounts = {};
  cats.forEach((c) => { categoryCounts[c.id] = oldCounts[c.id] || { min: 0, max: 0 }; });
  const removedCount = Object.keys(oldCounts).filter((id) => !validIds.has(id)).length;
  return {
    rules: {
      ...defaultAutoGenRules(state),
      ...rules,
      perMeal: { ...(rules.perMeal || {}), categoryCounts },
    },
    removedCount,
  };
}

// 생성 전 규칙 화면에서 보여줄 충돌 경고 (필수 규칙 재료가 재료 풀에서 빠진 경우 등)
export function checkRuleConflicts(state, rules, pool) {
  const poolSet = new Set(pool);
  const warnings = [];
  (rules.ingredientRules || []).forEach((r) => {
    if (!r.enabled) return;
    if (r.type === "requireDaily" && r.ingredient && !poolSet.has(r.ingredient)) {
      warnings.push(`'${(presetById(r.preset) || {}).label || "필수 규칙"}'의 재료(${r.ingredient})가 재료 풀에 없어요`);
    }
  });
  if (rules.staple.includeEveryMeal && !pool.some((n) => isStaple(state, n))) {
    warnings.push("주식(탄수화물) 재료가 재료 풀에 없어서 자동 포함 규칙을 건너뜁니다");
  }
  return warnings;
}

/* =====================================================================
   재료 풀 구성 - intros 상태 기준. 중단은 항상 제외, 관찰중·주의는 각각 토글로 포함 가능.
   intros에 아예 없는 재료(한 번도 소개 안 한 재료)는 포함 안 함(하단 "직접 추가"로만 가능)
   ===================================================================== */
export function buildIngredientPool(state, { includeCaution = false, includeObserving = false } = {}) {
  const names = new Set();
  (state.intros || []).forEach((it) => {
    if (it.status === "이상없음") names.add(it.name);
    else if (it.status === "관찰중" && includeObserving) names.add(it.name);
    else if (it.status === "주의" && includeCaution) names.add(it.name);
    // "중단"은 항상 제외
  });
  return [...names].sort((a, b) => a.localeCompare(b, "ko"));
}

/* =====================================================================
   생성 알고리즘
   ===================================================================== */
function enumerateDates(startDate, endDate) {
  const out = [];
  let d = startDate;
  let guard = 0;
  while (d <= endDate && guard < 400) {
    out.push(d);
    d = addDaysISO(d, 1);
    guard++;
  }
  return out;
}
// 날짜 범위를 밖에서도 계산해볼 수 있게 export (기간 선택 UI용)
export { enumerateDates };

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeItem(state, name, targetG) {
  const unitG = currentUnitGOf(state, name) || 15;
  const qty = Math.max(1, Math.round(targetG / unitG));
  return { name, qty, unitG, gramsOverride: null };
}

// 가상 재고에서 시도해보고 실제로 채워진 양을 반환(부족하면 있는 만큼만, vStock이 null이면 항상 충분한 것으로 취급)
function tryVirtualDeduct(vStock, name, cubes) {
  if (!vStock) return cubes; // ignoreStock 모드
  return deductFrozen(vStock, name, cubes, []);
}

/**
 * @param {object} state 앱 전체 상태(읽기 전용으로만 사용 - 이 함수는 state를 변형하지 않음)
 * @param {object} opts
 * @param {string[]} opts.dates 생성할 날짜(YYYY-MM-DD) 목록, 오름차순 - 기존 계획 존재 여부 등은 호출부가 이미 걸러서 넘김
 * @param {string[]} opts.pool 이번 생성에 사용할 재료 이름 목록(재료 풀 화면에서 체크한 결과)
 * @param {object} opts.rules autoGenRules
 * @param {() => number} [opts.rng] 0~1 난수 함수(테스트에서 결정적 시드 주입용), 기본 Math.random
 * @returns {{ plansByDate: Record<string, Array>, firstNoStockDate: string|null, warnings: string[] }}
 */
export function generatePlan(state, opts) {
  const { dates, pool, rules, rng = Math.random } = opts;
  const slots = [...(state.mealSlots || [])].sort((a, b) => a.time.localeCompare(b.time));
  const cats = categoryList(state);
  const poolByCat = {};
  cats.forEach((c) => { poolByCat[c.id] = pool.filter((n) => !isStaple(state, n) && catOf(state, n) === c.name); });
  const stapleNames = pool.filter((n) => isStaple(state, n));

  const vStock = rules.stock.mode === "stockFirst" ? structuredClone(state.stock) : null;
  const warnings = [];

  // 규칙 인덱싱
  const requireDailyRules = (rules.ingredientRules || []).filter((r) => r.enabled && r.type === "requireDaily");
  const maxPerWeekRules = (rules.ingredientRules || []).filter((r) => r.enabled && r.type === "maxPerWeek");
  const categoryFloorRules = (rules.ingredientRules || []).filter((r) => r.enabled && r.type === "categoryFloor");
  const newIngredientRule = (rules.ingredientRules || []).find((r) => r.enabled && r.type === "newIngredientSpacing");

  // categoryFloor 프리셋 적용(예: 단백질 분산 -> 단백질 카테고리 min을 최소 1로)
  const categoryCounts = { ...rules.perMeal.categoryCounts };
  categoryFloorRules.forEach((r) => {
    const cat = cats.find((c) => c.name === r.categoryName);
    if (!cat) return;
    const cur = categoryCounts[cat.id] || { min: 0, max: 0 };
    categoryCounts[cat.id] = { min: Math.max(cur.min, r.value || 0), max: Math.max(cur.max, cur.min, r.value || 0) };
  });

  const observingNames = new Set((state.intros || []).filter((it) => it.status === "관찰중").map((it) => it.name));

  // 사용 이력 (다양성 스코어링 + 연속 금지 + 조합 반복 간격용)
  const usageCount = {}; // name -> 누적 사용 횟수(스코어링)
  const lastUsedIdx = {}; // name -> 마지막 사용된 전체 끼니 순번(연속 금지 판정용)
  const weeklyUseDates = {}; // ruleId -> [dateIdx,...] (그룹 주간 빈도 제한용, 날짜 단위 1회만 카운트)
  const comboHistory = []; // [{dateIdx, key}]
  let lastNewIngredientDateIdx = -Infinity;
  let mealSeq = 0;
  let firstNoStockDateIdx = null;

  const isOnCooldownGroup = (rule, dateIdx) => {
    const within = (weeklyUseDates[rule.id] || []).filter((d) => dateIdx - d < 7);
    return within.length >= (rule.value || Infinity);
  };
  const markGroupUse = (rule, dateIdx) => {
    if (!weeklyUseDates[rule.id]) weeklyUseDates[rule.id] = [];
    if (!weeklyUseDates[rule.id].includes(dateIdx)) weeklyUseDates[rule.id].push(dateIdx);
  };
  const groupRuleFor = (name) => maxPerWeekRules.find((r) => (r.names || []).includes(name));

  const violatesGroupCap = (name, dateIdx) => {
    const rule = groupRuleFor(name);
    if (!rule) return false;
    const usedTodayAlready = (weeklyUseDates[rule.id] || []).includes(dateIdx);
    if (usedTodayAlready) return false; // 같은 날 추가 사용은 새 "횟수"로 안 침 - 그룹 전체가 이미 오늘 카운트됨
    return isOnCooldownGroup(rule, dateIdx);
  };

  // 신재료(관찰중) 배치 제약: 오전 첫 끼에만 + 다른 신재료와 최소 간격 - 이미 도입 중인 같은 재료를
  // 이어서 배치하는 건 새로 "도입"하는 게 아니므로 간격 제한에 걸리지 않음
  let lastNewIngredientNameUsed = null;
  const violatesNewIngredientRule = (name, dateIdx, mealIdxInDay) => {
    if (!observingNames.has(name) || !newIngredientRule) return false;
    if (mealIdxInDay !== 0) return true;
    if (name === lastNewIngredientNameUsed) return false;
    return dateIdx - lastNewIngredientDateIdx < (newIngredientRule.cooldownDays ?? NEW_INGREDIENT_COOLDOWN_DAYS);
  };

  const scoreCandidate = (name) => {
    const batches = stockBatches(state, name);
    const hasStock = vStock ? ((vStock[name] || {}).batches || []).some((b) => (b.frozen || 0) > 0) : true;
    const soonestExp = batches.reduce((min, b) => (b.frozenExp && (!min || b.frozenExp < min) ? b.frozenExp : min), null);
    return [
      hasStock ? 0 : 1, // 재고 있는 게 우선(오름차순 정렬 기준이라 작을수록 좋음)
      soonestExp || "9999-99-99",
      usageCount[name] || 0,
    ];
  };

  const sortByScore = (names) => shuffle(names, rng).sort((a, b) => {
    const sa = scoreCandidate(a), sb = scoreCandidate(b);
    for (let i = 0; i < sa.length; i++) { if (sa[i] !== sb[i]) return sa[i] < sb[i] ? -1 : 1; }
    return 0;
  });

  // 다양성 제약(연속 금지·같은 날 반복)은 단계적으로 완화하되, 신재료 도입 제약과 주간 빈도 상한
  // (생선 등 의학적 권고)은 안전 규칙이라 스펙의 완화 대상 목록에 없음 - base에 항상 포함시켜 절대 안 풀림.
  // 완화 순서: 1) 전부 적용 2) 연속 금지만 해제 3) 같은 날 반복도 허용하되 "바로 직전 끼니와는 다르게"만 지킴
  // 4) 그래도 안 되면 다 허용(그래도 신재료 제약·주간 상한은 base에서 계속 걸러짐)
  const pickCandidates = (candidatesIn, count, dateIdx, mealIdxInDay, usedTodayNames) => {
    const base = candidatesIn.filter((n) => !violatesNewIngredientRule(n, dateIdx, mealIdxInDay) && !violatesGroupCap(n, dateIdx));
    let candidates = base.filter((n) => {
      if (!rules.variety.allowSameDayRepeat && usedTodayNames.has(n)) return false;
      if (rules.variety.noConsecutiveMeals && lastUsedIdx[n] === mealSeq - 1) return false;
      return true;
    });
    let relaxed = false;
    if (candidates.length < count) {
      candidates = base.filter((n) => rules.variety.allowSameDayRepeat || !usedTodayNames.has(n));
      relaxed = candidates.length > 0;
    }
    if (candidates.length < count) {
      candidates = base.filter((n) => lastUsedIdx[n] !== mealSeq - 1);
      relaxed = candidates.length > 0;
    }
    if (candidates.length < count) {
      candidates = base;
      relaxed = candidates.length > 0;
    }
    return { picked: sortByScore(candidates).slice(0, count), relaxed };
  };

  const markUsed = (name, dateIdx) => {
    usageCount[name] = (usageCount[name] || 0) + 1;
    lastUsedIdx[name] = mealSeq;
    const rule = groupRuleFor(name);
    if (rule) markGroupUse(rule, dateIdx);
    if (observingNames.has(name)) { lastNewIngredientDateIdx = dateIdx; lastNewIngredientNameUsed = name; }
  };

  const placeItem = (items, name, targetG, dateIdx) => {
    const unitG = currentUnitGOf(state, name) || 15;
    const requested = Math.max(1, Math.round(targetG / unitG));
    const actual = tryVirtualDeduct(vStock, name, requested);
    if (vStock && actual < requested && firstNoStockDateIdx === null) firstNoStockDateIdx = dateIdx;
    items.push({ name, qty: requested, unitG, gramsOverride: null, _noStock: !!vStock && actual < requested });
  };

  const plansByDate = {};

  dates.forEach((date, dateIdx) => {
    const dayMeals = [];
    const usedTodayNames = new Set();
    const requiredToday = new Set(requireDailyRules.map((r) => r.ingredient).filter((n) => pool.includes(n)));
    const satisfiedToday = new Set();

    slots.forEach((slot, mealIdxInDay) => {
      const items = [];
      const perCatTarget = Object.values(categoryCounts).filter((r) => (r.max || 0) > 0);
      const totalSlots = perCatTarget.reduce((s, r) => s + r.max, 0) + (rules.staple.includeEveryMeal ? 1 : 0) || 1;
      const perItemG = Math.max(10, Math.round(rules.perMeal.targetTotalG / totalSlots));

      // staple (다양성 규칙 면제 시에도 재고·유통기한 스코어링은 그대로 적용)
      if (rules.staple.includeEveryMeal && stapleNames.length > 0) {
        const { picked } = rules.variety.stapleExemptFromVariety
          ? { picked: sortByScore(stapleNames).slice(0, 1) }
          : pickCandidates(stapleNames, 1, dateIdx, mealIdxInDay, usedTodayNames);
        picked.forEach((name) => {
          placeItem(items, name, rules.staple.defaultG, dateIdx);
          usedTodayNames.add(name);
          markUsed(name, dateIdx);
        });
      }

      // 카테고리별 채우기
      cats.forEach((cat) => {
        const range = categoryCounts[cat.id] || { min: 0, max: 0 };
        if ((range.max || 0) <= 0) return;
        const count = range.min + Math.floor(rng() * (range.max - range.min + 1));
        if (count <= 0) return;
        const pooled = poolByCat[cat.id] || [];
        const { picked, relaxed } = pickCandidates(pooled, count, dateIdx, mealIdxInDay, usedTodayNames);
        if (picked.length < range.min) {
          warnings.push(`${date} ${slot.label}: '${cat.name}' 카테고리를 채울 재료가 부족해요`);
        } else if (relaxed) {
          warnings.push(`${date} ${slot.label}: 다양성 규칙을 완화해서 재료를 배치했어요`);
        }
        picked.forEach((name) => {
          placeItem(items, name, perItemG, dateIdx);
          usedTodayNames.add(name);
          markUsed(name, dateIdx);
          if (requiredToday.has(name)) satisfiedToday.add(name);
        });
      });

      dayMeals.push({ id: uid(), label: slot.label, time: slot.time, items, fromAutoGen: true });
      mealSeq++;
    });

    // requireDaily 후행 보정: 하루가 끝났는데도 필수 재료가 하나도 안 들어갔으면, 첫 끼니에 추가로
    // 끼워 넣는다(카테고리 min/max를 넘겨서라도 - 의학적 권고가 다양성보다 우선)
    requiredToday.forEach((name) => {
      if (satisfiedToday.has(name) || dayMeals.length === 0) return;
      placeItem(dayMeals[0].items, name, rules.perMeal.targetTotalG / 4, dateIdx);
      markUsed(name, dateIdx);
    });

    // 조합(끼니 내 비-staple 재료 조합) 반복 간격 체크 - 위반해도 되돌리진 않고 경고만(최종 완화 단계)
    dayMeals.forEach((meal) => {
      const key = meal.items.filter((it) => !isStaple(state, it.name)).map((it) => it.name).sort().join("+");
      if (!key) return;
      const dup = comboHistory.find((h) => h.key === key && dateIdx - h.dateIdx < rules.variety.comboRepeatGapDays);
      if (dup) warnings.push(`${date} ${meal.label}: 최근에 나온 조합과 같아요 (반복 간격 규칙 완화됨)`);
      comboHistory.push({ dateIdx, key });
    });

    plansByDate[date] = dayMeals;
  });

  return {
    plansByDate,
    firstNoStockDate: firstNoStockDateIdx !== null ? dates[firstNoStockDateIdx] : null,
    warnings,
  };
}
