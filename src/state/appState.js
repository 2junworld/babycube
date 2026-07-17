/* 앱 상태 - seed·마이그레이션·리듀서와 재고/기록/계산 헬퍼 (C-2 파일 분리)
   UI를 포함하지 않는 순수 로직 계층. 컴포넌트는 App.jsx 참고 */
import { todayISO, addDaysISO, uid } from "../lib/dates";
import { SEED_INGREDIENTS, DB_CATEGORY } from "../data/nutrition";
import { CATEGORIES } from "../theme";

export function seedState() {
  const t = todayISO();
  // 새 가족의 시작 데이터: 앱 구조를 이해할 수 있는 "중립적인 대표 예시" 소량만 담는다.
  // (개인 정보 없음 - 자세한 예시가 필요한 화면 데모는 ?demo 모드의 demoState 참고)
  const stock = {
    죽: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 20, frozen: 8, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
    소고기: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 4, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
    브로콜리: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 4, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
  };
  // 오늘 하루치 예시 식단 (재고에 있는 재료로만 구성)
  const plans = {
    [t]: [
      { id: uid(), label: "아침", time: "07:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "브로콜리", qty: 1 }] },
    ],
  };
  const logs = {};
  // 먹어본 재료 예시 (대표 몇 개만 - 사용자가 직접 채워가는 목록)
  const introSeed = [
    { name: "쌀", cat: "탄수화물" },
    { name: "소고기", cat: "단백질" },
    { name: "브로콜리", cat: "채소" },
    { name: "애호박", cat: "채소" },
    { name: "단호박", cat: "채소" },
    { name: "사과", cat: "과일" },
  ];
  const intros = introSeed.map((x) => ({ id: uid(), ...x, status: "이상없음", memo: "", date: addDaysISO(t, -7) }));

  return {
    ingredients: { ...SEED_INGREDIENTS },
    ingredientUsage: {},
    ingredientTags: {},
    stock, plans, logs, intros,
    shopping: [],
    settings: { timeFmt: "24h", frozenAlertDays: 3, fridgeAlertDays: 1, fridgeKeepDays: 2, fontScale: 1, mealTips: { stock: true, pairing: true, usedToday: true } },
    travel: { active: false, start: "", end: "", mealsPerDay: 2, checklist: [] },
    members: ["엄마", "아빠"],
    baby: { name: "", sex: "남아", birth: "" }, // 생년월일 미설정 - 설정 화면에서 입력 안내
    ui: { fridgeBannerHiddenDate: null },
    mealSlots: [
      { id: uid(), label: "아침", time: "07:00" },
      { id: uid(), label: "점심", time: "12:00" },
      { id: uid(), label: "저녁", time: "18:00" },
    ],
  };
}

/* -------------------------------- 상태 마이그레이션 -------------------------------- */
// 구버전 상태(eaten/warnings 분리 구조 등)를 최신 구조로 변환
export function migrateState(s) {
  if (!s) return s;
  let out = { ...s };
  if (out.eaten) {
    const migrated = Array.isArray(out.intros) ? [...out.intros] : [];
    Object.entries(out.eaten).forEach(([cat, names]) => {
      (names || []).forEach((name) => {
        if (!migrated.some((it) => it.name === name)) {
          migrated.push({ id: uid(), name, cat, status: "이상없음", memo: "", date: todayISO() });
        }
      });
    });
    (out.warnings || []).forEach((w) => {
      const i = migrated.findIndex((it) => it.name === w.name);
      if (i >= 0) migrated[i] = { ...migrated[i], status: "중단", memo: w.reason };
      else migrated.push({ id: uid(), name: w.name, cat: "채소", status: "중단", memo: w.reason, date: todayISO() });
    });
    out.intros = migrated;
    delete out.eaten;
    delete out.warnings;
  }
  if (!out.intros) out.intros = [];
  out.intros = out.intros.map((it) => ({ cat: "채소", memo: "", ...it }));
  if (!out.baby) out.baby = { name: "", sex: "남아", birth: "" }; // 생년월일 미설정 상태로 시작
  if (!out.ui) out.ui = { fridgeBannerHiddenDate: null };
  // 카테고리 이름 변경: 죽 → 탄수화물 (기존 저장 데이터 호환)
  if (out.ingredients) {
    out.ingredients = Object.fromEntries(Object.entries(out.ingredients).map(([k, v]) =>
      [k, v && v.cat === "죽" ? { ...v, cat: "탄수화물" } : v]));
  }
  if (out.intros) {
    out.intros = out.intros.map((it) => (it.cat === "죽" ? { ...it, cat: "탄수화물" } : it));
  }
  if (out.settings && out.settings.fontScale == null) {
    out.settings = { ...out.settings, fontScale: 1 };
  }
  if (!out.mealSlots || out.mealSlots.length === 0) {
    out.mealSlots = [
      { id: uid(), label: "아침", time: "07:00" },
      { id: uid(), label: "점심", time: "12:00" },
      { id: uid(), label: "저녁", time: "18:00" },
    ];
  }
  // 주식 속성 도입: 기존 데이터의 "죽"에 staple 부여 (UX-5, 1회성)
  if (out.ingredients && out.ingredients["죽"] && out.ingredients["죽"].staple == null) {
    out.ingredients = { ...out.ingredients, 죽: { ...out.ingredients["죽"], staple: true } };
  }
  // 재료 검색 - 최근 사용순 정렬용 사용 이력 (없으면 빈 객체로 시작)
  if (!out.ingredientUsage) out.ingredientUsage = {};
  // 재료별 사용자 지정 영양 태그 (궁합 추천용, 기본 DB에 없는 재료 대응)
  if (!out.ingredientTags) out.ingredientTags = {};
  // 끼니 편집 화면 도움말(재고/궁합/오늘 사용 재료) 표시 여부 - 기존 사용자는 기본 전부 켜짐으로 시작
  if (out.settings && !out.settings.mealTips) {
    out.settings = { ...out.settings, mealTips: { stock: true, pairing: true, usedToday: true } };
  }

  /* ---- 데이터 위생 치유 (멱등 - 매 로드마다 실행해도 안전) ---- */
  // 음수 배치 정규화(과거 입력 오류) + 빈 재고 키 제거 + 재료명 공백 키 병합
  if (out.stock) {
    const stock = {};
    Object.entries(out.stock).forEach(([rawName, v]) => {
      const name = (rawName || "").trim();
      if (!name) return;
      const batches = (v && v.batches ? v.batches : []).map((b) => ({
        ...b, frozen: Math.max(0, b.frozen || 0), fridgeG: Math.max(0, b.fridgeG || 0),
      }));
      if (batches.length === 0) return;
      stock[name] = stock[name] ? { batches: [...stock[name].batches, ...batches] } : { ...v, batches };
    });
    out.stock = stock;
  }
  // ingredients·ingredientTags·ingredientUsage 키 공백 정리 (동명 존재 시 기존 항목 우선)
  ["ingredients", "ingredientTags", "ingredientUsage"].forEach((k) => {
    if (!out[k]) return;
    const m = {};
    Object.entries(out[k]).forEach(([rawName, v]) => {
      const name = (rawName || "").trim();
      if (name && m[name] == null) m[name] = v;
    });
    out[k] = m;
  });
  // intros 이름 공백 정리 + 동명 중복 제거 (첫 항목 유지)
  if (out.intros) {
    const seen = new Set();
    out.intros = out.intros.reduce((acc, it) => {
      const name = (it.name || "").trim();
      if (!name || seen.has(name)) return acc;
      seen.add(name);
      acc.push(name === it.name ? it : { ...it, name });
      return acc;
    }, []);
  }
  // shopping 이름 공백 정리
  if (out.shopping) {
    out.shopping = out.shopping
      .filter((s) => (s.name || "").trim())
      .map((s) => (s.name !== s.name.trim() ? { ...s, name: s.name.trim() } : s));
  }
  // plans/logs: 항목 재료명 공백 정리 + 빈 날짜 키 제거
  ["plans", "logs"].forEach((k) => {
    if (!out[k]) return;
    const m = {};
    Object.entries(out[k]).forEach(([date, arr]) => {
      if (!arr || arr.length === 0) return;
      m[date] = arr.map((entry) => ({
        ...entry,
        items: (entry.items || []).map((it) =>
          it.name && it.name !== it.name.trim() ? { ...it, name: it.name.trim() } : it),
      }));
    });
    out[k] = m;
  });

  return out;
}

/* --------------------------------- 리듀서 -------------------------------- */
export function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE":
      return action.state;

    /* ---- 삭제 실행취소(Undo) 복원용 ---- */
    case "RESTORE_BATCH": {
      const { name, batch } = action;
      const cur = state.stock[name] || { batches: [] };
      return { ...state, stock: { ...state.stock, [name]: { batches: [...cur.batches, batch] } } };
    }
    case "RESTORE_MEAL": {
      const { date, meal } = action;
      const dayMeals = state.plans[date] ? [...state.plans[date], meal] : [meal];
      dayMeals.sort((a, b) => a.time.localeCompare(b.time));
      return { ...state, plans: { ...state.plans, [date]: dayMeals } };
    }
    // 기록 삭제 실행취소: 기록을 되살리면서, 삭제 때 복원했던 재고를 다시 차감 (대칭 유지)
    case "RESTORE_LOG_ENTRY": {
      const { date, log } = action;
      const dayLogs = state.logs[date] ? [...state.logs[date], log] : [log];
      dayLogs.sort((a, b) => a.time.localeCompare(b.time));
      const stock = JSON.parse(JSON.stringify(state.stock));
      redeductLogDeductions(stock, log);
      return { ...state, stock, logs: { ...state.logs, [date]: dayLogs } };
    }
    case "RESTORE_LOG_DAY": {
      const { date, logs } = action;
      const stock = JSON.parse(JSON.stringify(state.stock));
      (logs || []).forEach((l) => redeductLogDeductions(stock, l));
      return { ...state, stock, logs: { ...state.logs, [date]: logs } };
    }
    case "RESTORE_INTRO": {
      const { intro } = action;
      return { ...state, intros: [intro, ...state.intros] };
    }

    case "RESET":
      return seedState();

    case "SET_SETTING":
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };

    /* ---- 식단 계획 ---- */
    case "PLAN_SAVE_MEAL": {
      const { date, meal } = action;
      const dayMeals = state.plans[date] ? [...state.plans[date]] : [];
      const idx = dayMeals.findIndex((m) => m.id === meal.id);
      if (idx >= 0) dayMeals[idx] = meal;
      else dayMeals.push(meal);
      dayMeals.sort((a, b) => a.time.localeCompare(b.time));
      // 재고에 없는 재료 → 장보기 목록 자동 등록
      let shopping = state.shopping;
      meal.items.forEach((it) => {
        const inStock = stockTotalCubes(state, it.name) > 0 || stockFridgeG(state, it.name) > 0;
        const already = shopping.some((s) => s.name === it.name && !s.done);
        if (!inStock && !already && !isStaple(state, it.name)) {
          shopping = [...shopping, { id: uid(), name: it.name, reason: "식단표 추가 (재고없음)", done: false }];
        }
      });
      return { ...state, plans: { ...state.plans, [date]: dayMeals }, shopping };
    }
    case "PLAN_DELETE_MEAL": {
      const { date, mealId } = action;
      const dayMeals = (state.plans[date] || []).filter((m) => m.id !== mealId);
      const plans = { ...state.plans };
      // 끼니가 모두 삭제된 날짜는 빈 배열 대신 키 자체를 제거 (Firestore 문서 비대화 방지)
      if (dayMeals.length > 0) plans[date] = dayMeals; else delete plans[date];
      return { ...state, plans };
    }

    /* ---- 제조 기록 (재고 입고) ---- */
    case "STOCK_ADD_BATCH": {
      const { batch } = action;
      const name = normalizeIngredientName(action.name);
      if (!name) return state;
      const cur = state.stock[name] || { batches: [] };
      // 재료 마스터에 없으면 공통 규칙으로 추가 (UX-4)
      const ingredients = ensureIngredientEntry(state.ingredients, name, action.cat, { unitG: batch.unitG });
      const cat = (ingredients[name] || {}).cat || action.cat || "채소";
      // 먹어본 재료 목록에도 반영 - 제조만 하고 아직 먹이지 않은 상태이므로 "관찰중"으로 등록 (UX-4 확정)
      let intros = state.intros;
      if (!intros.some((it) => it.name === name)) {
        intros = [{ id: uid(), name, cat, status: "관찰중", memo: "", date: batch.date || todayISO() }, ...intros];
      }
      // 장보기 목록에서 완료 처리
      const shopping = state.shopping.map((s) => (s.name === name && !s.done ? { ...s, done: true } : s));
      return {
        ...state, ingredients, intros, shopping,
        stock: { ...state.stock, [name]: { batches: [...cur.batches, { id: uid(), ...batch }] } },
      };
    }
    case "STOCK_UPDATE_BATCH": {
      const { name, batchId, patch } = action;
      const cur = state.stock[name];
      if (!cur) return state;
      const batches = cur.batches.map((b) => (b.id === batchId ? { ...b, ...patch } : b));
      return { ...state, stock: { ...state.stock, [name]: { batches } } };
    }
    case "STOCK_DELETE_BATCH": {
      const { name, batchId } = action;
      const cur = state.stock[name];
      if (!cur) return state;
      const batches = cur.batches.filter((b) => b.id !== batchId);
      const stock = { ...state.stock };
      // 배치가 모두 삭제된 재료는 빈 껍데기 대신 키 제거 (재료 마스터 ingredients는 그대로 유지)
      if (batches.length > 0) stock[name] = { batches }; else delete stock[name];
      return { ...state, stock };
    }

    /* ---- 급여 기록 (재고 차감 + 섭취율) ---- */
    case "LOG_SAVE": {
      const { date, log } = action;
      // 재고 차감: 선입선출, 재료별 deduct 플래그로 반영 여부 결정.
      // 기존 기록을 수정하는 경우, 예전에 반영했던 재료의 차감분을 먼저 복원한 뒤 새로 차감 (이중차감 방지)
      let stock = JSON.parse(JSON.stringify(state.stock));
      const dayLogs = state.logs[date] ? [...state.logs[date]] : [];
      const idx = dayLogs.findIndex((l) => l.id === log.id);
      if (idx >= 0) {
        // 기존 기록의 차감분 복원 - deductedBatches(C-3)가 있으면 원 배치로 정확히,
        // 없으면 deductedQty(→qty) 폴백. 재고 부풀림·배치 어긋남 방지
        restoreLogDeductions(stock, dayLogs[idx]);
      }
      // 실제 차감된 양(deductedQty)과 배치별 내역(deductedBatches)을 기록에 남김
      // (재고 부족 시 요청량보다 적을 수 있음 - 이후 수정·삭제 시 원 배치로 정확히 복원).
      // action의 log 객체를 직접 변형하지 않고 새 객체로 만들어 저장 (리듀서 순수성 유지)
      const savedLog = {
        ...log,
        items: log.items.map((it) => {
          if (it.deduct === false) return { ...it, deductedQty: 0, deductedBatches: [] };
          const trace = [];
          const actual = it.source === "fridge"
            ? deductFridge(stock, it.name, it.qty, trace) // qty=g
            : deductFrozen(stock, it.name, it.qty, trace); // qty=큐브
          return { ...it, deductedQty: actual, deductedBatches: trace };
        }),
      };
      if (idx >= 0) dayLogs[idx] = savedLog;
      else dayLogs.push(savedLog);
      dayLogs.sort((a, b) => a.time.localeCompare(b.time));
      // 급여한 재료가 재료 마스터·먹어본 재료에 없으면 자동 등록 (UX-4 확정: "관찰중" 상태)
      // - 실제로 먹였으므로 반응을 관찰하는 상태가 정확한 표현. 이상 없으면 사용자가 직접 변경
      let ingredients = state.ingredients;
      let intros = state.intros;
      savedLog.items.forEach((it) => {
        ingredients = ensureIngredientEntry(ingredients, it.name);
        if (!intros.some((x) => x.name === it.name)) {
          intros = [{ id: uid(), name: it.name, cat: (ingredients[it.name] || {}).cat || "채소", status: "관찰중", memo: "", date }, ...intros];
        }
      });
      return { ...state, stock, ingredients, intros, logs: { ...state.logs, [date]: dayLogs } };
    }
    // 급여 기록 삭제: 그 기록이 차감했던 재고(deductedQty)를 함께 복원
    case "LOG_DELETE_ENTRY": {
      const { date, logId } = action;
      const target = (state.logs[date] || []).find((l) => l.id === logId);
      const remaining = (state.logs[date] || []).filter((l) => l.id !== logId);
      const logs = { ...state.logs };
      if (remaining.length > 0) logs[date] = remaining; else delete logs[date];
      let stock = state.stock;
      if (target) {
        stock = JSON.parse(JSON.stringify(state.stock));
        restoreLogDeductions(stock, target);
      }
      return { ...state, stock, logs };
    }
    case "LOG_DELETE_DAY": {
      const { date } = action;
      const dayLogs = state.logs[date] || [];
      const logs = { ...state.logs };
      delete logs[date];
      const stock = JSON.parse(JSON.stringify(state.stock));
      dayLogs.forEach((l) => restoreLogDeductions(stock, l));
      return { ...state, stock, logs };
    }

    /* ---- 장보기 목록 ---- */
    case "SHOP_TOGGLE":
      return {
        ...state,
        shopping: state.shopping.map((s) => (s.id === action.id ? { ...s, done: !s.done } : s)),
      };
    case "SHOP_ADD": {
      const name = normalizeIngredientName(action.name);
      if (!name) return state;
      return { ...state, shopping: [...state.shopping, { id: uid(), name, reason: "직접 추가", done: false }] };
    }
    case "SHOP_CLEAR_DONE":
      return { ...state, shopping: state.shopping.filter((s) => !s.done) };

    /* ---- 재료 도입 / 먹어본 재료 (추가·수정·삭제 통합) ---- */
    case "INTRO_UPSERT": {
      const normName = normalizeIngredientName(action.intro.name);
      if (!normName) return state;
      const intro = { ...action.intro, name: normName };
      const idx = state.intros.findIndex((it) => it.id === intro.id);
      let intros;
      if (idx >= 0) { intros = [...state.intros]; intros[idx] = { ...intros[idx], ...intro }; }
      else intros = [{ ...intro, id: intro.id || uid() }, ...state.intros];
      const ingredients = ensureIngredientEntry(state.ingredients, intro.name, intro.cat);
      return { ...state, intros, ingredients };
    }
    case "INTRO_DELETE":
      return { ...state, intros: state.intros.filter((it) => it.id !== action.id) };

    /* ---- 재료 마스터에 카테고리 지정하여 등록 (신규 재료 추가시) ----
       카테고리를 명시하지 않으면 영양 DB의 카테고리를 우선 사용, baseOf가 오면 변형 재료로 연결 */
    case "INGREDIENT_ENSURE": {
      const { cat, baseOf } = action;
      const name = normalizeIngredientName(action.name);
      if (!name || state.ingredients[name]) return state;
      const extra = baseOf && baseOf !== name ? { baseOf } : {};
      return { ...state, ingredients: ensureIngredientEntry(state.ingredients, name, cat, extra) };
    }

    /* ---- 재료 즐겨찾기 토글 ---- */
    case "INGREDIENT_TOGGLE_FAVORITE": {
      const { name } = action;
      if (!name || !state.ingredients[name]) return state;
      const cur = state.ingredients[name];
      return { ...state, ingredients: { ...state.ingredients, [name]: { ...cur, favorite: !cur.favorite } } };
    }

    /* ---- 재료 메타 정보 (기본 재료 연결 baseOf · 혼합 큐브 구성 components) ---- */
    case "INGREDIENT_SET_META": {
      const { name, patch } = action;
      if (!name) return state;
      const cur = state.ingredients[name] || { cat: DB_CATEGORY[name] || "채소", unitG: 15 };
      const next = { ...state, ingredients: { ...state.ingredients, [name]: { ...cur, ...patch } } };
      // 분류(기본 재료 연결·혼합 구성)를 바꾸면 이전에 직접 지정했던 태그를 초기화해
      // 상속·합산 결과가 바로 반영되게 함 (옛 지정값이 새 분류를 가리는 문제 방지)
      if (("baseOf" in patch || "components" in patch) && state.ingredientTags && state.ingredientTags[name] != null) {
        next.ingredientTags = { ...state.ingredientTags, [name]: null };
      }
      return next;
    }

    /* ---- 재료별 영양 태그 지정 (궁합 추천용) ---- */
    case "INGREDIENT_TAGS_SET": {
      const { name, tags } = action;
      if (!name) return state;
      return { ...state, ingredientTags: { ...state.ingredientTags, [name]: tags } };
    }

    /* ---- 재료 선택(사용) 시각 기록 - 최근 사용순 정렬용 ---- */
    case "INGREDIENT_TOUCH": {
      const names = action.names || (action.name ? [action.name] : []);
      if (names.length === 0) return state;
      const now = Date.now();
      const usage = { ...state.ingredientUsage };
      names.forEach((n) => { usage[n] = now; });
      return { ...state, ingredientUsage: usage };
    }

    /* ---- 아기 정보 ---- */
    case "BABY_SET":
      return { ...state, baby: { ...state.baby, ...action.patch } };

    /* ---- 화면 UI 상태(배너 숨김 등) ---- */
    case "UI_SET":
      return { ...state, ui: { ...state.ui, ...action.patch } };

    /* ---- 여행 모드 ---- */
    case "TRAVEL_SET":
      return { ...state, travel: { ...state.travel, ...action.patch } };

    /* ---- 끼니 종류 (이름+시간 사전 설정, 식단표 입력 시 선택용) ---- */
    case "MEALSLOT_UPSERT": {
      const { slot } = action;
      const idx = state.mealSlots.findIndex((s) => s.id === slot.id);
      let mealSlots;
      if (idx >= 0) { mealSlots = [...state.mealSlots]; mealSlots[idx] = { ...mealSlots[idx], ...slot }; }
      else mealSlots = [...state.mealSlots, { ...slot, id: slot.id || uid() }];
      return { ...state, mealSlots };
    }
    case "MEALSLOT_DELETE":
      return { ...state, mealSlots: state.mealSlots.filter((s) => s.id !== action.id) };

    default:
      return state;
  }
}

