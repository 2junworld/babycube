/* 식단 자동 생성 - 순수 로직(React/Firebase 무의존). 규칙 기반 제약 충족 그리디 알고리즘.
   AI(Gemini) 미사용 - 저장된 규칙(state.settings.autoGenRules)과 재료 풀만으로 결정. (작업지시서 PR A)

   범위 밖으로 명시적으로 뺀 것 / 단순화한 것:
   - "동일 조합 반복"은 여러 날에 걸친 간격 대신 "같은 날 안에서만 안 겹치면 됨"으로 단순화(사용자 피드백).
     끼니 하나를 다 채운 뒤 오늘 이미 나온 조합과 겹치면 카테고리 하나를 다른 후보로 바꿔보는 재시도를
     몇 차례 하고, 그래도 안 되면 경고만 남기고 그대로 둠.
*/
import { addDaysISO, uid } from "./dates";
import { catOf, categoryList, currentUnitGOf, deductFridge, deductFrozen, gOf, stockBatches, stockFridgeG, stockTotalCubes } from "../state/appState";
import { pairingInfoFor, pairingRankFor } from "./pairing";

// 자동 생성에서 "주식(탄수화물)"은 재료의 isStaple 플래그(장보기 자동등록·여행계산 제외 용도로 쓰이는
// 별개 설정)가 아니라 카테고리로 판단한다 - 재료 풀 화면이 카테고리별로 묶여 있어서 사용자는
// "탄수화물 카테고리에 있으면 주식으로 쓰이겠구나"라고 자연스럽게 기대하는데, isStaple 플래그 기준으로
// 판단하면 그 기대와 어긋나 "재료 풀에 있는데도 없다고 뜬다" 같은 혼란스러운 경고가 생겼음
const CARB_CATEGORY_NAME = "탄수화물";
const isCarbStaple = (state, name) => catOf(state, name) === CARB_CATEGORY_NAME;

// 재료 정보 화면에서 라벨 편집 시 "생선"류로 자주 분류되는 재료에 추천 칩으로만 쓰임(자동으로
// 라벨을 붙이지는 않음 - 사용자가 직접 붙여야 "생선 빈도 제한" 규칙이 그 재료를 인식함)
export const COMMON_FISH_NAMES = ["연어", "고등어", "삼치", "장어", "대구살", "가자미", "조기", "참치"];

