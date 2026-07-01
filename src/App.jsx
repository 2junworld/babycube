import React, { useState, useEffect, useReducer, useMemo, useRef, createContext, useContext } from "react";
import {
  Home, CalendarDays, Package, LineChart as LineChartIcon, Menu,
  ChevronLeft, ChevronRight, Plus, Minus, Trash2, Pencil, X, Check,
  Refrigerator, Snowflake, ShoppingCart, Settings2, Users, Plane, Clock,
  AlertTriangle, Search,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
} from "recharts";
import { db, auth, googleProvider } from "./firebase";
import { doc, setDoc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

/* ============================================================================
   이유식 공유 앱 (베이비큐브) — 단일 기기 완전 동작 버전
   - 모든 데이터는 useReducer 스토어 + localStorage 영속 저장
   - 부부 공유/배포는 동봉된 가이드 문서(Firebase) 참고
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
const uid = () => Math.random().toString(36).slice(2, 9);

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
    stock, plans, logs, intros,
    shopping: [
      { id: uid(), name: "새송이버섯", reason: "식단표 추가 (재고없음)", done: false },
    ],
    settings: { timeFmt: "24h", frozenAlertDays: 3, fridgeAlertDays: 1, fridgeKeepDays: 2, fontScale: 1 },
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

/* -------------------------------- 영속 저장 -------------------------------- */
const STORAGE_KEY = "babycube_state_v1";
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
  return out;
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrateState(JSON.parse(raw));
  } catch (e) { /* ignore */ }
  return seedState();
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
        : { ...state.ingredients, [name]: { cat: action.cat || "채소", unitG: batch.unitG } };
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
      // 재고 차감: 선입선출
      let stock = JSON.parse(JSON.stringify(state.stock));
      log.items.forEach((it) => {
        if (it.source === "fridge") {
          deductFridge(stock, it.name, it.qty); // qty=g
        } else {
          deductFrozen(stock, it.name, it.qty); // qty=큐브
        }
      });
      const dayLogs = state.logs[date] ? [...state.logs[date]] : [];
      const idx = dayLogs.findIndex((l) => l.id === log.id);
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

    /* ---- 재료 마스터에 카테고리 지정하여 등록 (신규 재료 추가시) ---- */
    case "INGREDIENT_ENSURE": {
      const { name, cat } = action;
      if (!name || state.ingredients[name]) return state;
      return { ...state, ingredients: { ...state.ingredients, [name]: { cat: cat || "채소", unitG: 15 } } };
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
function stockTotalCubes(state, name) {
  return stockBatches(state, name).reduce((s, b) => s + b.frozen, 0);
}
function stockTotalFrozenG(state, name) {
  return stockBatches(state, name).reduce((s, b) => s + b.frozen * b.unitG, 0);
}
function stockFridgeG(state, name) {
  return stockBatches(state, name).reduce((s, b) => s + (b.fridgeG || 0), 0);
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

/* ----------------------------- 공통 계산 헬퍼 ----------------------------- */
function catOf(state, name) {
  return (state.ingredients[name] || SEED_INGREDIENTS[name] || { cat: "채소" }).cat;
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
function ageText(birthISO) {
  const birth = new Date((birthISO || "2025-10-08") + "T00:00:00");
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  return `생후 ${Math.max(0, months)}개월`;
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
      const prov = log.items.reduce((s, it) => s + (it.source === "fridge" ? it.qty : it.qty * it.unitG), 0);
      const pct = prov ? Math.round((log.intakeG / prov) * 100) : 0;
      rows.push([date, log.label, log.time, prov, log.intakeG, pct]);
    });
  });
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

/* --------------------------- 스토어 컨텍스트 --------------------------- */
const Store = createContext(null);
const useStore = () => useContext(Store);