/* ----------------------------- 재고 계산 헬퍼 ----------------------------- */
export function stockBatches(state, name) {
  return (state.stock[name] || { batches: [] }).batches;
}

// 배치의 frozen/fridgeG는 항상 0 이상이어야 하는데, 예전엔 NumInput이 직접 입력한 음수를 그대로 저장할 수 있어서
// (min 속성은 스핀 버튼에만 적용되고 타이핑으로 입력한 음수는 막아주지 못함) 이미 음수로 저장된 배치가 있을 수 있음.
// 집계 시점에 Math.max(0, ...)로 걸러내서 과거에 잘못 저장된 값이 있어도 화면엔 음수로 보이지 않게 함(자체 치유).
export function stockTotalCubes(state, name) {
  return stockBatches(state, name).reduce((s, b) => s + Math.max(0, b.frozen || 0), 0);
}

export function stockTotalFrozenG(state, name) {
  return stockBatches(state, name).reduce((s, b) => s + Math.max(0, b.frozen || 0) * b.unitG, 0);
}

export function stockFridgeG(state, name) {
  return stockBatches(state, name).reduce((s, b) => s + Math.max(0, b.fridgeG || 0), 0);
}

// 재고가 부족하면 있는 만큼만 차감하고, "실제로 차감된 양"을 반환함
// (호출 쪽에서 요청량과 비교해 재고 부족 안내·정확한 복원에 사용)
// trace 배열을 넘기면 배치별 차감 내역 {batchId, qty}를 담아줌 (C-3: 원 배치 복원용)
export function deductFrozen(stock, name, cubes, trace) {
  const batches = (stock[name] || { batches: [] }).batches;
  let remaining = cubes;
  const sorted = [...batches].sort((a, b) => a.date.localeCompare(b.date));
  for (const b of sorted) {
    if (remaining <= 0) break;
    // 음수 배치(과거 입력 오류 데이터)가 있어도 차감량·잔량이 오염되지 않게 0으로 클램프
    const take = Math.min(Math.max(0, b.frozen || 0), remaining);
    b.frozen = (b.frozen || 0) - take;
    remaining -= take;
    if (trace && take > 0) trace.push({ batchId: b.id, qty: take });
  }
  return cubes - remaining;
}

