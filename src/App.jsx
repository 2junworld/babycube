import React, { useState, useEffect, useReducer, useMemo, useRef, createContext, useContext } from "react";
import {
  Home, CalendarDays, Package, LineChart as LineChartIcon, Menu,
  ChevronLeft, ChevronRight, Plus, Minus, Trash2, Pencil, X, Check,
  Refrigerator, Snowflake, ShoppingCart, Settings2, Users, Plane, Clock,
  AlertTriangle, Search, History, Star,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
} from "recharts";
import { db, auth, googleProvider } from "./firebase";
import { doc, setDoc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

/* ============================================================================
   이유식 공유 앱 (베이비큐브) — Firebase 클라우드 동기화 버전
   - 모든 데이터는 useReducer 스토어 + Firestore 실시간 동기화(FamilyStoreProvider)
   - Google 로그인 후 가족(초대코드) 단위로 데이터를 공유 (배포 가이드 문서 참고)
   ========================================================================== */

/* --------------------------------- 토큰 --------------------------------- */
const C = {
  bg: "#FAF7F1", surface: "#FFFFFF", border: "#ECE5D6",
  ink: "#2A2722", inkSoft: "#534D43", muted: "#9A9285",
  sage: "#6B8F71", sageDeep: "#4F6E55", sageLight: "#E4ECE2",
  apricot: "#E07A3F", apricotLight: "#FBE6D6",
  butter: "#E8B94A", butterLight: "#FBF0D6",
  charcoal: "#1E1C19",
};
const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Noto+Sans+KR:wght@400;500;700;900&display=swap');";

const CATEGORY = {
  탄수화물: { color: "#9A9285", light: "#ECE9E1", label: "탄수화물" },
  단백질: { color: "#B9695C", light: "#F3E2DE", label: "단백질" },
  채소: { color: "#6B8F71", light: "#E4ECE2", label: "채소" },
  과일: { color: "#E8B94A", light: "#FBF0D6", label: "과일" },
};
const CATEGORIES = ["탄수화물", "단백질", "채소", "과일"];

/* ----------------------------- 초기 시드 데이터 ----------------------------- */
// 재료 마스터: 카테고리 + 기본 1큐브 g
const SEED_INGREDIENTS = {
  죽: { cat: "탄수화물", unitG: 20 },
  소고기: { cat: "단백질", unitG: 15 }, 닭고기: { cat: "단백질", unitG: 15 },
  대구살: { cat: "단백질", unitG: 15 }, 두부: { cat: "단백질", unitG: 15 },
  브로콜리: { cat: "채소", unitG: 15 }, 애호박: { cat: "채소", unitG: 15 },
  단호박: { cat: "채소", unitG: 15 }, 청경채: { cat: "채소", unitG: 15 },
  당근: { cat: "채소", unitG: 15 }, 양배추: { cat: "채소", unitG: 15 },
  시금치: { cat: "채소", unitG: 15 }, 무: { cat: "채소", unitG: 15 },
  사과: { cat: "과일", unitG: 15 }, 바나나: { cat: "과일", unitG: 15 },
  배: { cat: "과일", unitG: 15 },
};

// UTC 변환을 거치지 않고 로컬 날짜 요소만으로 계산 (타임존에 따라 날짜가 밀리는 버그 방지)
const pad2 = (n) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const addDaysISO = (iso, n) => {
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID)
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; // 구형 브라우저 대비 폴백

// 탭 내부 화면 상태(서브탭·뷰 선택)를 세션 동안 기억 - 하위 화면(재료 정보 등)에 다녀와도
// 탭이 리셋되지 않고 보던 화면으로 복귀하도록 함
const UI_STATE = { recordView: "table", recordTableRange: "week", stockSubTab: "stock" };

function seedState() {
  const t = todayISO();
  // 재고: 재료별 냉동 배치 + 냉장 보관
  const stock = {
    죽: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 20, frozen: 8, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
    소고기: { batches: [{ id: uid(), date: addDaysISO(t, -3), unitG: 15, frozen: 2, fridgeG: 40, frozenExp: addDaysISO(t, 11), fridgeExp: addDaysISO(t, 1) }] },
    브로콜리: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 4, fridgeG: 20, frozenExp: addDaysISO(t, 12), fridgeExp: addDaysISO(t, 1) }] },
    애호박: { batches: [{ id: uid(), date: addDaysISO(t, -1), unitG: 15, frozen: 9, fridgeG: 0, frozenExp: addDaysISO(t, 13), fridgeExp: null }] },
    단호박: { batches: [{ id: uid(), date: addDaysISO(t, -1), unitG: 15, frozen: 6, fridgeG: 0, frozenExp: addDaysISO(t, 13), fridgeExp: null }] },
    닭고기: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 5, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
    청경채: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 5, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
    당근: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 7, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
  };
  // 식단 계획: 날짜별 끼니
  const plans = {
    [t]: [
      { id: uid(), label: "아침", time: "07:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "브로콜리", qty: 1 }, { name: "애호박", qty: 1 }] },
      { id: uid(), label: "점심", time: "12:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "단호박", qty: 1 }] },
      { id: uid(), label: "저녁", time: "18:00", items: [{ name: "죽", qty: 4 }, { name: "닭고기", qty: 1 }, { name: "청경채", qty: 1 }] },
    ],
    [addDaysISO(t, 1)]: [
      { id: uid(), label: "아침", time: "07:00", items: [{ name: "죽", qty: 4 }, { name: "두부", qty: 1 }, { name: "시금치", qty: 1 }] },
      { id: uid(), label: "점심", time: "12:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "무", qty: 1 }] },
    ],
    [addDaysISO(t, -1)]: [
      { id: uid(), label: "아침", time: "07:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "시금치", qty: 1 }] },
      { id: uid(), label: "점심", time: "12:00", items: [{ name: "죽", qty: 4 }, { name: "대구살", qty: 1 }, { name: "당근", qty: 1 }] },
      { id: uid(), label: "저녁", time: "18:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "양배추", qty: 1 }] },
    ],
  };
  // 급여 기록: 날짜별 (제공 재료 + 끼니 섭취량) — 초기 상태는 빈 값으로 시작
  const logs = {};
  // 먹어본 / 도입 재료 (단일 소스: 이름·카테고리·반응상태·메모)
  const eatenSeed = {
    채소: ["토마토", "양배추", "브로콜리", "애호박", "단호박", "고구마", "감자", "시금치", "청경채", "무", "양파", "당근", "가지", "배추"],
    단백질: ["닭고기", "대구살", "소고기", "두부", "달걀노른자"],
    과일: ["사과", "바나나", "배"],
    탄수화물: ["쌀", "잡곡(귀리)"],
  };
  const intros = [];
  Object.entries(eatenSeed).forEach(([cat, names]) =>
    names.forEach((name) => intros.push({ id: uid(), name, cat, status: "이상없음", memo: "", date: addDaysISO(t, -20) }))
  );
  // 개별 도입/주의 기록 덮어쓰기
  const overrides = [
    { name: "파프리카", cat: "채소", status: "이상없음", memo: "전자레인지로 껍질 제거 후 다짐", date: addDaysISO(t, -5) },
    { name: "새송이버섯", cat: "채소", status: "관찰중", memo: "곱게 갈아서 제공", date: addDaysISO(t, -2) },
    { name: "달걀흰자", cat: "단백질", status: "중단", memo: "지연성 구토로 중단", date: addDaysISO(t, -30) },
  ];
  overrides.forEach((o) => {
    const i = intros.findIndex((x) => x.name === o.name);
    if (i >= 0) intros[i] = { ...intros[i], ...o };
    else intros.unshift({ id: uid(), ...o });
  });

  return {
    ingredients: { ...SEED_INGREDIENTS },
    ingredientUsage: {},
    ingredientTags: {},
    stock, plans, logs, intros,
    shopping: [
      { id: uid(), name: "새송이버섯", reason: "식단표 추가 (재고없음)", done: false },
    ],
    settings: { timeFmt: "24h", frozenAlertDays: 3, fridgeAlertDays: 1, fridgeKeepDays: 2, fontScale: 1, mealTips: { stock: true, pairing: true, usedToday: true } },
    travel: { active: false, start: "", end: "", mealsPerDay: 2, checklist: [] },
    members: ["이준세", "배우자"],
    baby: { name: "", sex: "남아", birth: "2025-10-08" },
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
function migrateState(s) {
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
  if (!out.baby) out.baby = { name: "", sex: "남아", birth: "2025-10-08" };
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
  // 재료 검색 - 최근 사용순 정렬용 사용 이력 (없으면 빈 객체로 시작)
  if (!out.ingredientUsage) out.ingredientUsage = {};
  // 재료별 사용자 지정 영양 태그 (궁합 추천용, 기본 DB에 없는 재료 대응)
  if (!out.ingredientTags) out.ingredientTags = {};
  // 끼니 편집 화면 도움말(재고/궁합/오늘 사용 재료) 표시 여부 - 기존 사용자는 기본 전부 켜짐으로 시작
  if (out.settings && !out.settings.mealTips) {
    out.settings = { ...out.settings, mealTips: { stock: true, pairing: true, usedToday: true } };
  }
  return out;
}

/* --------------------------------- 리듀서 -------------------------------- */
function reducer(state, action) {
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
    case "RESTORE_LOG_ENTRY": {
      const { date, log } = action;
      const dayLogs = state.logs[date] ? [...state.logs[date], log] : [log];
      dayLogs.sort((a, b) => a.time.localeCompare(b.time));
      return { ...state, logs: { ...state.logs, [date]: dayLogs } };
    }
    case "RESTORE_LOG_DAY": {
      const { date, logs } = action;
      return { ...state, logs: { ...state.logs, [date]: logs } };
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
        if (!inStock && !already && it.name !== "죽") {
          shopping = [...shopping, { id: uid(), name: it.name, reason: "식단표 추가 (재고없음)", done: false }];
        }
      });
      return { ...state, plans: { ...state.plans, [date]: dayMeals }, shopping };
    }
    case "PLAN_DELETE_MEAL": {
      const { date, mealId } = action;
      const dayMeals = (state.plans[date] || []).filter((m) => m.id !== mealId);
      return { ...state, plans: { ...state.plans, [date]: dayMeals } };
    }

    /* ---- 제조 기록 (재고 입고) ---- */
    case "STOCK_ADD_BATCH": {
      const { name, batch } = action;
      const cur = state.stock[name] || { batches: [] };
      // 재료 마스터에 없으면 추가
      const ingredients = state.ingredients[name]
        ? state.ingredients
        : { ...state.ingredients, [name]: { cat: action.cat || DB_CATEGORY[name] || "채소", unitG: batch.unitG } };
      const cat = (ingredients[name] || {}).cat || action.cat || "채소";
      // 먹어본 재료 목록에도 반영 (없으면 새로 추가)
      let intros = state.intros;
      if (!intros.some((it) => it.name === name)) {
        intros = [{ id: uid(), name, cat, status: "이상없음", memo: "", date: batch.date || todayISO() }, ...intros];
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
      return { ...state, stock: { ...state.stock, [name]: { batches } } };
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
        const oldLog = dayLogs[idx];
        const oldGloballyOff = oldLog.stockAffected === false; // 구버전(전체 On/Off) 기록과의 호환
        oldLog.items.forEach((it) => {
          if (oldGloballyOff || it.deduct === false) return;
          if (it.source === "fridge") restoreFridge(stock, it.name, it.qty);
          else restoreFrozen(stock, it.name, it.qty);
        });
      }
      log.items.forEach((it) => {
        if (it.deduct === false) return;
        if (it.source === "fridge") {
          deductFridge(stock, it.name, it.qty); // qty=g
        } else {
          deductFrozen(stock, it.name, it.qty); // qty=큐브
        }
      });
      if (idx >= 0) dayLogs[idx] = log;
      else dayLogs.push(log);
      dayLogs.sort((a, b) => a.time.localeCompare(b.time));
      return { ...state, stock, logs: { ...state.logs, [date]: dayLogs } };
    }
    // 잘못 기록된 급여 기록 정리용 (재고는 자동 복원되지 않음)
    case "LOG_DELETE_ENTRY": {
      const { date, logId } = action;
      const remaining = (state.logs[date] || []).filter((l) => l.id !== logId);
      const logs = { ...state.logs };
      if (remaining.length > 0) logs[date] = remaining; else delete logs[date];
      return { ...state, logs };
    }
    case "LOG_DELETE_DAY": {
      const { date } = action;
      const logs = { ...state.logs };
      delete logs[date];
      return { ...state, logs };
    }

    /* ---- 장보기 목록 ---- */
    case "SHOP_TOGGLE":
      return {
        ...state,
        shopping: state.shopping.map((s) => (s.id === action.id ? { ...s, done: !s.done } : s)),
      };
    case "SHOP_ADD":
      return { ...state, shopping: [...state.shopping, { id: uid(), name: action.name, reason: "직접 추가", done: false }] };
    case "SHOP_CLEAR_DONE":
      return { ...state, shopping: state.shopping.filter((s) => !s.done) };

    /* ---- 재료 도입 / 먹어본 재료 (추가·수정·삭제 통합) ---- */
    case "INTRO_UPSERT": {
      const { intro } = action;
      const idx = state.intros.findIndex((it) => it.id === intro.id);
      let intros;
      if (idx >= 0) { intros = [...state.intros]; intros[idx] = { ...intros[idx], ...intro }; }
      else intros = [{ ...intro, id: intro.id || uid() }, ...state.intros];
      const ingredients = state.ingredients[intro.name]
        ? state.ingredients
        : { ...state.ingredients, [intro.name]: { cat: intro.cat || "채소", unitG: 15 } };
      return { ...state, intros, ingredients };
    }
    case "INTRO_DELETE":
      return { ...state, intros: state.intros.filter((it) => it.id !== action.id) };

    /* ---- 재료 마스터에 카테고리 지정하여 등록 (신규 재료 추가시) ----
       카테고리를 명시하지 않으면 영양 DB의 카테고리를 우선 사용, baseOf가 오면 변형 재료로 연결 */
    case "INGREDIENT_ENSURE": {
      const { name, cat, baseOf } = action;
      if (!name || state.ingredients[name]) return state;
      const entry = { cat: cat || DB_CATEGORY[name] || "채소", unitG: 15, favorite: false };
      if (baseOf && baseOf !== name) entry.baseOf = baseOf;
      return { ...state, ingredients: { ...state.ingredients, [name]: entry } };
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
function stockBatches(state, name) {
  return (state.stock[name] || { batches: [] }).batches;
}
// 배치의 frozen/fridgeG는 항상 0 이상이어야 하는데, 예전엔 NumInput이 직접 입력한 음수를 그대로 저장할 수 있어서
// (min 속성은 스핀 버튼에만 적용되고 타이핑으로 입력한 음수는 막아주지 못함) 이미 음수로 저장된 배치가 있을 수 있음.
// 집계 시점에 Math.max(0, ...)로 걸러내서 과거에 잘못 저장된 값이 있어도 화면엔 음수로 보이지 않게 함(자체 치유).
function stockTotalCubes(state, name) {
  return stockBatches(state, name).reduce((s, b) => s + Math.max(0, b.frozen || 0), 0);
}
function stockTotalFrozenG(state, name) {
  return stockBatches(state, name).reduce((s, b) => s + Math.max(0, b.frozen || 0) * b.unitG, 0);
}
function stockFridgeG(state, name) {
  return stockBatches(state, name).reduce((s, b) => s + Math.max(0, b.fridgeG || 0), 0);
}
function deductFrozen(stock, name, cubes) {
  const batches = (stock[name] || { batches: [] }).batches;
  let remaining = cubes;
  const sorted = [...batches].sort((a, b) => a.date.localeCompare(b.date));
  for (const b of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(b.frozen, remaining);
    b.frozen -= take;
    remaining -= take;
  }
}
function deductFridge(stock, name, grams) {
  const batches = (stock[name] || { batches: [] }).batches;
  let remaining = grams;
  const sorted = [...batches].sort((a, b) => (a.fridgeExp || "9").localeCompare(b.fridgeExp || "9"));
  for (const b of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(b.fridgeG || 0, remaining);
    b.fridgeG = (b.fridgeG || 0) - take;
    remaining -= take;
  }
}
// 급여 기록 수정 시 기존에 차감했던 만큼 되돌리기 위한 복원 헬퍼 (가장 최근 배치에 복원)
function restoreFrozen(stock, name, cubes) {
  const cur = stock[name];
  if (!cur || !cur.batches || cur.batches.length === 0 || !cubes) return;
  const target = [...cur.batches].sort((a, b) => b.date.localeCompare(a.date))[0];
  target.frozen = (target.frozen || 0) + cubes;
}
function restoreFridge(stock, name, grams) {
  const cur = stock[name];
  if (!cur || !cur.batches || cur.batches.length === 0 || !grams) return;
  const target = [...cur.batches].sort((a, b) => (b.fridgeExp || "0").localeCompare(a.fridgeExp || "0"))[0];
  target.fridgeG = (target.fridgeG || 0) + grams;
}

/* ----------------------------- 공통 계산 헬퍼 ----------------------------- */
function catOf(state, name) {
  const reg = state.ingredients[name] || SEED_INGREDIENTS[name];
  if (reg) return reg.cat;
  return DB_CATEGORY[name] || "채소"; // 등록 전이라도 영양 DB에 있는 재료는 올바른 카테고리로 표시
}
function unitGOf(state, name) {
  return (state.ingredients[name] || SEED_INGREDIENTS[name] || { unitG: 15 }).unitG;
}
function gOf(state, item) {
  if (item.gramsOverride != null) return item.gramsOverride;
  const u = item.unitG != null ? item.unitG : unitGOf(state, item.name);
  return item.qty * u;
}
function totalG(state, items) {
  return items.reduce((s, it) => s + gOf(state, it), 0);
}
// 급여기록(log) 항목들의 총 제공량(g) - 냉장 항목은 qty가 이미 그램, 냉동 항목은 qty(큐브)*unitG
// (급여기록 여러 곳에서 "제공량 중 섭취량 %"를 계산할 때 공통으로 씀)
function logProvideG(log) {
  return log.items.reduce((s, it) => s + (it.source === "fridge" ? it.qty : it.qty * it.unitG), 0);
}
function catTotals(state, items) {
  const t = {}; CATEGORIES.forEach((c) => { t[c] = 0; });
  items.forEach((it) => { t[catOf(state, it.name)] += gOf(state, it); });
  return t;
}
// 재료 목록 정렬: 죽 → 단백질 → 채소 → 과일 순, 동일 카테고리 내에서는 가나다순
// (끼니 재료 나열, 재료 선택, 먹어본 재료 등 재료가 리스트업되는 모든 곳에서 공통 사용)
function sortByCategory(state, list, nameOf = (x) => x.name) {
  return [...list].sort((a, b) => {
    const oa = CATEGORIES.indexOf(catOf(state, nameOf(a)));
    const ob = CATEGORIES.indexOf(catOf(state, nameOf(b)));
    if (oa !== ob) return oa - ob;
    return nameOf(a).localeCompare(nameOf(b), "ko");
  });
}
function fmtTime(hhmm, mode) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (mode === "ampm") {
    const period = h < 12 ? "오전" : "오후";
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return `${period} ${h12}:${String(m).padStart(2, "0")}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function ageMonths(birthISO) {
  const birth = new Date((birthISO || "2025-10-08") + "T00:00:00");
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  return Math.max(0, months);
}
function ageText(birthISO) {
  return `생후 ${ageMonths(birthISO)}개월`;
}

/* ----------------------------- 이유식 성장 단계 참고 정보 (일반적인 참고용, 자동 적용 안 함) ----------------------------- */
// 개월수 구간별 일반적으로 알려진 참고 수치 - 실제 급여는 반드시 소아과 상담을 기준으로 할 것을 안내함
const GROWTH_STAGES = [
  { min: 0, max: 4, stage: "이유식 준비기", mealsPerDay: "-", perMealG: "-", note: "아직 모유·분유만으로 충분한 시기예요. 이유식 시작은 보통 생후 5~6개월부터 고려해요." },
  { min: 5, max: 6, stage: "초기 이유식", mealsPerDay: "1~2회", perMealG: "30~60g", note: "묽은 미음 형태로 한 가지 재료씩 천천히 소개하는 시기예요." },
  { min: 7, max: 8, stage: "중기 이유식", mealsPerDay: "2~3회", perMealG: "80~120g", note: "약간의 알갱이가 있는 죽 형태로 넘어가는 시기예요." },
  { min: 9, max: 11, stage: "후기 이유식", mealsPerDay: "3회", perMealG: "120~180g", note: "진밥 형태로 다양한 재료를 조합해볼 수 있는 시기예요." },
  { min: 12, max: 999, stage: "완료기 이유식", mealsPerDay: "3회 + 간식 1~2회", perMealG: "150~200g", note: "일반식에 가까운 진밥·진밥 형태로 넘어가는 시기예요." },
];
function growthStageOf(months) {
  return GROWTH_STAGES.find((g) => months >= g.min && months <= g.max) || GROWTH_STAGES[GROWTH_STAGES.length - 1];
}
// 식단 편집 화면 등에서 보여줄 "참고용" 성장 단계 안내 카드 - 값을 자동으로 적용하지 않고 정보만 표시함
function GrowthStageHint({ birth }) {
  const months = ageMonths(birth);
  const g = growthStageOf(months);
  return (
    <div style={{ background: C.sageLight, border: `1px dashed ${C.sage}`, borderRadius: 12, padding: "10px 12px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: C.sageDeep }}>생후 {months}개월 · {g.stage} 참고 정보</span>
      </div>
      <div style={{ fontSize: 11, color: C.sageDeep, lineHeight: 1.6 }}>
        일반적으로 하루 {g.mealsPerDay} · 1회 {g.perMealG} 정도가 참고돼요. {g.note}
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>* 일반적인 참고 정보이며, 정확한 급여량·시기는 소아과 상담을 따라주세요.</div>
    </div>
  );
}

/* ----------------------------- 재료 궁합 (영양학적 근거 기반) ----------------------------- */
// 포함 기준(엄격):
//  1) 사람 대상 연구로 확립된 '영양소 수준'의 상호작용만 수록 (예: 비타민C↔철분). 민간 음식궁합 속설은 제외
//  2) 근거 등급 표시 - A: 기전·임상 근거 모두 확립(NIH/WHO/영양학 교과서 수준), B: 근거는 있으나 한 끼 단위 효과 크기가 제한적일 수 있음
//  3) 태그가 등록되지 않은 재료는 추천하지 않음 (모르는 재료에 대해 추측하지 않음 - 보수적 원칙)
const NUTRIENT_TAGS = {
  // 육류·알 (철분·지방)
  소고기: ["iron", "fat"], 닭고기: ["iron", "fat"], 돼지고기: ["iron", "fat"],
  오리고기: ["iron", "fat"], 양고기: ["iron", "fat"], 소간: ["iron"],
  달걀노른자: ["iron", "fat"], 메추리알: ["iron", "fat"],
  // 생선 (지방·칼슘)
  연어: ["fat"], 고등어: ["fat"], 삼치: ["fat"], 장어: ["fat"], 멸치: ["calcium"],
  // 콩·두부·곡물 (식물성 철분·칼슘)
  두부: ["iron", "calcium"], 순두부: ["iron", "calcium"], 콩: ["iron"], 검은콩: ["iron"],
  완두콩: ["iron", "vitc"], 렌틸콩: ["iron"], 병아리콩: ["iron"],
  "잡곡(귀리)": ["iron"], 귀리: ["iron"], 오트밀: ["iron"], 퀴노아: ["iron"],
  // 채소 (비타민C·베타카로틴·칼슘·옥살산)
  브로콜리: ["vitc"], 콜리플라워: ["vitc"], 파프리카: ["vitc", "betacarotene"], 피망: ["vitc"],
  토마토: ["vitc"], 청경채: ["vitc", "calcium"], 양배추: ["vitc"], 배추: ["vitc"],
  케일: ["vitc", "betacarotene", "calcium"], 감자: ["vitc"],
  당근: ["betacarotene"], 단호박: ["betacarotene"], 고구마: ["betacarotene", "vitc"],
  시금치: ["iron", "betacarotene", "oxalate"], 근대: ["oxalate"], 비트: ["oxalate"],
  // 과일 (비타민C·베타카로틴)
  딸기: ["vitc"], 귤: ["vitc"], 오렌지: ["vitc"], 키위: ["vitc"],
  망고: ["vitc", "betacarotene"], 파인애플: ["vitc"], 살구: ["betacarotene"],
  // 유제품·지방원
  치즈: ["fat", "calcium"], 아기치즈: ["fat", "calcium"], 요거트: ["fat", "calcium"],
  아보카도: ["fat"], 참기름: ["fat"], 들기름: ["fat"],
};
// 태그 한글 이름 (재료 정보 화면의 태그 편집 UI에서 사용)
const TAG_LABELS = { iron: "철분", vitc: "비타민C", betacarotene: "베타카로틴", fat: "지방", calcium: "칼슘", oxalate: "옥살산" };
const TAG_KEYS = Object.keys(TAG_LABELS);
// 영양 DB 재료의 기본 카테고리 (아직 앱에 등록하지 않은 재료를 위키·카테고리 점 색상에 표시할 때 사용)
const DB_CATEGORY = {
  소고기: "단백질", 닭고기: "단백질", 돼지고기: "단백질", 오리고기: "단백질", 양고기: "단백질", 소간: "단백질",
  달걀노른자: "단백질", 메추리알: "단백질", 연어: "단백질", 고등어: "단백질", 삼치: "단백질", 장어: "단백질", 멸치: "단백질",
  두부: "단백질", 순두부: "단백질", 콩: "단백질", 검은콩: "단백질", 완두콩: "단백질", 렌틸콩: "단백질", 병아리콩: "단백질",
  치즈: "단백질", 아기치즈: "단백질", 요거트: "단백질", 참기름: "단백질", 들기름: "단백질",
  "잡곡(귀리)": "탄수화물", 귀리: "탄수화물", 오트밀: "탄수화물", 퀴노아: "탄수화물",
  브로콜리: "채소", 콜리플라워: "채소", 파프리카: "채소", 피망: "채소", 토마토: "채소", 청경채: "채소",
  양배추: "채소", 배추: "채소", 케일: "채소", 감자: "채소", 고구마: "채소", 당근: "채소", 단호박: "채소",
  시금치: "채소", 근대: "채소", 비트: "채소",
  딸기: "과일", 귤: "과일", 오렌지: "과일", 키위: "과일", 망고: "과일", 파인애플: "과일", 살구: "과일",
};
const PAIRING_RULES = [
  { tagA: "iron", tagB: "vitc", type: "good", grade: "A", text: "비타민 C가 철분 흡수를 높여줘요" },
  { tagA: "betacarotene", tagB: "fat", type: "good", grade: "A", text: "베타카로틴은 지방과 함께 먹으면 흡수가 잘 돼요" },
  { tagA: "oxalate", tagB: "calcium", type: "avoid", grade: "A", text: "옥살산이 칼슘과 결합해 칼슘 흡수를 방해할 수 있어요" },
  { tagA: "calcium", tagB: "iron", type: "avoid", grade: "B", text: "같은 끼니의 많은 칼슘이 철분 흡수를 낮출 수 있다는 연구가 있어요" },
];
// 재료의 영양 태그 결정 순서: ① 사용자가 직접 지정한 태그 → ② 기본 영양 DB →
// ③ 변형 재료면 기본 재료의 태그 상속 (예: 사과퓨레 → 사과) → ④ 혼합 큐브면 구성 재료 태그 합산
const tagsOf = (state, name, depth = 0) => {
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
function suggestBaseFor(state, name) {
  if (!name || NUTRIENT_TAGS[name]) return null;
  const known = Array.from(new Set([...Object.keys(NUTRIENT_TAGS), ...Object.keys(state.ingredients)]));
  return known.filter((n) => n !== name && n.length >= 2 && name.startsWith(n)).sort((a, b) => b.length - a.length)[0] || null;
}

// 현재 담긴 재료 기준으로 (1) 재고에 있는 재료 중 궁합 좋은 추천, (2) 현재 조합 안의 주의 조합 계산
function pairingSuggestions(state, currentNames) {
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
function usedTodayMap(state, date = todayISO()) {
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
function pairingRankFor(state, currentNames, name) {
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
function pairingInfoFor(state, currentNames, name) {
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
function ingredientPairsFor(state, name) {
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
// 끼니 편집 화면에서 현재 재료 조합 기준 궁합 추천/주의 안내 카드
function PairingHint({ currentNames, onAdd }) {
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

/* ----------------------------- 데이터 내보내기 ----------------------------- */
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function feedingLogsToCSV(state) {
  const header = ["날짜", "끼니", "시간", "제공량(g)", "섭취량(g)", "섭취율(%)"];
  const rows = [header];
  Object.keys(state.logs).sort().forEach((date) => {
    (state.logs[date] || []).forEach((log) => {
      const prov = logProvideG(log);
      const pct = prov ? Math.round((log.intakeG / prov) * 100) : 0;
      rows.push([date, log.label, log.time, prov, log.intakeG, pct]);
    });
  });
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

/* --------------------------- 스토어 컨텍스트 --------------------------- */
// 실제 앱은 Firebase 기반 FamilyStoreProvider(클라우드 동기화)만 사용합니다.
const Store = createContext(null);
const useStore = () => useContext(Store);

/* =====================================================================
   공통 UI 부품
   ===================================================================== */
function CubeMark({ size = 18 }) {
  const cells = [1, 1, 0, 1];
  const gap = Math.max(2, Math.round(size * 0.12));
  const cell = (size - gap) / 2;
  return (
    <div style={{ width: size, height: size, display: "grid",
      gridTemplateColumns: `${cell}px ${cell}px`, gridTemplateRows: `${cell}px ${cell}px`, gap }}>
      {cells.map((f, i) => (
        <div key={i} style={{ borderRadius: 2, background: f ? C.sage : "transparent",
          border: f ? "none" : `1.5px solid ${C.sageLight}` }} />
      ))}
    </div>
  );
}

function CubeGrid({ filled, total, size = 11, gap = 4, color = C.sage }) {
  const cap = Math.min(total, 10);
  const arr = Array.from({ length: cap }, (_, i) => i < filled);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap }}>
      {arr.map((on, i) => (
        <div key={i} style={{ width: size, height: size, borderRadius: 3,
          background: on ? color : "transparent", border: on ? "none" : `1.4px solid ${C.border}` }} />
      ))}
      {total > 10 && <span style={{ fontSize: 10, color: C.muted, alignSelf: "center", marginLeft: 2 }}>+{total - 10}</span>}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", background: C.sageLight, borderRadius: 999, padding: 3 }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button key={opt.value} onClick={() => onChange(opt.value)}
            style={{ flex: 1, border: "none", padding: "6px 10px", borderRadius: 999, fontSize: 12,
              fontWeight: 700, cursor: "pointer", background: active ? C.surface : "transparent",
              color: active ? C.sageDeep : C.inkSoft, boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CatDot({ name, size = 7 }) {
  const { state } = useStore();
  const color = (CATEGORY[catOf(state, name)] || {}).color || C.muted;
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%",
    background: color, marginRight: 6, flexShrink: 0 }} />;
}

function CategoryLegend() {
  return (
    <div className="flex items-center" style={{ gap: 13, flexWrap: "wrap" }}>
      {Object.values(CATEGORY).map((v) => (
        <div key={v.label} className="flex items-center" style={{ gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: v.color, display: "inline-block" }} />
          <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>{v.label}</span>
        </div>
      ))}
    </div>
  );
}

function CategoryBar({ items, height = 6 }) {
  const { state } = useStore();
  const totals = catTotals(state, items);
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return (
    <div style={{ display: "flex", width: "100%", height, borderRadius: height / 2, overflow: "hidden", background: C.border }}>
      {Object.entries(totals).map(([cat, g]) =>
        g > 0 ? <div key={cat} style={{ width: `${(g / sum) * 100}%`, background: CATEGORY[cat].color }} /> : null
      )}
    </div>
  );
}

// CategoryBar와 동일한 모양이지만, items 배열이 아니라 카테고리별 g 합계(totals 객체)를 바로 받는 버전
function CategoryTotalsBar({ totals, height = 6 }) {
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return (
    <div style={{ display: "flex", width: "100%", height, borderRadius: height / 2, overflow: "hidden", background: C.border }}>
      {Object.entries(totals).map(([cat, g]) =>
        g > 0 ? <div key={cat} style={{ width: `${(g / sum) * 100}%`, background: CATEGORY[cat].color }} /> : null
      )}
    </div>
  );
}

function MealItemList({ items, fontSize = 11, wrap = false, empty = "-" }) {
  const { state } = useStore();
  if (!items || items.length === 0) return <span style={{ fontSize, color: C.muted }}>{empty}</span>;
  const sorted = sortByCategory(state, items);
  return (
    <div style={{ display: "flex", flexDirection: wrap ? "row" : "column", flexWrap: wrap ? "wrap" : "nowrap", gap: wrap ? "3px 12px" : 2 }}>
      {sorted.map((it) => (
        <span key={it.name} className="flex items-center" style={{ fontSize, color: C.inkSoft, lineHeight: 1.3 }}>
          <CatDot name={it.name} size={Math.max(5, fontSize - 4)} />{it.name}
        </span>
      ))}
    </div>
  );
}

function IngredientTable({ items, total }) {
  const { state } = useStore();
  const sorted = sortByCategory(state, items);
  return (
    <div>
      <div className="flex items-center justify-between" style={{ padding: "5px 9px", background: C.sageLight, borderRadius: "8px 8px 0 0" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep }}>재료</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep }}>양</span>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 8px 8px" }}>
        {sorted.map((it, i) => (
          <div key={it.name} className="flex items-center justify-between" style={{ padding: "7px 9px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
            <div className="flex items-center"><CatDot name={it.name} /><span style={{ fontSize: 12, color: C.inkSoft }}>{it.name}</span></div>
            <span style={{ fontSize: 12, color: C.muted }}>{it.gramsOverride != null || it.source === "fridge" ? `${gOf(state, it)}g` : `${gOf(state, it)}g (${it.qty}큐브)`}</span>
          </div>
        ))}
      </div>
      {total != null && (
        <div className="flex items-center justify-between" style={{ marginTop: 6, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>끼니 총량</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{total}g</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    예정: { bg: C.sageLight, fg: C.sageDeep, label: "예정" },
    대기: { bg: C.apricotLight, fg: C.apricot, label: "기록 대기" },
    완료: { bg: C.butterLight, fg: "#9A7416", label: "완료" },
  };
  const s = map[status];
  return <span style={{ fontSize: 10.5, fontWeight: 700, background: s.bg, color: s.fg, padding: "3px 8px", borderRadius: 999 }}>{s.label}</span>;
}

function ScreenHeader({ title, right }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "14px 18px 10px" }}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <CubeMark size={20} />
        <span style={{ fontFamily: "'Gowun Dodum', sans-serif", fontSize: 19, color: C.ink }}>{title}</span>
      </div>
      {right}
    </div>
  );
}

function SubHeader({ title, onBack, right }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "14px 18px 6px" }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <ChevronLeft size={20} color={C.ink} />
        </button>
        <span style={{ fontFamily: "'Gowun Dodum', sans-serif", fontSize: 18, color: C.ink }}>{title}</span>
      </div>
      {right}
    </div>
  );
}

const selectStyle = { border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 6px",
  fontSize: 12, fontWeight: 700, color: C.ink, background: C.surface, cursor: "pointer", outline: "none" };
const stepBtn = { width: 24, height: 24, borderRadius: "50%", border: `1px solid ${C.border}`,
  background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 };
const primaryBtn = { background: C.sage, border: "none", borderRadius: 14, padding: "13px 0",
  fontSize: 13.5, fontWeight: 700, color: "#fff", cursor: "pointer", width: "100%" };

/* =====================================================================
   숫자 입력 (0 지웠을 때 "020"처럼 되는 현상 방지)
   - 값이 0이면 입력창을 빈칸으로 표시 → 이어서 입력해도 선행 0이 남지 않음
   ===================================================================== */
// min 기본값 0: 이 컴포넌트는 항상 재고 그램·큐브 수·일수 등 음수가 나올 수 없는 값에만 쓰이는데,
// 숫자 입력창(type=number)의 HTML min 속성은 스핀 버튼에만 적용되고 직접 타이핑으로 음수를 넣는 건 막아주지 않아서
// (예: 냉장 보관량을 직접 편집하다 "-" 부호가 남는 경우) 재고 중량이 음수로 표시되는 버그가 있었음.
// onChange에서 Math.max로 실제로 clamp해서 근본적으로 막음.
function NumInput({ value, onChange, width = 46, suffix, placeholder = "0", min = 0 }) {
  return (
    <div className="flex items-center" style={{ gap: 6 }}>
      <input
        type="number"
        inputMode="numeric"
        value={value === 0 || value == null ? "" : value}
        placeholder={placeholder}
        min={min}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") { onChange(0); return; }
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(min != null ? Math.max(min, n) : n);
        }}
        style={{ width, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px",
          fontSize: 12, textAlign: "center", color: C.ink, outline: "none" }}
      />
      {suffix && <span style={{ fontSize: 11, color: C.muted }}>{suffix}</span>}
    </div>
  );
}

/* =====================================================================
   확인 모달 (브라우저 confirm()은 미리보기 샌드박스에서 차단될 수 있어
   앱 내부에서 뜨는 확인창으로 대체)
   ===================================================================== */
function ConfirmModal({ title, message, warning, confirmLabel = "삭제", danger = true, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, borderRadius: 18, padding: "20px 18px", width: "100%", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: message || warning ? 6 : 16 }}>{title}</div>
        {message && <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: warning ? 8 : 16, lineHeight: 1.5 }}>{message}</div>}
        {warning && (
          <div style={{ fontSize: 12, color: C.apricot, fontWeight: 700, marginBottom: 16, lineHeight: 1.5, background: C.apricotLight, borderRadius: 10, padding: "8px 10px" }}>
            ⚠ {warning}
          </div>
        )}
        <div className="flex items-center" style={{ gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, background: C.sageLight, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.inkSoft, cursor: "pointer" }}>취소</button>
          <button onClick={onConfirm} style={{ flex: 1, background: danger ? C.apricot : C.sage, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// iOS Safari에서 키보드가 올라오면 레이아웃 뷰포트는 그대로인데 실제 보이는 영역(visualViewport)만 줄어들어서,
// position:fixed 바텀시트가 키보드 뒤에 가려지는 문제가 있음(재료 검색창이 대표적). 실제 보이는 영역의 높이/위치를 추적해서
// 시트를 그 영역 안에 맞추는 데 사용.
function useVisualViewport() {
  const getSnapshot = () => (
    window.visualViewport
      ? { height: window.visualViewport.height, offsetTop: window.visualViewport.offsetTop }
      : { height: window.innerHeight, offsetTop: 0 }
  );
  const [vv, setVv] = useState(getSnapshot);
  useEffect(() => {
    if (!window.visualViewport) return;
    const update = () => setVv(getSnapshot());
    window.visualViewport.addEventListener("resize", update);
    window.visualViewport.addEventListener("scroll", update);
    return () => {
      window.visualViewport.removeEventListener("resize", update);
      window.visualViewport.removeEventListener("scroll", update);
    };
  }, []);
  return vv;
}

/* =====================================================================
   재료 선택 모달
   ===================================================================== */
// multi=true면 체크박스로 여러 재료를 한 번에 골라 onPick(names[])으로 전달, false면 기존처럼 탭 즉시 onPick(name) 1건
// 정렬은 여러 기준을 동시에 켤 수 있음(중복 선택) — 아래 고정된 우선순위(즐겨찾기 > 오늘 사용 재료 > 궁합 좋은 재료 >
// 재고순 > 카테고리순) 순서로 앞 기준이 같을 때만 다음 기준으로 넘어가며, 마지막엔 항상 이름순으로 마무리함.
// 재고순만 한 칩을 반복 클릭하면 꺼짐→적은순→많은순→꺼짐 순으로 도는 3단 토글.
function IngredientPicker({ onPick, onClose, multi = false, alreadyAdded = [], date = todayISO() }) {
  const { state, dispatch } = useStore();
  const vv = useVisualViewport();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("전체");
  const [newCat, setNewCat] = useState("채소");
  const [selected, setSelected] = useState([]);
  const [sortSel, setSortSel] = useState({ fav: false, excludeUsedToday: false, pairing: false, stock: null, cat: true });
  const [linkBase, setLinkBase] = useState(true); // 변형 재료 자동 연결 여부 (기본 켬)
  const names = Object.keys(state.ingredients);
  // 새 재료 입력 시: 영양 DB에 있으면 카테고리 자동 선택, 변형 재료로 보이면 기본 재료의 카테고리를 미리 선택
  const newSuggestion = q && !names.includes(q) ? suggestBaseFor(state, q) : null;
  useEffect(() => {
    setLinkBase(true);
    if (DB_CATEGORY[q]) setNewCat(DB_CATEGORY[q]);
    else if (newSuggestion) setNewCat(catOf(state, newSuggestion));
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const stockAmt = (n) => stockTotalFrozenG(state, n) + stockFridgeG(state, n);
  const isFavorite = (n) => !!(state.ingredients[n] && state.ingredients[n].favorite);
  const usedTodayG = usedTodayMap(state, date);
  const toggleSortFav = () => setSortSel((s) => ({ ...s, fav: !s.fav }));
  const toggleExcludeUsedToday = () => setSortSel((s) => ({ ...s, excludeUsedToday: !s.excludeUsedToday }));
  const toggleSortPairing = () => setSortSel((s) => ({ ...s, pairing: !s.pairing }));
  const toggleSortStock = () => setSortSel((s) => ({ ...s, stock: s.stock === null ? "asc" : s.stock === "asc" ? "desc" : null }));
  const toggleSortCat = () => setSortSel((s) => ({ ...s, cat: !s.cat }));
  // "오늘 사용 재료 제외"는 정렬이 아니라 목록 자체에서 걸러내는 필터
  const base = names.filter((n) => (cat === "전체" || catOf(state, n) === cat) && n.includes(q) && (!sortSel.excludeUsedToday || !usedTodayG.has(n)));
  const sortChain = [];
  if (sortSel.fav) sortChain.push((a, b) => { const fa = isFavorite(a), fb = isFavorite(b); return fa !== fb ? (fa ? -1 : 1) : 0; });
  if (sortSel.pairing) sortChain.push((a, b) => {
    const ra = pairingRankFor(state, alreadyAdded, a), rb = pairingRankFor(state, alreadyAdded, b);
    if (ra === rb) return 0;
    if (ra === null) return 1;
    if (rb === null) return -1;
    return ra - rb; // 궁합 근거 A(0) > B(1)
  });
  if (sortSel.stock) sortChain.push((a, b) => {
    const sa = stockAmt(a), sb = stockAmt(b);
    const aHas = sa > 0, bHas = sb > 0;
    if (aHas !== bHas) return aHas ? -1 : 1; // 재고 있는 재료가 항상 먼저
    return sortSel.stock === "asc" ? sa - sb : sb - sa;
  });
  if (sortSel.cat) sortChain.push((a, b) => CATEGORIES.indexOf(catOf(state, a)) - CATEGORIES.indexOf(catOf(state, b)));
  sortChain.push((a, b) => a.localeCompare(b, "ko")); // 최종 안정 정렬(동률 시 이름순)
  const filtered = [...base].sort((a, b) => {
    for (const cmp of sortChain) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  });
  const isNew = q && !names.includes(q);
  const addedSet = new Set(alreadyAdded);

  const confirmNew = () => {
    // 변형 재료 연결이 켜져 있으면 baseOf까지 함께 등록 → 영양 태그·궁합 특성이 즉시 따라옴
    dispatch({ type: "INGREDIENT_ENSURE", name: q, cat: newCat, baseOf: linkBase && newSuggestion ? newSuggestion : undefined });
    dispatch({ type: "INGREDIENT_TOUCH", name: q });
    if (multi) {
      setSelected((p) => p.includes(q) ? p : [...p, q]);
      setQ("");
    } else {
      onPick(q, newCat);
    }
  };

  const pickOne = (n) => { dispatch({ type: "INGREDIENT_TOUCH", name: n }); onPick(n); };
  const toggleFavorite = (n, e) => { e.stopPropagation(); dispatch({ type: "INGREDIENT_TOGGLE_FAVORITE", name: n }); };
  const toggle = (n) => setSelected((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n]);
  const confirmSelection = () => { dispatch({ type: "INGREDIENT_TOUCH", names: selected }); onPick(selected); onClose(); };

  return (
    <div style={{ position: "fixed", top: vv.offsetTop, left: 0, right: 0, height: vv.height, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", maxHeight: "78%", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 18px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{multi ? `재료 선택${selected.length ? ` (${selected.length})` : ""}` : "재료 선택"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ padding: "0 18px 10px" }}>
          <div className="flex items-center" style={{ gap: 7, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px", marginBottom: 9 }}>
            <Search size={15} color={C.muted} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="재료 검색 또는 새 재료 입력"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.ink, width: "100%" }} />
          </div>
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {["전체", ...CATEGORIES].map((c) => (
              <button key={c} onClick={() => setCat(c)} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                border: "none", background: cat === c ? C.sage : C.sageLight, color: cat === c ? "#fff" : C.sageDeep }}>{c}</button>
            ))}
          </div>
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginRight: 1 }}>정렬(중복 선택 가능)</span>
            {[
              { on: sortSel.fav, onClick: toggleSortFav, label: "즐겨찾기" },
              { on: sortSel.excludeUsedToday, onClick: toggleExcludeUsedToday, label: "오늘 사용 재료 제외" },
              { on: sortSel.pairing, onClick: toggleSortPairing, label: "궁합 좋은 재료" },
              { on: sortSel.stock !== null, onClick: toggleSortStock, label: sortSel.stock === "desc" ? "재고 많은순" : sortSel.stock === "asc" ? "재고 적은순" : "재고순" },
              { on: sortSel.cat, onClick: toggleSortCat, label: "카테고리순" },
            ].map((o, i) => (
              <button key={i} onClick={o.onClick} style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${o.on ? C.sage : C.border}`, background: o.on ? C.sageLight : "transparent", color: o.on ? C.sageDeep : C.muted }}>{o.label}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: "0 18px 24px" }}>
          {isNew && (
            <div style={{ marginBottom: 10, background: C.sageLight, border: `1px dashed ${C.sage}`, borderRadius: 12, padding: "11px 12px" }}>
              <div className="flex items-center" style={{ gap: 8, marginBottom: 9 }}>
                <Plus size={15} color={C.sageDeep} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sageDeep }}>'{q}' 새 재료로 추가</span>
              </div>
              <div style={{ fontSize: 10.5, color: C.sageDeep, fontWeight: 700, marginBottom: 6 }}>카테고리</div>
              <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {CATEGORIES.map((c) => (
                  <button key={c} onClick={() => setNewCat(c)} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                    border: "none", background: newCat === c ? C.sage : C.surface, color: newCat === c ? "#fff" : C.sageDeep }}>{c}</button>
                ))}
              </div>
              {newSuggestion && (
                <button onClick={() => setLinkBase((v) => !v)} className="flex items-center" style={{ gap: 8, background: C.surface, border: "none", borderRadius: 10, padding: "8px 10px", marginBottom: 10, width: "100%", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${linkBase ? C.sage : C.border}`,
                    background: linkBase ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {linkBase && <Check size={12} color="#fff" />}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.sageDeep, lineHeight: 1.4 }}>'{newSuggestion}'의 변형으로 연결 — 영양·궁합 특성을 물려받아요</span>
                </button>
              )}
              <button onClick={confirmNew} style={{ ...primaryBtn, padding: "9px 0", fontSize: 12.5 }}>'{q}' 추가하기</button>
              <div style={{ fontSize: 9.5, color: C.sageDeep, marginTop: 8, lineHeight: 1.4, opacity: 0.8 }}>
                여러 재료가 섞인 혼합 큐브라면, 추가 후 재고 탭 → 재료 정보에서 구성 재료를 지정하면 궁합 계산에 반영돼요.
              </div>
            </div>
          )}
          {filtered.map((n) => {
            const cubes = stockTotalCubes(state, n), fg = stockFridgeG(state, n);
            const already = multi && addedSet.has(n);
            const checked = selected.includes(n);
            const fav = isFavorite(n);
            const pairInfo = sortSel.pairing ? pairingInfoFor(state, alreadyAdded, n) : null;
            return (
              <button key={n} onClick={() => (multi ? (already ? null : toggle(n)) : pickOne(n))} disabled={already}
                className="flex items-center justify-between" style={{ width: "100%", padding: "11px 12px",
                borderBottom: `1px solid ${C.border}`, background: "transparent", border: "none", borderBottomStyle: "solid",
                cursor: already ? "default" : "pointer", opacity: already ? 0.45 : 1 }}>
                <div className="flex items-center" style={{ gap: multi ? 9 : 6, minWidth: 0 }}>
                  {multi && (
                    <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${checked ? C.sage : C.border}`,
                      background: checked ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {checked && <Check size={12} color="#fff" />}
                    </span>
                  )}
                  <span role="button" onClick={(e) => toggleFavorite(n, e)} style={{ display: "flex", padding: 2, cursor: "pointer" }}>
                    <Star size={13} color={fav ? C.apricot : C.border} fill={fav ? C.apricot : "none"} />
                  </span>
                  <CatDot name={n} size={8} /><span style={{ fontSize: 13, color: C.ink }}>{n}</span>
                  {usedTodayG.has(n) && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "1px 6px", flexShrink: 0 }}>오늘 {Math.round(usedTodayG.get(n))}g</span>
                  )}
                  {pairInfo && pairInfo.goodWith.length > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "1px 6px", flexShrink: 0 }}>{pairInfo.goodWith.join("·")}와 궁합</span>
                  )}
                  {pairInfo && pairInfo.avoidWith.length > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#9A4A1E", background: C.apricotLight, borderRadius: 999, padding: "1px 6px", flexShrink: 0 }}>{pairInfo.avoidWith.join("·")}와 비추천</span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: cubes || fg ? C.muted : C.apricot, flexShrink: 0 }}>
                  {already ? "이미 담김" : cubes || fg ? `냉동 ${cubes}${fg ? ` · 냉장 ${fg}g` : ""}` : "재고없음"}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && !isNew && (
            <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12, color: C.muted }}>검색 결과가 없습니다</div>
          )}
        </div>
        {multi && (
          <div style={{ padding: "10px 18px 20px", borderTop: `1px solid ${C.border}` }}>
            <button onClick={confirmSelection} disabled={selected.length === 0}
              style={{ ...primaryBtn, background: selected.length ? C.sage : C.sageLight, color: selected.length ? "#fff" : C.muted, cursor: selected.length ? "pointer" : "default" }}>
              {selected.length > 0 ? `${selected.length}개 재료 추가` : "재료를 선택하세요"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   끼니 시간 선택기
   ===================================================================== */
// bare=true면 카드(테두리) 없이 행만 렌더링 - 다른 카드 안에 합쳐 넣을 때 사용
function TimePicker({ time, setTime, timeFmt, bare = false, labelColor }) {
  const [h0, m0] = time.split(":").map(Number);
  const setH = (h24) => setTime(`${String(h24).padStart(2, "0")}:${String(m0).padStart(2, "0")}`);
  const setM = (mm) => setTime(`${String(h0).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  const row = (
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12.5, color: labelColor || C.inkSoft, fontWeight: 600 }}>끼니 시간</span>
        <div className="flex items-center" style={{ gap: 6 }}>
          {timeFmt === "ampm" && (
            <select value={h0 < 12 ? "오전" : "오후"} onChange={(e) => {
              const wantPM = e.target.value === "오후", isPM = h0 >= 12;
              if (wantPM && !isPM) setH(h0 + 12); else if (!wantPM && isPM) setH(h0 - 12);
            }} style={selectStyle}><option>오전</option><option>오후</option></select>
          )}
          <select value={timeFmt === "ampm" ? ((h0 % 12) === 0 ? 12 : h0 % 12) : h0} onChange={(e) => {
            const v = Number(e.target.value);
            if (timeFmt === "ampm") { const isPM = h0 >= 12; let h = v % 12; if (isPM) h += 12; setH(h); } else setH(v);
          }} style={selectStyle}>
            {(timeFmt === "ampm" ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 24 }, (_, i) => i)).map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}시</option>
            ))}
          </select>
          <select value={m0} onChange={(e) => setM(Number(e.target.value))} style={selectStyle}>
            {[0, 10, 20, 30, 40, 50].map((mm) => <option key={mm} value={mm}>{String(mm).padStart(2, "0")}분</option>)}
          </select>
        </div>
      </div>
  );
  if (bare) return row;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px" }}>
      {row}
      <div style={{ textAlign: "right", fontSize: 10.5, color: C.muted, marginTop: 6 }}>{fmtTime(time, timeFmt)}</div>
    </div>
  );
}

/* =====================================================================
   끼니 종류 선택 모달 (더보기 → 끼니 설정에서 미리 정의한 목록 중 선택)
   ===================================================================== */
function MealSlotPicker({ slots, timeFmt, onPick, onClose }) {
  const [custom, setCustom] = useState("");
  const sorted = [...slots].sort((a, b) => a.time.localeCompare(b.time));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", maxHeight: "78%", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 18px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>끼니 종류 선택</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 18px 10px" }}>
          {sorted.map((s) => (
            <button key={s.id} onClick={() => onPick(s.label, s.time)} className="flex items-center justify-between" style={{ width: "100%", padding: "12px 12px",
              borderBottom: `1px solid ${C.border}`, background: "transparent", border: "none", borderBottomStyle: "solid", cursor: "pointer" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{s.label}</span>
              <span style={{ fontSize: 11.5, color: C.muted }}>{fmtTime(s.time, timeFmt)}</span>
            </button>
          ))}
          {sorted.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: C.muted }}>
              등록된 끼니 종류가 없습니다.<br />더보기 → 끼니 설정에서 추가해 보세요.
            </div>
          )}
        </div>
        <div style={{ padding: "10px 18px 24px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, marginBottom: 7 }}>목록에 없는 끼니라면 직접 입력</div>
          <div className="flex items-center" style={{ gap: 8 }}>
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="예: 야식"
              style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: C.ink, outline: "none" }} />
            <button onClick={() => custom && onPick(custom, null)} disabled={!custom}
              style={{ background: custom ? C.sage : C.sageLight, border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 12.5, fontWeight: 700, color: custom ? "#fff" : C.muted, cursor: custom ? "pointer" : "default" }}>선택</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   다른 날짜의 끼니를 복사해오는 선택기 (식단표 재료 재입력 수고를 줄이기 위함)
   ===================================================================== */
function MealCopyPicker({ onPick, onClose }) {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const timeFmt = state.settings.timeFmt;
  const all = [];
  Object.keys(state.plans).sort((a, b) => b.localeCompare(a)).forEach((d) => {
    (state.plans[d] || []).forEach((m) => all.push({ date: d, meal: m }));
  });
  const filtered = all.filter(({ date, meal }) =>
    !q || meal.label.includes(q) || date.includes(q) || meal.items.some((it) => it.name.includes(q))
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", maxHeight: "78%", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 18px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>식단 복사</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ padding: "0 18px 10px" }}>
          <div className="flex items-center" style={{ gap: 7, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px" }}>
            <Search size={15} color={C.muted} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="날짜, 끼니 이름, 재료로 검색"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.ink, width: "100%" }} />
          </div>
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8 }}>선택하면 현재 재료 목록이 해당 끼니 재료로 대체됩니다.</div>
        </div>
        <div style={{ overflowY: "auto", padding: "0 18px 24px" }}>
          {filtered.map(({ date, meal }) => (
            <button key={date + meal.id} onClick={() => { onPick(meal); onClose(); }} className="flex flex-col" style={{ width: "100%", textAlign: "left", padding: "10px 12px",
              borderBottom: `1px solid ${C.border}`, background: "transparent", border: "none", borderBottomStyle: "solid", cursor: "pointer" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{date} · {meal.label}</span>
                <span style={{ fontSize: 10.5, color: C.muted }}>{fmtTime(meal.time, timeFmt)}</span>
              </div>
              <MealItemList items={meal.items} fontSize={10.5} wrap />
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12, color: C.muted }}>복사할 수 있는 끼니 기록이 없습니다</div>
          )}
        </div>
      </div>
    </div>
  );
}

// "냉장고 비우기" 힌트: 냉장 보관 중이거나 냉동 보관기한이 임박한 재료를 식단 편집 화면에서 바로 추가할 수 있게 안내
function UrgentStockHint({ currentNames, onAdd }) {
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
function TodayUsedHint({ currentNames, date = todayISO() }) {
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
const MEAL_TIP_OPTIONS = [
  { key: "stock", label: "재고" },
  { key: "pairing", label: "궁합" },
  { key: "usedToday", label: "오늘 사용 재료" },
];
function mealTipsOf(state) {
  return state.settings.mealTips || { stock: true, pairing: true, usedToday: true };
}
// 재고/궁합/오늘 사용 재료 힌트를 하나로 묶어 기본은 접어두고, 필요할 때만 펼쳐보는 패널.
// 세 카드를 항상 펼쳐두면 화면을 너무 많이 차지한다는 피드백을 받아 접이식으로 변경함(2026-07-04).
function MealTipsPanel({ currentNames, onAdd, date = todayISO() }) {
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

/* =====================================================================
   끼니 편집 화면 (식단 계획용)
   ===================================================================== */
function MealEditScreen({ date, meal, onBack }) {
  const { state, dispatch } = useStore();
  const timeFmt = state.settings.timeFmt;
  const [label, setLabel] = useState(meal.label || "");
  const [time, setTime] = useState(meal.time || "12:00");
  const [items, setItems] = useState(meal.items.map((it) => ({
    ...it,
    unitG: it.unitG != null ? it.unitG : unitGOf(state, it.name),
    gramsOverride: it.gramsOverride != null ? it.gramsOverride : null,
  })));
  const [picker, setPicker] = useState(false);
  const [slotPicker, setSlotPicker] = useState(false);
  const [copyPicker, setCopyPicker] = useState(false);

  const upQty = (name, d) => setItems((p) => p.map((it) => it.name === name ? { ...it, qty: it.qty + d } : it).filter((it) => it.qty > 0));
  const upUnit = (name, v) => setItems((p) => p.map((it) => it.name === name ? { ...it, unitG: v } : it));
  const upGrams = (name, v) => setItems((p) => p.map((it) => it.name === name ? { ...it, gramsOverride: v } : it));
  const setMode = (name, mode) => setItems((p) => p.map((it) => {
    if (it.name !== name) return it;
    const curG = it.gramsOverride != null ? it.gramsOverride : it.qty * (it.unitG || 15);
    if (mode === "gram") return { ...it, gramsOverride: curG };
    return { ...it, gramsOverride: null, qty: Math.max(1, Math.round(curG / (it.unitG || 15))) };
  }));
  const rm = (name) => setItems((p) => p.filter((it) => it.name !== name));
  const addItems = (names) => {
    setPicker(false);
    setItems((p) => {
      const existing = new Set(p.map((it) => it.name));
      const toAdd = names.filter((n) => !existing.has(n)).map((name) => ({ name, qty: 1, unitG: unitGOf(state, name), gramsOverride: null }));
      return [...p, ...toAdd];
    });
  };
  const copyMeal = (srcMeal) => {
    setItems(srcMeal.items.map((it) => ({
      ...it,
      unitG: it.unitG != null ? it.unitG : unitGOf(state, it.name),
      gramsOverride: it.gramsOverride != null ? it.gramsOverride : null,
    })));
  };
  const total = totalG(state, items);

  const pickSlot = (slotLabel, slotTime) => {
    setLabel(slotLabel);
    if (slotTime) setTime(slotTime); // 미리 정해둔 시간으로 자동 입력 (이후 직접 수정 가능)
    setSlotPicker(false);
  };

  const save = () => {
    if (!label) return; // 끼니 종류 미선택 - 아래 저장 버튼이 비활성화·안내 문구로 바뀌므로 여기까지 오지 않음
    dispatch({ type: "PLAN_SAVE_MEAL", date, meal: { id: meal.id || uid(), label, time, items: items.map(({ name, qty, unitG, gramsOverride }) => ({ name, qty, unitG, gramsOverride: gramsOverride != null ? gramsOverride : null })) } });
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

        <div>
          <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginBottom: 6, padding: "0 2px" }}>재료 ({items.length})</div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            {sortByCategory(state, items).map((it, i) => {
              const isGram = it.gramsOverride != null;
              return (
                <div key={it.name} style={{ padding: "11px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: C.surface }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                    <div className="flex items-center"><CatDot name={it.name} size={8} /><span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{it.name}</span></div>
                    <button onClick={() => rm(it.name)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Trash2 size={14} color={C.apricot} /></button>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Segmented value={isGram ? "gram" : "cube"} onChange={(v) => setMode(it.name, v)} options={[{ value: "cube", label: "큐브로 입력" }, { value: "gram", label: "그램으로 입력" }]} />
                  </div>
                  {isGram ? (
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 10.5, color: C.muted }}>총 중량</span>
                      <NumInput value={it.gramsOverride} onChange={(v) => upGrams(it.name, v)} width={56} suffix="g" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center" style={{ gap: 6 }}>
                        <span style={{ fontSize: 10.5, color: C.muted }}>큐브당</span>
                        <NumInput value={it.unitG} onChange={(v) => upUnit(it.name, v)} width={38} suffix="g" />
                      </div>
                      <div className="flex items-center" style={{ gap: 8 }}>
                        <button onClick={() => upQty(it.name, -1)} style={stepBtn}><Minus size={12} color={C.inkSoft} /></button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, minWidth: 40, textAlign: "center", whiteSpace: "nowrap" }}>{it.qty}큐브</span>
                        <button onClick={() => upQty(it.name, 1)} style={stepBtn}><Plus size={12} color={C.inkSoft} /></button>
                      </div>
                    </div>
                  )}
                  <div style={{ textAlign: "right", fontSize: 10.5, color: C.muted, marginTop: 5 }}>
                    = {gOf(state, it)}g{isGram && it.unitG ? ` (약 ${Math.round((it.gramsOverride / it.unitG) * 10) / 10}큐브 상당)` : ""}
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <div style={{ padding: 18, textAlign: "center", fontSize: 12, color: C.muted }}>추가된 재료가 없습니다</div>}
          </div>
        </div>

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
function BulkSaveScreen({ initialCursor, onBack }) {
  const { state, dispatch } = useStore();
  const timeFmt = state.settings.timeFmt;
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("07:00");
  const [items, setItems] = useState([]);
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

  const upQty = (name, d) => setItems((p) => p.map((it) => it.name === name ? { ...it, qty: it.qty + d } : it).filter((it) => it.qty > 0));
  const upUnit = (name, v) => setItems((p) => p.map((it) => it.name === name ? { ...it, unitG: v } : it));
  const upGrams = (name, v) => setItems((p) => p.map((it) => it.name === name ? { ...it, gramsOverride: v } : it));
  const setMode = (name, mode) => setItems((p) => p.map((it) => {
    if (it.name !== name) return it;
    const curG = it.gramsOverride != null ? it.gramsOverride : it.qty * (it.unitG || 15);
    if (mode === "gram") return { ...it, gramsOverride: curG };
    return { ...it, gramsOverride: null, qty: Math.max(1, Math.round(curG / (it.unitG || 15))) };
  }));
  const rm = (name) => setItems((p) => p.filter((it) => it.name !== name));
  const addItems = (names) => {
    setPicker(false);
    setItems((p) => {
      const existing = new Set(p.map((it) => it.name));
      const toAdd = names.filter((n) => !existing.has(n)).map((name) => ({ name, qty: 1, unitG: unitGOf(state, name), gramsOverride: null }));
      return [...p, ...toAdd];
    });
  };
  const copyMeal = (srcMeal) => {
    setItems(srcMeal.items.map((it) => ({
      ...it,
      unitG: it.unitG != null ? it.unitG : unitGOf(state, it.name),
      gramsOverride: it.gramsOverride != null ? it.gramsOverride : null,
    })));
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
          <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginBottom: 6, padding: "0 2px" }}>재료 ({items.length})</div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            {sortByCategory(state, items).map((it, i) => {
              const isGram = it.gramsOverride != null;
              return (
                <div key={it.name} style={{ padding: "11px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: C.surface }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                    <div className="flex items-center"><CatDot name={it.name} size={8} /><span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{it.name}</span></div>
                    <button onClick={() => rm(it.name)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Trash2 size={14} color={C.apricot} /></button>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Segmented value={isGram ? "gram" : "cube"} onChange={(v) => setMode(it.name, v)} options={[{ value: "cube", label: "큐브로 입력" }, { value: "gram", label: "그램으로 입력" }]} />
                  </div>
                  {isGram ? (
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 10.5, color: C.muted }}>총 중량</span>
                      <NumInput value={it.gramsOverride} onChange={(v) => upGrams(it.name, v)} width={56} suffix="g" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center" style={{ gap: 6 }}>
                        <span style={{ fontSize: 10.5, color: C.muted }}>큐브당</span>
                        <NumInput value={it.unitG} onChange={(v) => upUnit(it.name, v)} width={38} suffix="g" />
                      </div>
                      <div className="flex items-center" style={{ gap: 8 }}>
                        <button onClick={() => upQty(it.name, -1)} style={stepBtn}><Minus size={12} color={C.inkSoft} /></button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, minWidth: 40, textAlign: "center", whiteSpace: "nowrap" }}>{it.qty}큐브</span>
                        <button onClick={() => upQty(it.name, 1)} style={stepBtn}><Plus size={12} color={C.inkSoft} /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {items.length === 0 && <div style={{ padding: 18, textAlign: "center", fontSize: 12, color: C.muted }}>추가된 재료가 없습니다</div>}
          </div>
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

// 급여 기록 화면에서 재료별로 "저장하면 재고가 어떻게 바뀌는지" 안내 + 재고 반영 여부 체크박스
// (재고가 아예 없는 재료는 반영할 재고 자체가 없으므로 체크박스를 넣지 않음)
function StockChangeHint({ item, checked, onToggle }) {
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

/* =====================================================================
   급여 기록 화면 (실제 먹인 끼니 → 재고 차감 + 섭취율)
   ===================================================================== */
function FeedingLogScreen({ date, planMeal, existingLog, onBack }) {
  const { state, dispatch, notify } = useStore();
  const base = existingLog || planMeal;
  // 실제 급여 시간: 계획 시간과 별개로 수정 가능 (계획은 그대로 두고 기록에만 반영됨)
  const [time, setTime] = useState(base.time || "12:00");
  const [label] = useState(base.label || "끼니");
  // 제공 항목: 출처(냉동/냉장) + 수량. 식단표에서 "그램으로 입력"(gramsOverride)한 재료는
  // 실제 중량을 그대로 이어받도록 냉장(계량) 방식으로 옮겨온다 (기본 15g으로 뭉개지는 문제 방지)
  const [items, setItems] = useState(
    base.items.map((it) => {
      const effectiveUnitG = it.unitG != null ? it.unitG : unitGOf(state, it.name);
      // 기존 급여기록을 다시 불러오는 경우: 저장 당시의 source(냉동/냉장)를 그대로 존중해야
      // 냉장(중량) 입력값이 냉동(큐브) 개수로 잘못 바뀌는 문제가 없음
      if (it.source === "fridge") {
        return { name: it.name, source: "fridge", qty: 1, fridgeG: it.qty || 0, unitG: effectiveUnitG, deduct: it.deduct !== false };
      }
      if (it.source === "frozen") {
        return { name: it.name, source: "frozen", qty: it.qty || 1, fridgeG: effectiveUnitG * (it.qty || 1), unitG: effectiveUnitG, deduct: it.deduct !== false };
      }
      // 식단표 항목(아직 급여기록으로 저장된 적 없음, source 필드 없음)
      const hasGramsOverride = it.gramsOverride != null;
      const totalGForItem = hasGramsOverride ? it.gramsOverride : (it.qty || 1) * effectiveUnitG;
      // 기본 출처 선택: 냉동 재고가 조금이라도 있으면 냉동을 기본으로 한다.
      // (버그 수정) 예전엔 "냉장 보관분이 조금이라도 있으면 무조건 냉장"으로 기본값을 잡아서,
      // 실제로는 냉동 큐브로 준 재료인데 남아있던 소량의 냉장 보관분(g)만 차감되고 냉동 재고는
      // 전혀 줄지 않는 문제가 있었음(deductFridge가 부족분을 그냥 버리고 조용히 끝남).
      // 냉동 재고가 아예 없고 냉장 재고만 있을 때만 냉장을 기본값으로 함.
      const hasFrozen = stockTotalCubes(state, it.name) > 0;
      const hasFridge = stockFridgeG(state, it.name) > 0;
      const source = hasGramsOverride ? "fridge" : (!hasFrozen && hasFridge && it.name !== "죽" ? "fridge" : "frozen");
      return {
        name: it.name,
        source,
        qty: hasGramsOverride ? Math.max(1, Math.round(totalGForItem / (effectiveUnitG || 15))) : (it.qty || 1),
        fridgeG: hasGramsOverride ? totalGForItem : (effectiveUnitG * (it.qty || 1)),
        unitG: effectiveUnitG,
        deduct: it.deduct !== false,
      };
    })
  );
  const [picker, setPicker] = useState(false);
  const [intake, setIntake] = useState(existingLog ? existingLog.intakeG : null);
  const [confirmingSave, setConfirmingSave] = useState(false);

  const provideG = (it) => it.source === "fridge" ? it.fridgeG : it.qty * it.unitG;
  const totalProvide = items.reduce((s, it) => s + provideG(it), 0);

  const setSource = (name, src) => setItems((p) => p.map((it) => it.name === name ? { ...it, source: src } : it));
  const upQty = (name, d) => setItems((p) => p.map((it) => it.name === name ? { ...it, qty: Math.max(1, it.qty + d) } : it));
  const upUnit = (name, v) => setItems((p) => p.map((it) => it.name === name ? { ...it, unitG: v } : it));
  const upFridge = (name, v) => setItems((p) => p.map((it) => it.name === name ? { ...it, fridgeG: v } : it));
  const toggleDeduct = (name) => setItems((p) => p.map((it) => it.name === name ? { ...it, deduct: !it.deduct } : it));
  const rm = (name) => setItems((p) => p.filter((it) => it.name !== name));
  const addItems = (names) => {
    setPicker(false);
    setItems((p) => {
      const existing = new Set(p.map((it) => it.name));
      const toAdd = names.filter((n) => !existing.has(n)).map((name) => ({ name, source: "frozen", qty: 1, fridgeG: 15, unitG: unitGOf(state, name), deduct: true }));
      return [...p, ...toAdd];
    });
  };

  const quick = [["완식", 1], ["3/4", 0.75], ["절반", 0.5], ["조금", 0.25], ["거부", 0]];

  const save = () => {
    const logItems = items.map((it) => it.source === "fridge"
      ? { name: it.name, source: "fridge", qty: it.fridgeG, unitG: 1, deduct: it.deduct !== false }
      : { name: it.name, source: "frozen", qty: it.qty, unitG: it.unitG, deduct: it.deduct !== false });
    // 저장 시점의 식단표(계획)를 스냅샷으로 함께 저장 - 이후 식단표가 수정·삭제돼도
    // 급여표의 '계획 대비 비교'는 기록 저장 당시의 계획 기준으로 유지됨.
    // 기존 기록을 수정하는 경우엔 최초 저장 때 담아둔 스냅샷을 그대로 보존.
    const planSnapshot = existingLog && existingLog.planSnapshot
      ? existingLog.planSnapshot
      : (planMeal && planMeal.items && planMeal.items.length > 0
        ? { label: planMeal.label, time: planMeal.time,
            items: planMeal.items.map(({ name, qty, unitG, gramsOverride }) => ({
              name, qty, unitG: unitG != null ? unitG : unitGOf(state, name),
              gramsOverride: gramsOverride != null ? gramsOverride : null })) }
        : null);
    dispatch({ type: "LOG_SAVE", date, log: { id: existingLog ? existingLog.id : uid(), label, time, items: logItems, intakeG: intake == null ? totalProvide : intake, planSnapshot } });
    // 저장 직후 "재고가 실제로 차감되었는지"를 눈으로 확인할 수 있게 차감 내역을 토스트로 안내
    const deducted = logItems.filter((it) => it.deduct !== false);
    const summary = deducted
      .map((it) => (it.source === "fridge" ? `${it.name} ${it.qty}g` : `${it.name} ${it.qty}큐브`))
      .join(", ");
    notify(deducted.length > 0 ? `기록 저장 · 재고 차감: ${summary}` : "기록 저장됨 (재고 차감 없음)");
    onBack();
  };
  const intakeVal = intake == null ? totalProvide : intake;
  const deductCount = items.filter((it) => it.deduct !== false).length;

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title={`${label} 급여 기록`} onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>급여 시간</span>
          <div className="flex items-center" style={{ gap: 8 }}>
            <input type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)}
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 13, color: C.ink, background: "transparent", outline: "none", fontFamily: "inherit" }} />
            <button onClick={() => { const n = new Date(); setTime(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`); }}
              style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep, background: C.sageLight, border: "none", borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}>지금</button>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600, padding: "0 2px" }}>
          재료별로 재고 반영 여부를 선택할 수 있어요
        </div>

        <div>
          <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginBottom: 6, padding: "0 2px" }}>제공한 재료</div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            {sortByCategory(state, items).map((it, i) => (
              <div key={it.name} style={{ padding: "11px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: C.surface }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <div className="flex items-center"><CatDot name={it.name} size={8} /><span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{it.name}</span></div>
                  <button onClick={() => rm(it.name)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Trash2 size={14} color={C.apricot} /></button>
                </div>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <Segmented value={it.source} onChange={(v) => setSource(it.name, v)} options={[
                    { value: "frozen", label: <span className="flex items-center justify-center" style={{ gap: 4 }}><Snowflake size={12} /> 냉동</span> },
                    { value: "fridge", label: <span className="flex items-center justify-center" style={{ gap: 4 }}><Refrigerator size={12} /> 냉장</span> },
                  ]} />
                </div>
                {it.source === "frozen" ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center" style={{ gap: 6 }}>
                      <span style={{ fontSize: 10.5, color: C.muted }}>큐브당</span>
                      <NumInput value={it.unitG} onChange={(v) => upUnit(it.name, v)} width={38} suffix="g" />
                    </div>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <button onClick={() => upQty(it.name, -1)} style={stepBtn}><Minus size={12} color={C.inkSoft} /></button>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, minWidth: 40, textAlign: "center", whiteSpace: "nowrap" }}>{it.qty}큐브</span>
                      <button onClick={() => upQty(it.name, 1)} style={stepBtn}><Plus size={12} color={C.inkSoft} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 10.5, color: C.muted }}>냉장 보관분 (계량)</span>
                    <NumInput value={it.fridgeG} onChange={(v) => upFridge(it.name, v)} width={52} suffix="g" />
                  </div>
                )}
                <div style={{ textAlign: "right", fontSize: 10.5, color: C.muted, marginTop: 5 }}>제공 {provideG(it)}g</div>
                <StockChangeHint item={it} checked={it.deduct !== false} onToggle={() => toggleDeduct(it.name)} />
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => setPicker(true)} className="flex items-center justify-center" style={{ gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
          <Plus size={14} /> 재료 추가
        </button>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>섭취량</span>
            <span style={{ fontSize: 12, color: C.muted }}>총 제공 {totalProvide}g</span>
          </div>
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {quick.map(([lab, r]) => {
              const v = Math.round(totalProvide * r);
              const active = intake === v;
              return (
                <button key={lab} onClick={() => setIntake(v)} style={{ fontSize: 11.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999, cursor: "pointer",
                  border: "none", background: active ? C.sage : C.sageLight, color: active ? "#fff" : C.sageDeep }}>{lab}</button>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11.5, color: C.inkSoft }}>직접 입력</span>
            <div className="flex items-center" style={{ gap: 6 }}>
              <input type="number" value={intake == null ? "" : intake} placeholder={String(totalProvide)} onChange={(e) => setIntake(e.target.value === "" ? null : Number(e.target.value))}
                style={{ width: 60, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 13, textAlign: "center", color: C.ink, outline: "none" }} />
              <span style={{ fontSize: 12, color: C.muted }}>g</span>
            </div>
          </div>
          {intake != null && totalProvide > 0 && (
            <div style={{ marginTop: 10, textAlign: "right", fontSize: 12, fontWeight: 700, color: C.sageDeep }}>
              섭취율 {Math.round((intake / totalProvide) * 100)}%
            </div>
          )}
        </div>

        <button onClick={() => setConfirmingSave(true)} style={primaryBtn}>기록 저장</button>
      </div>
      {picker && <IngredientPicker multi onPick={addItems} alreadyAdded={items.map((it) => it.name)} onClose={() => setPicker(false)} date={date} />}
      {confirmingSave && (
        <ConfirmModal
          title={`${label} 급여 기록을 저장할까요?`}
          message={`제공 ${totalProvide}g 중 섭취 ${intakeVal}g${totalProvide ? ` (${Math.round((intakeVal / totalProvide) * 100)}%)` : ""}${deductCount > 0 ? ` · 재고 반영이 켜진 재료 ${deductCount}개의 재고가 차감됩니다.` : ""}`}
          confirmLabel="저장"
          danger={false}
          onConfirm={() => { setConfirmingSave(false); save(); }}
          onCancel={() => setConfirmingSave(false)}
        />
      )}
    </div>
  );
}

/* =====================================================================
   소진 예측 / 알림 계산
   ===================================================================== */
function avgDailyUse(state, name, days = 14) {
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
function daysLeft(state, name) {
  const g = stockTotalFrozenG(state, name);
  const avg = avgDailyUse(state, name);
  if (avg <= 0) return null;
  return Math.floor(g / avg);
}
// 냉동 재료의 보관 마지노선(제조일 기준 14일)까지 남은 일수 — 가장 임박한 배치 기준
function frozenStorageDaysLeft(state, name) {
  const batches = stockBatches(state, name).filter((b) => b.frozen > 0 && b.frozenExp);
  if (batches.length === 0) return null;
  const nearestExp = batches.reduce((min, b) => (b.frozenExp < min ? b.frozenExp : min), batches[0].frozenExp);
  const t = todayISO();
  const diffMs = new Date(nearestExp + "T00:00:00") - new Date(t + "T00:00:00");
  return Math.round(diffMs / 86400000);
}
// 냉장 보관 재료의 보관 마지노선까지 남은 일수 — 가장 임박한 배치 기준 (냉동과 동일한 방식)
function fridgeStorageDaysLeft(state, name) {
  const batches = stockBatches(state, name).filter((b) => (b.fridgeG || 0) > 0 && b.fridgeExp);
  if (batches.length === 0) return null;
  const nearestExp = batches.reduce((min, b) => (b.fridgeExp < min ? b.fridgeExp : min), batches[0].fridgeExp);
  const t = todayISO();
  const diffMs = new Date(nearestExp + "T00:00:00") - new Date(t + "T00:00:00");
  return Math.round(diffMs / 86400000);
}
// "냉장고 비우기" 대상 재료: 냉장 보관 중(항상 임박으로 취급)이거나, 냉동 보관기한이 며칠 안 남은 재료
function urgentStockNames(state, frozenDaysThreshold = 3) {
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
function frozenAlerts(state) {
  return Object.keys(state.stock).map((name) => {
    const cubes = stockTotalCubes(state, name);
    if (cubes <= 0) return null;
    const dl = daysLeft(state, name);
    return { name, cubes, g: stockTotalFrozenG(state, name), daysLeft: dl };
  }).filter((x) => x && x.daysLeft != null && x.daysLeft <= 5).sort((a, b) => a.daysLeft - b.daysLeft);
}
function fridgeAlerts(state) {
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

/* =====================================================================
   오늘 탭
   ===================================================================== */
function TodayTab({ go }) {
  const { state, dispatch } = useStore();
  const t = todayISO();
  const timeFmt = state.settings.timeFmt;
  const plan = state.plans[t] || [];
  const logs = state.logs[t] || [];
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const [detail, setDetail] = useState(false);

  const fAlerts = frozenAlerts(state);
  const rAlertsAll = fridgeAlerts(state);
  const bannerHidden = state.ui.fridgeBannerHiddenDate === t;

  const meals = plan.map((m) => {
    const log = logs.find((l) => l.label === m.label);
    let status = "예정";
    if (log) status = "완료";
    else if (m.time < nowHM) status = "대기";
    return { ...m, log, status };
  });

  return (
    <div style={{ paddingBottom: 90 }}>
      <ScreenHeader title="베이비큐브" right={<span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>{ageText(state.baby.birth)} · 오늘</span>} />

      {rAlertsAll.length > 0 && !bannerHidden && (
        <div style={{ padding: "0 18px", marginBottom: 14 }}>
          <div className="flex items-start" style={{ gap: 10, background: C.apricotLight, borderRadius: 14, padding: "12px 14px" }}>
            <Refrigerator size={18} color={C.apricot} style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#9A4A1E" }}>냉장 보관 이유식 소진 임박</div>
              <div style={{ fontSize: 12, color: "#A85B30", marginTop: 2 }}>
                {rAlertsAll.map((a) => a.name).join(" · ")} — 오늘~내일 사용 권장
              </div>
            </div>
            <button onClick={() => dispatch({ type: "UI_SET", patch: { fridgeBannerHiddenDate: t } })}
              style={{ background: "none", border: "none", padding: 2, cursor: "pointer", flexShrink: 0 }}>
              <X size={15} color="#A85B30" />
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {meals.length > 0 && (
          <div className="flex items-center justify-end">
            <button onClick={() => setDetail((v) => !v)} style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep, background: C.sageLight, border: "none", borderRadius: 999, padding: "5px 10px", cursor: "pointer" }}>
              {detail ? "디테일뷰" : "심플뷰"}
            </button>
          </div>
        )}
        {meals.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted }}>
            오늘 계획된 끼니가 없습니다.<br />식단표 탭에서 추가해 보세요.
          </div>
        )}
        {meals.map((m) => {
          const total = totalG(state, m.items);
          const intake = m.log ? m.log.intakeG : null;
          const provided = m.log ? logProvideG(m.log) : total;
          // 기록 완료된 끼니는 계획이 아니라 "실제로 급여한 재료"를 보여줌
          // (기록 화면에서 재료를 추가/삭제했으면 계획과 달라질 수 있음)
          const shownItems = m.log ? m.log.items : m.items;
          return (
            <div key={m.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{m.label}</span>
                  {/* 완료된 끼니는 계획 시간이 아니라 실제 급여 시간을 표시 */}
                  <span style={{ fontSize: 12, color: C.muted }}>{fmtTime(m.log ? m.log.time : m.time, timeFmt)}</span>
                </div>
                <StatusBadge status={m.status} />
              </div>
              {detail ? <div style={{ marginBottom: 9 }}><IngredientTable items={shownItems} /></div> : <div style={{ marginBottom: 9 }}><MealItemList items={shownItems} fontSize={12} wrap /></div>}
              <CategoryBar items={shownItems} />
              <div className="flex items-center justify-between" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.border}` }}>
                {m.status === "완료" ? (
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sageDeep }}>
                    {provided}g 중 {intake}g ({provided ? Math.round((intake / provided) * 100) : 0}%)
                  </span>
                ) : (
                  <span style={{ fontSize: 12.5, color: C.muted }}>총 제공 예정 {total}g</span>
                )}
                <button onClick={() => go("feed", { date: t, planMeal: m, existingLog: m.log })}
                  style={{ fontSize: 12, fontWeight: 700, color: m.status === "완료" ? C.muted : C.sageDeep, background: m.status === "완료" ? "transparent" : C.sageLight, border: "none", borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}>
                  {m.status === "완료" ? "수정" : "기록하기"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {fAlerts.length > 0 && (
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
            <div className="flex items-center" style={{ gap: 7, marginBottom: 10 }}>
              <Snowflake size={15} color={C.sageDeep} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>곧 떨어지는 재료</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {fAlerts.map((r) => (
                <div key={r.name} className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: C.inkSoft, width: 52 }}>{r.name}</span>
                    <CubeGrid filled={r.cubes} total={10} />
                  </div>
                  <span style={{ fontSize: 11.5, color: C.apricot, fontWeight: 600 }}>~{r.daysLeft}일</span>
                </div>
              ))}
            </div>
            <button onClick={() => go("shopping")} className="flex items-center justify-center" style={{ width: "100%", marginTop: 12, gap: 6, fontSize: 12.5, fontWeight: 700, color: C.sageDeep, background: C.sageLight, border: "none", borderRadius: 10, padding: "9px 0", cursor: "pointer" }}>
              <ShoppingCart size={13} /> 장보기·제조 목록 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   식단표 탭
   ===================================================================== */
const WD = ["일", "월", "화", "수", "목", "금", "토"];

// 해당 주간의 끼니 열 순서: 설정된 끼니 종류(mealSlots)를 시간순으로 기본 배치하고,
// 그 외 라벨(직접 입력 등)은 첫 등장 시간순으로 뒤에 추가
function weekMealLabels(state, days) {
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
function weekLogLabels(state, days) {
  const planLabels = weekMealLabels(state, days);
  const extra = new Map();
  days.forEach((iso) => (state.logs[iso] || []).forEach((l) => {
    if (planLabels.includes(l.label) || extra.has(l.label)) return;
    extra.set(l.label, l.time || "99:99");
  }));
  const extraLabels = Array.from(extra.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([l]) => l);
  return [...planLabels, ...extraLabels];
}

function WeekTable({ startISO, onPickDay }) {
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
          const find = (lab) => (meals.find((m) => m.label === lab) || {}).items;
          return (
            <button key={iso} onClick={() => onPickDay(iso)} style={{ display: "grid", gridTemplateColumns: cols, padding: "13px 6px", width: "100%", textAlign: "left",
              borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: isToday ? C.sageLight : C.surface, border: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}><div style={{ fontSize: 13, fontWeight: 800, color: isToday ? C.sageDeep : C.ink }}>{WD[dow]}</div><div style={{ fontSize: 10.5, color: C.muted }}>{iso.slice(5)}</div></div>
              {labels.map((lab) => {
                const its = find(lab);
                return (
                  <div key={lab} style={{ padding: "0 4px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 3 }}>
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

function MonthView({ monthDate, selected, setSelected }) {
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
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>{m.label}</span>
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

function MealPlanTab() {
  const { state, dispatch, notify } = useStore();
  const timeFmt = state.settings.timeFmt;
  const [range, setRange] = useState("day");
  const [detail, setDetail] = useState(true);
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
              {detail ? "디테일뷰" : "심플뷰"}
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

/* =====================================================================
   제조 기록 모달 (재고 입고)
   ===================================================================== */
function BatchModal({ presetName, onClose }) {
  const { state, dispatch } = useStore();
  const t = todayISO();
  const [name, setName] = useState(presetName || "");
  const [picker, setPicker] = useState(!presetName);
  const [cat, setCat] = useState("채소");
  const [date, setDate] = useState(t);
  const [unitG, setUnitG] = useState(name ? unitGOf(state, name) : 15);
  const [frozen, setFrozen] = useState(10);
  const [fridgeG, setFridgeG] = useState(0);
  const keep = state.settings.fridgeKeepDays;

  const save = () => {
    if (!name) return;
    dispatch({ type: "STOCK_ADD_BATCH", name, cat,
      // frozenOriginal/fridgeOriginal: 제조 당시 생산량 기록(이후 소비돼도 변하지 않음) — 제조 이력 화면에서 사용
      batch: { date, unitG: Number(unitG), frozen: Number(frozen), fridgeG: Number(fridgeG),
        frozenOriginal: Number(frozen), fridgeOriginal: Number(fridgeG),
        frozenExp: addDaysISO(date, 14), fridgeExp: Number(fridgeG) > 0 ? addDaysISO(date, keep) : null } });
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", borderRadius: "20px 20px 0 0", padding: "16px 18px 26px", position: "relative" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>제조 기록 추가</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <button onClick={() => setPicker(true)} className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", cursor: "pointer" }}>
            <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>재료</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: name ? C.ink : C.muted }}>{name || "선택"}</span>
          </button>
          {name && !state.ingredients[name] && (
            <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
              <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>카테고리</span>
              <select value={cat} onChange={(e) => setCat(e.target.value)} style={selectStyle}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
          )}
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>제조일</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ border: "none", background: "transparent", fontSize: 12.5, color: C.ink, fontWeight: 700, outline: "none" }} />
          </div>
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>1큐브 기준</span>
            <NumInput value={Number(unitG) || 0} onChange={setUnitG} width={46} suffix="g" />
          </div>
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <span className="flex items-center" style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, gap: 5 }}><Snowflake size={13} color={C.sageDeep} /> 냉동 큐브</span>
            <NumInput value={Number(frozen) || 0} onChange={setFrozen} width={46} suffix="큐브" />
          </div>
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <span className="flex items-center" style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, gap: 5 }}><Refrigerator size={13} color={C.apricot} /> 냉장 보관</span>
            <NumInput value={Number(fridgeG) || 0} onChange={setFridgeG} width={46} suffix="g" />
          </div>
          <div style={{ fontSize: 10.5, color: C.muted, padding: "0 2px" }}>
            냉동 만료 ~{addDaysISO(date, 14).slice(5)} · {Number(fridgeG) > 0 ? `냉장 만료 ~${addDaysISO(date, keep).slice(5)}` : "냉장 없음"}
          </div>
          <button onClick={save} style={primaryBtn}>저장</button>
        </div>
        {picker && <IngredientPicker onPick={(n, c) => { setName(n); setUnitG(unitGOf(state, n)); if (c) setCat(c); setPicker(false); }} onClose={() => setPicker(false)} />}
      </div>
    </div>
  );
}

/* =====================================================================
   재고 탭
   ===================================================================== */
// 재고 탭 필터 칩: 전체 / 소진임박(urgentStockNames) / 냉동(냉동 수량 있음) / 냉장(냉장 수량 있음) / 카테고리별
const STOCK_FILTERS = ["전체", "소진임박", "냉동", "냉장", ...CATEGORIES];
// 재고 탭 정렬 옵션: 기본은 카테고리순(카테고리 → 가나다순), 그 외 이름순/재고량순 선택 가능
const STOCK_SORT_OPTIONS = [
  { key: "cat", label: "카테고리순" },
  { key: "name", label: "이름순" },
  { key: "stockDesc", label: "재고 많은순" },
  { key: "stockAsc", label: "재고 적은순" },
];
// 재고 탭 표시 방식: 한줄 리스트 / 2열 그리드 / 3열 그리드
const STOCK_LAYOUTS = [
  { key: "row", label: "한줄" },
  { key: "grid2", label: "2열" },
  { key: "grid3", label: "3열" },
];

// 소진임박 재료의 데드라인 텍스트 - 냉장 보관중이면 냉장 만료 기준, 아니면 냉동 만료 기준
function urgentDeadlineText(u) {
  if (u.fg > 0) {
    if (u.fridgeDaysLeft == null) return "냉장 보관중";
    if (u.fridgeDaysLeft < 0) return "냉장 기한 지남";
    return u.fridgeDaysLeft === 0 ? "냉장 오늘까지" : `냉장 ~${u.fridgeDaysLeft}일`;
  }
  if (u.frozenDaysLeft == null) return null;
  if (u.frozenDaysLeft < 0) return "기한 지남";
  return u.frozenDaysLeft === 0 ? "오늘까지" : `~${u.frozenDaysLeft}일`;
}

// 재료 목록 항목 - layout("row"|"grid2"|"grid3")에 따라 한 줄 행 또는 카드형 그리드로 표시.
// 소진임박 재료도 별도 섹션/디자인 없이 이 컴포넌트를 그대로 쓰고, urgent=true면 테두리 강조 + 데드라인 텍스트만 붙임
function StockItem({ name, onClick, urgent, deadlineText, layout }) {
  const { state } = useStore();
  const cubes = stockTotalCubes(state, name), fg = stockFridgeG(state, name);
  const border = `1px solid ${urgent ? C.apricot : C.border}`;
  const badge = urgent && deadlineText ? (
    <span style={{ fontSize: 9.5, fontWeight: 700, color: C.apricot, background: C.apricotLight, borderRadius: 999, padding: "1px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>{deadlineText}</span>
  ) : null;

  if (layout === "row") {
    return (
      <button onClick={onClick} className="flex items-center justify-between" style={{ width: "100%", textAlign: "left", background: C.surface, border, borderRadius: 12, padding: "10px 12px", cursor: "pointer" }}>
        <div className="flex items-center" style={{ gap: 8, minWidth: 0, flex: 1 }}>
          <CatDot name={name} size={7} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
          {badge}
        </div>
        <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
          {cubes > 0 && <CubeGrid filled={Math.min(cubes, 10)} total={10} size={6} gap={2} />}
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
            {cubes > 0 ? `${cubes}큐브` : ""}{cubes > 0 && fg > 0 ? " · " : ""}{fg > 0 ? `${fg}g` : ""}
          </span>
          <ChevronRight size={13} color={C.muted} />
        </div>
      </button>
    );
  }

  // grid2 / grid3: 세로 배치 카드형
  return (
    <button onClick={onClick} style={{ textAlign: "left", background: C.surface, border, borderRadius: 12, padding: layout === "grid3" ? "9px 8px" : "10px 10px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <div className="flex items-center" style={{ gap: 5, minWidth: 0 }}>
        <CatDot name={name} size={6} />
        <span style={{ fontSize: layout === "grid3" ? 11.5 : 12.5, fontWeight: 700, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{name}</span>
      </div>
      {cubes > 0 && <CubeGrid filled={Math.min(cubes, 10)} total={10} size={5} gap={1.5} />}
      <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>
        {cubes > 0 ? `${cubes}큐브` : ""}{cubes > 0 && fg > 0 ? " · " : ""}{fg > 0 ? `${fg}g` : ""}
      </span>
      {badge && <span style={{ alignSelf: "flex-start" }}>{badge}</span>}
    </button>
  );
}

// 재고 탭 정렬·표시 설정을 기기에 저장 (탭 이동·앱 재시작 후에도 유지)
function readStockPref(key, fallback, validKeys) {
  try {
    const v = localStorage.getItem(key);
    return v && validKeys.includes(v) ? v : fallback;
  } catch { return fallback; }
}
function writeStockPref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 저장 불가 환경이면 무시 */ }
}

function StockTab({ go }) {
  const { state } = useStore();
  const [batchModal, setBatchModal] = useState(false);
  const [filter, setFilter] = useState("전체");
  // 서브탭: 재고 / 재료 정보(위키). 하위 화면에 다녀와도 보던 서브탭으로 복귀
  const [subTab, setSubTabRaw] = useState(UI_STATE.stockSubTab);
  const setSubTab = (v) => { UI_STATE.stockSubTab = v; setSubTabRaw(v); };
  const [sortMode, setSortModeRaw] = useState(() => readStockPref("bc_stock_sort", "cat", STOCK_SORT_OPTIONS.map((o) => o.key)));
  const [layout, setLayoutRaw] = useState(() => readStockPref("bc_stock_layout", "row", STOCK_LAYOUTS.map((l) => l.key)));
  const setSortMode = (v) => { setSortModeRaw(v); writeStockPref("bc_stock_sort", v); };
  const setLayout = (v) => { setLayoutRaw(v); writeStockPref("bc_stock_layout", v); };

  const allNames = Object.keys(state.stock).filter((n) => stockTotalCubes(state, n) > 0 || stockFridgeG(state, n) > 0);
  const urgent = urgentStockNames(state); // 이미 긴급도순으로 정렬돼 있음(냉장 보관중 > 냉동 보관기한 임박순)
  const urgentMap = new Map(urgent.map((u) => [u.name, u]));

  const matchesFilter = (n) => {
    if (filter === "전체") return true;
    if (filter === "소진임박") return urgentMap.has(n);
    if (filter === "냉동") return stockTotalCubes(state, n) > 0;
    if (filter === "냉장") return stockFridgeG(state, n) > 0;
    return catOf(state, n) === filter; // 카테고리 필터
  };
  const stockAmt = (n) => stockTotalFrozenG(state, n) + stockFridgeG(state, n);
  const sortNames = (list) => {
    if (sortMode === "cat") return sortByCategory(state, list, (n) => n);
    if (sortMode === "name") return [...list].sort((a, b) => a.localeCompare(b, "ko"));
    return [...list].sort((a, b) => sortMode === "stockAsc" ? stockAmt(a) - stockAmt(b) : stockAmt(b) - stockAmt(a));
  };

  // 필터를 통과한 재료를 정렬해서 하나의 리스트로 표시. 소진임박 재료도 별도 섹션으로 분리하지 않고
  // 같은 리스트 안에서 테두리 강조 + 데드라인 텍스트로만 구분 (필터를 냉동/냉장/카테고리로 바꿔도 계속 보임)
  const names = sortNames(allNames.filter(matchesFilter));
  const isEmpty = names.length === 0;
  const gridStyle = layout === "row"
    ? { display: "flex", flexDirection: "column", gap: 8 }
    : { display: "grid", gridTemplateColumns: layout === "grid2" ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8 };

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <ScreenHeader title="재고" right={<button onClick={() => go("shopping")} style={{ background: "none", border: "none", cursor: "pointer" }}><ShoppingCart size={18} color={C.inkSoft} /></button>} />
      <div style={{ padding: "0 18px 12px" }}>
        <Segmented value={subTab} onChange={setSubTab} options={[{ value: "stock", label: "재고" }, { value: "wiki", label: "재료 정보" }]} />
      </div>
      {subTab === "wiki" && <IngredientWikiPanel go={go} />}
      {subTab === "stock" && (
        <>
          <div style={{ position: "sticky", top: 0, zIndex: 15, background: C.bg, padding: "0 18px 10px" }}>
            <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
              {STOCK_FILTERS.map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                  border: "none", background: filter === f ? C.sage : C.sageLight, color: filter === f ? "#fff" : C.sageDeep }}>{f}</button>
              ))}
            </div>
            <button onClick={() => setBatchModal(true)} className="flex items-center justify-center" style={{ gap: 7, background: C.sage, border: "none", borderRadius: 14, padding: "11px 0", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", width: "100%" }}>
              <Plus size={15} /> 제조 기록 추가
            </button>
          </div>
          <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 6 }}>
              <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginRight: 1 }}>정렬</span>
                {STOCK_SORT_OPTIONS.map((o) => (
                  <button key={o.key} onClick={() => setSortMode(o.key)} style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${sortMode === o.key ? C.sage : C.border}`, background: sortMode === o.key ? C.sageLight : "transparent", color: sortMode === o.key ? C.sageDeep : C.muted }}>{o.label}</button>
                ))}
              </div>
              <div className="flex items-center" style={{ gap: 4 }}>
                {STOCK_LAYOUTS.map((l) => (
                  <button key={l.key} onClick={() => setLayout(l.key)} style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${layout === l.key ? C.sage : C.border}`, background: layout === l.key ? C.sageLight : "transparent", color: layout === l.key ? C.sageDeep : C.muted }}>{l.label}</button>
                ))}
              </div>
            </div>
            {!isEmpty && (
              <div style={gridStyle}>
                {names.map((name) => {
                  const u = urgentMap.get(name);
                  return (
                    <StockItem
                      key={name}
                      name={name}
                      layout={layout}
                      urgent={!!u}
                      deadlineText={u ? urgentDeadlineText(u) : null}
                      onClick={() => go("stockDetail", { name })}
                    />
                  );
                })}
              </div>
            )}
            {isEmpty && <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted }}>{filter === "전체" ? "재고가 없습니다. 제조 기록을 추가해 보세요." : "해당하는 재료가 없습니다."}</div>}
          </div>
        </>
      )}
      {batchModal && <BatchModal onClose={() => setBatchModal(false)} />}
    </div>
  );
}

/* =====================================================================
   재고 상세 (카드 탭 → 배치별 바로 수정/삭제)
   ===================================================================== */
function StockDetailScreen({ name, onBack }) {
  const { state, dispatch, notify } = useStore();
  const [addOpen, setAddOpen] = useState(false);
  const [delTarget, setDelTarget] = useState(null); // 삭제 확인 대상 batchId
  const batches = stockBatches(state, name).slice().sort((a, b) => a.date.localeCompare(b.date));
  const cubes = stockTotalCubes(state, name), fg = stockFridgeG(state, name);

  const patch = (batchId, p) => dispatch({ type: "STOCK_UPDATE_BATCH", name, batchId, patch: p });
  const confirmDel = () => {
    const batch = stockBatches(state, name).find((b) => b.id === delTarget);
    dispatch({ type: "STOCK_DELETE_BATCH", name, batchId: delTarget });
    setDelTarget(null);
    if (batch) notify("배치를 삭제했습니다", () => dispatch({ type: "RESTORE_BATCH", name, batch }));
  };

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title={`${name} 재고`} onBack={onBack} />
      <div style={{ padding: "6px 18px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="flex items-center justify-between" style={{ background: C.sageLight, borderRadius: 14, padding: "12px 14px" }}>
          <div className="flex items-center" style={{ gap: 8 }}><CatDot name={name} size={9} /><span style={{ fontSize: 14, fontWeight: 800, color: C.sageDeep }}>{name}</span></div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep }}>냉동 {cubes}큐브{fg > 0 ? ` · 냉장 ${fg}g` : ""}</span>
        </div>

        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, padding: "0 2px" }}>제조 배치 ({batches.length})</div>
        {batches.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12.5, color: C.muted }}>제조 배치가 없습니다.</div>}
        {batches.map((b) => (
          <div key={b.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 13, display: "flex", flexDirection: "column", gap: 9 }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{b.date} 제조</span>
              <button onClick={() => setDelTarget(b.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Trash2 size={14} color={C.apricot} /></button>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11.5, color: C.inkSoft }}>1큐브 기준</span>
              <NumInput value={b.unitG} onChange={(v) => patch(b.id, { unitG: v })} width={44} suffix="g" />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center" style={{ fontSize: 11.5, color: C.inkSoft, gap: 5 }}><Snowflake size={12} color={C.sageDeep} /> 냉동 큐브</span>
              <NumInput value={b.frozen} onChange={(v) => patch(b.id, { frozen: v })} width={44} suffix="큐브" />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center" style={{ fontSize: 11.5, color: C.inkSoft, gap: 5 }}><Refrigerator size={12} color={C.apricot} /> 냉장 보관</span>
              <NumInput value={b.fridgeG || 0} onChange={(v) => patch(b.id, { fridgeG: v, fridgeExp: v > 0 ? (b.fridgeExp || addDaysISO(b.date, state.settings.fridgeKeepDays)) : b.fridgeExp })} width={44} suffix="g" />
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>
              냉동 만료 ~{b.frozenExp ? b.frozenExp.slice(5) : "-"} · {(b.fridgeG || 0) > 0 ? `냉장 만료 ~${b.fridgeExp ? b.fridgeExp.slice(5) : "-"}` : "냉장 없음"}
            </div>
          </div>
        ))}

        <button onClick={() => setAddOpen(true)} className="flex items-center justify-center" style={{ gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 14, padding: "11px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
          <Plus size={14} /> 제조 배치 추가
        </button>
      </div>
      {addOpen && <BatchModal presetName={name} onClose={() => setAddOpen(false)} />}
      {delTarget && (
        <ConfirmModal
          title="이 배치를 삭제할까요?"
          message="되돌릴 수 없습니다."
          onConfirm={confirmDel}
          onCancel={() => setDelTarget(null)}
        />
      )}
    </div>
  );
}

/* =====================================================================
   제조 이력 화면 — 모든 재료의 제조 배치를 날짜순으로 모아 보여줌
   (배치는 소진돼도 삭제되지 않고 수량만 0으로 남으므로, 이미 있는 데이터를 그대로 활용)
   ===================================================================== */
function ManufactureHistoryScreen({ onBack }) {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const all = [];
  Object.keys(state.stock).forEach((name) => {
    (state.stock[name].batches || []).forEach((b) => all.push({ name, ...b }));
  });
  const filtered = all
    .filter((b) => !q || b.name.includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));

  return (
    <div style={{ paddingBottom: 90 }}>
      <SubHeader title="제조 이력" onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="flex items-center" style={{ gap: 7, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px" }}>
          <Search size={15} color={C.muted} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="재료명으로 검색"
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.ink, width: "100%" }} />
        </div>
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted }}>제조 이력이 없습니다</div>}
        {filtered.map((b) => {
          const tracked = b.frozenOriginal != null; // 제조량 기록 이후 만든 배치인지 (이전 배치는 원본 수량을 모름)
          const usedUp = (b.frozen || 0) <= 0 && (b.fridgeG || 0) <= 0;
          return (
            <div key={b.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 13, opacity: usedUp ? 0.55 : 1 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <div className="flex items-center"><CatDot name={b.name} size={8} /><span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{b.name}</span></div>
                <span style={{ fontSize: 11, color: C.muted }}>{b.date} 제조</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.inkSoft, lineHeight: 1.5 }}>
                {tracked
                  ? <>냉동 {b.frozenOriginal}큐브 제조 → 현재 {b.frozen}큐브{b.fridgeOriginal ? <><br />냉장 {b.fridgeOriginal}g 제조 → 현재 {b.fridgeG || 0}g</> : ""}</>
                  : <>현재 냉동 {b.frozen}큐브{b.fridgeG ? ` · 냉장 ${b.fridgeG}g` : ""} <span style={{ color: C.muted }}>(제조 당시 수량 기록 이전 배치)</span></>}
              </div>
              {usedUp && <div style={{ fontSize: 10, color: C.muted, marginTop: 5, fontWeight: 700 }}>소진됨</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =====================================================================
   장보기 / 제조 목록 화면
   ===================================================================== */
function ShoppingScreen({ onBack }) {
  const { state, dispatch } = useStore();
  const [batchFor, setBatchFor] = useState(null);
  const [adding, setAdding] = useState(false);
  // 재고 임박 항목도 합류
  const lowStock = frozenAlerts(state).filter((a) => a.daysLeft <= 3).map((a) => ({ id: "low-" + a.name, name: a.name, reason: `재고 임박 (~${a.daysLeft}일)`, done: false, low: true }));
  const list = [...state.shopping, ...lowStock.filter((l) => !state.shopping.some((s) => s.name === l.name && !s.done))];

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title="장보기 · 제조 목록" onBack={onBack} right={
        <button onClick={() => dispatch({ type: "SHOP_CLEAR_DONE" })} style={{ fontSize: 11, fontWeight: 700, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>완료 정리</button>
      } />
      <div style={{ padding: "8px 18px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {list.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted }}>목록이 비어 있습니다</div>}
        {list.map((s) => (
          <div key={s.id} className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 13px" }}>
            <button onClick={() => !s.low && dispatch({ type: "SHOP_TOGGLE", id: s.id })} className="flex items-center" style={{ gap: 10, background: "none", border: "none", cursor: s.low ? "default" : "pointer", flex: 1, textAlign: "left" }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${s.done ? C.sage : C.border}`, background: s.done ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {s.done && <Check size={13} color="#fff" />}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: s.done ? C.muted : C.ink, textDecoration: s.done ? "line-through" : "none" }}>{s.name}</div>
                <div style={{ fontSize: 10.5, color: C.muted }}>{s.reason}</div>
              </div>
            </button>
            <button onClick={() => setBatchFor(s.name)} style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, background: C.sageLight, border: "none", borderRadius: 999, padding: "5px 10px", cursor: "pointer" }}>제조 기록</button>
          </div>
        ))}
        <button onClick={() => setAdding(true)} className="flex items-center justify-center" style={{ gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
          <Plus size={14} /> 항목 직접 추가
        </button>
      </div>
      {batchFor && <BatchModal presetName={batchFor} onClose={() => setBatchFor(null)} />}
      {adding && <IngredientPicker onPick={(n) => { dispatch({ type: "SHOP_ADD", name: n }); setAdding(false); }} onClose={() => setAdding(false)} />}
    </div>
  );
}

