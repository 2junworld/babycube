/* PWA 업데이트 감지·적용 - vite-plugin-pwa(registerType:'prompt')를 useRegisterSW로 직접 제어해
   자동 새로고침 대신 앱 안에서 "새 버전이 있어요" 배너로 사용자가 직접 적용하게 함 */
import React, { createContext, useContext, useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { C } from "./theme";

const PwaUpdateContext = createContext({ needRefresh: false, applyUpdate: () => {}, checkForUpdate: () => {} });

// 새 서비스 워커 확인 주기 - 탭을 오래 켜둬도 새 배포를 놓치지 않도록 1시간마다 자동 확인
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function PwaUpdateProvider({ children }) {
  const registrationRef = useRef(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      registrationRef.current = r || null;
    },
    onRegisterError(err) {
      console.error("서비스 워커 등록 실패:", err);
    },
  });

  useEffect(() => {
    const id = setInterval(() => registrationRef.current && registrationRef.current.update(), CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const checkForUpdate = () => { if (registrationRef.current) registrationRef.current.update(); };
  // waitFor: 업데이트 적용(=새로고침) 전에 끝나야 하는 진행 중 작업(예: Firestore 저장)이 있으면
  // 그 Promise를 넘겨받아 기다린 뒤 적용 - 새로고침이 진행 중인 저장 요청을 끊어버리는 것 방지
  const applyUpdate = async (waitFor) => {
    if (waitFor) { try { await waitFor(); } catch { /* 저장이 실패해도 업데이트 적용은 계속 진행 */ } }
    updateServiceWorker(true);
  };

  return (
    <PwaUpdateContext.Provider value={{ needRefresh, applyUpdate, checkForUpdate }}>
      {children}
    </PwaUpdateContext.Provider>
  );
}

export function usePwaUpdate() {
  return useContext(PwaUpdateContext);
}

// 새 버전이 있을 때만 나타나는 상단 배너. waitFor를 넘기면(Firestore 저장 중인 화면) 적용 전에
// 그 작업이 끝나길 기다림. 다른 상단 배너(동기화 오류 등)와 겹치지 않도록 zIndex/순서는 호출부에서 배치
export function UpdateBanner({ waitFor }) {
  const { needRefresh, applyUpdate } = usePwaUpdate();
  if (!needRefresh) return null;
  return (
    <button onClick={() => applyUpdate(waitFor)} className="flex items-center justify-center"
      style={{ width: "100%", border: "none", background: C.sageDeep, color: "#fff", fontSize: 12, fontWeight: 700, textAlign: "center", padding: "8px 12px", cursor: "pointer" }}>
      새 버전이 있어요 · 업데이트
    </button>
  );
}