export function deductFridge(stock, name, grams, trace) {
  const batches = (stock[name] || { batches: [] }).batches;
  let remaining = grams;
  const sorted = [...batches].sort((a, b) => (a.fridgeExp || "9").localeCompare(b.fridgeExp || "9"));
  for (const b of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(Math.max(0, b.fridgeG || 0), remaining);
    b.fridgeG = (b.fridgeG || 0) - take;
    remaining -= take;
    if (trace && take > 0) trace.push({ batchId: b.id, qty: take });
  }
  return grams - remaining;
}

// 급여 기록 수정 시 기존에 차감했던 만큼 되돌리기 위한 복원 헬퍼 (가장 최근 배치에 복원)
export function restoreFrozen(stock, name, cubes) {
  const cur = stock[name];
  if (!cur || !cur.batches || cur.batches.length === 0 || !cubes) return;
  const target = [...cur.batches].sort((a, b) => b.date.localeCompare(a.date))[0];
  target.frozen = (target.frozen || 0) + cubes;
}

export function restoreFridge(stock, name, grams) {
  const cur = stock[name];
  if (!cur || !cur.batches || cur.batches.length === 0 || !grams) return;
  const target = [...cur.batches].sort((a, b) => (b.fridgeExp || "0").localeCompare(a.fridgeExp || "0"))[0];
  target.fridgeG = (target.fridgeG || 0) + grams;
}