function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }, [state]);
  return <Store.Provider value={{ state, dispatch }}>{children}</Store.Provider>;
}

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
            <span style={{ fontSize: 12, color: C.muted }}>{it.gramsOverride != null ? `${gOf(state, it)}g` : `${it.qty}큐브 (${gOf(state, it)}g)`}</span>
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
function NumInput({ value, onChange, width = 46, suffix, placeholder = "0", min }) {
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
          if (!Number.isNaN(n)) onChange(n);
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
function ConfirmModal({ title, message, confirmLabel = "삭제", danger = true, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, borderRadius: 18, padding: "20px 18px", width: "100%", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: message ? 6 : 16 }}>{title}</div>
        {message && <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 16, lineHeight: 1.5 }}>{message}</div>}
        <div className="flex items-center" style={{ gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, background: C.sageLight, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.inkSoft, cursor: "pointer" }}>취소</button>
          <button onClick={onConfirm} style={{ flex: 1, background: danger ? C.apricot : C.sage, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: "#fff", cursor: "pointer" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   재료 선택 모달
   ===================================================================== */
function IngredientPicker({ onPick, onClose }) {
  const { state, dispatch } = useStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("전체");
  const [newCat, setNewCat] = useState("채소");
  const names = Object.keys(state.ingredients);
  const filtered = sortByCategory(state, names.filter((n) =>
    (cat === "전체" || catOf(state, n) === cat) && n.includes(q)
  ), (n) => n);
  const isNew = q && !names.includes(q);

  const confirmNew = () => {
    dispatch({ type: "INGREDIENT_ENSURE", name: q, cat: newCat });
    onPick(q, newCat);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", maxHeight: "78%", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 18px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>재료 선택</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ padding: "0 18px 10px" }}>
          <div className="flex items-center" style={{ gap: 7, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 11px", marginBottom: 9 }}>
            <Search size={15} color={C.muted} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="재료 검색 또는 새 재료 입력"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: C.ink, width: "100%" }} />
          </div>
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
            {["전체", ...CATEGORIES].map((c) => (
              <button key={c} onClick={() => setCat(c)} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                border: "none", background: cat === c ? C.sage : C.sageLight, color: cat === c ? "#fff" : C.sageDeep }}>{c}</button>
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
              <button onClick={confirmNew} style={{ ...primaryBtn, padding: "9px 0", fontSize: 12.5 }}>'{q}' 추가하기</button>
            </div>
          )}
          {filtered.map((n) => {
            const cubes = stockTotalCubes(state, n), fg = stockFridgeG(state, n);
            return (
              <button key={n} onClick={() => onPick(n)} className="flex items-center justify-between" style={{ width: "100%", padding: "11px 12px",
                borderBottom: `1px solid ${C.border}`, background: "transparent", border: "none", borderBottomStyle: "solid", cursor: "pointer" }}>
                <div className="flex items-center"><CatDot name={n} size={8} /><span style={{ fontSize: 13, color: C.ink }}>{n}</span></div>
                <span style={{ fontSize: 11, color: cubes || fg ? C.muted : C.apricot }}>
                  {cubes || fg ? `냉동 ${cubes}${fg ? ` · 냉장 ${fg}g` : ""}` : "재고없음"}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && !isNew && (
            <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12, color: C.muted }}>검색 결과가 없습니다</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   끼니 시간 선택기
   ===================================================================== */
function TimePicker({ time, setTime, timeFmt }) {
  const [h0, m0] = time.split(":").map(Number);
  const setH = (h24) => setTime(`${String(h24).padStart(2, "0")}:${String(m0).padStart(2, "0")}`);
  const setM = (mm) => setTime(`${String(h0).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px" }}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>끼니 시간</span>
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
  const addItem = (name) => {
    setPicker(false);
    setItems((p) => p.some((it) => it.name === name) ? p : [...p, { name, qty: 1, unitG: unitGOf(state, name), gramsOverride: null }]);
  };
  const total = totalG(state, items);

  const pickSlot = (slotLabel, slotTime) => {
    setLabel(slotLabel);
    if (slotTime) setTime(slotTime); // 미리 정해둔 시간으로 자동 입력 (이후 직접 수정 가능)
    setSlotPicker(false);
  };

  const save = () => {
    if (!label) return;
    dispatch({ type: "PLAN_SAVE_MEAL", date, meal: { id: meal.id || uid(), label, time, items: items.map(({ name, qty, unitG, gramsOverride }) => ({ name, qty, unitG, gramsOverride: gramsOverride != null ? gramsOverride : null })) } });
    onBack();
  };

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title={meal.id ? "끼니 수정" : "새 끼니 추가"} onBack={onBack} />

      <div style={{ position: "sticky", top: 0, zIndex: 15, background: C.bg, padding: "0 18px 10px" }}>
        <div className="flex items-center justify-between" style={{ padding: "0 2px 8px" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{date} ({WD[new Date(date + "T00:00:00").getDay()]})</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: label ? C.sageDeep : C.muted }}>{label || "끼니 선택 전"}</span>
        </div>
        <div style={{ background: C.sageLight, borderRadius: 14, padding: 14, boxShadow: "0 4px 10px rgba(0,0,0,0.05)" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 9 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.sageDeep }}>끼니 총량</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: C.sageDeep }}>{total}g</span>
          </div>
          <CategoryBar items={items} height={8} />
        </div>
      </div>

      <div style={{ padding: "0 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        <button onClick={() => setSlotPicker(true)} className="flex items-center justify-between" style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", cursor: "pointer" }}>
          <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>끼니 종류</span>
          <span className="flex items-center" style={{ gap: 5, fontSize: 13, fontWeight: 700, color: label ? C.ink : C.muted }}>{label || "선택"} <ChevronRight size={14} color={C.muted} /></span>
        </button>
        <TimePicker time={time} setTime={setTime} timeFmt={timeFmt} />

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

        <button onClick={save} style={primaryBtn}>저장</button>
      </div>
      {picker && <IngredientPicker onPick={addItem} onClose={() => setPicker(false)} />}
      {slotPicker && <MealSlotPicker slots={state.mealSlots} timeFmt={timeFmt} onPick={pickSlot} onClose={() => setSlotPicker(false)} />}
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
  const [monthCursor, setMonthCursor] = useState(initialCursor);
  const [selectedDates, setSelectedDates] = useState([]);
  const [result, setResult] = useState(null); // { applied, skipped }

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
  const addItem = (name) => {
    setPicker(false);
    setItems((p) => p.some((it) => it.name === name) ? p : [...p, { name, qty: 1, unitG: unitGOf(state, name), gramsOverride: null }]);
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
            <span style={{ fontSize: 11.5, color: C.sageDeep, fontWeight: 700 }}>{selectedDates.length}일 선택됨</span>
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
      {picker && <IngredientPicker onPick={addItem} onClose={() => setPicker(false)} />}
      {slotPicker && <MealSlotPicker slots={state.mealSlots} timeFmt={timeFmt} onPick={pickSlot} onClose={() => setSlotPicker(false)} />}
    </div>
  );
}

/* =====================================================================
   급여 기록 화면 (실제 먹인 끼니 → 재고 차감 + 섭취율)
   ===================================================================== */
function FeedingLogScreen({ date, planMeal, existingLog, onBack }) {
  const { state, dispatch } = useStore();
  const base = existingLog || planMeal;
  const [time] = useState(base.time || "12:00");
  const [label] = useState(base.label || "끼니");
  // 제공 항목: 출처(냉동/냉장) + 수량
  const [items, setItems] = useState(
    base.items.map((it) => {
      const hasFridge = stockFridgeG(state, it.name) > 0;
      return { name: it.name, source: hasFridge && it.name !== "죽" ? "fridge" : "frozen",
        qty: it.qty || 1, fridgeG: it.unitG ? it.unitG * (it.qty || 1) : 15, unitG: it.unitG != null ? it.unitG : unitGOf(state, it.name) };
    })
  );
  const [picker, setPicker] = useState(false);
  const [intake, setIntake] = useState(existingLog ? existingLog.intakeG : null);

  const provideG = (it) => it.source === "fridge" ? it.fridgeG : it.qty * it.unitG;
  const totalProvide = items.reduce((s, it) => s + provideG(it), 0);

  const setSource = (name, src) => setItems((p) => p.map((it) => it.name === name ? { ...it, source: src } : it));
  const upQty = (name, d) => setItems((p) => p.map((it) => it.name === name ? { ...it, qty: Math.max(1, it.qty + d) } : it));
  const upFridge = (name, v) => setItems((p) => p.map((it) => it.name === name ? { ...it, fridgeG: v } : it));
  const rm = (name) => setItems((p) => p.filter((it) => it.name !== name));
  const addItem = (name) => { setPicker(false); setItems((p) => p.some((it) => it.name === name) ? p : [...p, { name, source: "frozen", qty: 1, fridgeG: 15, unitG: unitGOf(state, name) }]); };

  const quick = [["완식", 1], ["3/4", 0.75], ["절반", 0.5], ["조금", 0.25], ["거부", 0]];

  const save = () => {
    const logItems = items.map((it) => it.source === "fridge"
      ? { name: it.name, source: "fridge", qty: it.fridgeG, unitG: 1 }
      : { name: it.name, source: "frozen", qty: it.qty, unitG: it.unitG });
    dispatch({ type: "LOG_SAVE", date, log: { id: existingLog ? existingLog.id : uid(), label, time, items: logItems, intakeG: intake == null ? totalProvide : intake } });
    onBack();
  };

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title={`${label} 급여 기록`} onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600, padding: "0 2px" }}>
          {fmtTime(time, state.settings.timeFmt)} · 꺼낸 재료가 재고에서 차감됩니다
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
                    <span style={{ fontSize: 10.5, color: C.muted }}>큐브당 {it.unitG}g</span>
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

        <button onClick={save} style={primaryBtn}>기록 저장</button>
      </div>
      {picker && <IngredientPicker onPick={addItem} onClose={() => setPicker(false)} />}
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
          const provided = m.log ? m.log.items.reduce((s, it) => s + (it.source === "fridge" ? it.qty : it.qty * it.unitG), 0) : total;
          return (
            <div key={m.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{m.label}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>{fmtTime(m.time, timeFmt)}</span>
                </div>
                <StatusBadge status={m.status} />
              </div>
              {detail ? <div style={{ marginBottom: 9 }}><IngredientTable items={m.items} /></div> : <div style={{ marginBottom: 9 }}><MealItemList items={m.items} fontSize={12} wrap /></div>}
              <CategoryBar items={m.items} />
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
      batch: { date, unitG: Number(unitG), frozen: Number(frozen), fridgeG: Number(fridgeG),
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
function StockTab({ go }) {
  const { state } = useStore();
  const [batchModal, setBatchModal] = useState(false);
  const names = Object.keys(state.stock).filter((n) => stockTotalCubes(state, n) > 0 || stockFridgeG(state, n) > 0);
  const sorted = names.sort((a, b) => {
    const da = daysLeft(state, a), db = daysLeft(state, b);
    return (da == null ? 99 : da) - (db == null ? 99 : db);
  });

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <ScreenHeader title="재고" right={<button onClick={() => go("shopping")} style={{ background: "none", border: "none", cursor: "pointer" }}><ShoppingCart size={18} color={C.inkSoft} /></button>} />
      <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map((name) => {
          const cubes = stockTotalCubes(state, name), fg = stockFridgeG(state, name);
          const fgGrams = stockTotalFrozenG(state, name);
          const dl = daysLeft(state, name);
          return (
            <button key={name} onClick={() => go("stockDetail", { name })} className="flex flex-col" style={{ width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${fg > 0 ? C.apricot : C.border}`, borderRadius: 16, padding: 14, cursor: "pointer" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <div className="flex items-center"><CatDot name={name} size={8} /><span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{name}</span></div>
                <div className="flex items-center" style={{ gap: 6 }}>
                  {fg > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.apricot }}>냉장 소진 임박</span>}
                  <ChevronRight size={15} color={C.muted} />
                </div>
              </div>
              <div className="flex items-center justify-between" style={{ marginBottom: fg > 0 ? 8 : 0 }}>
                <div className="flex items-center" style={{ gap: 9 }}><Snowflake size={14} color={C.sageDeep} /><CubeGrid filled={cubes} total={10} /></div>
                <span style={{ fontSize: 11.5, color: C.muted }}>{cubes}큐브 ({fgGrams}g){dl != null ? ` · ~${dl}일` : ""}</span>
              </div>
              {fg > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: 9 }}><Refrigerator size={14} color={C.apricot} /><span style={{ fontSize: 12, color: C.inkSoft }}>냉장 보관</span></div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.apricot }}>{fg}g</span>
                </div>
              )}
            </button>
          );
        })}
        {sorted.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted }}>재고가 없습니다. 제조 기록을 추가해 보세요.</div>}
        <button onClick={() => setBatchModal(true)} className="flex items-center justify-center" style={{ gap: 7, background: C.sage, border: "none", borderRadius: 14, padding: "13px 0", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", marginTop: 4 }}>
          <Plus size={15} /> 제조 기록 추가
        </button>
      </div>
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
        const prov = log.items.reduce((s, it) => s + (it.source === "fridge" ? it.qty : it.qty * it.unitG), 0);
        provSum += prov; intSum += log.intakeG;
      });
    }
    out.push({ week: addDaysISO(t, -(w * 7 + 6)).slice(5), rate: provSum ? Math.round((intSum / provSum) * 100) : null });
  }
  return out;
}

