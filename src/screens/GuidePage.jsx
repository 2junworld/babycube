/* 설치·사용법 안내 페이지 - 로그인 없이 /guide 경로로 바로 접근 가능 (지인 공유용 고정 링크)
   설치 단계·문제 해결·사용법 카드 내용은 아래 데이터 배열만 바꾸면 되도록 구성 (유지보수 용이성) */
import React, { useState } from "react";
import { Share, MoreVertical, SquarePlus, CheckCircle2, ClipboardList, Package, CalendarDays, Snowflake, ChevronDown, ChevronLeft } from "lucide-react";
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
    { icon: SquarePlus, text: "'앱 설치' 선택" },
    { icon: CheckCircle2, text: "완료! 홈 화면 아이콘으로 실행" },
  ],
};

// 실제로 겪었던 설치 오류들 기반 - 문항만 추가/수정하면 되도록 배열로 분리
const troubleshooting = [
  { q: "설치 버튼이 안 보이고 '바로가기 만들기'만 떠요 (안드로이드)",
    a: "브라우저에 예전 버전 정보가 남아있을 때 나타나요. 브라우저 설정 → 사이트 정보(또는 설정) → 이 사이트의 저장된 데이터·캐시 삭제 후, 페이지를 새로고침하고 다시 시도해 주세요." },
  { q: "아이폰인데 설치 메뉴 자체가 없어요",
    a: "아이폰은 Safari에서만 '홈 화면에 추가'로 설치할 수 있어요. Chrome 등 다른 브라우저로 링크를 열었다면, 그 링크를 Safari로 다시 열어주세요." },
  { q: "설치 후 로그인이 안 되거나, 구글 로그인 화면이 계속 되풀이돼요",
    a: "설치된 앱을 화면에서 완전히 종료했다가 다시 열어보세요(최근 앱 목록에서 위로 스와이프해 종료). 그래도 안 되면 앱 아이콘을 삭제하고 링크로 다시 설치해 주세요." },
  { q: "화면이 깨지거나 예전 화면이 계속 보여요",
    a: "더보기 탭 하단의 '업데이트 확인' 버튼을 눌러보세요. 그래도 그대로면 앱을 완전히 종료 후 재실행해 주세요." },
];

const usageCards = [
  { key: "today", icon: ClipboardList, title: "급여기록 입력", desc: "오늘 탭에서 바로 기록", shot: "/guide/today.png",
    detail: [
      "오늘 탭에서 끼니(아침·점심·저녁)를 선택해요",
      "'재료 추가'로 먹인 재료를 고르고 큐브 수나 그램을 입력해요",
      "완식/3·4/절반 등 실제 섭취량을 선택하고 저장하면 기록 완료!",
      "'재고 반영'을 켜두면 사용한 만큼 재고에서 자동으로 차감돼요",
    ] },
  { key: "stock", icon: Package, title: "재고 확인", desc: "냉동·냉장 재고 한눈에", shot: "/guide/stock.png",
    detail: [
      "재고 탭에서 냉동·냉장 보관 중인 재료 수량을 한눈에 확인해요",
      "카테고리·소진임박순 등으로 정렬해 필요한 재료를 빠르게 찾을 수 있어요",
      "재료를 탭하면 궁합 좋은 재료, 영양 태그 같은 상세 정보도 볼 수 있어요",
    ] },
  { key: "plan", icon: CalendarDays, title: "식단표 확인·편집", desc: "하루~한 달 식단 계획", shot: "/guide/plan.png",
    detail: [
      "식단표 탭에서 하루·주·월 단위로 계획한 끼니를 확인해요",
      "끼니를 탭해 재료 구성을 수정하거나 새 끼니를 추가할 수 있어요",
      "'여러 날짜에 저장'으로 같은 식단을 여러 날짜에 한 번에 반영할 수 있어요",
    ] },
  { key: "manufacture", icon: Snowflake, title: "제조 기록", desc: "만든 날 냉동 큐브 등록", shot: "/guide/manufacture.png",
    detail: [
      "재고 탭 상단의 '+ 제조 기록 추가' 버튼을 눌러요",
      "재료·제조일·냉동 큐브 수(또는 냉장 보관량)를 입력해요",
      "저장하면 유통기한이 자동 계산되고 재고에 바로 반영돼요",
    ] },
];

function detectOS() {
  if (typeof navigator === "undefined") return "ios";
  return /android/i.test(navigator.userAgent || "") ? "android" : "ios";
}