// 배치 id로 특정 배치를 찾음 (없으면 null - 배치가 이후 삭제된 경우)
function findBatch(stock, name, batchId) {
  const cur = stock[name];
  if (!cur || !cur.batches) return null;
  return cur.batches.find((b) => b.id === batchId) || null;
}

// (C-3) 배치별 차감 내역(deductedBatches)이 있으면 "차감됐던 바로 그 배치"로 복원.
// 배치가 삭제돼 없으면 해당 몫만 기존 방식(최근 배치)으로 폴백
function restoreItemDeduction(stock, it) {
  const amt = it.deductedQty != null ? it.deductedQty : it.qty;
  if (Array.isArray(it.deductedBatches) && it.deductedBatches.length > 0) {
    it.deductedBatches.forEach(({ batchId, qty }) => {
      const b = findBatch(stock, it.name, batchId);
      if (b) {
        if (it.source === "fridge") b.fridgeG = (b.fridgeG || 0) + qty;
        else b.frozen = (b.frozen || 0) + qty;
      } else if (it.source === "fridge") restoreFridge(stock, it.name, qty);
      else restoreFrozen(stock, it.name, qty);
    });
    return;
  }
  // 구버전 기록(배치 내역 없음): 기존 방식 폴백
  if (it.source === "fridge") restoreFridge(stock, it.name, amt);
  else restoreFrozen(stock, it.name, amt);
}