/* =====================================================================
   기록 탭
   ===================================================================== */
function Chip({ children, cat, tone = "default", onClick, onDelete }) {
  const tones = { default: { bg: C.sageLight, fg: C.sageDeep }, warn: { bg: C.apricotLight, fg: C.apricot } };
  const tn = (cat && CATEGORY[cat]) ? { bg: CATEGORY[cat].light, fg: CATEGORY[cat].color } : tones[tone];
  return (
    <span className="flex items-center" style={{ background: tn.bg, borderRadius: 999, overflow: "hidden" }}>
      <button onClick={onClick} disabled={!onClick} style={{ background: "none", border: "none", padding: onDelete ? "5px 4px 5px 10px" : "5px 10px",
        fontSize: 11.5, fontWeight: 600, color: tn.fg, cursor: onClick ? "pointer" : "default" }}>
        {children}
      </button>
      {onDelete && (
        <button onClick={onDelete} style={{ background: "rgba(0,0,0,0.08)", border: "none", width: 16, height: 16, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, marginRight: 5, flexShrink: 0 }}>
          <X size={9} color={tn.fg} />
        </button>
      )}
    </span>
  );
}

function weeklyRates(state) {
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

/* 월간 리포트: 급여 횟수 · 평균 섭취율 · 카테고리별/재료별 추정 섭취 비율(제공량 × 전체 섭취율) */
function monthStats(state, year, month) {
  const catTotals = { 탄수화물: 0, 단백질: 0, 채소: 0, 과일: 0 };
  const ingredientTotals = {}; // 재료명 -> 추정 섭취 g
  let totalProv = 0, totalIntake = 0, count = 0;
  Object.keys(state.logs).forEach((d) => {
    const dt = new Date(d + "T00:00:00");
    if (dt.getFullYear() !== year || dt.getMonth() !== month) return;
    (state.logs[d] || []).forEach((log) => {
      const prov = logProvideG(log);
      const rate = prov ? log.intakeG / prov : 0;
      totalProv += prov;
      totalIntake += log.intakeG;
      count += 1;
      log.items.forEach((it) => {
        const g = it.source === "fridge" ? it.qty : it.qty * it.unitG;
        const cat = catOf(state, it.name);
        catTotals[cat] = (catTotals[cat] || 0) + g * rate;
        ingredientTotals[it.name] = (ingredientTotals[it.name] || 0) + g * rate;
      });
    });
  });
  const avgRate = totalProv ? Math.round((totalIntake / totalProv) * 100) : null;
  const topIngredients = Object.entries(ingredientTotals)
    .map(([name, g]) => ({ name, g: Math.round(g) }))
    .filter((x) => x.g > 0)
    .sort((a, b) => b.g - a.g)
    .slice(0, 5);
  return { count, totalProv: Math.round(totalProv), totalIntake: Math.round(totalIntake), avgRate, catTotals, topIngredients };
}
/* 해당 월에 제조된 총량(g) — 재료별 배치의 제조 당시 기록(frozenOriginal/fridgeOriginal) 기준. 이 필드가 없는 옛 배치는 집계에서 제외됨 */
function monthProducedG(state, year, month) {
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

/* =====================================================================
   급여표 - 식단표의 주별 그리드(WeekTable)를 참고해 실제 급여기록(state.logs) 기준으로
   같은 구조로 그려주는 컴포넌트. 기록이 없는 칸은 계획 유무/미래 날짜 구분 없이 항상 빈 칸.
   ===================================================================== */
function FeedingWeekPanel({ go }) {
  const { state } = useStore();
  const [cursor, setCursor] = useState(todayISO());
  const weekStart = addDaysISO(cursor, -new Date(cursor + "T00:00:00").getDay());
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  const labels = weekLogLabels(state, days);
  const wide = labels.length > 3;
  // 마지막 열: 해당 일자 총 섭취량(합계)
  const cols = `34px repeat(${labels.length}, minmax(58px, 1fr)) 48px`;
  const t = todayISO();
  const headLabel = `${weekStart.slice(5)} ~ ${addDaysISO(weekStart, 6).slice(5)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <button onClick={() => setCursor(addDaysISO(cursor, -7))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronLeft size={17} color={C.muted} /></button>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{headLabel}</span>
        <button onClick={() => setCursor(addDaysISO(cursor, 7))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronRight size={17} color={C.muted} /></button>
      </div>
      <div style={{ overflowX: wide ? "auto" : "visible" }}>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", minWidth: wide ? 34 + labels.length * 68 + 52 : "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, background: C.sageLight, padding: "9px 6px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep }}>요일</span>
            {labels.map((h) => <span key={h} style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, textAlign: "center" }}>{h}</span>)}
            <span style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, textAlign: "center" }}>합계</span>
          </div>
          {days.map((iso, i) => {
            const dow = new Date(iso + "T00:00:00").getDay();
            const isToday = iso === t;
            const dayLogs = state.logs[iso] || [];
            const findLog = (lab) => dayLogs.find((l) => l.label === lab);
            const dayIntakeG = dayLogs.reduce((s, l) => s + (l.intakeG || 0), 0);
            return (
              <div key={iso} style={{ display: "grid", gridTemplateColumns: cols, padding: "13px 6px",
                borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: isToday ? C.sageLight : C.surface }}>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: isToday ? C.sageDeep : C.ink }}>{WD[dow]}</div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>{iso.slice(5)}</div>
                </div>
                {labels.map((lab) => {
                  const log = findLog(lab);
                  // 기록이 없는 칸: 계획만 있음/계획도 없음/미래 날짜 모두 구분 없이 빈 칸으로 표시
                  if (!log) return <div key={lab} />;
                  const prov = logProvideG(log);
                  const pct = prov ? Math.round((log.intakeG / prov) * 100) : 0;
                  // 중량(섭취 g)을 크게 강조, 섭취율은 보조 표기
                  return (
                    <button key={lab} onClick={() => go("feedCompare", { date: iso, label: lab })}
                      style={{ padding: "0 4px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 2,
                        background: "none", border: "none", cursor: "pointer" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{log.intakeG}g</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: pct >= 85 ? C.sageDeep : C.apricot }}>{pct}%</span>
                    </button>
                  );
                })}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                  {dayLogs.length > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: C.sageDeep }}>{dayIntakeG}g</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {wide && <div style={{ fontSize: 9.5, color: C.muted, textAlign: "center" }}>← 옆으로 밀어서 더 보기 →</div>}
    </div>
  );
}

/* =====================================================================
   급여표 - 월별 뷰: 달력에서 일자별 총 섭취량을 보고, 날짜를 선택하면 끼니별 상세 확인
   ===================================================================== */
function FeedingMonthPanel({ go }) {
  const { state } = useStore();
  const t = todayISO();
  const [ym, setYm] = useState(() => ({ y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(t);
  const shiftMonth = (n) => setYm((p) => { const d = new Date(p.y, p.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const first = new Date(ym.y, ym.m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const isoOf = (d) => `${ym.y}-${pad2(ym.m + 1)}-${pad2(d)}`;
  const dayIntakeG = (iso) => (state.logs[iso] || []).reduce((s, l) => s + (l.intakeG || 0), 0);
  const monthTotal = cells.reduce((s, d) => d ? s + dayIntakeG(isoOf(d)) : s, 0);
  const selLogs = state.logs[selected] || [];
  const selTotal = selLogs.reduce((s, l) => s + (l.intakeG || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: 10 }}>
          <button onClick={() => shiftMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronLeft size={17} color={C.muted} /></button>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{ym.y}년 {ym.m + 1}월</span>
          <button onClick={() => shiftMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronRight size={17} color={C.muted} /></button>
        </div>
        {monthTotal > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep }}>이 달 총 {monthTotal}g</span>}
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {WD.map((d) => <span key={d} style={{ fontSize: 10, color: C.muted, fontWeight: 700, textAlign: "center" }}>{d}</span>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const iso = isoOf(d);
            const g = dayIntakeG(iso);
            const isToday = iso === t, isSel = iso === selected;
            return (
              <button key={i} onClick={() => setSelected(iso)} className="flex flex-col items-center justify-center"
                style={{ height: 46, borderRadius: 10, background: isSel ? C.sageLight : "transparent", cursor: "pointer",
                  border: isToday ? `1.5px solid ${C.sage}` : isSel ? `1px solid ${C.sage}` : "1px solid transparent", padding: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: isToday ? 800 : 500, color: isToday ? C.sageDeep : C.inkSoft }}>{d}</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: g > 0 ? C.sageDeep : "transparent", marginTop: 2 }}>{g > 0 ? `${g}g` : "-"}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 8, padding: "0 4px" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{selected.slice(5)} ({WD[new Date(selected + "T00:00:00").getDay()]})</span>
          {selLogs.length > 0 && <span style={{ fontSize: 12.5, fontWeight: 800, color: C.sageDeep }}>총 {selTotal}g</span>}
        </div>
        {selLogs.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selLogs.map((log) => {
              const prov = logProvideG(log);
              const pct = prov ? Math.round((log.intakeG / prov) * 100) : 0;
              return (
                <button key={log.id} onClick={() => go("feedCompare", { date: selected, label: log.label })}
                  className="flex items-center justify-between" style={{ width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 13px", cursor: "pointer" }}>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{log.label}</span>
                    <span style={{ fontSize: 10.5, color: C.muted }}>{fmtTime(log.time, state.settings.timeFmt)}</span>
                  </div>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{log.intakeG}g</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: pct >= 85 ? C.sageDeep : C.apricot }}>{pct}%</span>
                    <ChevronRight size={13} color={C.muted} />
                  </div>
                </button>
              );
            })}
          </div>
        ) : <div style={{ textAlign: "center", padding: "18px 0", fontSize: 12, color: C.muted }}>이 날짜엔 급여 기록이 없습니다</div>}
      </div>
    </div>
  );
}

function RecordTab({ go }) {
  const { state, dispatch, notify } = useStore();
  const trend = weeklyRates(state).filter((x) => x.rate != null);
  const thisWeek = trend.length ? trend[trend.length - 1].rate : null;
  const lastWeek = trend.length > 1 ? trend[trend.length - 2].rate : null;
  const diff = thisWeek != null && lastWeek != null ? thisWeek - lastWeek : null;
  const [editIntro, setEditIntro] = useState(null); // null | 'new' | introObj
  const [delIntro, setDelIntro] = useState(null); // 삭제 확인 대상 introObj
  // 하위 화면에 다녀와도 보던 뷰로 복귀하도록 UI_STATE에 마지막 선택을 기억
  const [view, setViewRaw] = useState(UI_STATE.recordView); // "table"(급여표, 기본) | "history"(기존 히스토리·통계)
  const setView = (v) => { UI_STATE.recordView = v; setViewRaw(v); };
  const [tableRange, setTableRangeRaw] = useState(UI_STATE.recordTableRange); // 급여표 주별/월별 뷰
  const setTableRange = (v) => { UI_STATE.recordTableRange = v; setTableRangeRaw(v); };
  const [reportYM, setReportYM] = useState(() => { const t = todayISO(); return { y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) - 1 }; });

  const shiftReportMonth = (n) => setReportYM((p) => { const d = new Date(p.y, p.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const report = monthStats(state, reportYM.y, reportYM.m);
  const prevMonthDate = new Date(reportYM.y, reportYM.m - 1, 1);
  const prevReport = monthStats(state, prevMonthDate.getFullYear(), prevMonthDate.getMonth());
  const reportDiff = report.avgRate != null && prevReport.avgRate != null ? report.avgRate - prevReport.avgRate : null;
  const producedG = monthProducedG(state, reportYM.y, reportYM.m);

  const yISO = addDaysISO(todayISO(), -1);
  const yLogs = state.logs[yISO] || [];

  const introsByCat = {};
  CATEGORIES.forEach((c) => { introsByCat[c] = []; });
  state.intros.forEach((it) => {
    if (it.status === "주의" || it.status === "중단") return;
    (introsByCat[it.cat] || (introsByCat[it.cat] = [])).push(it);
  });
  CATEGORIES.forEach((c) => { introsByCat[c].sort((a, b) => a.name.localeCompare(b.name, "ko")); });
  const warnIntros = state.intros.filter((it) => it.status === "주의" || it.status === "중단").sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <ScreenHeader title="기록" />
      <div style={{ padding: "0 18px 14px" }}>
        <Segmented value={view} onChange={setView} options={[{ value: "table", label: "급여표" }, { value: "history", label: "히스토리" }]} />
      </div>

      {view === "table" && (
        <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <Segmented value={tableRange} onChange={setTableRange} options={[{ value: "week", label: "주별" }, { value: "month", label: "월별" }]} />
          {tableRange === "week" ? <FeedingWeekPanel go={go} /> : <FeedingMonthPanel go={go} />}
        </div>
      )}

      {view === "history" && (
      <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: C.sageLight, borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: C.sageDeep, fontWeight: 600 }}>이번 주 평균 섭취율</div>
          <div className="flex items-end" style={{ gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: C.sageDeep, fontFamily: "'Gowun Dodum', sans-serif" }}>{thisWeek != null ? `${thisWeek}%` : "—"}</span>
            {diff != null && <span style={{ fontSize: 12, color: diff >= 0 ? C.sage : C.apricot, fontWeight: 700, marginBottom: 4 }}>{diff >= 0 ? "▲" : "▼"} 지난주 대비 {Math.abs(diff)}%p</span>}
          </div>
          {trend.length > 1 && (
            <div style={{ height: 90, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[40, 100]} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${C.border}` }} formatter={(v) => [`${v}%`, "섭취율"]} />
                  <Line type="monotone" dataKey="rate" stroke={C.sage} strokeWidth={2.5} dot={{ r: 3, fill: C.sage }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
            <button onClick={() => shiftReportMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronLeft size={15} color={C.muted} /></button>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{reportYM.y}년 {reportYM.m + 1}월 리포트</span>
            <button onClick={() => shiftReportMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronRight size={15} color={C.muted} /></button>
          </div>
          {report.count === 0 ? (
            <div style={{ textAlign: "center", padding: "10px 0", fontSize: 12, color: C.muted }}>이 달엔 급여 기록이 없습니다</div>
          ) : (
            <>
              <div className="flex items-center" style={{ gap: 18, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 600, marginBottom: 2 }}>급여 횟수</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: C.ink }}>{report.count}회</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 600, marginBottom: 2 }}>평균 섭취율</div>
                  <div className="flex items-end" style={{ gap: 6 }}>
                    <span style={{ fontSize: 17, fontWeight: 900, color: C.sageDeep }}>{report.avgRate != null ? `${report.avgRate}%` : "—"}</span>
                    {reportDiff != null && <span style={{ fontSize: 11, color: reportDiff >= 0 ? C.sage : C.apricot, fontWeight: 700 }}>{reportDiff >= 0 ? "▲" : "▼"} {Math.abs(reportDiff)}%p</span>}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, marginBottom: 6 }}>카테고리별 추정 섭취 비율</div>
              <CategoryTotalsBar totals={report.catTotals} height={8} />
              <div style={{ marginTop: 8 }}><CategoryLegend /></div>

              {report.topIngredients.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
                  <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, marginBottom: 8 }}>이 달 많이 먹은 재료 TOP {report.topIngredients.length}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {report.topIngredients.map((ing, i) => (
                      <div key={ing.name} className="flex items-center justify-between">
                        <div className="flex items-center" style={{ gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, width: 14 }}>{i + 1}</span>
                          <CatDot name={ing.name} size={7} /><span style={{ fontSize: 12, color: C.ink }}>{ing.name}</span>
                        </div>
                        <span style={{ fontSize: 11.5, color: C.sageDeep, fontWeight: 700 }}>약 {ing.g}g</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
                <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, marginBottom: 6 }}>제조량 대비 소비량</div>
                {producedG > 0 ? (
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: C.inkSoft }}>제조 {producedG}g · 재고 차감(제공) {report.totalProv}g</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: report.totalProv > producedG ? C.apricot : C.sageDeep }}>
                      {Math.round((report.totalProv / producedG) * 100)}%
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: C.muted }}>이 달에 제조 기록(제조 이력)이 없어 비교할 수 없어요</div>
                )}
              </div>
            </>
          )}
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 8 }}>히스토리</div>
          <button onClick={() => go("recordHistory")} className="flex flex-col" style={{ width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, cursor: "pointer" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>어제 · {yISO.slice(5)}</span>
              <div className="flex items-center" style={{ gap: 4 }}>
                <span style={{ fontSize: 10.5, color: C.muted }}>전체 히스토리</span>
                <ChevronRight size={14} color={C.muted} />
              </div>
            </div>
            {yLogs.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted }}>급여 기록이 없습니다</div>
            ) : yLogs.map((log) => {
              const prov = logProvideG(log);
              const pct = prov ? Math.round((log.intakeG / prov) * 100) : 0;
              return (
                <div key={log.id} className="flex items-center justify-between" style={{ marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, color: C.inkSoft }}>{log.label} · {prov}g 중 {log.intakeG}g</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: pct >= 85 ? C.sageDeep : C.apricot }}>{pct}%</span>
                </div>
              );
            })}
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>지금까지 먹어본 재료</span>
            <button onClick={() => setEditIntro("new")} className="flex items-center" style={{ gap: 3, background: "none", border: "none", cursor: "pointer" }}>
              <Plus size={13} color={C.sageDeep} /><span style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep }}>추가</span>
            </button>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {CATEGORIES.map((cat) => (introsByCat[cat] || []).length > 0 && (
              <div key={cat}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5 }}>{cat} ({introsByCat[cat].length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {introsByCat[cat].map((it) => (
                    <Chip key={it.id} cat={it.cat} onClick={() => go("ingredientInfo", { name: it.name })} onDelete={() => setDelIntro(it)}>{it.name}</Chip>
                  ))}
                </div>
              </div>
            ))}
            {warnIntros.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: C.apricot, fontWeight: 700, marginBottom: 5 }}>⚠ 주의/중단</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {warnIntros.map((it) => (
                    <Chip key={it.id} tone="warn" onClick={() => go("ingredientInfo", { name: it.name })} onDelete={() => setDelIntro(it)}>{it.name}{it.memo ? ` — ${it.memo}` : ""}</Chip>
                  ))}
                </div>
              </div>
            )}
            {state.intros.length === 0 && <div style={{ textAlign: "center", fontSize: 11.5, color: C.muted }}>아직 기록된 재료가 없습니다</div>}
          </div>
        </div>
      </div>
      )}
      {editIntro && <IntroEditModal intro={editIntro} onClose={() => setEditIntro(null)} />}
      {delIntro && (
        <ConfirmModal
          title={`'${delIntro.name}' 기록을 삭제할까요?`}
          onConfirm={() => {
            dispatch({ type: "INTRO_DELETE", id: delIntro.id });
            setDelIntro(null);
            notify(`'${delIntro.name}' 기록을 삭제했습니다`, () => dispatch({ type: "RESTORE_INTRO", intro: delIntro }));
          }}
          onCancel={() => setDelIntro(null)}
        />
      )}
    </div>
  );
}

