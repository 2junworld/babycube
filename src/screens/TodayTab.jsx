/* 오늘 탭 - 오늘의 끼니 카드·바로 기록·소진 임박 재료 */
import React from "react";
import { Plus, X, Refrigerator, Snowflake, ShoppingCart } from "lucide-react";
import { C } from "../theme";
import { ageText, fmtTime, todayISO } from "../lib/dates";
import { logProvideG, totalG } from "../state/appState";
import { useStore } from "../store";
import { CategoryBar, CubeGrid, IngredientTable, MealItemList, ScreenHeader, StatusBadge } from "../components/common";
import { useDetailView } from "./uiPrefs";
import { fridgeAlerts, frozenAlerts } from "../lib/stockAlerts";

/* =====================================================================
   오늘 탭
   ===================================================================== */
export function TodayTab({ go }) {
  const { state, dispatch } = useStore();
  const t = todayISO();
  const timeFmt = state.settings.timeFmt;
  const plan = state.plans[t] || [];
  const logs = state.logs[t] || [];
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const [detail, setDetail] = useDetailView("bc_today_view");

  const fAlerts = frozenAlerts(state);
  const rAlertsAll = fridgeAlerts(state);
  const bannerHidden = state.ui.fridgeBannerHiddenDate === t;

  // 계획 ↔ 기록 매칭: 같은 이름 끼니가 하루에 2개여도 이미 매칭된 기록은 제외하고
  // 순차적으로 1:1 매칭 (계획·기록 모두 시간순 정렬이므로 시간순 짝이 됨)
  const usedLogIds = new Set();
  const meals = plan.map((m) => {
    const log = logs.find((l) => l.label === m.label && !usedLogIds.has(l.id));
    if (log) usedLogIds.add(log.id);
    let status = "예정";
    if (log) status = "완료";
    else if (m.time < nowHM) status = "대기";
    return { ...m, log, status };
  });
  // 계획과 매칭되지 않은 기록(바로 기록 등)도 완료 카드로 함께 표시
  const extraCards = logs
    .filter((l) => !usedLogIds.has(l.id))
    .map((l) => ({ id: l.id, label: l.label, time: l.time, items: l.items, log: l, status: "완료", adhocOnly: true }));
  const cards = [...meals, ...extraCards].sort((a, b) =>
    (a.log ? a.log.time : a.time).localeCompare(b.log ? b.log.time : b.time));

  return (
    <div style={{ paddingBottom: 90 }}>
      <ScreenHeader title="베이비큐브" right={<span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>{ageText(state.baby.birth)} · 오늘</span>} />

      {rAlertsAll.length > 0 && !bannerHidden && (
        <div style={{ padding: "0 18px", marginBottom: 14 }}>
          <div className="flex items-start" style={{ gap: 10, background: C.apricotLight, borderRadius: 14, padding: "12px 14px" }}>
            <Refrigerator size={18} color={C.apricot} style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#9A4A1E" }}>냉장 보관 이유식 소진 임박</div>
              <div style={{ fontSize: 12, color: "#A85B30", marginTop: 2 }}>
                {rAlertsAll.map((a) => a.name).join(" · ")} — 오늘~내일 사용 권장
              </div>
            </div>
            <button onClick={() => dispatch({ type: "UI_SET", patch: { fridgeBannerHiddenDate: t } })}
              style={{ background: "none", border: "none", padding: 2, cursor: "pointer", flexShrink: 0 }}>
              <X size={15} color="#A85B30" />
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {cards.length > 0 && (
          <div className="flex items-center justify-end">
            <button onClick={() => setDetail((v) => !v)} style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep, background: C.sageLight, border: "none", borderRadius: 999, padding: "5px 10px", cursor: "pointer" }}>
              {detail ? "심플뷰로 보기" : "디테일뷰로 보기"}
            </button>
          </div>
        )}
        {cards.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted }}>
            오늘 계획된 끼니가 없습니다.<br />식단표 탭에서 계획하거나, 아래 '바로 기록'으로 먹인 끼니를 기록해 보세요.
          </div>
        )}
        {cards.map((m) => {
          const total = totalG(state, m.items);
          const intake = m.log ? m.log.intakeG : null;
          const provided = m.log ? logProvideG(m.log) : total;
          // 기록 완료된 끼니는 계획이 아니라 "실제로 급여한 재료"를 보여줌
          // (기록 화면에서 재료를 추가/삭제했으면 계획과 달라질 수 있음)
          const shownItems = m.log ? m.log.items : m.items;
          return (
            <div key={m.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{m.label}</span>
                  {/* 완료된 끼니는 계획 시간이 아니라 실제 급여 시간을 표시 */}
                  <span style={{ fontSize: 12, color: C.muted }}>{fmtTime(m.log ? m.log.time : m.time, timeFmt)}</span>
                </div>
                <StatusBadge status={m.status} />
              </div>
              {detail ? <div style={{ marginBottom: 9 }}><IngredientTable items={shownItems} /></div> : <div style={{ marginBottom: 9 }}><MealItemList items={shownItems} fontSize={12} wrap /></div>}
              <CategoryBar items={shownItems} />
              <div className="flex items-center justify-between" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.border}` }}>
                {m.status === "완료" ? (
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sageDeep }}>
                    {provided}g 중 {intake}g ({provided ? Math.round((intake / provided) * 100) : 0}%)
                  </span>
                ) : (
                  <span style={{ fontSize: 12.5, color: C.muted }}>총 제공 예정 {total}g</span>
                )}
                <button onClick={() => go("feed", { date: t, planMeal: m.adhocOnly ? null : m, existingLog: m.log })}
                  style={{ fontSize: 12, fontWeight: 700, color: m.status === "완료" ? C.muted : C.sageDeep, background: m.status === "완료" ? "transparent" : C.sageLight, border: "none", borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}>
                  {m.status === "완료" ? "수정" : "기록하기"}
                </button>
              </div>
            </div>
          );
        })}
        <button onClick={() => go("feed", { date: t })} className="flex items-center justify-center"
          style={{ gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 14, padding: "11px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
          <Plus size={14} /> 바로 기록 — 계획 없이 먹인 끼니
        </button>
      </div>

      {fAlerts.length > 0 && (
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
            <div className="flex items-center" style={{ gap: 7, marginBottom: 10 }}>
              <Snowflake size={15} color={C.sageDeep} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>곧 떨어지는 재료</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {fAlerts.map((r) => (
                <div key={r.name} className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: C.inkSoft, width: 52 }}>{r.name}</span>
                    <CubeGrid filled={r.cubes} total={10} />
                  </div>
                  <span style={{ fontSize: 11.5, color: C.apricot, fontWeight: 600 }}>{r.cubes <= 0 ? "소진" : `~${r.daysLeft}일`}</span>
                </div>
              ))}
            </div>
            <button onClick={() => go("shopping")} className="flex items-center justify-center" style={{ width: "100%", marginTop: 12, gap: 6, fontSize: 12.5, fontWeight: 700, color: C.sageDeep, background: C.sageLight, border: "none", borderRadius: 10, padding: "9px 0", cursor: "pointer" }}>
              <ShoppingCart size={13} /> 장보기·제조 목록 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