// (C-3) 재차감도 가능하면 원 배치에서: 배치별 내역이 있으면 그 배치에서(잔량 한도 내),
// 부족분·배치 없음은 FIFO 차감으로 폴백
function redeductItemDeduction(stock, it) {
  const amt = it.deductedQty != null ? it.deductedQty : it.qty;
  if (Array.isArray(it.deductedBatches) && it.deductedBatches.length > 0) {
    let leftover = 0;
    it.deductedBatches.forEach(({ batchId, qty }) => {
      const b = findBatch(stock, it.name, batchId);
      if (!b) { leftover += qty; return; }
      const avail = it.source === "fridge" ? Math.max(0, b.fridgeG || 0) : Math.max(0, b.frozen || 0);
      const take = Math.min(avail, qty);
      if (it.source === "fridge") b.fridgeG = (b.fridgeG || 0) - take;
      else b.frozen = (b.frozen || 0) - take;
      leftover += qty - take;
    });
    if (leftover > 0) {
      if (it.source === "fridge") deductFridge(stock, it.name, leftover);
      else deductFrozen(stock, it.name, leftover);
    }
    return;
  }
  if (it.source === "fridge") deductFridge(stock, it.name, amt);
  else deductFrozen(stock, it.name, amt);
}

// 급여 기록 한 건이 재고에 반영했던 차감분을 복원 (기록 삭제·수정 시 사용)
// deductedBatches가 있으면 원 배치로 정확히, 없으면 deductedQty(→qty) 폴백
export function restoreLogDeductions(stock, log) {
  if (log.stockAffected === false) return;
  (log.items || []).forEach((it) => {
    if (it.deduct === false) return;
    restoreItemDeduction(stock, it);
  });
}