/* =====================================================================
   재료 정보 추가·수정 모달 (기록 탭 "먹어본 재료" 겸 재료 도입 기록)
   ===================================================================== */
function IntroEditModal({ intro, onClose }) {
  const { state, dispatch, notify } = useStore();
  const isNew = intro === "new";
  const base = isNew ? {} : intro;
  const [picker, setPicker] = useState(false);
  const [confirmingDel, setConfirmingDel] = useState(false);
  const [name, setName] = useState(base.name || "");
  const [cat, setCat] = useState(base.cat || "채소");
  const [status, setStatus] = useState(base.status || "이상없음");
  const [memo, setMemo] = useState(base.memo || "");

  const save = () => {
    if (!name) return;
    dispatch({ type: "INTRO_UPSERT", intro: { id: isNew ? undefined : base.id, name, cat, status, memo, date: base.date || todayISO() } });
    onClose();
  };
  const del = () => {
    dispatch({ type: "INTRO_DELETE", id: base.id });
    notify(`'${base.name}' 기록을 삭제했습니다`, () => dispatch({ type: "RESTORE_INTRO", intro: base }));
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", borderRadius: "20px 20px 0 0", padding: "16px 18px 26px", position: "relative" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{isNew ? "재료 추가" : "재료 정보 수정"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {isNew ? (
            <button onClick={() => setPicker(true)} className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", cursor: "pointer" }}>
              <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>재료</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: name ? C.ink : C.muted }}>{name || "선택"}</span>
            </button>
          ) : (
            <div className="flex items-center" style={{ gap: 8 }}><CatDot name={name} size={9} /><span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{name}</span></div>
          )}
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }}>카테고리</div>
            <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCat(c)} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                  border: "none", background: cat === c ? C.sage : C.sageLight, color: cat === c ? "#fff" : C.sageDeep }}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }}>반응</div>
            <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
              {["이상없음", "관찰중", "주의", "중단"].map((s) => (
                <button key={s} onClick={() => setStatus(s)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                  border: "none", background: status === s ? ((s === "주의" || s === "중단") ? C.apricot : C.sage) : C.sageLight, color: status === s ? "#fff" : C.sageDeep }}>{s}</button>
              ))}
            </div>
          </div>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: C.ink, outline: "none" }} />
          <button onClick={save} style={primaryBtn}>{isNew ? "추가" : "저장"}</button>
          {!isNew && <button onClick={() => setConfirmingDel(true)} style={{ background: "none", border: "none", color: C.apricot, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0" }}>이 기록 삭제</button>}
        </div>
        {picker && <IngredientPicker onPick={(n, c) => { setName(n); setCat(c || catOf(state, n)); setPicker(false); }} onClose={() => setPicker(false)} />}
        {confirmingDel && (
          <ConfirmModal
            title={`'${name}' 기록을 삭제할까요?`}
            onConfirm={del}
            onCancel={() => setConfirmingDel(false)}
          />
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   기록 히스토리 전체 보기
   ===================================================================== */
function RecordHistoryScreen({ onBack }) {
  const { state, dispatch, notify } = useStore();
  const [delDay, setDelDay] = useState(null); // 삭제 확인 대상 날짜 (일자 전체 삭제)
  const [delEntry, setDelEntry] = useState(null); // 삭제 확인 대상 { date, logId, label } (개별 삭제)
  const logDates = Object.keys(state.logs).filter((d) => (state.logs[d] || []).length > 0).sort().reverse();

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title="급여 히스토리" onBack={onBack} />
      <div style={{ padding: "8px 18px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {logDates.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted }}>아직 급여 기록이 없습니다</div>}
        {logDates.map((d) => (
          <div key={d} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{d}</span>
              <button onClick={() => setDelDay(d)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <Trash2 size={13} color={C.muted} />
              </button>
            </div>
            {(state.logs[d] || []).map((log) => {
              const prov = logProvideG(log);
              const pct = prov ? Math.round((log.intakeG / prov) * 100) : 0;
              return (
                <div key={log.id} className="flex items-center justify-between" style={{ marginBottom: 3, gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: C.inkSoft }}>{log.label} · {prov}g 중 {log.intakeG}g</span>
                  <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: pct >= 85 ? C.sageDeep : C.apricot }}>{pct}%</span>
                    <button onClick={() => setDelEntry({ date: d, logId: log.id, label: log.label })} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                      <X size={13} color={C.muted} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {delDay && (
        <ConfirmModal
          title={`${delDay} 기록을 전체 삭제할까요?`}
          message="이 날짜의 급여 기록이 모두 삭제됩니다."
          warning="삭제해도 이미 차감된 재고 수량은 자동으로 복원되지 않습니다."
          onConfirm={() => {
            const logsBackup = state.logs[delDay] || [];
            dispatch({ type: "LOG_DELETE_DAY", date: delDay });
            setDelDay(null);
            notify(`${delDay} 기록을 삭제했습니다`, () => dispatch({ type: "RESTORE_LOG_DAY", date: delDay, logs: logsBackup }));
          }}
          onCancel={() => setDelDay(null)}
        />
      )}
      {delEntry && (
        <ConfirmModal
          title={`'${delEntry.label}' 기록을 삭제할까요?`}
          warning="삭제해도 이미 차감된 재고 수량은 자동으로 복원되지 않습니다."
          onConfirm={() => {
            const log = (state.logs[delEntry.date] || []).find((l) => l.id === delEntry.logId);
            dispatch({ type: "LOG_DELETE_ENTRY", date: delEntry.date, logId: delEntry.logId });
            setDelEntry(null);
            if (log) notify(`'${delEntry.label}' 기록을 삭제했습니다`, () => dispatch({ type: "RESTORE_LOG_ENTRY", date: delEntry.date, log }));
          }}
          onCancel={() => setDelEntry(null)}
        />
      )}
    </div>
  );
}

/* =====================================================================
   급여표 셀 상세 - 계획(식단표) vs 실제(급여기록) 비교
   ===================================================================== */
function FeedingCompareScreen({ date, label, onBack }) {
  const { state } = useStore();
  const log = (state.logs[date] || []).find((l) => l.label === label);
  const planLive = (state.plans[date] || []).find((m) => m.label === label);
  // 기록 저장 당시의 식단표 스냅샷을 우선 사용 (이후 식단표가 바뀌어도 저장 당시 기준으로 비교).
  // 스냅샷이 없는 옛 기록은 현재 식단표로 대체
  const snapshotUsed = !!(log && log.planSnapshot);
  const plan = snapshotUsed ? log.planSnapshot : planLive;
  const planTotal = plan ? totalG(state, plan.items) : 0;
  const provTotal = log ? logProvideG(log) : 0;
  const pct = log && provTotal ? Math.round((log.intakeG / provTotal) * 100) : 0;

  // 항목별 계획 g / 실제 제공 g 비교 데이터
  const planG = {};
  (plan ? plan.items : []).forEach((it) => { planG[it.name] = (planG[it.name] || 0) + gOf(state, it); });
  const actualG = {};
  (log ? log.items : []).forEach((it) => { actualG[it.name] = (actualG[it.name] || 0) + (it.source === "fridge" ? it.qty : it.qty * it.unitG); });
  const allNames = sortByCategory(state, Array.from(new Set([...Object.keys(planG), ...Object.keys(actualG)])), (n) => n);
  const totalDiff = provTotal - planTotal;

  const diffText = (d) => (d > 0 ? `+${d}g` : d < 0 ? `${d}g` : "—");
  const diffColor = (d) => (d > 0 ? C.apricot : d < 0 ? "#4A7FB5" : C.muted);
  const cellStyle = { fontSize: 11.5, color: C.inkSoft, textAlign: "right" };
  const gridCols = "minmax(64px,1.4fr) 1fr 1fr 1fr";

  return (
    <div style={{ paddingBottom: 90 }}>
      <SubHeader title={`${date.slice(5)} · ${label}`} onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* 섭취 요약 */}
        <div style={{ background: C.sageLight, borderRadius: 16, padding: 14 }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 13, fontWeight: 700, color: C.sageDeep }}>섭취 요약</span>
            {log
              ? <span style={{ fontSize: 12.5, fontWeight: 800, color: C.sageDeep }}>{provTotal}g 중 {log.intakeG}g ({pct}%)</span>
              : <span style={{ fontSize: 12, color: C.muted }}>급여 기록 없음</span>}
          </div>
        </div>

        {/* 항목별 계획 대비 기록 비교표 */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>계획 대비 기록</span>
            <span style={{ fontSize: 9.5, color: C.muted, fontWeight: 600 }}>
              {snapshotUsed ? "기록 저장 당시 식단표 기준" : plan ? "현재 식단표 기준 (저장 당시 스냅샷 없음)" : ""}
            </span>
          </div>
          {!plan && !log && <div style={{ textAlign: "center", padding: "16px 0", fontSize: 12, color: C.muted }}>계획·기록 정보가 없습니다</div>}
          {(plan || log) && (
            <>
              {!plan && <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 6 }}>이 끼니의 계획 정보가 없어 기록만 표시합니다(계획이 삭제되었을 수 있어요)</div>}
              <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 4, padding: "6px 8px", background: C.sageLight, borderRadius: "8px 8px 0 0", marginTop: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep }}>재료</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep, textAlign: "right" }}>계획</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep, textAlign: "right" }}>기록(제공)</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep, textAlign: "right" }}>증감</span>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 8px 8px" }}>
                {allNames.map((name, i) => {
                  const p = planG[name]; const a = actualG[name];
                  const added = p == null;   // 계획엔 없고 기록에만 있음
                  const removed = a == null; // 계획에 있었지만 기록에서 빠짐
                  const d = (a || 0) - (p || 0);
                  return (
                    <div key={name} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 4, alignItems: "center", padding: "7px 8px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, opacity: removed ? 0.75 : 1 }}>
                      <div className="flex items-center" style={{ minWidth: 0, gap: 2 }}>
                        <CatDot name={name} />
                        <span style={{ fontSize: 12, color: C.ink, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                      </div>
                      <span style={cellStyle}>{p != null ? `${p}g` : "—"}</span>
                      <span style={{ ...cellStyle, fontWeight: 700, color: C.ink }}>{a != null ? `${a}g` : "—"}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, textAlign: "right",
                        color: added ? C.sageDeep : removed ? C.apricot : diffColor(d) }}>
                        {added ? "추가" : removed ? "빠짐" : diffText(d)}
                      </span>
                    </div>
                  );
                })}
                {/* 합계 행 */}
                <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 4, alignItems: "center", padding: "8px 8px", borderTop: `1px dashed ${C.border}`, background: C.bg }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.ink }}>합계</span>
                  <span style={{ ...cellStyle, fontWeight: 700 }}>{plan ? `${planTotal}g` : "—"}</span>
                  <span style={{ ...cellStyle, fontWeight: 800, color: C.ink }}>{log ? `${provTotal}g` : "—"}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, textAlign: "right", color: plan && log ? diffColor(totalDiff) : C.muted }}>
                    {plan && log ? diffText(totalDiff) : "—"}
                  </span>
                </div>
              </div>
              <div className="flex items-center" style={{ gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9.5, color: C.sageDeep, fontWeight: 700 }}>추가 = 계획에 없던 재료</span>
                <span style={{ fontSize: 9.5, color: C.apricot, fontWeight: 700 }}>빠짐 = 계획엔 있었지만 안 준 재료</span>
                <span style={{ fontSize: 9.5, color: C.muted, fontWeight: 700 }}>증감 = 제공량 기준</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   재료 정보 화면 - 영양 태그(편집 가능) · 궁합 좋은 재료/주의 조합 · 재고 · 최근 급여 이력
   (기록 탭 '지금까지 먹어본 재료'에서 재료를 탭하면 진입)
   ===================================================================== */