// 새로 도입(관찰중)된 재료 사이에 두는 최소 간격 - 스펙의 "2~3일"에서 2일로 확정
const NEW_INGREDIENT_COOLDOWN_DAYS = 2;
// 조합 반복 회피를 위해 카테고리 하나를 다른 후보로 바꿔보는 최대 시도 횟수
const COMBO_RETRY_ATTEMPTS = 4;

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
    rationale: "수은 노출 우려로 생선 섭취 빈도 제한 권고 (특히 대형 어류). 재료 정보 화면에서 '생선' 라벨을 붙인 재료끼리 묶어서 계산돼요",
  },
  {
    preset: "proteinEveryMeal",
    type: "categoryFloor",
    label: "단백질 분산",
    defaultEnabled: true,
    rationale: "후기 이유식 시기엔 단백질을 매 끼니 고르게 나눠주는 게 좋아요. 켜두면 위 '끼니당 카테고리 구성'에서 단백질 최소 개수가 자동으로 1종 이상으로 맞춰져요.",
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
    // perIngredientG: 재료 풀 화면에서 재료별로 직접 지정한 1회 급여량(g, 냉동 큐브 입력도 내부적으로는
    // 이 그램 값으로 환산해 저장) - 지정 안 한 재료는 그 끼니의 목표 총량을 카테고리 슬롯 수로 나눈 값을 씀.
    // perIngredientType: 재료 풀 화면에서 사용자가 고른 기본 재료 유형("frozen"|"fridge", 기본 frozen) -
    // 입력창 단위(큐브 개수 vs 중량) 선택 및 실제 재고가 전혀 없을 때의 대체값으로만 쓰이고, 재고 우선
    // 모드에서는 resolveStorageType()이 실제 재고 구성을 우선함(냉장 재고가 있으면 사용자 선택과 무관하게 냉장부터)
    // targetGByLabel: 끼니 이름(아침/점심/저녁 등)별 목표 총량 오버라이드 - 지정 안 한 끼니는 targetTotalG(기본값)를 씀
    perMeal: { categoryCounts, targetTotalG: 150, targetGByLabel: {}, perIngredientG: {}, perIngredientType: {} },
    staple: { includeEveryMeal: true, defaultG: 80 },
    ingredientRules: [
      { id: uid(), preset: "ironSource", type: "requireDaily", ingredient: "소고기", enabled: true },
      { id: uid(), preset: "fishLimit", type: "maxPerWeek", label: "생선", value: 2, enabled: true },
      { id: uid(), preset: "proteinEveryMeal", type: "categoryFloor", categoryName: "단백질", value: 1, enabled: true },
      { id: uid(), preset: "newIngredientSpacing", type: "newIngredientSpacing", cooldownDays: NEW_INGREDIENT_COOLDOWN_DAYS, enabled: true },
    ],
    // 주식은 항상 다양성 규칙에서 예외(같은 주식이 매 끼니 반복돼도 됨) - 예전엔 별도 토글이었는데
    // "매 끼니 자동 포함"(staple.includeEveryMeal)과 개념이 겹쳐 헷갈린다는 피드백으로 토글을 없애고
    // 항상 예외로 고정함(기본값이 이미 true였으므로 실사용 동작은 그대로)
    variety: { noConsecutiveMeals: true, allowSameDayRepeat: false },
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
  const removedCount = Object.keys(oldCounts).filter((id) => !validIds.has(id)).length;
  const categoryCounts = {};
  cats.forEach((c) => { categoryCounts[c.id] = oldCounts[c.id] || { min: 0, max: 0 }; });
  return {
    rules: {
      ...defaultAutoGenRules(state),
      ...rules,
      perMeal: { ...(rules.perMeal || {}), categoryCounts },
    },
    removedCount,
  };
}

// 재료 하나를 냉동 큐브 vs 냉장 계량 중 어느 쪽으로 다룰지 최종 결정.
// - 재고 무시 모드: 실제 재고를 아예 보지 않고 사용자가 재료 풀 화면에서 고른 기본값을 그대로 따름.
// - 재고 우선 모드: 실제 재고 구성이 사용자의 선택보다 우선함 - 냉장 재고가 남아있으면(유통기한이
//   짧아 먼저 소진해야 하므로) 사용자 선택과 무관하게 냉장부터, 냉장이 없고 냉동만 있으면 냉동으로.
//   그 재료 재고가 아예 없으면 역시 사용자가 고른 기본값(기본 냉동)으로 대체함.
export function resolveStorageType(state, name, rules) {
  const preferred = (rules.perMeal.perIngredientType && rules.perMeal.perIngredientType[name]) || "frozen";
  if (rules.stock.mode === "ignoreStock") return preferred;
  if (stockFridgeG(state, name) > 0) return "fridge";
  if (stockTotalCubes(state, name) > 0) return "frozen";
  return preferred;
}

// 카테고리 관리 화면에서 삭제 전에 확인하는 용도 - 이 카테고리가 자동 생성 규칙에서 실제로(0,0이 아니게)
// 쓰이고 있는지. categoryFloor(예: "단백질 분산")는 카테고리 이름으로 참조하므로 이름으로도 확인
export function categoryUsedInAutoGenRules(rules, category) {
  if (!rules) return false;
  const r = rules.perMeal && rules.perMeal.categoryCounts && rules.perMeal.categoryCounts[category.id];
  if (r && ((r.min || 0) > 0 || (r.max || 0) > 0)) return true;
  return (rules.ingredientRules || []).some((rule) => rule.enabled && rule.type === "categoryFloor" && rule.categoryName === category.name);
}