// 삭제 실행취소 시 복원했던 차감분을 다시 차감 (삭제 ↔ 실행취소 대칭 유지)
export function redeductLogDeductions(stock, log) {
  if (log.stockAffected === false) return;
  (log.items || []).forEach((it) => {
    if (it.deduct === false) return;
    redeductItemDeduction(stock, it);
  });
}

// 주식(밥·죽) 재료 여부 - 장보기 자동 등록·여행 필요량·기본 출처 판정에서 제외/특별 취급 (UX-5)
// 기존 "죽" 하드코딩을 재료 속성으로 승격: 재료 정보 화면에서 토글 가능
export function isStaple(state, name) {
  const reg = (state.ingredients && state.ingredients[name]) || SEED_INGREDIENTS[name];
  return !!(reg && reg.staple);
}

// 최근 7일 식단표 기준 하루 평균 끼니 수 - 계획이 없으면 끼니 설정 개수로 폴백 (P2-3)
export function avgPlannedMealsPerDay(state) {
  const t = todayISO();
  let total = 0, daysWithPlan = 0;
  for (let i = 1; i <= 7; i++) {
    const n = (state.plans[addDaysISO(t, -i)] || []).length;
    if (n > 0) { total += n; daysWithPlan += 1; }
  }
  if (daysWithPlan > 0) return total / daysWithPlan;
  return (state.mealSlots && state.mealSlots.length) || 3;
}