function UsageDetail({ card, onBack }) {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 20px 44px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <button onClick={onBack} className="flex items-center" style={{ gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer", color: C.inkSoft }}>
          <ChevronLeft size={18} />
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>안내로 돌아가기</span>
        </button>
        <a href="/" style={{ fontSize: 11, fontWeight: 700, color: C.muted, textDecoration: "underline" }}>앱으로 돌아가기</a>
      </div>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 14 }}>
        <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: C.sageLight, flexShrink: 0 }}>
          <card.icon size={16} color={C.sageDeep} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{card.title}</span>
      </div>
      <img src={card.shot} alt={card.title} style={{ width: "100%", display: "block", borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 14 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {card.detail.map((line, i) => (
          <div key={i} className="flex items-start" style={{ gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.sageDeep, background: C.sageLight, borderRadius: 999, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
            <span style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5 }}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GuidePage() {
  const [os, setOs] = useState(detectOS);
  const [openQ, setOpenQ] = useState(null);
  const [detailKey, setDetailKey] = useState(null);

  const detailCard = usageCards.find((c) => c.key === detailKey);
  if (detailCard) {
    return (
      <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif" }}>
        <style>{FONT_IMPORT}</style>
        <UsageDetail card={detailCard} onBack={() => setDetailKey(null)} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 20px 44px" }}>
        {/* 더보기 탭·직접 링크 등 어디서 들어와도 앱으로 돌아갈 방법이 눈에 보이도록 상단 고정 -
            /guide는 앱 라우터 밖의 별도 진입점이라 브라우저 뒤로가기가 항상 기대대로 동작하지 않음
            (특히 새 탭·standalone PWA에서 열렸을 때 브라우저 뒤로가기 자체가 없을 수 있음) */}
        <a href="/" className="flex items-center" style={{ gap: 4, textDecoration: "none", color: C.inkSoft, marginBottom: 14 }}>
          <ChevronLeft size={18} />
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>앱으로 돌아가기</span>
        </a>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
            {installSteps[os].map((s, i) => (
              <div key={i} className="flex flex-col items-center" style={{ textAlign: "center", gap: 7 }}>
                <div className="flex items-center justify-center" style={{ width: 46, height: 46, borderRadius: 14, background: C.sageLight, flexShrink: 0 }}>
                  <s.icon size={20} color={C.sageDeep} />
                </div>
                <div style={{ fontSize: 10, color: C.inkSoft, lineHeight: 1.35 }}>{i + 1}. {s.text}</div>
              </div>
            ))}
          </div>

          {/* 설치가 잘 안 될 때 - 아코디언으로 접어둬서 평소엔 스크롤을 늘리지 않음 */}
          <div style={{ borderTop: `1px dashed ${C.border}`, paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8 }}>설치가 잘 안 되나요?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {troubleshooting.map((t, i) => {
                const open = openQ === i;
                return (
                  <div key={i} style={{ background: C.sageLight, borderRadius: 10, overflow: "hidden" }}>
                    <button onClick={() => setOpenQ(open ? null : i)} className="flex items-center justify-between" style={{ width: "100%", background: "none", border: "none", padding: "9px 11px", cursor: "pointer", textAlign: "left", gap: 8 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep, lineHeight: 1.4 }}>{t.q}</span>
                      <ChevronDown size={14} color={C.sageDeep} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
                    </button>
                    {open && <div style={{ padding: "0 11px 11px", fontSize: 11, color: C.inkSoft, lineHeight: 1.5 }}>{t.a}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* B. 사용법 요약 - 카드를 누르면 상세 설명으로 이동 */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 10, padding: "0 2px" }}>2. 이렇게 사용해요</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {usageCards.map((c) => (
              <button key={c.key} onClick={() => setDetailKey(c.key)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", cursor: "pointer", padding: 0, textAlign: "left" }}>
                <img src={c.shot} alt={c.title} style={{ width: "100%", display: "block", aspectRatio: "9 / 10", objectFit: "cover", objectPosition: "top", borderBottom: `1px solid ${C.border}`, background: C.sageLight }} />
                <div style={{ padding: "9px 10px" }}>
                  <div className="flex items-center" style={{ gap: 6, marginBottom: 3 }}>
                    <c.icon size={13} color={C.sageDeep} />
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>{c.title}</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{c.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <a href="/" style={{ ...primaryBtn, display: "block", textAlign: "center", textDecoration: "none", marginTop: 24, boxSizing: "border-box" }}>베이비큐브 시작하기</a>
      </div>
    </div>
  );
}