/* 월간 리포트: 급여 횟수 · 평균 섭취율 · 카테고리별 추정 섭취 비율(제공량 × 전체 섭취율) */
function monthStats(state, year, month) {
  const catTotals = { 탄수화물: 0, 단백질: 0, 채소: 0, 과일: 0 };
  let totalProv = 0, totalIntake = 0, count = 0;
  Object.keys(state.logs).forEach((d) => {
    const dt = new Date(d + "T00:00:00");
    if (dt.getFullYear() !== year || dt.getMonth() !== month) return;
    (state.logs[d] || []).forEach((log) => {
      const prov = log.items.reduce((s, it) => s + (it.source === "fridge" ? it.qty : it.qty * it.unitG), 0);
      const rate = prov ? log.intakeG / prov : 0;
      totalProv += prov;
      totalIntake += log.intakeG;
      count += 1;
      log.items.forEach((it) => {
        const g = it.source === "fridge" ? it.qty : it.qty * it.unitG;
        const cat = catOf(state, it.name);
        catTotals[cat] = (catTotals[cat] || 0) + g * rate;
      });
    });
  });
  const avgRate = totalProv ? Math.round((totalIntake / totalProv) * 100) : null;
  return { count, totalProv: Math.round(totalProv), totalIntake: Math.round(totalIntake), avgRate, catTotals };
}