// 재료 마스터(ingredients) 등록 공통 헬퍼 - 어떤 경로(식단·제조·먹어본 재료·급여 기록)로
// 재료가 추가되든 동일한 규칙으로 등록되어 재료 정보(위키)에 즉시 노출됨 (UX-4)
export function ensureIngredientEntry(ingredients, name, cat, extra = {}) {
  if (!name || ingredients[name]) return ingredients;
  return { ...ingredients, [name]: { cat: cat || DB_CATEGORY[name] || "채소", unitG: 15, favorite: false, ...extra } };
}

// 재료명 정규화: 앞뒤 공백 제거. 빈 문자열이면 null 반환 (등록 거부용)
// "소고기 "처럼 보이지 않는 중복 재료가 생겨 재고·기록·통계가 분리 집계되는 문제 방지
export function normalizeIngredientName(name) {
  const n = (name || "").trim();
  return n.length > 0 ? n : null;
}

// 기록 삭제 시 재고 복원이 불가능한 재료 이름 목록 (배치가 하나도 없으면 복원할 곳이 없음)
export function unrestorableStockNames(state, logsArr) {
  const names = new Set();
  logsArr.forEach((log) => {
    if (log.stockAffected === false) return;
    (log.items || []).forEach((it) => {
      if (it.deduct === false) return;
      const amt = it.deductedQty != null ? it.deductedQty : it.qty;
      if (amt > 0 && stockBatches(state, it.name).length === 0) names.add(it.name);
    });
  });
  return [...names];
}

