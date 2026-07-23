/* 앱 셸 - 하단 탭바와 화면 라우팅 */
import React, { useState } from "react";
import { Home, CalendarDays, Package, Menu, LineChart as LineChartIcon } from "lucide-react";
import { C, FONT_IMPORT } from "../theme";
import { useStore } from "../store";
import { TodayTab } from "./TodayTab";
import { MealPlanTab } from "./PlanTab";
import { FeedingLogScreen } from "./FeedingLogScreen";
import { IngredientInfoScreen, ManufactureHistoryScreen, ProductDetailScreen, ProductStockDetailScreen, ShoppingScreen, StockDetailScreen, StockTab } from "./StockTab";
import { FeedingCompareScreen, RecordHistoryScreen, RecordTab } from "./RecordTab";
import { ActivityScreen, CategoriesScreen, FeedbackScreen, MealSlotsScreen, MembersScreen, MoreTab, SettingsScreen, TravelScreen } from "./MoreTab";

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
  const [tab, setTab] = useState("today");
  const [route, setRoute] = useState(null); // 풀스크린 하위 화면
  const [params, setParams] = useState({});

  const go = (r, p = {}) => { setParams(p); setRoute(r); };
  const back = () => setRoute(null);

  let content;
  if (route === "feed") content = <FeedingLogScreen date={params.date} planMeal={params.planMeal} existingLog={params.existingLog} onBack={back} />;
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
