/* 재료 궁합 계산 (영양학적 근거 기반) - 순수 함수 계층 */
import { todayISO } from "./dates";
import { NUTRIENT_TAGS, PAIRING_RULES } from "../data/nutrition";
import { sortByCategory, stockFridgeG, stockTotalCubes } from "../state/appState";

// 재료의 영양 태그 결정 순서: ① 사용자가 직접 지정한 태그 → ② 기본 영양 DB →
// ③ 변형 재료면 기본 재료의 태그 상속 (예: 사과퓨레 → 사과) → ④ 혼합 큐브면 구성 재료 태그 합산
export const tagsOf = (state, name, depth = 0) => {
  const custom = state.ingredientTags && state.ingredientTags[name];
  // 빈 배열은 '지정 안 함'으로 간주하고 상속·합산으로 넘어감 (태그를 켰다 껐던 흔적이 상속을 막지 않도록)
  if (custom != null && custom.length > 0) return custom;
  if (NUTRIENT_TAGS[name]) return NUTRIENT_TAGS[name];
  const meta = state.ingredients[name];
  if (meta && depth < 3) { // depth 제한: 순환 연결로 인한 무한 재귀 방지
    const set = new Set();
    if (meta.baseOf && meta.baseOf !== name) tagsOf(state, meta.baseOf, depth + 1).forEach((t) => set.add(t));
    if (meta.components && meta.components.length > 0) {
      meta.components.forEach((c) => { if (c !== name) tagsOf(state, c, depth + 1).forEach((t) => set.add(t)); });
    }
    if (set.size > 0) return Array.from(set); // 기본 재료 연결 + 혼합 구성이 둘 다 있으면 합집합
  }
  return [];
};

// 변형 재료 자동 제안: 이름이 다른 알려진 재료명으로 시작하면 그 재료의 변형일 가능성 (예: '사과퓨레' → '사과').
// 재료 자체가 영양 DB에 있으면(예: '배추'가 '배'로 시작) 오인식이므로 제안하지 않음. 가장 긴 일치를 선택
export function suggestBaseFor(state, name) {
  if (!name || NUTRIENT_TAGS[name]) return null;
  const known = Array.from(new Set([...Object.keys(NUTRIENT_TAGS), ...Object.keys(state.ingredients)]));
  return known.filter((n) => n !== name && n.length >= 2 && name.startsWith(n)).sort((a, b) => b.length - a.length)[0] || null;
}

// 현재 담긴 재료 기준으로 (1) 재고에 있는 재료 중 궁합 좋은 추천, (2) 현재 조합 안의 주의 조합 계산
export function pairingSuggestions(state, currentNames) {
  const curSet = new Set(currentNames);
  const stopped = new Set(state.intros.filter((it) => it.status === "중단" || it.status === "주의").map((it) => it.name));
  const stockNames = Object.keys(state.stock).filter((n) =>
    !curSet.has(n) && !stopped.has(n) && (stockTotalCubes(state, n) > 0 || stockFridgeG(state, n) > 0));
  const good = [];
  const seen = new Set();
  stockNames.forEach((cand) => {
    const candTags = tagsOf(state, cand);
    PAIRING_RULES.filter((r) => r.type === "good").forEach((r) => {
      if (seen.has(cand)) return;
      const withA = currentNames.filter((n) => tagsOf(state, n).includes(r.tagA));
      const withB = currentNames.filter((n) => tagsOf(state, n).includes(r.tagB));
      if (candTags.includes(r.tagB) && withA.length > 0) { good.push({ name: cand, text: r.text, grade: r.grade, withNames: withA }); seen.add(cand); }
      else if (candTags.includes(r.tagA) && withB.length > 0) { good.push({ name: cand, text: r.text, grade: r.grade, withNames: withB }); seen.add(cand); }
    });
  });
  const avoid = [];
  PAIRING_RULES.filter((r) => r.type === "avoid").forEach((r) => {
    const aNames = currentNames.filter((n) => tagsOf(state, n).includes(r.tagA));
    const bNames = currentNames.filter((n) => tagsOf(state, n).includes(r.tagB) && !aNames.includes(n));
    if (aNames.length > 0 && bNames.length > 0) avoid.push({ a: aNames, b: bNames, text: r.text, grade: r.grade });
  });
  return { good: good.slice(0, 5), avoid };
}

