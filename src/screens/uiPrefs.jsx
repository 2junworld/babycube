/* 화면 UI 상태·기기 저장 설정 (서브탭 기억, 뷰 토글 등) */
import React, { useState } from "react";

// 탭 내부 화면 상태(서브탭·뷰 선택)를 세션 동안 기억 - 하위 화면(재료 정보 등)에 다녀와도
// 탭이 리셋되지 않고 보던 화면으로 복귀하도록 함
export const UI_STATE = { recordView: "table", recordTableRange: "week", stockSubTab: "stock" };

// 재고 탭 정렬·표시 설정을 기기에 저장 (탭 이동·앱 재시작 후에도 유지)
export function readStockPref(key, fallback, validKeys) {
  try {
    const v = localStorage.getItem(key);
    return v && validKeys.includes(v) ? v : fallback;
  } catch { return fallback; }
}

export function writeStockPref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 저장 불가 환경이면 무시 */ }
}

// 심플뷰/디테일뷰 토글 상태 - 기본 심플, 선택값은 기기에 저장되어 유지 (UX-2)
export function useDetailView(storageKey) {
  const [detail, setDetailRaw] = useState(() => readStockPref(storageKey, "simple", ["simple", "detail"]) === "detail");
  const setDetail = (updater) => setDetailRaw((v) => {
    const nv = typeof updater === "function" ? updater(v) : updater;
    writeStockPref(storageKey, nv ? "detail" : "simple");
    return nv;
  });
  return [detail, setDetail];
}