function RecordTab({ go }) {
  const { state, dispatch, notify } = useStore();
  const trend = weeklyRates(state).filter((x) => x.rate != null);
  const thisWeek = trend.length ? trend[trend.length - 1].rate : null;
  const lastWeek = trend.length > 1 ? trend[trend.length - 2].rate : null;
  const diff = thisWeek != null && lastWeek != null ? thisWeek - lastWeek : null;
  const [editIntro, setEditIntro] = useState(null); // null | 'new' | introObj
  const [delIntro, setDelIntro] = useState(null); // 삭제 확인 대상 introObj
  const [reportYM, setReportYM] = useState(() => { const t = todayISO(); return { y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) - 1 }; });

  const shiftReportMonth = (n) => setReportYM((p) => { const d = new Date(p.y, p.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const report = monthStats(state, reportYM.y, reportYM.m);
  const prevMonthDate = new Date(reportYM.y, reportYM.m - 1, 1);
  const prevReport = monthStats(state, prevMonthDate.getFullYear(), prevMonthDate.getMonth());
  const reportDiff = report.avgRate != null && prevReport.avgRate != null ? report.avgRate - prevReport.avgRate : null;

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
              const prov = log.items.reduce((s, it) => s + (it.source === "fridge" ? it.qty : it.qty * it.unitG), 0);
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
                    <Chip key={it.id} cat={it.cat} onClick={() => setEditIntro(it)} onDelete={() => setDelIntro(it)}>{it.name}</Chip>
                  ))}
                </div>
              </div>
            ))}
            {warnIntros.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: C.apricot, fontWeight: 700, marginBottom: 5 }}>⚠ 주의/중단</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {warnIntros.map((it) => (
                    <Chip key={it.id} tone="warn" onClick={() => setEditIntro(it)} onDelete={() => setDelIntro(it)}>{it.name}{it.memo ? ` — ${it.memo}` : ""}</Chip>
                  ))}
                </div>
              </div>
            )}
            {state.intros.length === 0 && <div style={{ textAlign: "center", fontSize: 11.5, color: C.muted }}>아직 기록된 재료가 없습니다</div>}
          </div>
        </div>
      </div>
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
              const prov = log.items.reduce((s, it) => s + (it.source === "fridge" ? it.qty : it.qty * it.unitG), 0);
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
          message="이 날짜의 급여 기록이 모두 삭제됩니다. 재고는 자동으로 복원되지 않습니다."
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
          message="재고는 자동으로 복원되지 않습니다."
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
   더보기 하위 화면들
   ===================================================================== */
