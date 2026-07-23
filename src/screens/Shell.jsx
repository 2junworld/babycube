/* 앱 셸 - 하단 탭바와 화면 라우팅 */
import React, { useState } from "react";
import { Home, CalendarDays, Package, Menu, LineChart as LineChartIcon } from "lucide-react";
import { C, FONT_IMPORT } from "../theme";
import { todayISO } from "../lib/dates";
import { useStore } from "../store";
import { DayRecordScreen, TodayTab } from "./TodayTab";
import { MealPlanTab } from "./PlanTab";
import { FeedingLogScreen } from "./FeedingLogScreen";
import { IngredientInfoScreen, ManufactureHistoryScreen, ProductDetailScreen, ProductStockDetailScreen, ShoppingScreen, StockDetailScreen, StockTab } from "./StockTab";
import { FeedingCompareScreen, RecordHistoryScreen, RecordTab } from "./RecordTab";
import { ActivityScreen, CategoriesScreen, FeedbackScreen, MealSlotsScreen, MembersScreen, MoreTab, SettingsScreen, TravelScreen } from "./MoreTab";
import { UI_STATE } from "./uiPrefs";

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
  const [route, setRoute] = useState(null); // 풀스크린 하위 화면
  const [params, setParams] = useState({});
  // 오늘 탭에서 보고 있는 날짜 - 하단 탭 라벨에도 반영해야 해서(개선 요청) Shell이 들고 있음.
  // 다른 탭으로 이동하면 오늘로 리셋(아래 setTab 참고)
  const [todayViewDate, setTodayViewDate] = useState(todayISO());

  const go = (r, p = {}) => { setParams(p); setRoute(r); };
  const back = () => setRoute(null);
  const setTab = (key) => { setTabRaw(key); if (key !== "today") setTodayViewDate(todayISO()); };
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
  else if (route === "settings") content = <SettingsScreen onBack={back} />;
  else if (route === "members") content = <MembersScreen onBack={back} go={go} />;
  else if (route === "activity") content = <ActivityScreen onBack={back} go={go} filterUid={params.uid} filterName={params.name} />;
  else if (route === "feedback") content = <FeedbackScreen onBack={back} />;
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