// 특정 날짜의 급여 기록에 사용된 재료 -> 그 날짜에 제공된 총 g. 재료 검색의 "오늘 사용 재료 제외" 필터/배지와
// 끼니 편집 화면의 "오늘 이미 준 재료" 힌트가 공용으로 사용. date 기준은 실제 오늘이 아니라 "끼니 계획을 세우는 날짜"임 —
// 끼니 편집·일괄 저장 화면에서는 편집 중인 날짜를 넘겨받고, 그 외(제조 기록 추가 등 날짜 개념이 없는 곳)만 실제 오늘을 기본값으로 씀
export function usedTodayMap(state, date = todayISO()) {
  const usedG = new Map();
  (state.logs[date] || []).forEach((log) => {
    log.items.forEach((it) => {
      const g = it.source === "fridge" ? it.qty : it.qty * it.unitG;
      usedG.set(it.name, (usedG.get(it.name) || 0) + g);
    });
  });
  return usedG;
}

// 재료 검색에서 "궁합 좋은 재료" 정렬에 쓸 순위: 현재 조합(currentNames)과 좋은 궁합이면 0(근거 A) 또는 1(근거 B), 없으면 null.
// pairingSuggestions와 달리 재고 유무·상위 5개 제한 없이 전체 재료를 대상으로 계산함(검색 목록 전체를 정렬해야 하므로)
export function pairingRankFor(state, currentNames, name) {
  if (!currentNames || currentNames.length === 0) return null;
  const tags = tagsOf(state, name);
  let best = null;
  PAIRING_RULES.filter((r) => r.type === "good").forEach((r) => {
    const withA = currentNames.some((n) => tagsOf(state, n).includes(r.tagA));
    const withB = currentNames.some((n) => tagsOf(state, n).includes(r.tagB));
    if ((tags.includes(r.tagB) && withA) || (tags.includes(r.tagA) && withB)) {
      const rank = r.grade === "A" ? 0 : 1;
      if (best === null || rank < best) best = rank;
    }
  });
  return best;
}

// 재료 검색에서 궁합 배지에 표시할 정보: 후보 재료(name)가 현재 조합(currentNames)의 어떤 재료와
// 궁합이 좋은지/비추천인지를 실제 재료 이름 목록으로 반환 (근거 등급 대신 사람이 바로 알아볼 수 있는 이름을 보여주기 위함)
export function pairingInfoFor(state, currentNames, name) {
  const goodWith = new Set();
  const avoidWith = new Set();
  if (!currentNames || currentNames.length === 0) return { goodWith: [], avoidWith: [] };
  const tags = tagsOf(state, name);
  PAIRING_RULES.forEach((r) => {
    const withA = currentNames.filter((n) => n !== name && tagsOf(state, n).includes(r.tagA));
    const withB = currentNames.filter((n) => n !== name && tagsOf(state, n).includes(r.tagB));
    const target = r.type === "good" ? goodWith : avoidWith;
    if (tags.includes(r.tagB) && withA.length > 0) withA.forEach((n) => target.add(n));
    else if (tags.includes(r.tagA) && withB.length > 0) withB.forEach((n) => target.add(n));
  });
  return { goodWith: Array.from(goodWith), avoidWith: Array.from(avoidWith) };
}

// 특정 재료 하나를 기준으로, 등록된 모든 재료 중 궁합 좋은 재료 / 주의 조합 재료 목록 계산
// (재료 정보 화면에서 사용 - 재고 유무와 무관하게 전체를 보여주되 재고 있는 재료를 앞에 배치)
export function ingredientPairsFor(state, name) {
  const myTags = tagsOf(state, name);
  const others = Object.keys(state.ingredients).filter((n) => n !== name);
  const good = [];
  const avoid = [];
  others.forEach((other) => {
    const ot = tagsOf(state, other);
    PAIRING_RULES.forEach((r) => {
      const match = (myTags.includes(r.tagA) && ot.includes(r.tagB)) || (myTags.includes(r.tagB) && ot.includes(r.tagA));
      if (!match) return;
      const list = r.type === "good" ? good : avoid;
      if (list.some((x) => x.name === other)) return;
      list.push({ name: other, text: r.text, grade: r.grade, inStock: stockTotalCubes(state, other) > 0 || stockFridgeG(state, other) > 0 });
    });
  });
  const sortList = (l) => {
    const byCat = sortByCategory(state, l);
    return [...byCat.filter((x) => x.inStock), ...byCat.filter((x) => !x.inStock)];
  };
  return { good: sortList(good), avoid: sortList(avoid) };
}
