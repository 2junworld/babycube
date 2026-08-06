/* 앱 셸 - 하단 탭바와 화면 라우팅 */
import React, { useEffect, useState } from "react";
import { Home, CalendarDays, Package, Menu, LineChart as LineChartIcon } from "lucide-react";
import { C, FONT_IMPORT } from "../theme";
import { todayISO } from "../lib/dates";
import { useStore } from "../store";
import { DayRecordScreen, TodayTab } from "./TodayTab";
import { MealPlanTab } from "./PlanTab";
import { FeedingLogScreen } from "./FeedingLogScreen";
import { IngredientInfoScreen, ManufactureHistoryScreen, ProductDetailScreen, ProductStockDetailScreen, ShoppingScreen, StockDetailScreen, StockTab } from "./StockTab";
import { FeedingCompareScreen, RecordHistoryScreen, RecordTab } from "./RecordTab";
import { ActivityScreen, CategoriesScreen, ChangelogHistoryScreen, FeedbackScreen, HistoryScreen, MealSlotsScreen, MembersScreen, MoreTab, SettingsScreen, TravelScreen } from "./MoreTab";
import { GO_TO_CHANGELOG_EVENT, UI_STATE } from "./uiPrefs";

// 개발 브랜치 프리뷰 배포(vite.config.js가 VERCEL_ENV로 판단)에서만 화면 한쪽에 작게 표시 -
// 정식 배포와 헷갈리지 않게 항상 눈에 보이는 곳에 두되, 탭·버튼을 가리지 않도록 pointerEvents: none
function DevBuildBadge() {
  const isDevBuild = typeof __DEPLOY_ENV__ !== "undefined" && __DEPLOY_ENV__ !== "production";
  if (!isDevBuild) return null;
  const buildId = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : null;
  return (
    <div style={{ position: "fixed", top: "calc(6px + env(safe-area-inset-top))", right: 8, zIndex: 40, pointerEvents: "none" }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: "#E07A3F", borderRadius: 999, padding: "3px 8px", letterSpacing: 0.4, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
        DEV{buildId ? ` ${buildId}` : ""}
      </span>
    </div>
  );
}

/* =====================================================================
   앱 셸 (탭 + 라우팅)
   ===================================================================== */
export const TABS = [
  { key: "today", label: "오늘", icon: Home },
  { key: "plan", label: "식단표", icon: CalendarDays },
  { key: "stock", label: "재고", icon: Package },
  { key: "record", label: "기록", icon: LineChartIcon },
  { key: "more", label: "더보기", icon: Menu },
];

export function Shell() {
  const { state } = useStore();
  const fontScale = state.settings.fontScale || 1;
  const [tab, setTabRaw] = useState("today");
  // 풀스크린 하위 화면 스택 - 설정→끼니 설정처럼 2단계 이상 들어갈 수 있는 화면이 생기면서,
  // 단일 route 값(뒤로가기 = 항상 탭 목록으로)만으로는 "한 단계만 뒤로" 가 안 돼 스택으로 전환
  const [stack, setStack] = useState([]); // [{route, params}, ...]
  const top = stack[stack.length - 1];
  const route = top ? top.route : null;
  const params = top ? top.params : {};
  // 오늘 탭에서 보고 있는 날짜 - 하단 탭 라벨에도 반영해야 해서(개선 요청) Shell이 들고 있음.
  // 다른 탭으로 이동하면 오늘로 리셋(아래 setTab 참고)
  const [todayViewDate, setTodayViewDate] = useState(todayISO());

  const go = (r, p = {}) => setStack((s) => [...s, { route: r, params: p }]);
  const back = () => setStack((s) => s.slice(0, -1));
  const setTab = (key) => { setTabRaw(key); setStack([]); if (key !== "today") setTodayViewDate(todayISO()); };
  // 업데이트 안내 팝업(pwa.jsx의 WhatsNewSheet)은 Shell 바깥(형제)에 있어 go()를 직접 못 부르므로,
  // 커스텀 이벤트로 받은 "업데이트 내역으로 이동" 신호를 여기서 실제 네비게이션으로 처리
  useEffect(() => {
    const onGoChangelog = () => go("changelog");
    window.addEventListener(GO_TO_CHANGELOG_EVENT, onGoChangelog);
    return () => window.removeEventListener(GO_TO_CHANGELOG_EVENT, onGoChangelog);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 오늘 탭 날짜 이동 → 기록 탭 급여표(월별)로 바로가기 - 보던 날짜를 그대로 넘겨 이어서 봄
  const openRecordMonth = (date) => {
    UI_STATE.recordMonthSelected = date;
    UI_STATE.recordView = "table";
    UI_STATE.recordTableRange = "month";
    setTab("record");
  };

  let content;
  if (route === "feed") content = <FeedingLogScreen date={params.date} planMeal={params.planMeal} existingLog={params.existingLog} onBack={back} />;
  else if (route === "dayRecord") content = <DayRecordScreen date={params.date} onBack={back} go={go} />;
  else if (route === "shopping") content = <ShoppingScreen onBack={back} />;
  else if (route === "settings") content = <SettingsScreen onBack={back} go={go} />;
  else if (route === "history") content = <HistoryScreen onBack={back} go={go} />;
  else if (route === "members") content = <MembersScreen onBack={back} go={go} />;
  else if (route === "activity") content = <ActivityScreen onBack={back} go={go} filterUid={params.uid} filterName={params.name} />;
  else if (route === "feedback") content = <FeedbackScreen onBack={back} />;
  else if (route === "changelog") content = <ChangelogHistoryScreen onBack={back} />;
  else if (route === "travel") content = <TravelScreen onBack={back} />;
  else if (route === "mealSlots") content = <MealSlotsScreen onBack={back} />;
  else if (route === "categories") content = <CategoriesScreen onBack={back} />;
  else if (route === "stockDetail") content = <StockDetailScreen name={params.name} onBack={back} />;
  else if (route === "recordHistory") content = <RecordHistoryScreen onBack={back} />;
  else if (route === "feedCompare") content = <FeedingCompareScreen date={params.date} logId={params.logId} label={params.label} onBack={back} />;
  else if (route === "ingredientInfo") content = <IngredientInfoScreen name={params.name} onBack={back} go={go} />;
  else if (route === "manufactureHistory") content = <ManufactureHistoryScreen onBack={back} />;
  else if (route === "productDetail") content = <ProductDetailScreen productId={params.productId} onBack={back} go={go} />;
  else if (route === "productStockDetail") content = <ProductStockDetailScreen productId={params.productId} onBack={back} />;
  else if (tab === "today") content = <TodayTab go={go} viewDate={todayViewDate} setViewDate={setTodayViewDate} onOpenRecordMonth={openRecordMonth} />;
  else if (tab === "plan") content = <MealPlanTab />;
  else if (tab === "stock") content = <StockTab go={go} />;
  else if (tab === "record") content = <RecordTab go={go} />;
  else content = <MoreTab go={go} />;

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif", zoom: fontScale }}>
      <style>{FONT_IMPORT}</style>
      <DevBuildBadge />
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", position: "relative" }}>
        {content}

        {!route && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20 }}>
            <div style={{ maxWidth: 480, margin: "0 auto", background: "rgba(250,247,241,0.92)", backdropFilter: "blur(8px)", borderTop: `1px solid ${C.border}`, padding: "10px 8px calc(10px + env(safe-area-inset-bottom))", display: "flex", justifyContent: "space-around" }}>
              {TABS.map((tb) => {
                const active = tb.key === tab;
                // 오늘 탭에서 과거 날짜를 보고 있으면 하단 탭 라벨도 그 날짜로 바꿔서(개선 요청) 지금 뭘 보고
                // 있는지 한눈에 알 수 있게 함. 다른 탭으로 이동하면 setTab이 자동으로 오늘로 리셋함
                const label = tb.key === "today" && todayViewDate !== todayISO() ? todayViewDate.slice(5) : tb.label;
                return (
                  <button key={tb.key} onClick={() => setTab(tb.key)} className="flex flex-col items-center" style={{ gap: 3, background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>
                    <div style={{ position: "relative" }}>
                      {active && <div style={{ position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: 2, background: C.sage }} />}
                      <tb.icon size={20} color={active ? C.sageDeep : C.muted} strokeWidth={active ? 2.4 : 1.8} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? C.sageDeep : C.muted }}>{label}</span>
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