// 카테고리 삭제는 저장된 규칙을 건드리지 않으므로(위 categoryUsedInAutoGenRules 경고 참고), 삭제
// 이후에도 규칙엔 이제 없는 카테고리 참조가 그대로 남아있을 수 있음. 자동 생성을 실제로 실행하기
// 직전(PR C의 생성 버튼)에 이 함수로 확인해서, 걸리면 조용히 기본값으로 대체하지 말고 "이 규칙은
// 지금 상태로 쓸 수 없어요" 안내로 막고 규칙 화면으로 보내 사용자가 직접 다시 확인하게 함
export function rulesReferenceDeletedCategory(state, rules) {
  if (!rules) return false;
  const validIds = new Set(categoryList(state).map((c) => c.id));
  const counts = (rules.perMeal && rules.perMeal.categoryCounts) || {};
  return Object.entries(counts).some(([id, r]) => !validIds.has(id) && ((r.min || 0) > 0 || (r.max || 0) > 0));
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
    if (r.type === "maxPerWeek" && r.label && !pool.some((n) => (state.ingredients[n]?.labels || []).includes(r.label))) {
      warnings.push(`'${(presetById(r.preset) || {}).label || "빈도 제한"}' 규칙에 걸리는 '${r.label}' 라벨 재료가 아직 없어요 - 재료 정보에서 라벨을 붙여보세요`);
    }
  });
  if (rules.staple.includeEveryMeal && !pool.some((n) => isCarbStaple(state, n))) {
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

// 재료 풀 화면 기본 노출용 - 후보 이름 목록 중 실제 냉동/냉장 재고가 조금이라도 있는 것만 남김.
// 재고 없는 재료는 화면에 처음부터 죽 나열하는 대신 "재료 선택" 버튼(피커)으로만 추가하게 해서
// 매번 재료 풀 전체를 훑어야 하는 부담을 줄임
export function withStockOnly(state, names) {
  return names.filter((n) => stockTotalCubes(state, n) > 0 || stockFridgeG(state, n) > 0);
}

// 재료 풀 화면에서 "1회 급여량"을 급여 기록 히스토리 기반으로 미리 채워주기 위한 평균 계산.
// 시판 제품 항목은 재료 단위 함량을 알 수 없어 제외. 기록이 하나도 없으면 null(호출부가 기본값을 씀)
export function avgServingGFromLogs(state, name) {
  let sum = 0, count = 0;
  Object.values(state.logs || {}).forEach((dayLogs) => {
    (dayLogs || []).forEach((log) => {
      (log.items || []).forEach((it) => {
        if (it.source === "product" || it.name !== name) return;
        sum += gOf(state, it);
        count++;
      });
    });
  });
  return count > 0 ? Math.round(sum / count) : null;
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

const comboKeyOf = (state, items) => items.filter((it) => !isCarbStaple(state, it.name)).map((it) => it.name).sort().join("+");

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
  cats.forEach((c) => { poolByCat[c.id] = pool.filter((n) => !isCarbStaple(state, n) && catOf(state, n) === c.name); });
  const stapleNames = pool.filter((n) => isCarbStaple(state, n));

  const vStock = rules.stock.mode === "stockFirst" ? structuredClone(state.stock) : null;
  const warnings = [];

  // 재료별 저장 형태 판단(냉동 큐브 vs 냉장 계량) - 지금 실제 재고 구성 + 사용자가 재료 풀 화면에서
  // 고른 기본값을 기준으로 생성 내내 고정(resolveStorageType 참고). staple(무른밥 등)도 예외 없이
  // 동일하게 판단 - 무른밥은 흔히 냉장 보관이라 실제 재고 형태를 따르는 게 맞음
  const storageTypeOf = {};
  pool.forEach((name) => { storageTypeOf[name] = resolveStorageType(state, name, rules); });

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
  const perIngredientG = rules.perMeal.perIngredientG || {};

  // 사용 이력 (다양성 스코어링 + 연속 금지 + 주간 빈도 상한용) - 모두 "커밋된" 끼니 기준으로만 갱신됨
  const usageCount = {}; // name -> 누적 사용 횟수(스코어링)
  const lastUsedIdx = {}; // name -> 마지막 사용된 전체 끼니 순번(연속 금지 판정용)
  const weeklyUseDates = {}; // ruleId -> [dateIdx,...] (그룹 주간 빈도 제한용, 날짜 단위 1회만 카운트)
  const todayCombos = {}; // dateIdx -> Set<comboKey> (같은 날 안에서만 조합 중복 검사)
  let lastNewIngredientDateIdx = -Infinity;
  let lastNewIngredientNameUsed = null;
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
  const labelsOf = (name) => (state.ingredients[name] && state.ingredients[name].labels) || [];
  const groupRuleFor = (name) => maxPerWeekRules.find((r) => r.label && labelsOf(name).includes(r.label));

  const violatesGroupCap = (name, dateIdx) => {
    const rule = groupRuleFor(name);
    if (!rule) return false;
    const usedTodayAlready = (weeklyUseDates[rule.id] || []).includes(dateIdx);
    if (usedTodayAlready) return false; // 같은 날 추가 사용은 새 "횟수"로 안 침 - 그룹 전체가 이미 오늘 카운트됨
    return isOnCooldownGroup(rule, dateIdx);
  };

  // 신재료(관찰중) 배치 제약: 오전 첫 끼에만 + 다른 신재료와 최소 간격 - 이미 도입 중인 같은 재료를
  // 이어서 배치하는 건 새로 "도입"하는 게 아니므로 간격 제한에 걸리지 않음
  const violatesNewIngredientRule = (name, dateIdx, mealIdxInDay) => {
    if (!observingNames.has(name) || !newIngredientRule) return false;
    if (mealIdxInDay !== 0) return true;
    if (name === lastNewIngredientNameUsed) return false;
    return dateIdx - lastNewIngredientDateIdx < (newIngredientRule.cooldownDays ?? NEW_INGREDIENT_COOLDOWN_DAYS);
  };

  // 이미 이번 끼니에 담긴 재료들과의 궁합 등급 - 0/1(좋은 궁합, 등급 A/B) < 2(중립) < 3(주의 조합).
  // 완전히 막지는 않고 순위만 뒤로 미룸(재고·다양성 제약으로 다른 후보가 없으면 그래도 주의 조합이 선택될 수 있음 -
  // 기존 앱의 "주의 조합" 개념도 경고일 뿐 차단은 아니므로 같은 정책을 따름)
  const pairingTier = (name, alreadyInMeal) => {
    if (!alreadyInMeal || alreadyInMeal.length === 0) return 2;
    const { goodWith, avoidWith } = pairingInfoFor(state, alreadyInMeal, name);
    if (avoidWith.length > 0) return 3;
    if (goodWith.length > 0) {
      const rank = pairingRankFor(state, alreadyInMeal, name);
      return rank === null ? 1 : rank;
    }
    return 2;
  };

  const scoreCandidate = (name, alreadyInMeal = []) => {
    const isFridge = storageTypeOf[name] === "fridge";
    const batches = stockBatches(state, name);
    const hasStock = vStock
      ? ((vStock[name] || {}).batches || []).some((b) => (isFridge ? (b.fridgeG || 0) > 0 : (b.frozen || 0) > 0))
      : true;
    // 저장 형태에 맞는 유통기한 필드를 봐야 함 - 냉장 전용 재료를 frozenExp만 보고 스코어링하면
    // "만료일이 없다"고 오판해서 항상 우선순위가 밀리는 문제가 있었음
    const soonestExp = batches.reduce((min, b) => {
      const exp = isFridge ? b.fridgeExp : b.frozenExp;
      return exp && (!min || exp < min) ? exp : min;
    }, null);
    return [
      hasStock ? 0 : 1, // 재고 있는 게 우선(오름차순 정렬 기준이라 작을수록 좋음)
      pairingTier(name, alreadyInMeal), // 이미 담긴 재료와 궁합 좋으면 우대, 주의 조합이면 최대한 뒤로
      soonestExp || "9999-99-99",
      usageCount[name] || 0,
    ];
  };

  const sortByScore = (names, alreadyInMeal = []) => shuffle(names, rng).sort((a, b) => {
    const sa = scoreCandidate(a, alreadyInMeal), sb = scoreCandidate(b, alreadyInMeal);
    for (let i = 0; i < sa.length; i++) { if (sa[i] !== sb[i]) return sa[i] < sb[i] ? -1 : 1; }
    return 0;
  });

  // 같은 끼니 안에서 두 번 고르는 것은 항상 금지(usedThisMeal - 완화 대상 아님). 그 외 "오늘 다른 끼니와
  // 반복"·"바로 직전 끼니와 반복"은 다양성 규칙이라 단계적으로 완화하되, 신재료 도입 제약과 주간 빈도
  // 상한(생선 등 의학적 권고)은 안전 규칙이라 완화 대상이 아님 - base에 항상 포함시켜 절대 안 풀림.
  // 완화 순서: 1) 전부 적용 2) 연속 금지만 해제 3) 같은 날 반복도 허용하되 "바로 직전 끼니와는 다르게"만
  // 지킴 4) 그래도 안 되면 다 허용
  const pickCandidates = (candidatesIn, count, dateIdx, mealIdxInDay, usedTodayNames, usedThisMeal) => {
    const base = candidatesIn.filter((n) => !violatesNewIngredientRule(n, dateIdx, mealIdxInDay) && !violatesGroupCap(n, dateIdx) && !usedThisMeal.has(n));
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
    return { picked: sortByScore(candidates, [...usedThisMeal]).slice(0, count), relaxed };
  };

  const markUsed = (name, dateIdx) => {
    usageCount[name] = (usageCount[name] || 0) + 1;
    lastUsedIdx[name] = mealSeq;
    const rule = groupRuleFor(name);
    if (rule) markGroupUse(rule, dateIdx);
    if (observingNames.has(name)) { lastNewIngredientDateIdx = dateIdx; lastNewIngredientNameUsed = name; }
  };

  const buildItem = (name, targetG, dateIdx) => {
    const unitG = currentUnitGOf(state, name) || 15;
    const isFridge = storageTypeOf[name] === "fridge";
    const requestedAmount = isFridge ? Math.max(1, Math.round(targetG)) : Math.max(1, Math.round(targetG / unitG));
    let actual = requestedAmount;
    if (vStock) actual = isFridge ? deductFridge(vStock, name, requestedAmount, []) : deductFrozen(vStock, name, requestedAmount, []);
    if (vStock && actual < requestedAmount && firstNoStockDateIdx === null) firstNoStockDateIdx = dateIdx;
    return {
      name,
      qty: isFridge ? Math.max(1, Math.round(targetG / unitG)) : requestedAmount,
      unitG,
      gramsOverride: isFridge ? Math.round(targetG) : null,
      _noStock: !!vStock && actual < requestedAmount,
    };
  };

  const targetGFor = (name, fallback) => (perIngredientG[name] != null ? perIngredientG[name] : fallback);

  const plansByDate = {};

  dates.forEach((date, dateIdx) => {
    todayCombos[dateIdx] = new Set();
    const dayMeals = [];
    const usedTodayNames = new Set(); // 오늘 이미 "커밋된" 끼니에서 쓰인 재료
    const requiredToday = new Set(requireDailyRules.map((r) => r.ingredient).filter((n) => pool.includes(n)));
    const satisfiedToday = new Set();

    slots.forEach((slot, mealIdxInDay) => {
      const mealTargetG = (rules.perMeal.targetGByLabel && rules.perMeal.targetGByLabel[slot.label]) || rules.perMeal.targetTotalG;
      const perCatTarget = Object.values(categoryCounts).filter((r) => (r.max || 0) > 0);
      const totalSlots = perCatTarget.reduce((s, r) => s + r.max, 0) + (rules.staple.includeEveryMeal ? 1 : 0) || 1;
      const perItemG = Math.max(10, Math.round(mealTargetG / totalSlots));

      // 조합이 오늘 다른 끼니와 겹치면, 카테고리 하나(가장 후보가 많은 곳)를 다른 재료로 바꿔서 재시도
      let items = [];
      let relaxedAny = false;
      for (let attempt = 0; attempt <= COMBO_RETRY_ATTEMPTS; attempt++) {
        items = [];
        const usedThisMeal = new Set();

        if (rules.staple.includeEveryMeal && stapleNames.length > 0) {
          // 주식은 항상 다양성 규칙 예외 - 같은 주식이 매 끼니 반복돼도 됨(밥/죽류는 반복이 자연스러움)
          const picked = sortByScore(stapleNames.filter((n) => !usedThisMeal.has(n)), [...usedThisMeal]).slice(0, 1);
          picked.forEach((name) => { items.push(buildItem(name, targetGFor(name, rules.staple.defaultG), dateIdx)); usedThisMeal.add(name); });
        }

        cats.forEach((cat) => {
          const range = categoryCounts[cat.id] || { min: 0, max: 0 };
          if ((range.max || 0) <= 0) return;
          const count = range.min + Math.floor(rng() * (range.max - range.min + 1));
          if (count <= 0) return;
          const pooled = poolByCat[cat.id] || [];
          const { picked, relaxed } = pickCandidates(pooled, count, dateIdx, mealIdxInDay, usedTodayNames, usedThisMeal);
          if (picked.length < range.min) {
            if (attempt === COMBO_RETRY_ATTEMPTS) warnings.push(`${date} ${slot.label}: '${cat.name}' 카테고리를 채울 재료가 부족해요`);
          } else if (relaxed) {
            relaxedAny = true;
          }
          picked.forEach((name) => { items.push(buildItem(name, targetGFor(name, perItemG), dateIdx)); usedThisMeal.add(name); });
        });

        const key = comboKeyOf(state, items);
        if (!key || !todayCombos[dateIdx].has(key)) break; // 겹치지 않으면(또는 조합이 없으면) 이 결과로 확정
        if (attempt === COMBO_RETRY_ATTEMPTS) warnings.push(`${date} ${slot.label}: 오늘 다른 끼니와 같은 조합이라 그대로 뒀어요`);
      }
      if (relaxedAny) warnings.push(`${date} ${slot.label}: 다양성 규칙을 완화해서 재료를 배치했어요`);

      items.forEach((it) => { usedTodayNames.add(it.name); markUsed(it.name, dateIdx); if (requiredToday.has(it.name)) satisfiedToday.add(it.name); });
      const finalKey = comboKeyOf(state, items);
      if (finalKey) todayCombos[dateIdx].add(finalKey);

      dayMeals.push({ id: uid(), label: slot.label, time: slot.time, items, fromAutoGen: true });
      mealSeq++;
    });

    // requireDaily 후행 보정: 하루가 끝났는데도 필수 재료가 하나도 안 들어갔으면, 첫 끼니에 추가로
    // 끼워 넣는다(카테고리 min/max를 넘겨서라도, 조합 중복 검사도 건너뜀 - 의학적 권고가 다양성보다 우선)
    requiredToday.forEach((name) => {
      if (satisfiedToday.has(name) || dayMeals.length === 0) return;
      const firstMealTargetG = (rules.perMeal.targetGByLabel && rules.perMeal.targetGByLabel[dayMeals[0].label]) || rules.perMeal.targetTotalG;
      dayMeals[0].items.push(buildItem(name, targetGFor(name, firstMealTargetG / 4), dateIdx));
      markUsed(name, dateIdx);
    });

    plansByDate[date] = dayMeals;
  });

  return {
    plansByDate,
    firstNoStockDate: firstNoStockDateIdx !== null ? dates[firstNoStockDateIdx] : null,
    warnings,
  };
}
