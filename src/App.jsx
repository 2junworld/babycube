import React from "react";
import { AuthGate, DemoProvider, DemoFamilyFlow } from "./sync/providers";
import { C, FONT_IMPORT, primaryBtn } from "./theme";
import { CubeMark } from "./components/common";
import { PwaUpdateProvider } from "./pwa";
import GuidePage from "./screens/GuidePage";

/* ============================================================================
   이유식 공유 앱 (베이비큐브) — 앱 진입점
   - 모든 데이터는 useReducer 스토어(state/appState) + Firestore 실시간 동기화(sync/providers)
   - 화면은 screens/, 공용 UI는 components/, 계산 로직은 lib/ 참고 (C-2 파일 분리)
   ========================================================================== */

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

export default function App() {
  const demoParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("demo") : null;
  // /guide: 로그인 없이 바로 보는 설치·사용법 안내 페이지 (지인 공유용 고정 링크) - 인증·동기화
  // 레이어를 아예 거치지 않고 가장 먼저 분기해, 계정이 없어도 즉시 열림
  const pathname = typeof window !== "undefined" ? window.location.pathname.replace(/\/+$/, "") : "";
  if (pathname === "/guide") {
    return (
      <ErrorBoundary>
        <GuidePage />
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary>
      <PwaUpdateProvider>
        {demoParam === "family" ? <DemoFamilyFlow /> : demoParam != null ? <DemoProvider /> : <AuthGate />}
      </PwaUpdateProvider>
    </ErrorBoundary>
  );
}