function IngredientInfoScreen({ name, onBack }) {
  const { state, dispatch } = useStore();
  const [editIntro, setEditIntro] = useState(false);
  const [basePicker, setBasePicker] = useState(false);
  const [compPicker, setCompPicker] = useState(false);
  const intro = state.intros.find((it) => it.name === name);
  const cubes = stockTotalCubes(state, name), fg = stockFridgeG(state, name);
  const myTags = tagsOf(state, name);
  const { good, avoid } = ingredientPairsFor(state, name);
  const isCustomized = !!(state.ingredientTags && state.ingredientTags[name] && state.ingredientTags[name].length > 0);

  // 분류: 변형 재료(기본 재료 연결) · 혼합 큐브(구성 재료)
  const meta = state.ingredients[name] || {};
  const baseOf = meta.baseOf || null;
  const components = meta.components || [];
  const setMeta = (patch) => dispatch({ type: "INGREDIENT_SET_META", name, patch });
  // 자동 제안: 이름이 다른 재료명으로 시작하면 변형일 가능성 (예: '사과퓨레' → '사과')
  const baseSuggestion = (!baseOf && components.length === 0) ? suggestBaseFor(state, name) : null;
  // 태그 출처 (안내 문구용)
  const tagSource = isCustomized ? "custom" : NUTRIENT_TAGS[name] ? "db" : baseOf ? "base" : components.length > 0 ? "blend" : "none";

  const toggleTag = (t) => {
    const next = myTags.includes(t) ? myTags.filter((x) => x !== t) : [...myTags, t];
    dispatch({ type: "INGREDIENT_TAGS_SET", name, tags: next });
  };

  // 최근 급여 이력 (최신순 5회)
  const history = [];
  Object.keys(state.logs).sort((a, b) => b.localeCompare(a)).forEach((d) => {
    (state.logs[d] || []).forEach((log) => {
      log.items.forEach((it) => {
        if (it.name !== name) return;
        history.push({ date: d, label: log.label, g: it.source === "fridge" ? it.qty : it.qty * it.unitG });
      });
    });
  });
  const recent = history.slice(0, 5);

  const gradeBadge = (g) => (
    <span style={{ fontSize: 8.5, fontWeight: 800, color: g === "A" ? C.sageDeep : "#9A7416", background: g === "A" ? C.sageLight : C.butterLight, borderRadius: 4, padding: "1px 4px", flexShrink: 0 }}>근거 {g}</span>
  );
  const stockBadge = (inStock) => (
    <span style={{ fontSize: 9.5, fontWeight: 700, color: inStock ? C.sageDeep : C.muted, border: `1px solid ${inStock ? C.sage : C.border}`, borderRadius: 8, padding: "2px 8px", flexShrink: 0, whiteSpace: "nowrap" }}>{inStock ? "재고 있음" : "재고 없음"}</span>
  );

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title={`${name} 재료 정보`} onBack={onBack} />
      <div style={{ padding: "6px 18px 0", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* 요약 카드 */}
        <div className="flex items-center justify-between" style={{ background: C.sageLight, borderRadius: 14, padding: "12px 14px" }}>
          <div className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
            <CatDot name={name} size={9} />
            <span style={{ fontSize: 14, fontWeight: 800, color: C.sageDeep }}>{name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, background: C.surface, color: C.sageDeep, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
              {catOf(state, name)}{intro ? ` · ${intro.status}` : ""}
            </span>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep, flexShrink: 0 }}>
            {cubes > 0 || fg > 0 ? `냉동 ${cubes}큐브${fg > 0 ? ` · 냉장 ${fg}g` : ""}` : "재고 없음"}
          </span>
        </div>

        {/* 재료 분류 - 변형(기본 재료 연결) · 혼합 큐브 구성 */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 }}>재료 분류</div>
          {baseSuggestion && (
            <div className="flex items-center justify-between" style={{ background: C.sageLight, borderRadius: 8, padding: "7px 9px", marginBottom: 8, gap: 8 }}>
              <span style={{ fontSize: 11, color: C.sageDeep, lineHeight: 1.4 }}>'{baseSuggestion}'를 조리 방식만 바꾼 재료인가요? 연결하면 영양·궁합 정보를 물려받아요.</span>
              <button onClick={() => setMeta({ baseOf: baseSuggestion })} style={{ background: C.sage, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer", flexShrink: 0 }}>연결</button>
            </div>
          )}
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.inkSoft }}>기본 재료 연결 <span style={{ fontSize: 9.5, color: C.muted }}>(변형 재료용)</span></span>
            {baseOf ? (
              <span className="flex items-center" style={{ gap: 6 }}>
                <span className="flex items-center" style={{ fontSize: 12, fontWeight: 700, color: C.sageDeep }}><CatDot name={baseOf} size={7} />{baseOf}</span>
                <button onClick={() => setMeta({ baseOf: null })} style={{ background: "none", border: "none", fontSize: 10, color: C.muted, cursor: "pointer", padding: 0, textDecoration: "underline" }}>해제</button>
              </span>
            ) : (
              <button onClick={() => setBasePicker(true)} style={{ background: C.sageLight, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: C.sageDeep, cursor: "pointer" }}>선택</button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 12, color: C.inkSoft }}>혼합 큐브 구성 <span style={{ fontSize: 9.5, color: C.muted }}>(여러 재료 섞인 큐브용)</span></span>
            <button onClick={() => setCompPicker(true)} style={{ background: C.sageLight, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: C.sageDeep, cursor: "pointer" }}>{components.length > 0 ? "추가" : "선택"}</button>
          </div>
          {components.length > 0 && (
            <div className="flex items-center" style={{ gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {components.map((c) => (
                <span key={c} className="flex items-center" style={{ gap: 4, fontSize: 11, fontWeight: 700, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "3px 5px 3px 9px" }}>
                  <CatDot name={c} size={6} />{c}
                  <button onClick={() => setMeta({ components: components.filter((x) => x !== c) })} style={{ background: "rgba(0,0,0,0.08)", border: "none", width: 14, height: 14, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><X size={8} color={C.sageDeep} /></button>
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 9.5, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>
            변형 재료(예: 사과퓨레→사과)는 기본 재료의 영양·궁합 정보를 물려받고, 혼합 큐브(예: 감뚝큐브=배·무·양파)는 구성 재료의 정보를 합쳐서 계산해요. 재고와 급여 기록은 이 재료 단위로 그대로 관리돼요.
          </div>
        </div>

        {/* 영양 태그 (탭해서 편집) */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.ink }}>영양 태그 <span style={{ fontWeight: 400, color: C.muted }}>— 탭해서 켜고 끄기</span></span>
            {isCustomized && (
              <button onClick={() => dispatch({ type: "INGREDIENT_TAGS_SET", name, tags: null })} style={{ background: "none", border: "none", fontSize: 10, color: C.muted, cursor: "pointer", padding: 0, textDecoration: "underline" }}>기본값으로</button>
            )}
          </div>
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
            {TAG_KEYS.map((t) => {
              const on = myTags.includes(t);
              return (
                <button key={t} onClick={() => toggleTag(t)} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                  border: "none", background: on ? C.sage : C.sageLight, color: on ? "#fff" : C.sageDeep }}>{TAG_LABELS[t]}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 9.5, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>
            {tagSource === "custom" ? "직접 지정한 태그를 사용 중이에요. '기본값으로'를 누르면 자동 계산으로 돌아가요."
              : tagSource === "db" ? "기본 영양 DB에 등록된 재료예요. 태그는 궁합 추천 계산에 바로 반영돼요."
              : tagSource === "base" ? `기본 재료 '${baseOf}'의 태그를 물려받고 있어요. 태그를 직접 바꾸면 이 재료만의 태그로 저장돼요.`
              : tagSource === "blend" ? "혼합 큐브라서 구성 재료의 태그를 합쳐서 계산 중이에요. 직접 바꾸면 그 값이 우선돼요."
              : "기본 DB에 없는 재료예요. 영양 태그를 지정하거나 위 '재료 분류'에서 기본 재료를 연결하면 궁합 추천에 포함돼요."}
          </div>
        </div>

        {/* 궁합 좋은 재료 / 주의 조합 */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, marginBottom: 8 }}>궁합 좋은 재료 ({good.length})</div>
          {good.length === 0 && <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>등록된 재료 중 궁합 정보가 있는 재료가 없어요</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {good.map((g) => (
              <div key={g.name} className="flex items-center justify-between" style={{ gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="flex items-center" style={{ gap: 5 }}>
                    <CatDot name={g.name} size={7} />
                    <span style={{ fontSize: 12, color: C.ink, fontWeight: 700 }}>{g.name}</span>
                    {gradeBadge(g.grade)}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4, marginTop: 1 }}>{g.text}</div>
                </div>
                {stockBadge(g.inStock)}
              </div>
            ))}
          </div>
          {avoid.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.apricot, margin: "12px 0 6px" }}>주의 조합 ({avoid.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {avoid.map((a) => (
                  <div key={a.name} style={{ background: C.apricotLight, borderRadius: 8, padding: "7px 9px" }}>
                    <div className="flex items-center justify-between" style={{ gap: 8 }}>
                      <div className="flex items-center" style={{ gap: 5 }}>
                        <AlertTriangle size={11} color={C.apricot} />
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#9A4A1E" }}>{a.name}</span>
                        {gradeBadge(a.grade)}
                      </div>
                      {stockBadge(a.inStock)}
                    </div>
                    <div style={{ fontSize: 10, color: "#A85B30", lineHeight: 1.4, marginTop: 2 }}>{a.text}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ fontSize: 9.5, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>* 확립된 영양소 상호작용만 안내하는 참고 정보예요. 흡수율에 관한 내용으로, 함께 먹여도 위험한 조합은 아니에요.</div>
        </div>

        {/* 최근 급여 이력 */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 }}>최근 급여 이력</div>
          {recent.length === 0 ? (
            <div style={{ fontSize: 11.5, color: C.muted }}>아직 급여 기록이 없어요</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {recent.map((h, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span style={{ fontSize: 12, color: C.inkSoft }}>{h.date.slice(5)} · {h.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.sageDeep }}>{h.g}g</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 반응 기록·메모 */}
        {intro ? (
          <button onClick={() => setEditIntro(true)} className="flex items-center justify-between" style={{ width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 13px", cursor: "pointer" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>반응 기록 · 메모 수정</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{intro.status}{intro.memo ? ` — ${intro.memo}` : ""}</div>
            </div>
            <ChevronRight size={15} color={C.muted} />
          </button>
        ) : (
          <button onClick={() => dispatch({ type: "INTRO_UPSERT", intro: { name, cat: catOf(state, name), status: "이상없음", memo: "", date: todayISO() } })}
            className="flex items-center justify-center" style={{ gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "11px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
            <Plus size={14} /> 먹어본 재료로 등록
          </button>
        )}
      </div>
      {editIntro && intro && <IntroEditModal intro={intro} onClose={() => setEditIntro(false)} />}
      {basePicker && <IngredientPicker onPick={(n) => { if (n !== name) setMeta({ baseOf: n }); setBasePicker(false); }} onClose={() => setBasePicker(false)} />}
      {compPicker && <IngredientPicker multi alreadyAdded={[...components, name]} onPick={(names) => { setMeta({ components: Array.from(new Set([...components, ...names.filter((n) => n !== name)])) }); }} onClose={() => setCompPicker(false)} />}
    </div>
  );
}

/* =====================================================================
   재료 정보(위키) - 영양 DB 전체 + 앱에 등록된 재료를 카테고리별로 나열.
   먹어본 재료는 진하게(활성) 표시, 탭하면 재료 정보 화면으로 이동
   ===================================================================== */
function IngredientWikiPanel({ go }) {
  const { state } = useStore();
  const [q, setQ] = useState("");
  // 먹어본 재료: intros 등록분 + 변형 재료를 먹었다면 그 기본 재료도 먹은 것으로 간주 (예: 사과퓨레 → 사과)
  const eaten = new Set();
  state.intros.forEach((it) => {
    eaten.add(it.name);
    const b = (state.ingredients[it.name] || {}).baseOf;
    if (b) eaten.add(b);
  });
  const warned = new Set(state.intros.filter((it) => it.status === "주의" || it.status === "중단").map((it) => it.name));
  const allNames = Array.from(new Set([...Object.keys(NUTRIENT_TAGS), ...Object.keys(state.ingredients)]));
  const filtered = allNames.filter((n) => !q || n.includes(q));
  const byCat = {};
  CATEGORIES.forEach((c) => { byCat[c] = []; });
  filtered.forEach((n) => { (byCat[catOf(state, n)] || byCat["채소"]).push(n); });
  CATEGORIES.forEach((c) => {
    byCat[c].sort((a, b) => {
      const ea = eaten.has(a), eb = eaten.has(b);
      if (ea !== eb) return ea ? -1 : 1; // 먹어본 재료 먼저
      return a.localeCompare(b, "ko");
    });
  });
  const eatenCount = filtered.filter((n) => eaten.has(n)).length;

  return (
    <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="flex items-center" style={{ gap: 7, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px" }}>
        <Search size={15} color={C.muted} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="재료 검색"
          style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.ink, width: "100%" }} />
      </div>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>먹어본 재료는 진하게 표시돼요 · 탭하면 상세 정보</span>
        <span style={{ fontSize: 10.5, color: C.sageDeep, fontWeight: 700 }}>{eatenCount}/{filtered.length} 먹어봄</span>
      </div>
      {CATEGORIES.map((cat) => byCat[cat].length > 0 && (
        <div key={cat}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, margin: "4px 0 6px", padding: "0 2px" }}>{cat} ({byCat[cat].length})</div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            {byCat[cat].map((n, i) => {
              const isEaten = eaten.has(n);
              const isWarned = warned.has(n);
              const tags = tagsOf(state, n);
              const meta = state.ingredients[n] || {};
              const sub = meta.baseOf ? `${meta.baseOf}의 변형`
                : (meta.components && meta.components.length > 0) ? `혼합: ${meta.components.join("·")}`
                : tags.length > 0 ? tags.map((t) => TAG_LABELS[t]).filter(Boolean).join(" · ") : "";
              return (
                <button key={n} onClick={() => go("ingredientInfo", { name: n })} className="flex items-center justify-between"
                  style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: C.surface, border: "none",
                    borderTop: i === 0 ? "none" : `1px solid ${C.border}`, cursor: "pointer", opacity: isEaten ? 1 : 0.5 }}>
                  <div className="flex items-center" style={{ gap: 7, minWidth: 0, flex: 1 }}>
                    <CatDot name={n} size={7} />
                    <span style={{ fontSize: 12.5, fontWeight: isEaten ? 800 : 500, color: C.ink, whiteSpace: "nowrap" }}>{n}</span>
                    {isEaten && !isWarned && <Check size={12} color={C.sage} />}
                    {isWarned && <span style={{ fontSize: 9, fontWeight: 700, color: C.apricot, background: C.apricotLight, borderRadius: 999, padding: "1px 6px" }}>주의·중단</span>}
                    {sub && <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>}
                  </div>
                  <ChevronRight size={13} color={C.muted} style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 9.5, color: C.muted, lineHeight: 1.5, padding: "0 2px 4px" }}>
        영양 DB {Object.keys(NUTRIENT_TAGS).length}개 재료 + 직접 등록한 재료가 함께 표시돼요. 새 재료는 식단표·제조 기록·기록 탭에서 추가하면 여기에 나타나요.
      </div>
    </div>
  );
}

/* =====================================================================
   더보기 하위 화면들
   ===================================================================== */
function SettingsScreen({ onBack }) {
  const { state, dispatch, notify } = useStore();
  const s = state.settings;
  const baby = state.baby;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [importPending, setImportPending] = useState(null); // 검증 통과한 백업 데이터 (확인 대기)
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);
  const set = (key, value) => dispatch({ type: "SET_SETTING", key, value });
  const setBaby = (patch) => dispatch({ type: "BABY_SET", patch });
  const doReset = () => { dispatch({ type: "RESET" }); setConfirmingReset(false); };
  const handleFileSelected = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // 같은 파일을 다시 선택해도 onChange가 동작하도록 초기화
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        // 최소한의 형태 검증 - 베이비큐브 백업 파일인지 확인 (핵심 필드 존재 + 재료 마스터가 비어있지 않은지)
        const looksValid = parsed && typeof parsed === "object"
          && parsed.ingredients && typeof parsed.ingredients === "object" && Object.keys(parsed.ingredients).length > 0
          && parsed.stock && typeof parsed.stock === "object"
          && parsed.logs && typeof parsed.logs === "object"
          && parsed.plans && typeof parsed.plans === "object";
        if (!looksValid) {
          setImportError("올바른 베이비큐브 백업 파일이 아니거나, 재료 정보가 비어있는 파일입니다.");
          return;
        }
        setImportPending(parsed);
      } catch (err) {
        setImportError("파일을 읽을 수 없습니다. JSON 백업 파일인지 확인해 주세요.");
      }
    };
    reader.readAsText(file);
  };
  const doImport = () => {
    const backup = state; // 실행취소용 현재 데이터 백업 (가져오기 직전 상태)
    const migrated = migrateState(importPending);
    dispatch({ type: "HYDRATE", state: migrated });
    setImportPending(null);
    // 가족 공유 앱 특성상, 실행취소를 누르는 시점에 이미 다른 기기(배우자 등)의 변경이 반영돼 있을 수 있음.
    // 그 사이 변화가 없을 때만 조용히 되돌리고, 변화가 있었다면 그 변경을 덮어써도 되는지 다시 물어봄.
    notify("백업 데이터를 가져왔습니다", (currentState) => {
      const unchangedSinceImport = JSON.stringify(currentState) === JSON.stringify(migrated);
      if (!unchangedSinceImport) {
        const proceed = window.confirm(
          "가져오기 이후 추가로 반영된 변경사항이 있어요(다른 가족 구성원의 변경일 수 있어요). 그래도 가져오기 이전 데이터로 되돌릴까요? 그 사이 변경사항은 사라집니다."
        );
        if (!proceed) return;
      }
      dispatch({ type: "HYDRATE", state: backup });
    }, 15000);
  };
  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title="설정" onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>시간 표시 형식</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <Segmented value={s.timeFmt} onChange={(v) => set("timeFmt", v)} options={[{ value: "24h", label: "24시간 (18:00)" }, { value: "ampm", label: "오전/오후 (오후 6:00)" }]} />
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8, padding: "0 2px" }}>예시: {fmtTime("07:00", s.timeFmt)} · {fmtTime("18:00", s.timeFmt)}</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>글자 크기</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <Segmented value={s.fontScale || 1} onChange={(v) => set("fontScale", v)} options={[
              { value: 0.9, label: "작게" },
              { value: 1, label: "보통" },
              { value: 1.15, label: "크게" },
              { value: 1.3, label: "아주크게" },
            ]} />
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8, padding: "0 2px" }}>앱 전체 글자·화면 크기가 함께 조정됩니다.</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>알림 · 보관</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {[["frozenAlertDays", "냉동 소진 알림", "일 전"], ["fridgeAlertDays", "냉장 소진 알림", "일 전"], ["fridgeKeepDays", "냉장 보관 기본 기간", "일"]].map(([key, label, unit], i) => (
              <div key={key} className="flex items-center justify-between" style={{ padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{label}</span>
                <NumInput value={s[key]} onChange={(v) => set(key, v)} width={42} suffix={unit} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>아기 정보</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12.5, color: C.ink }}>이름</span>
              <input value={baby.name} onChange={(e) => setBaby({ name: e.target.value })} placeholder="이름 (선택)"
                style={{ border: "none", background: "transparent", textAlign: "right", fontSize: 12.5, fontWeight: 700, color: C.ink, width: 130, outline: "none" }} />
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12.5, color: C.ink }}>성별</span>
              <Segmented value={baby.sex} onChange={(v) => setBaby({ sex: v })} options={[{ value: "남아", label: "남아" }, { value: "여아", label: "여아" }]} />
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12.5, color: C.ink }}>생년월일</span>
              <input type="date" value={baby.birth} onChange={(e) => setBaby({ birth: e.target.value })}
                style={{ border: "none", background: "transparent", fontSize: 12.5, fontWeight: 700, color: C.ink, outline: "none" }} />
            </div>
            <div className="flex items-center justify-between" style={{ paddingTop: 7, borderTop: `1px dashed ${C.border}` }}>
              <span style={{ fontSize: 12.5, color: C.ink }}>현재</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sageDeep }}>{ageText(baby.birth)}</span>
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>데이터</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => downloadFile(`babycube-backup-${todayISO()}.json`, JSON.stringify(state, null, 2), "application/json")}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, color: C.ink, cursor: "pointer" }}>
              전체 데이터 내보내기 (JSON 백업)
            </button>
            <button onClick={() => fileInputRef.current && fileInputRef.current.click()}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, color: C.ink, cursor: "pointer" }}>
              데이터 가져오기 (JSON 백업 복원)
            </button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileSelected} style={{ display: "none" }} />
            {importError && <div style={{ fontSize: 11, color: C.apricot, fontWeight: 600, padding: "0 2px" }}>{importError}</div>}
            <button onClick={() => downloadFile(`babycube-feeding-logs-${todayISO()}.csv`, "﻿" + feedingLogsToCSV(state), "text/csv;charset=utf-8;")}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, color: C.ink, cursor: "pointer" }}>
              급여 기록 내보내기 (CSV)
            </button>
            <button onClick={() => setConfirmingReset(true)}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.apricot}`, borderRadius: 12, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, color: C.apricot, cursor: "pointer" }}>
              초기 데이터로 재설정
            </button>
          </div>
        </div>
      </div>
      {confirmingReset && (
        <ConfirmModal
          title="모든 데이터를 초기화할까요?"
          message="식단·재고·기록이 모두 초기 상태로 되돌아갑니다. 되돌릴 수 없습니다."
          confirmLabel="초기화"
          onConfirm={doReset}
          onCancel={() => setConfirmingReset(false)}
        />
      )}
      {importPending && (
        <ConfirmModal
          title="백업 데이터를 가져올까요?"
          message="가져오기를 하면 현재 저장된 모든 데이터(식단·재고·기록 등)가 선택한 백업 파일 내용으로 완전히 교체됩니다. 가족 구성원 모두의 화면에 즉시 반영돼요."
          warning="가져온 직후 잠시 동안은 하단 '실행취소'로 가져오기 전 데이터로 되돌릴 수 있습니다. 그 이후엔 되돌릴 수 없으니 신중하게 진행해 주세요."
          confirmLabel="가져오기"
          danger
          onConfirm={doImport}
          onCancel={() => setImportPending(null)}
        />
      )}
    </div>
  );
}

function MembersScreen({ onBack }) {
  const { cloud } = useStore();
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  if (!cloud) return null;
  const { familyId, user, meta, leaveFamily, logout } = cloud;
  const memberList = (meta.members || []).map((uid) => ({ uid, ...(meta.memberInfo?.[uid] || {}) }));

  const copyCode = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(familyId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title="공유 멤버" onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: C.sageLight, borderRadius: 14, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.sageDeep, fontWeight: 700, marginBottom: 6 }}>초대 코드</div>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 3, color: C.sageDeep, fontFamily: "'Gowun Dodum', sans-serif", marginBottom: 10 }}>{familyId}</div>
          <button onClick={copyCode} style={{ background: C.surface, border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 11.5, fontWeight: 700, color: C.sageDeep, cursor: "pointer" }}>{copied ? "복사됨" : "코드 복사"}</button>
        </div>

        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, padding: "0 2px" }}>구성원 ({memberList.length})</div>
        {memberList.map((m) => (
          <div key={m.uid} className="flex items-center" style={{ gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 14px" }}>
            <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: "50%", background: C.sageLight }}><Users size={16} color={C.sageDeep} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{m.name || m.email || "이름 없음"}{m.uid === user.uid ? " (나)" : ""}</div>
              {m.email && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>{m.email}</div>}
            </div>
          </div>
        ))}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <button onClick={() => setConfirmLeave(true)} style={{ background: "none", border: `1px solid ${C.apricot}`, borderRadius: 12, padding: "11px 0", fontSize: 12.5, fontWeight: 700, color: C.apricot, cursor: "pointer" }}>이 가족에서 나가기</button>
          <button onClick={logout} style={{ background: "none", border: "none", fontSize: 12, color: C.muted, cursor: "pointer" }}>로그아웃</button>
        </div>
      </div>
      {confirmLeave && (
        <ConfirmModal
          title="가족에서 나가시겠어요?"
          message="더 이상 이 가족의 데이터를 볼 수 없게 됩니다."
          confirmLabel="나가기"
          onConfirm={leaveFamily}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}

function TravelScreen({ onBack }) {
  const { state, dispatch } = useStore();
  const tv = state.travel;
  const set = (patch) => dispatch({ type: "TRAVEL_SET", patch });
  // 필요 큐브 산출: 최근 식단 평균 재료 사용량 기반
  const cubeNeed = useMemo(() => {
    if (!tv.start || !tv.end) return [];
    const days = Math.max(1, Math.round((new Date(tv.end) - new Date(tv.start)) / 86400000) + 1);
    const usage = {};
    const t = todayISO();
    let counted = 0;
    for (let i = 1; i <= 7; i++) {
      const meals = state.plans[addDaysISO(t, -i)] || [];
      if (meals.length) counted++;
      meals.forEach((m) => m.items.forEach((it) => { if (it.name !== "죽") usage[it.name] = (usage[it.name] || 0) + it.qty; }));
    }
    const perDay = counted || 1;
    return Object.entries(usage).map(([name, q]) => ({ name, cubes: Math.ceil((q / perDay) * days * (tv.mealsPerDay / 3)) })).sort((a, b) => b.cubes - a.cubes);
  }, [tv.start, tv.end, tv.mealsPerDay, state.plans]);

  const defChecklist = ["냉동 큐브 챙기기 (드라이아이스)", "카페리 탑승용 1끼 캐리어 별도 포장", "숙소 냉동고·전자레인지 확인", "상비용 시판 이유식"];
  const checklist = tv.checklist.length ? tv.checklist : defChecklist.map((t) => ({ text: t, done: false }));

  return (
    <div style={{ paddingBottom: 90 }}>
      <SubHeader title="여행 모드" onBack={onBack} right={
        <button onClick={() => set({ active: !tv.active })} style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 12px", borderRadius: 999, border: "none", cursor: "pointer", background: tv.active ? C.sage : C.sageLight, color: tv.active ? "#fff" : C.sageDeep }}>{tv.active ? "켜짐" : "꺼짐"}</button>
      } />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
          <div className="flex items-center justify-between"><span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>출발</span><input type="date" value={tv.start} onChange={(e) => set({ start: e.target.value })} style={{ border: "none", background: "transparent", fontSize: 12.5, fontWeight: 700, color: C.ink, outline: "none" }} /></div>
          <div className="flex items-center justify-between"><span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>도착</span><input type="date" value={tv.end} onChange={(e) => set({ end: e.target.value })} style={{ border: "none", background: "transparent", fontSize: 12.5, fontWeight: 700, color: C.ink, outline: "none" }} /></div>
          <div className="flex items-center justify-between"><span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>하루 끼니 수</span>
            <select value={tv.mealsPerDay} onChange={(e) => set({ mealsPerDay: Number(e.target.value) })} style={selectStyle}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}끼</option>)}</select>
          </div>
        </div>
        {cubeNeed.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>필요 큐브 (예상)</div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 7 }}>
              {cubeNeed.map((c) => (
                <div key={c.name} className="flex items-center justify-between"><div className="flex items-center"><CatDot name={c.name} size={7} /><span style={{ fontSize: 12.5, color: C.ink }}>{c.name}</span></div><span style={{ fontSize: 12, fontWeight: 700, color: C.sageDeep }}>{c.cubes}큐브</span></div>
              ))}
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>준비 체크리스트</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {checklist.map((c, i) => (
              <button key={i} onClick={() => { const nc = checklist.map((x, j) => j === i ? { ...x, done: !x.done } : x); set({ checklist: nc }); }}
                className="flex items-center" style={{ width: "100%", gap: 10, padding: "11px 13px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ width: 19, height: 19, borderRadius: 6, border: `1.5px solid ${c.done ? C.sage : C.border}`, background: c.done ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.done && <Check size={12} color="#fff" />}</span>
                <span style={{ fontSize: 12.5, color: c.done ? C.muted : C.ink, textDecoration: c.done ? "line-through" : "none" }}>{c.text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   끼니 설정 (끼니 종류 이름·시간을 미리 정의 → 식단표 입력 시 선택 목록으로 사용)
   ===================================================================== */
function MealSlotsScreen({ onBack }) {
  const { state } = useStore();
  const [editing, setEditing] = useState(null); // null | 'new' | slotObj
  const timeFmt = state.settings.timeFmt;
  const sorted = [...state.mealSlots].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title="끼니 설정" onBack={onBack} right={
        <button onClick={() => setEditing("new")} className="flex items-center" style={{ gap: 3, background: "none", border: "none", cursor: "pointer" }}>
          <Plus size={14} color={C.sageDeep} /><span style={{ fontSize: 12, fontWeight: 700, color: C.sageDeep }}>추가</span>
        </button>
      } />
      <div style={{ padding: "6px 18px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, padding: "0 2px" }}>
          여기서 정한 끼니 이름과 시간이 식단표에서 끼니를 추가할 때 선택 목록으로 사용됩니다. 예: 아침 · 점심 · 저녁, 또는 첫 끼니 · 둘째 끼니 · 간식1
        </div>
        {sorted.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12.5, color: C.muted }}>등록된 끼니 종류가 없습니다.</div>}
        {sorted.map((s) => (
          <button key={s.id} onClick={() => setEditing(s)} className="flex items-center justify-between" style={{ width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 14px", cursor: "pointer" }}>
            <div className="flex items-center" style={{ gap: 10 }}>
              <div className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: C.sageLight, flexShrink: 0 }}><Clock size={14} color={C.sageDeep} /></div>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{s.label}</span>
            </div>
            <div className="flex items-center" style={{ gap: 6 }}>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{fmtTime(s.time, timeFmt)}</span>
              <ChevronRight size={15} color={C.muted} />
            </div>
          </button>
        ))}
      </div>
      {editing && <MealSlotEditModal slot={editing} timeFmt={timeFmt} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MealSlotEditModal({ slot, timeFmt, onClose }) {
  const { dispatch } = useStore();
  const isNew = slot === "new";
  const base = isNew ? {} : slot;
  const [label, setLabel] = useState(base.label || "");
  const [time, setTime] = useState(base.time || "12:00");
  const [confirmingDel, setConfirmingDel] = useState(false);

  const save = () => {
    if (!label) return;
    dispatch({ type: "MEALSLOT_UPSERT", slot: { id: isNew ? undefined : base.id, label, time } });
    onClose();
  };
  const del = () => { dispatch({ type: "MEALSLOT_DELETE", id: base.id }); onClose(); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", borderRadius: "20px 20px 0 0", padding: "16px 18px 26px", position: "relative" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{isNew ? "끼니 종류 추가" : "끼니 종류 수정"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>이름</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 간식1, 첫 끼니"
              style={{ border: "none", background: "transparent", textAlign: "right", fontSize: 13, fontWeight: 700, color: C.ink, width: 150, outline: "none" }} />
          </div>
          <TimePicker time={time} setTime={setTime} timeFmt={timeFmt} />
          <button onClick={save} style={primaryBtn}>{isNew ? "추가" : "저장"}</button>
          {!isNew && <button onClick={() => setConfirmingDel(true)} style={{ background: "none", border: "none", color: C.apricot, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0" }}>이 끼니 종류 삭제</button>}
        </div>
        {confirmingDel && (
          <ConfirmModal
            title={`'${label}' 끼니 종류를 삭제할까요?`}
            message="이미 식단표·기록에 저장된 항목은 그대로 남아있습니다."
            onConfirm={del}
            onCancel={() => setConfirmingDel(false)}
          />
        )}
      </div>
    </div>
  );
}

function MoreTab({ go }) {
  const items = [
    { key: "mealSlots", icon: Clock, label: "끼니 설정", sub: "끼니 이름·시간 관리" },
    { key: "manufactureHistory", icon: History, label: "제조 이력", sub: "재료별 제조 배치 기록 조회" },
    { key: "members", icon: Users, label: "공유 멤버", sub: "초대 코드 · 구성원 관리" },
    { key: "travel", icon: Plane, label: "여행 모드", sub: "필요 큐브 자동 계산" },
    { key: "settings", icon: Settings2, label: "설정", sub: "시간 형식 · 알림 · 아기 정보" },
  ];
  return (
    <div style={{ paddingBottom: 90 }}>
      <ScreenHeader title="더보기" />
      <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it) => (
          <button key={it.key} onClick={() => go(it.key)} className="flex items-center" style={{ gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 14px", cursor: "pointer", width: "100%", textAlign: "left" }}>
            <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: C.sageLight, flexShrink: 0 }}><it.icon size={16} color={C.sageDeep} /></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{it.label}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{it.sub}</div></div>
            <ChevronRight size={16} color={C.muted} />
          </button>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 10, color: C.muted, marginTop: 20 }}>
        베이비큐브 · v1.3
      </div>
    </div>
  );
}

/* =====================================================================
   앱 셸 (탭 + 라우팅)
   ===================================================================== */
const TABS = [
  { key: "today", label: "오늘", icon: Home },
  { key: "plan", label: "식단표", icon: CalendarDays },
  { key: "stock", label: "재고", icon: Package },
  { key: "record", label: "기록", icon: LineChartIcon },
  { key: "more", label: "더보기", icon: Menu },
];

function Shell() {
  const { state } = useStore();
  const fontScale = state.settings.fontScale || 1;
  const [tab, setTab] = useState("today");
  const [route, setRoute] = useState(null); // 풀스크린 하위 화면
  const [params, setParams] = useState({});

  const go = (r, p = {}) => { setParams(p); setRoute(r); };
  const back = () => setRoute(null);

  let content;
  if (route === "feed") content = <FeedingLogScreen date={params.date} planMeal={params.planMeal} existingLog={params.existingLog} onBack={back} />;
  else if (route === "shopping") content = <ShoppingScreen onBack={back} />;
  else if (route === "settings") content = <SettingsScreen onBack={back} />;
  else if (route === "members") content = <MembersScreen onBack={back} />;
  else if (route === "travel") content = <TravelScreen onBack={back} />;
  else if (route === "mealSlots") content = <MealSlotsScreen onBack={back} />;
  else if (route === "stockDetail") content = <StockDetailScreen name={params.name} onBack={back} />;
  else if (route === "recordHistory") content = <RecordHistoryScreen onBack={back} />;
  else if (route === "feedCompare") content = <FeedingCompareScreen date={params.date} label={params.label} onBack={back} />;
  else if (route === "ingredientInfo") content = <IngredientInfoScreen name={params.name} onBack={back} />;
  else if (route === "manufactureHistory") content = <ManufactureHistoryScreen onBack={back} />;
  else if (tab === "today") content = <TodayTab go={go} />;
  else if (tab === "plan") content = <MealPlanTab />;
  else if (tab === "stock") content = <StockTab go={go} />;
  else if (tab === "record") content = <RecordTab go={go} />;
  else content = <MoreTab go={go} />;

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif", zoom: fontScale }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", position: "relative" }}>
        {content}

        {!route && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20 }}>
            <div style={{ maxWidth: 480, margin: "0 auto", background: "rgba(250,247,241,0.92)", backdropFilter: "blur(8px)", borderTop: `1px solid ${C.border}`, padding: "10px 8px calc(10px + env(safe-area-inset-bottom))", display: "flex", justifyContent: "space-around" }}>
              {TABS.map((t) => {
                const active = t.key === tab;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)} className="flex flex-col items-center" style={{ gap: 3, background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>
                    <div style={{ position: "relative" }}>
                      {active && <div style={{ position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: 2, background: C.sage }} />}
                      <t.icon size={20} color={active ? C.sageDeep : C.muted} strokeWidth={active ? 2.4 : 1.8} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? C.sageDeep : C.muted }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   Firebase 연동 — 로그인 · 가족(공유 그룹) · 클라우드 저장
   - Google 로그인 후, 가족을 새로 만들거나 6자리 초대 코드로 합류
   - 가족 문서(families/{familyId})의 state 필드를 실시간 구독·저장
   ===================================================================== */
function genInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I 제외
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function CenterMessage({ text }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{text}</span>
    </div>
  );
}

function LoginScreen({ onLogin, busy, error }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24, fontFamily: "'Noto Sans KR', sans-serif", gap: 22 }}>
      <style>{FONT_IMPORT}</style>
      <CubeMark size={40} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Gowun Dodum', sans-serif", fontSize: 22, color: C.ink, marginBottom: 6 }}>베이비큐브</div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>로그인하면 데이터가 계정에 안전하게 저장되고,<br />배우자와 실시간으로 공유할 수 있습니다.</div>
      </div>
      <button onClick={onLogin} disabled={busy} className="flex items-center justify-center" style={{ gap: 9, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 24px", fontSize: 13.5, fontWeight: 700, color: C.ink, cursor: busy ? "default" : "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
        </svg>
        {busy ? "로그인 중..." : "Google로 로그인"}
      </button>
      {error && <span style={{ fontSize: 11.5, color: C.apricot, textAlign: "center" }}>{error}</span>}
    </div>
  );
}

function FamilySetupScreen({ user, onDone, onLogout }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const create = async () => {
    setBusy(true); setErr("");
    try {
      let fid = genInviteCode();
      for (let i = 0; i < 5; i++) {
        const exists = (await getDoc(doc(db, "families", fid))).exists();
        if (!exists) break;
        fid = genInviteCode();
      }
      await setDoc(doc(db, "families", fid), {
        ownerUid: user.uid,
        members: [user.uid],
        memberInfo: { [user.uid]: { name: user.displayName || "", email: user.email || "" } },
        createdAt: Date.now(),
        state: seedState(),
      });
      await setDoc(doc(db, "users", user.uid), { familyId: fid }, { merge: true });
      onDone(fid);
    } catch (e) {
      setErr("가족 생성에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    const fid = code.trim().toUpperCase();
    if (fid.length < 4) { setErr("초대 코드를 확인해 주세요."); return; }
    setBusy(true); setErr("");
    try {
      const ref = doc(db, "families", fid);
      const snap = await getDoc(ref);
      if (!snap.exists()) { setErr("해당 코드의 가족을 찾을 수 없습니다."); setBusy(false); return; }
      const data = snap.data();
      const members = (data.members || []).includes(user.uid) ? data.members : [...(data.members || []), user.uid];
      await updateDoc(ref, {
        members,
        [`memberInfo.${user.uid}`]: { name: user.displayName || "", email: user.email || "" },
      });
      await setDoc(doc(db, "users", user.uid), { familyId: fid }, { merge: true });
      onDone(fid);
    } catch (e) {
      setErr("합류에 실패했습니다. 코드를 다시 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24, fontFamily: "'Noto Sans KR', sans-serif", gap: 20 }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Gowun Dodum', sans-serif", fontSize: 20, color: C.ink, marginBottom: 6 }}>{user.displayName || user.email}님, 환영합니다</div>
        <div style={{ fontSize: 12, color: C.muted }}>가족 그룹을 새로 만들거나, 받은 초대 코드로 합류하세요.</div>
      </div>

      {!mode && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320 }}>
          <button onClick={() => setMode("create")} style={primaryBtn}>새 가족 만들기</button>
          <button onClick={() => setMode("join")} style={{ ...primaryBtn, background: C.sageLight, color: C.sageDeep }}>초대 코드로 합류하기</button>
        </div>
      )}

      {mode === "create" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320 }}>
          <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center", lineHeight: 1.5 }}>가족을 만들면 6자리 초대 코드가 생성됩니다.<br />그 코드를 배우자분에게 공유해 주세요.</div>
          <button onClick={create} disabled={busy} style={primaryBtn}>{busy ? "만드는 중..." : "가족 만들기"}</button>
          <button onClick={() => { setMode(null); setErr(""); }} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>뒤로</button>
        </div>
      )}

      {mode === "join" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320 }}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="초대 코드 6자리" maxLength={8}
            style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 14px", fontSize: 16, fontWeight: 700, letterSpacing: 2, textAlign: "center", color: C.ink, outline: "none" }} />
          <button onClick={join} disabled={busy} style={primaryBtn}>{busy ? "확인 중..." : "합류하기"}</button>
          <button onClick={() => { setMode(null); setErr(""); }} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>뒤로</button>
        </div>
      )}

      {err && <span style={{ fontSize: 11.5, color: C.apricot, textAlign: "center" }}>{err}</span>}
      <button onClick={onLogout} style={{ background: "none", border: "none", color: C.muted, fontSize: 11.5, cursor: "pointer", marginTop: 10 }}>다른 계정으로 로그인</button>
    </div>
  );
}

function FamilyStoreProvider({ familyId, user, onLogout }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => seedState());
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState({ members: [], memberInfo: {}, ownerUid: null });
  const [syncError, setSyncError] = useState(false);
  // lastSyncedRef: 마지막으로 로컬↔원격이 일치했던 state 객체(전체) - 다음 저장 시 "무엇이 바뀌었는지" 비교하는 기준점
  const lastSyncedRef = useRef(null);
  // stateRef: 최신 state를 항상 가리키는 ref - retry 등 이벤트 리스너 콜백이 오래된 클로저 값을 참조하지 않도록 함
  const stateRef = useRef(state);
  stateRef.current = state;
  // pendingRef: 현재 진행 중인 저장 요청(Promise). 동시에 두 개 이상의 updateDoc 요청이 겹치면,
  // 먼저 실패한 요청의 lastSyncedRef 롤백이 나중에 성공한 요청의 동기화 기록을 덮어써서
  // "실제로는 저장 안 된 변경이 동기화된 것으로 착각"하는 레이스가 생길 수 있어 항상 순차적으로만 보냄.
  const pendingRef = useRef(null);
  // queuedRef: 진행 중인 요청이 끝난 뒤, 그 사이 바뀐 최신 state로 한 번 더 동기화가 필요한지
  const queuedRef = useRef(false);

  useEffect(() => {
    const famRef = doc(db, "families", familyId);
    const unsub = onSnapshot(famRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const migrated = migrateState(data.state);
      lastSyncedRef.current = migrated;
      dispatch({ type: "HYDRATE", state: migrated });
      setMeta({ members: data.members || [], memberInfo: data.memberInfo || {}, ownerUid: data.ownerUid });
      setReady(true);
    });
    return unsub;
  }, [familyId]);

  // 로컬 state 중 마지막 동기화 시점과 달라진 최상위 항목(재고/식단/기록 등)만 골라
  // "state.항목명" 경로로 부분 업데이트함. 예: 내가 재고만 바꿨다면 state.stock만 보내고,
  // 배우자가 그 사이 식단(state.plans)만 바꿔서 먼저 저장했더라도 그 값은 건드리지 않음.
  // (기존에는 state 전체를 통째로 덮어써서, 서로 다른 항목을 거의 동시에 바꾸면 한쪽이 사라질 수 있었음)
  const syncToCloud = () => {
    if (pendingRef.current) {
      // 이미 저장 요청이 진행 중이면 새 요청을 겹쳐 보내지 않고, 그 요청이 끝난 뒤
      // 최신 state 기준으로 다시 한번 동기화하도록 예약만 해둠 (요청 순차 처리)
      queuedRef.current = true;
      return;
    }
    const current = stateRef.current;
    const prevSynced = lastSyncedRef.current;
    const changedKeys = Object.keys(current).filter(
      (k) => JSON.stringify(current[k]) !== JSON.stringify(prevSynced ? prevSynced[k] : undefined)
    );
    if (changedKeys.length === 0) return;
    const updates = {};
    changedKeys.forEach((k) => { updates[`state.${k}`] = current[k]; });
    lastSyncedRef.current = current;
    pendingRef.current = updateDoc(doc(db, "families", familyId), updates)
      .then(() => setSyncError(false))
      .catch((err) => {
        console.error("Firestore 저장 실패:", err);
        // 저장이 실패하면 다음 변경 시 재시도될 수 있도록 되돌려 둠 (조용히 유실되는 것 방지)
        lastSyncedRef.current = prevSynced;
        setSyncError(true);
      })
      .finally(() => {
        pendingRef.current = null;
        if (queuedRef.current) {
          queuedRef.current = false;
          syncToCloud(); // 진행 중이던 요청이 끝나는 사이 쌓인 변경사항을 최신 state 기준으로 다시 동기화
        }
      });
  };

  useEffect(() => {
    if (!ready) return; // 최초 원격 데이터 수신 전에는 로컬 seed로 덮어쓰지 않음
    syncToCloud();
  }, [state, ready, familyId]);

  // 네트워크가 복구되면 마지막으로 실패했던 저장을 다시 시도
  useEffect(() => {
    const retry = () => { if (ready) syncToCloud(); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [ready, familyId]);

  const leaveFamily = async () => {
    const ref = doc(db, "families", familyId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const members = (snap.data().members || []).filter((u) => u !== user.uid);
      await updateDoc(ref, { members });
    }
    await setDoc(doc(db, "users", user.uid), { familyId: null }, { merge: true });
    window.location.reload();
  };

  const [toast, setToast] = useState(null); // { id, message, onUndo }
  const notify = (message, onUndo, duration = 5000) => {
    const id = uid();
    setToast({ id, message, onUndo });
    setTimeout(() => {
      setToast((t) => (t && t.id === id ? null : t));
    }, duration);
  };

  if (!ready) return <CenterMessage text="데이터를 불러오는 중..." />;

  return (
    <Store.Provider value={{ state, dispatch, cloud: { familyId, user, meta, leaveFamily, logout: onLogout }, notify }}>
      <Shell />
      {syncError && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 70, background: C.apricot, color: "#fff", fontSize: 12, fontWeight: 700, textAlign: "center", padding: "8px 12px" }}>
          저장에 실패했어요. 인터넷 연결을 확인해 주세요. 연결되면 자동으로 다시 저장을 시도합니다.
        </div>
      )}
      {toast && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 90, display: "flex", justifyContent: "center", zIndex: 50, padding: "0 18px", pointerEvents: "none" }}>
          <div className="flex items-center justify-between" style={{ gap: 14, maxWidth: 480, width: "100%", background: C.charcoal, borderRadius: 12, padding: "12px 14px", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", pointerEvents: "auto" }}>
            <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 600 }}>{toast.message}</span>
            {toast.onUndo && (
              <button onClick={() => { toast.onUndo(state); setToast(null); }}
                style={{ background: "none", border: "none", color: C.butter, fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>실행취소</button>
            )}
          </div>
        </div>
      )}
    </Store.Provider>
  );
}

function AuthGate() {
  const [user, setUser] = useState(undefined); // undefined=확인중, null=로그아웃
  const [familyId, setFamilyId] = useState(undefined); // undefined=확인중, null=없음
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setBusy(false);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        setFamilyId(snap.exists() ? (snap.data().familyId || null) : null);
      } else {
        setFamilyId(undefined);
      }
    });
    return unsub;
  }, []);

  const login = async () => {
    setError(""); setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError("로그인에 실패했습니다. 다시 시도해 주세요.");
      setBusy(false);
    }
  };
  const logout = () => signOut(auth);

  if (user === undefined) return <CenterMessage text="불러오는 중..." />;
  if (!user) return <LoginScreen onLogin={login} busy={busy} error={error} />;
  if (familyId === undefined) return <CenterMessage text="불러오는 중..." />;
  if (!familyId) return <FamilySetupScreen user={user} onDone={setFamilyId} onLogout={logout} />;
  return <FamilyStoreProvider familyId={familyId} user={user} onLogout={logout} />;
}

/* ----------------------------- 에러 바운더리 ----------------------------- */
// reducer나 렌더링 중 예기치 못한 오류가 나도 흰 화면 대신 복구 UI를 보여줌
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("앱 오류:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24, fontFamily: "'Noto Sans KR', sans-serif", gap: 14, textAlign: "center" }}>
          <style>{FONT_IMPORT}</style>
          <CubeMark size={36} />
          <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>문제가 발생했어요</div>
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, maxWidth: 280 }}>
            화면을 표시하는 중 오류가 발생했습니다. 저장된 데이터는 안전하니 새로고침해 주세요.
          </div>
          <button onClick={() => window.location.reload()} style={{ ...primaryBtn, width: "auto", padding: "10px 28px" }}>새로고침</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ----------------------------- 데모 모드 (스크린샷용, 임시) ----------------------------- */
// URL에 ?demo 를 붙이면 로그인 없이 데모 데이터로 앱을 보여줌. Firebase에 아무것도 저장하지 않음.
function demoState() {
  const s = seedState();
  const t = todayISO();
  const mk = (label, time, items, intakeG) => ({ id: uid(), label, time, items, intakeG, planSnapshot: null });
  const fz = (name, qty, unitG = 15) => ({ name, source: "frozen", qty, unitG, deduct: true });
  const menus = [
    [fz("죽", 4, 20), fz("소고기", 1), fz("브로콜리", 1)],
    [fz("죽", 4, 20), fz("닭고기", 1), fz("애호박", 1)],
    [fz("죽", 4, 20), fz("소고기", 1), fz("단호박", 1)],
    [fz("죽", 4, 20), fz("대구살", 1), fz("당근", 1)],
    [fz("죽", 4, 20), fz("닭고기", 1), fz("청경채", 1)],
    [fz("죽", 4, 20), fz("소고기", 1), fz("시금치", 1)],
  ];
  const totalG = (items) => items.reduce((s2, it) => s2 + it.qty * it.unitG, 0);
  const logs = {};
  for (let d = 13; d >= 1; d--) {
    const iso = addDaysISO(t, -d);
    const ratios = [[0.95, 1], [0.8, 0.9], [1, 0.75]];
    logs[iso] = [
      mk("아침", "07:00", menus[d % menus.length], Math.round(totalG(menus[d % menus.length]) * ratios[0][d % 2])),
      mk("점심", "12:00", menus[(d + 2) % menus.length], Math.round(totalG(menus[(d + 2) % menus.length]) * ratios[1][d % 2])),
      mk("저녁", "18:00", menus[(d + 4) % menus.length], Math.round(totalG(menus[(d + 4) % menus.length]) * ratios[2][d % 2])),
    ];
  }
  logs[t] = [mk("아침", "07:00", [fz("죽", 4, 20), fz("소고기", 1), fz("브로콜리", 1), fz("애호박", 1)], 118)];
  return { ...s, logs, members: ["엄마", "아빠"], baby: { name: "", sex: "남아", birth: "2025-10-08" } };
}

function DemoProvider() {
  const [state, dispatch] = useReducer(reducer, undefined, () => demoState());
  // 실제 앱과 동일하게 토스트 알림 표시 (데모에서도 저장/삭제 피드백 확인 가능)
  const [toast, setToast] = useState(null);
  const notify = (message, onUndo, duration = 5000) => {
    const id = uid();
    setToast({ id, message, onUndo });
    setTimeout(() => setToast((tv) => (tv && tv.id === id ? null : tv)), duration);
  };
  const cloud = {
    familyId: "demo",
    user: { uid: "demo", displayName: "데모", email: "demo@babycube.app" },
    meta: { members: ["demo"], memberInfo: { demo: { name: "데모" } }, ownerUid: "demo" },
    leaveFamily: () => {},
    logout: () => {},
  };
  return (
    <Store.Provider value={{ state, dispatch, cloud, notify }}>
      <Shell />
      {toast && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 90, display: "flex", justifyContent: "center", zIndex: 50, padding: "0 18px", pointerEvents: "none" }}>
          <div className="flex items-center justify-between" style={{ gap: 14, maxWidth: 480, width: "100%", background: C.charcoal, borderRadius: 12, padding: "12px 14px", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", pointerEvents: "auto" }}>
            <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 600 }}>{toast.message}</span>
            {toast.onUndo && (
              <button onClick={() => { toast.onUndo(state); setToast(null); }}
                style={{ background: "none", border: "none", color: C.butter, fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>실행취소</button>
            )}
          </div>
        </div>
      )}
    </Store.Provider>
  );
}

export default function App() {
  const isDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");
  return (
    <ErrorBoundary>
      {isDemo ? <DemoProvider /> : <AuthGate />}
    </ErrorBoundary>
  );
}