function SettingsScreen({ onBack }) {
  const { state, dispatch } = useStore();
  const s = state.settings;
  const baby = state.baby;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const set = (key, value) => dispatch({ type: "SET_SETTING", key, value });
  const setBaby = (patch) => dispatch({ type: "BABY_SET", patch });
  const doReset = () => { dispatch({ type: "RESET" }); setConfirmingReset(false); };
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
        베이비큐브 · v1.0
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
  const lastSentRef = useRef(null);

  useEffect(() => {
    const famRef = doc(db, "families", familyId);
    const unsub = onSnapshot(famRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const migrated = migrateState(data.state);
      lastSentRef.current = JSON.stringify(migrated);
      dispatch({ type: "HYDRATE", state: migrated });
      setMeta({ members: data.members || [], memberInfo: data.memberInfo || {}, ownerUid: data.ownerUid });
      setReady(true);
    });
    return unsub;
  }, [familyId]);

  useEffect(() => {
    if (!ready) return; // 최초 원격 데이터 수신 전에는 로컬 seed로 덮어쓰지 않음
    const json = JSON.stringify(state);
    if (json === lastSentRef.current) return;
    lastSentRef.current = json;
    setDoc(doc(db, "families", familyId), { state }, { merge: true });
  }, [state, ready, familyId]);

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
  const notify = (message, onUndo) => {
    const id = uid();
    setToast({ id, message, onUndo });
    setTimeout(() => {
      setToast((t) => (t && t.id === id ? null : t));
    }, 5000);
  };

  if (!ready) return <CenterMessage text="데이터를 불러오는 중..." />;

  return (
    <Store.Provider value={{ state, dispatch, cloud: { familyId, user, meta, leaveFamily, logout: onLogout }, notify }}>
      <Shell />
      {toast && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 90, display: "flex", justifyContent: "center", zIndex: 50, padding: "0 18px", pointerEvents: "none" }}>
          <div className="flex items-center justify-between" style={{ gap: 14, maxWidth: 480, width: "100%", background: C.charcoal, borderRadius: 12, padding: "12px 14px", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", pointerEvents: "auto" }}>
            <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 600 }}>{toast.message}</span>
            <button onClick={() => { if (toast.onUndo) toast.onUndo(); setToast(null); }}
              style={{ background: "none", border: "none", color: C.butter, fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>실행취소</button>
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

export default function App() {
  return <AuthGate />;
}