/* ----------------------------- 공통 계산 헬퍼 ----------------------------- */
export function catOf(state, name) {
  const reg = state.ingredients[name] || SEED_INGREDIENTS[name];
  if (reg) return reg.cat;
  return DB_CATEGORY[name] || "채소"; // 등록 전이라도 영양 DB에 있는 재료는 올바른 카테고리로 표시
}

export function unitGOf(state, name) {
  return (state.ingredients[name] || SEED_INGREDIENTS[name] || { unitG: 15 }).unitG;
}

export function gOf(state, item) {
  if (item.gramsOverride != null) return item.gramsOverride;
  const u = item.unitG != null ? item.unitG : unitGOf(state, item.name);
  return item.qty * u;
}

export function totalG(state, items) {
  return items.reduce((s, it) => s + gOf(state, it), 0);
}

// 급여기록(log) 항목들의 총 제공량(g) - 냉장 항목은 qty가 이미 그램, 냉동 항목은 qty(큐브)*unitG
// (급여기록 여러 곳에서 "제공량 중 섭취량 %"를 계산할 때 공통으로 씀)
export function logProvideG(log) {
  return log.items.reduce((s, it) => s + (it.source === "fridge" ? it.qty : it.qty * it.unitG), 0);
}

export function catTotals(state, items) {
  const t = {}; CATEGORIES.forEach((c) => { t[c] = 0; });
  items.forEach((it) => { t[catOf(state, it.name)] += gOf(state, it); });
  return t;
}

// 재료 목록 정렬: 죽 → 단백질 → 채소 → 과일 순, 동일 카테고리 내에서는 가나다순
// (끼니 재료 나열, 재료 선택, 먹어본 재료 등 재료가 리스트업되는 모든 곳에서 공통 사용)
export function sortByCategory(state, list, nameOf = (x) => x.name) {
  return [...list].sort((a, b) => {
    const oa = CATEGORIES.indexOf(catOf(state, nameOf(a)));
    const ob = CATEGORIES.indexOf(catOf(state, nameOf(b)));
    if (oa !== ob) return oa - ob;
    return nameOf(a).localeCompare(nameOf(b), "ko");
  });
}

// Firestore 문서 한도(1MiB)와 경고 임계치 - state가 이 한도를 넘으면 저장 자체가 실패하므로 미리 경고
export const DOC_SIZE_LIMIT_BYTES = 1048576;
export const DOC_SIZE_WARN_BYTES = 700 * 1024;
