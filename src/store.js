/* 전역 스토어 컨텍스트 - state/dispatch/cloud/notify 공유 (C-2 파일 분리) */
import { createContext, useContext } from "react";

/* --------------------------- 스토어 컨텍스트 --------------------------- */
// 실제 앱은 Firebase 기반 FamilyStoreProvider(클라우드 동기화)만 사용합니다.
export const Store = createContext(null);

export const useStore = () => useContext(Store);
