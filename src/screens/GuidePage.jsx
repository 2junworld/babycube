/* 설치·사용법 안내 페이지 - 로그인 없이 /guide 경로로 바로 접근 가능 (지인 공유용 고정 링크)
   설치 단계·사용법 카드 내용은 아래 데이터 배열만 바꾸면 되도록 구성 (유지보수 용이성) */
import React, { useState } from "react";
import { Share, MoreVertical, SquarePlus, CheckCircle2, ClipboardList, Package, CalendarDays, Snowflake } from "lucide-react";
import { C, FONT_IMPORT, primaryBtn } from "../theme";
import { CubeMark } from "../components/common";

const installSteps = {
  ios: [
    { icon: Share, text: "Safari 하단 공유 버튼 탭" },
    { icon: SquarePlus, text: "'홈 화면에 추가' 선택" },
    { icon: CheckCircle2, text: "완료! 홈 화면 아이콘으로 실행" },
  ],
  android: [
    { icon: MoreVertical, text: "Chrome 우측 상단 메뉴(⋮) 탭" },
    { icon: SquarePlus, text: "'홈 화면에 추가' 선택" },
    { icon: CheckCircle2, text: "완료! 홈 화면 아이콘으로 실행" },
  ],
};

const usageCards = [
  { icon: ClipboardList, title: "급여기록 입력", desc: "오늘 탭에서 바로 기록", shot: "/guide/today.png" },
  { icon: Package, title: "재고 확인", desc: "냉동·냉장 재고 한눈에", shot: "/guide/stock.png" },
  { icon: CalendarDays, title: "식단표 확인·편집", desc: "하루~한 달 식단 계획", shot: "/guide/plan.png" },
  { icon: Snowflake, title: "제조 기록", desc: "만든 날 냉동 큐브 등록", shot: "/guide/manufacture.png" },
];

function detectOS() {
  if (typeof navigator === "undefined") return "ios";
  return /android/i.test(navigator.userAgent || "") ? "android" : "ios";
}

export default function GuidePage() {
  const [os, setOs] = useState(detectOS);

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px 44px" }}>
        <div className="flex flex-col items-center" style={{ textAlign: "center", marginBottom: 24 }}>
          <CubeMark size={40} />
          <div style={{ fontSize: 19, fontWeight: 900, color: C.ink, marginTop: 10, fontFamily: "'Gowun Dodum', sans-serif" }}>베이비큐브</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>홈 화면에 설치하고 바로 시작해보세요</div>
        </div>

        {/* A. 설치 안내 */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 12 }}>1. 홈 화면에 설치하기</div>
          <div className="flex items-center" style={{ background: C.sageLight, borderRadius: 999, padding: 3, marginBottom: 16 }}>
            {[["ios", "iOS (Safari)"], ["android", "Android (Chrome)"]].map(([v, l]) => (
              <button key={v} onClick={() => setOs(v)} style={{ flex: 1, border: "none", padding: "8px 0", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: os === v ? C.surface : "transparent", color: os === v ? C.sageDeep : C.inkSoft, boxShadow: os === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {installSteps[os].map((s, i) => (
              <div key={i} className="flex flex-col items-center" style={{ textAlign: "center", gap: 7 }}>
                <div className="flex items-center justify-center" style={{ width: 46, height: 46, borderRadius: 14, background: C.sageLight, flexShrink: 0 }}>
                  <s.icon size={20} color={C.sageDeep} />
                </div>
                <div style={{ fontSize: 10, color: C.inkSoft, lineHeight: 1.35 }}>{i + 1}. {s.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* B. 사용법 요약 */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 10, padding: "0 2px" }}>2. 이렇게 사용해요</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {usageCards.map((c) => (
              <div key={c.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
                <img src={c.shot} alt={c.title} style={{ width: "100%", display: "block", aspectRatio: "9 / 10", objectFit: "cover", objectPosition: "top", borderBottom: `1px solid ${C.border}`, background: C.sageLight }} />
                <div style={{ padding: "9px 10px" }}>
                  <div className="flex items-center" style={{ gap: 6, marginBottom: 3 }}>
                    <c.icon size={13} color={C.sageDeep} />
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>{c.title}</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <a href="/" style={{ ...primaryBtn, display: "block", textAlign: "center", textDecoration: "none", marginTop: 24, boxSizing: "border-box" }}>베이비큐브 시작하기</a>
      </div>
    </div>
  );
}
