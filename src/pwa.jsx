/* PWA 업데이트 감지·적용 - vite-plugin-pwa(registerType:'prompt')를 useRegisterSW로 직접 제어해
   자동 새로고침 대신 앱 안에서 "새 버전이 있어요" 배너로 사용자가 직접 적용하게 함 */
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { C, primaryBtn } from "./theme";
import { BottomSheet } from "./components/common";
import { CHANGELOG } from "./changelog";

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
    const check = () => registrationRef.current && registrationRef.current.update();
    // 1시간 주기 확인은 앱을 계속 켜둔 채로 오래 두는 경우를 위한 최소한의 안전망일 뿐이고,
    // 실제로는 대부분 앱을 백그라운드에 뒀다가 다시 열 때(홈 화면 PWA) 그 시점에 바로 확인해야
    // "새로고침하기 전엔 업데이트 여부를 모른다"는 문제가 해결됨 - 포그라운드 복귀(visibilitychange)와
    // 창 포커스(focus, 데스크톱 탭 전환) 두 시점에도 즉시 확인하도록 추가
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      clearInterval(id);
    };
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

/* =====================================================================
   업데이트 완료 후 "이번 업데이트에서 달라진 점" 1회 안내 - 업데이트를 적용하기 전(구버전 실행 중)이
   아니라 적용된 직후(신버전이 이미 로드된 시점)에 보여준다. 그래야 지금 실행 중인 코드에 담긴
   CHANGELOG(changelog.js) 내용이 항상 실제로 반영된 최신 버전과 정확히 일치한다.
   기기별 localStorage에 마지막으로 본 버전을 남겨 버전이 바뀔 때만 1회 표시하고, 앱을 처음 쓰는
   경우(저장된 값이 아예 없음)는 "업데이트 안내"가 아니므로 조용히 버전만 기록하고 넘어간다 ---- */
const LAST_SEEN_VERSION_KEY = "bc_last_seen_version";

export function useWhatsNew() {
  const [entry, setEntry] = useState(null);
  useEffect(() => {
    const current = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null;
    if (!current) return;
    let last = null;
    try { last = localStorage.getItem(LAST_SEEN_VERSION_KEY); } catch { /* 저장소 접근 불가 시 매번 조용히 넘어감 */ }
    if (last !== current) {
      if (last) {
        const found = CHANGELOG.find((c) => c.version === current);
        if (found) setEntry(found);
      }
      try { localStorage.setItem(LAST_SEEN_VERSION_KEY, current); } catch { /* 저장 불가 환경이면 다음에도 다시 시도됨 */ }
    }
  }, []);
  return { entry, dismiss: () => setEntry(null) };
}

export function WhatsNewSheet() {
  const { entry, dismiss } = useWhatsNew();
  if (!entry) return null;
  return (
    <BottomSheet title={`v${entry.version} 업데이트`} onClose={dismiss}>
      <div style={{ padding: "0 18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12, color: C.muted }}>이번 업데이트에서 이런 점이 달라졌어요</div>
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {entry.notes.map((n, i) => <li key={i} style={{ fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{n}</li>)}
        </ul>
        <button onClick={dismiss} style={primaryBtn}>확인</button>
      </div>
    </BottomSheet>
  );
}
