/* 기록 탭 - 급여표(주/월)·히스토리·기록 관리·계획 대비 비교 */
import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { C, primaryBtn, PRODUCT_COLOR } from "../theme";
import { WD, addDaysISO, fmtTime, pad2, todayISO } from "../lib/dates";
import { catOf, categoryNames, defaultCategoryName, gOf, logProvideG, sortByCategory, totalG, unrestorableStockNames } from "../state/appState";
import { useStore } from "../store";
import { AuthorInfo, BottomSheet, CatDot, CategoryLegend, CategoryTotalsBar, Chip, ConfirmModal, ProductDot, ScreenHeader, Segmented, SubHeader } from "../components/common";
import { UI_STATE } from "./uiPrefs";
import { monthProducedG, monthStats, weeklyRates } from "../lib/stats";
import { weekLogLabels } from "../lib/mealLabels";
import { IngredientPicker } from "../components/pickers";
import { WeekTable } from "./PlanTab";

/* =====================================================================
   급여표 - 식단표의 주별 그리드(WeekTable)를 참고해 실제 급여기록(state.logs) 기준으로
   같은 구조로 그려주는 컴포넌트. 기록이 없는 칸은 계획 유무/미래 날짜 구분 없이 항상 빈 칸.
   ===================================================================== */
export function FeedingWeekPanel({ go }) {
  const { state } = useStore();
  const [cursor, setCursor] = useState(todayISO());
  // 같은 이름 기록이 하루 2건 이상인 셀을 탭했을 때 어느 기록을 볼지 고르는 시트
  const [multiPick, setMultiPick] = useState(null); // { date, label, logs }
  const weekStart = addDaysISO(cursor, -new Date(cursor + "T00:00:00").getDay());
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  const labels = weekLogLabels(state, days);
  const wide = labels.length > 3;
  // 마지막 열: 해당 일자 총 섭취량(합계)
  const cols = `34px repeat(${labels.length}, minmax(58px, 1fr)) 48px`;
  const t = todayISO();
  const headLabel = `${weekStart.slice(5)} ~ ${addDaysISO(weekStart, 6).slice(5)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <button onClick={() => setCursor(addDaysISO(cursor, -7))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronLeft size={17} color={C.muted} /></button>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{headLabel}</span>
        <button onClick={() => setCursor(addDaysISO(cursor, 7))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronRight size={17} color={C.muted} /></button>
      </div>
      <div style={{ overflowX: wide ? "auto" : "visible" }}>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", minWidth: wide ? 34 + labels.length * 68 + 52 : "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, background: C.sageLight, padding: "9px 6px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep }}>요일</span>
            {labels.map((h) => <span key={h} style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, textAlign: "center" }}>{h}</span>)}
            <span style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep, textAlign: "center" }}>합계</span>
          </div>
          {days.map((iso, i) => {
            const dow = new Date(iso + "T00:00:00").getDay();
            const isToday = iso === t;
            const dayLogs = state.logs[iso] || [];
            // 같은 이름 기록이 여러 건이면 전부 모아 합산 표시 (logId 기준으로 상세 진입)
            const findLogs = (lab) => dayLogs.filter((l) => l.label === lab);
            const dayIntakeG = dayLogs.reduce((s, l) => s + (l.intakeG || 0), 0);
            return (
              <div key={iso} style={{ display: "grid", gridTemplateColumns: cols, padding: "13px 6px",
                borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: isToday ? C.sageLight : C.surface }}>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: isToday ? C.sageDeep : C.ink }}>{WD[dow]}</div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>{iso.slice(5)}</div>
                </div>
                {labels.map((lab) => {
                  const cellLogs = findLogs(lab);
                  // 기록이 없는 칸: 계획만 있음/계획도 없음/미래 날짜 모두 구분 없이 빈 칸으로 표시
                  if (cellLogs.length === 0) return <div key={lab} />;
                  const prov = cellLogs.reduce((s, l) => s + logProvideG(l), 0);
                  const intake = cellLogs.reduce((s, l) => s + (l.intakeG || 0), 0);
                  const pct = prov ? Math.round((intake / prov) * 100) : 0;
                  // 중량(섭취 g)을 크게 강조, 섭취율은 보조 표기. 2건 이상이면 배지 표시 후 탭 시 선택
                  return (
                    <button key={lab}
                      onClick={() => cellLogs.length === 1
                        ? go("feedCompare", { date: iso, logId: cellLogs[0].id })
                        : setMultiPick({ date: iso, label: lab, logs: cellLogs })}
                      style={{ padding: "0 4px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 2,
                        background: "none", border: "none", cursor: "pointer" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{intake}g</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: pct >= 85 ? C.sageDeep : C.apricot }}>{pct}%</span>
                      {cellLogs.length > 1 && (
                        <span style={{ fontSize: 8.5, fontWeight: 800, background: C.butterLight, color: "#9A7416", padding: "1px 5px", borderRadius: 999 }}>{cellLogs.length}건</span>
                      )}
                    </button>
                  );
                })}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                  {dayLogs.length > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: C.sageDeep }}>{dayIntakeG}g</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {wide && <div style={{ fontSize: 9.5, color: C.muted, textAlign: "center" }}>← 옆으로 밀어서 더 보기 →</div>}
      {multiPick && (
        <BottomSheet title={`${multiPick.date.slice(5)} · '${multiPick.label}' 기록 ${multiPick.logs.length}건`} onClose={() => setMultiPick(null)}>
          <div style={{ padding: "0 18px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11.5, color: C.muted }}>볼 기록을 선택하세요</div>
            {multiPick.logs.map((l) => (
              <button key={l.id} onClick={() => { setMultiPick(null); go("feedCompare", { date: multiPick.date, logId: l.id }); }}
                className="flex items-center justify-between"
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{fmtTime(l.time, state.settings.timeFmt)}</span>
                <span style={{ fontSize: 12.5, color: C.muted }}>{logProvideG(l)}g 중 {l.intakeG}g</span>
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/* =====================================================================
   급여표 - 월별 뷰: 달력에서 일자별 총 섭취량을 보고, 날짜를 선택하면 끼니별 상세 확인
   ===================================================================== */
export function FeedingMonthPanel({ go }) {
  const { state } = useStore();
  const t = todayISO();
  const [ym, setYm] = useState(() => ({ y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(t);
  const shiftMonth = (n) => setYm((p) => { const d = new Date(p.y, p.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const first = new Date(ym.y, ym.m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const isoOf = (d) => `${ym.y}-${pad2(ym.m + 1)}-${pad2(d)}`;
  const dayIntakeG = (iso) => (state.logs[iso] || []).reduce((s, l) => s + (l.intakeG || 0), 0);
  const monthTotal = cells.reduce((s, d) => d ? s + dayIntakeG(isoOf(d)) : s, 0);
  const selLogs = state.logs[selected] || [];
  const selTotal = selLogs.reduce((s, l) => s + (l.intakeG || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: 10 }}>
          <button onClick={() => shiftMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronLeft size={17} color={C.muted} /></button>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{ym.y}년 {ym.m + 1}월</span>
          <button onClick={() => shiftMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronRight size={17} color={C.muted} /></button>
        </div>
        {monthTotal > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep }}>이 달 총 {monthTotal}g</span>}
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {WD.map((d) => <span key={d} style={{ fontSize: 10, color: C.muted, fontWeight: 700, textAlign: "center" }}>{d}</span>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const iso = isoOf(d);
            const g = dayIntakeG(iso);
            const isToday = iso === t, isSel = iso === selected;
            return (
              <button key={i} onClick={() => setSelected(iso)} className="flex flex-col items-center justify-center"
                style={{ height: 46, borderRadius: 10, background: isSel ? C.sageLight : "transparent", cursor: "pointer",
                  border: isToday ? `1.5px solid ${C.sage}` : isSel ? `1px solid ${C.sage}` : "1px solid transparent", padding: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: isToday ? 800 : 500, color: isToday ? C.sageDeep : C.inkSoft }}>{d}</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: g > 0 ? C.sageDeep : "transparent", marginTop: 2 }}>{g > 0 ? `${g}g` : "-"}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 8, padding: "0 4px" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{selected.slice(5)} ({WD[new Date(selected + "T00:00:00").getDay()]})</span>
          {selLogs.length > 0 && <span style={{ fontSize: 12.5, fontWeight: 800, color: C.sageDeep }}>총 {selTotal}g</span>}
        </div>
        {selLogs.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
            {selLogs.map((log) => {
              const prov = logProvideG(log);
              const pct = prov ? Math.round((log.intakeG / prov) * 100) : 0;
              return (
                <button key={log.id} onClick={() => go("feedCompare", { date: selected, logId: log.id })}
                  className="flex items-center justify-between" style={{ width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 13px", cursor: "pointer" }}>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{log.label}</span>
                    <span style={{ fontSize: 10.5, color: C.muted }}>{fmtTime(log.time, state.settings.timeFmt)}</span>
                  </div>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{log.intakeG}g</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: pct >= 85 ? C.sageDeep : C.apricot }}>{pct}%</span>
                    <ChevronRight size={13} color={C.muted} />
                  </div>
                </button>
              );
            })}
          </div>
        ) : <div style={{ textAlign: "center", padding: "12px 0", fontSize: 12, color: C.muted }}>이 날짜엔 급여 기록이 없습니다</div>}
        {/* 지난 날짜(오늘 포함) 기록 추가 - 개선 제안 반영: 예전엔 "오늘" 탭에서만 기록을 남길 수 있어
            지난 날짜에 깜빡한 기록을 나중에 추가할 방법이 없었음. 미래 날짜는 기록할 대상이 없으니 제외 */}
        {selected <= t && (
          <button onClick={() => go("dayRecord", { date: selected })} className="flex items-center justify-center"
            style={{ width: "100%", gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.sageDeep, background: "transparent", cursor: "pointer" }}>
            <Plus size={14} /> {selected.slice(5)} 기록 추가
          </button>
        )}
      </div>
    </div>
  );
}

export function RecordTab({ go }) {
  const { state, dispatch, notify } = useStore();
  const trend = weeklyRates(state).filter((x) => x.rate != null);
  const thisWeek = trend.length ? trend[trend.length - 1].rate : null;
  const lastWeek = trend.length > 1 ? trend[trend.length - 2].rate : null;
  const diff = thisWeek != null && lastWeek != null ? thisWeek - lastWeek : null;
  const [editIntro, setEditIntro] = useState(null); // null | 'new' | introObj
  const [delIntro, setDelIntro] = useState(null); // 삭제 확인 대상 introObj
  // 하위 화면에 다녀와도 보던 뷰로 복귀하도록 UI_STATE에 마지막 선택을 기억
  const [view, setViewRaw] = useState(UI_STATE.recordView); // "table"(급여표, 기본) | "history"(기존 히스토리·통계)
  const setView = (v) => { UI_STATE.recordView = v; setViewRaw(v); };
  const [tableRange, setTableRangeRaw] = useState(UI_STATE.recordTableRange); // 급여표 주별/월별 뷰
  const setTableRange = (v) => { UI_STATE.recordTableRange = v; setTableRangeRaw(v); };
  const [reportYM, setReportYM] = useState(() => { const t = todayISO(); return { y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) - 1 }; });

  const shiftReportMonth = (n) => setReportYM((p) => { const d = new Date(p.y, p.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const report = monthStats(state, reportYM.y, reportYM.m);
  const prevMonthDate = new Date(reportYM.y, reportYM.m - 1, 1);
  const prevReport = monthStats(state, prevMonthDate.getFullYear(), prevMonthDate.getMonth());
  const reportDiff = report.avgRate != null && prevReport.avgRate != null ? report.avgRate - prevReport.avgRate : null;
  const producedG = monthProducedG(state, reportYM.y, reportYM.m);

  const yISO = addDaysISO(todayISO(), -1);
  const yLogs = state.logs[yISO] || [];

  const cats = categoryNames(state);
  const introsByCat = {};
  cats.forEach((c) => { introsByCat[c] = []; });
  state.intros.forEach((it) => {
    if (it.status === "주의" || it.status === "중단") return;
    (introsByCat[it.cat] || (introsByCat[it.cat] = [])).push(it);
  });
  cats.forEach((c) => { introsByCat[c].sort((a, b) => a.name.localeCompare(b.name, "ko")); });
  const warnIntros = state.intros.filter((it) => it.status === "주의" || it.status === "중단").sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <ScreenHeader title="기록" />
      <div style={{ padding: "0 18px 14px" }}>
        <Segmented value={view} onChange={setView} options={[{ value: "table", label: "급여표" }, { value: "history", label: "히스토리" }]} />
      </div>

      {view === "table" && (
        <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <Segmented value={tableRange} onChange={setTableRange} options={[{ value: "week", label: "주별" }, { value: "month", label: "월별" }]} />
          {tableRange === "week" ? <FeedingWeekPanel go={go} /> : <FeedingMonthPanel go={go} />}
        </div>
      )}

      {view === "history" && (
      <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: C.sageLight, borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: C.sageDeep, fontWeight: 600 }}>이번 주 평균 섭취율</div>
          <div className="flex items-end" style={{ gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: C.sageDeep, fontFamily: "'Gowun Dodum', sans-serif" }}>{thisWeek != null ? `${thisWeek}%` : "—"}</span>
            {diff != null && <span style={{ fontSize: 12, color: diff >= 0 ? C.sage : C.apricot, fontWeight: 700, marginBottom: 4 }}>{diff >= 0 ? "▲" : "▼"} 지난주 대비 {Math.abs(diff)}%p</span>}
          </div>
          {trend.length > 1 && (
            <div style={{ height: 90, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[40, 100]} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${C.border}` }} formatter={(v) => [`${v}%`, "섭취율"]} />
                  <Line type="monotone" dataKey="rate" stroke={C.sage} strokeWidth={2.5} dot={{ r: 3, fill: C.sage }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
            <button onClick={() => shiftReportMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronLeft size={15} color={C.muted} /></button>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{reportYM.y}년 {reportYM.m + 1}월 리포트</span>
            <button onClick={() => shiftReportMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><ChevronRight size={15} color={C.muted} /></button>
          </div>
          {report.count === 0 ? (
            <div style={{ textAlign: "center", padding: "10px 0", fontSize: 12, color: C.muted }}>이 달엔 급여 기록이 없습니다</div>
          ) : (
            <>
              <div className="flex items-center" style={{ gap: 18, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 600, marginBottom: 2 }}>급여 횟수</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: C.ink }}>{report.count}회</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 600, marginBottom: 2 }}>평균 섭취율</div>
                  <div className="flex items-end" style={{ gap: 6 }}>
                    <span style={{ fontSize: 17, fontWeight: 900, color: C.sageDeep }}>{report.avgRate != null ? `${report.avgRate}%` : "—"}</span>
                    {reportDiff != null && <span style={{ fontSize: 11, color: reportDiff >= 0 ? C.sage : C.apricot, fontWeight: 700 }}>{reportDiff >= 0 ? "▲" : "▼"} {Math.abs(reportDiff)}%p</span>}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, marginBottom: 6 }}>카테고리별 추정 섭취 비율</div>
              <CategoryTotalsBar totals={report.catTotals} height={8} />
              <div style={{ marginTop: 8 }}><CategoryLegend /></div>

              {report.topIngredients.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
                  <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, marginBottom: 8 }}>이 달 많이 먹은 재료 TOP {report.topIngredients.length}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {report.topIngredients.map((ing, i) => (
                      <div key={ing.name} className="flex items-center justify-between">
                        <div className="flex items-center" style={{ gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, width: 14 }}>{i + 1}</span>
                          <CatDot name={ing.name} size={7} /><span style={{ fontSize: 12, color: C.ink }}>{ing.name}</span>
                        </div>
                        <span style={{ fontSize: 11.5, color: C.sageDeep, fontWeight: 700 }}>약 {ing.g}g</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.productMealRate != null && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
                  <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, marginBottom: 6 }}>제작 vs 시판 (끼니 수 기준)</div>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: C.inkSoft }}>전체 {report.count}끼 중 시판 포함 {report.productMealCount}끼</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: PRODUCT_COLOR }}>{report.productMealRate}%</span>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
                <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, marginBottom: 6 }}>제조량 대비 소비량</div>
                {producedG > 0 ? (
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: C.inkSoft }}>제조 {producedG}g · 재고 차감(제공) {report.totalProv}g</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: report.totalProv > producedG ? C.apricot : C.sageDeep }}>
                      {Math.round((report.totalProv / producedG) * 100)}%
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: C.muted }}>이 달에 제조 기록(제조 이력)이 없어 비교할 수 없어요</div>
                )}
              </div>
            </>
          )}
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 8 }}>히스토리</div>
          <button onClick={() => go("recordHistory")} className="flex flex-col" style={{ width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, cursor: "pointer" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>어제 · {yISO.slice(5)}</span>
              <div className="flex items-center" style={{ gap: 4 }}>
                <span style={{ fontSize: 10.5, color: C.muted }}>전체 히스토리</span>
                <ChevronRight size={14} color={C.muted} />
              </div>
            </div>
            {yLogs.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted }}>급여 기록이 없습니다</div>
            ) : yLogs.map((log) => {
              const prov = logProvideG(log);
              const pct = prov ? Math.round((log.intakeG / prov) * 100) : 0;
              return (
                <div key={log.id} className="flex items-center justify-between" style={{ marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, color: C.inkSoft }}>{log.label} · {prov}g 중 {log.intakeG}g</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: pct >= 85 ? C.sageDeep : C.apricot }}>{pct}%</span>
                </div>
              );
            })}
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>지금까지 먹어본 재료</span>
            <button onClick={() => setEditIntro("new")} className="flex items-center" style={{ gap: 3, background: "none", border: "none", cursor: "pointer" }}>
              <Plus size={13} color={C.sageDeep} /><span style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep }}>추가</span>
            </button>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {cats.map((cat) => (introsByCat[cat] || []).length > 0 && (
              <div key={cat}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5 }}>{cat} ({introsByCat[cat].length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {introsByCat[cat].map((it) => (
                    <Chip key={it.id} cat={it.cat} onClick={() => go("ingredientInfo", { name: it.name })} onDelete={() => setDelIntro(it)}>{it.name}</Chip>
                  ))}
                </div>
              </div>
            ))}
            {warnIntros.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: C.apricot, fontWeight: 700, marginBottom: 5 }}>⚠ 주의/중단</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {warnIntros.map((it) => (
                    <Chip key={it.id} tone="warn" onClick={() => go("ingredientInfo", { name: it.name })} onDelete={() => setDelIntro(it)}>{it.name}{it.memo ? ` — ${it.memo}` : ""}</Chip>
                  ))}
                </div>
              </div>
            )}
            {state.intros.length === 0 && <div style={{ textAlign: "center", fontSize: 11.5, color: C.muted }}>아직 기록된 재료가 없습니다</div>}
          </div>
        </div>
      </div>
      )}
      {editIntro && <IntroEditModal intro={editIntro} onClose={() => setEditIntro(null)} />}
      {delIntro && (
        <ConfirmModal
          title={`'${delIntro.name}' 기록을 삭제할까요?`}
          onConfirm={() => {
            dispatch({ type: "INTRO_DELETE", id: delIntro.id });
            setDelIntro(null);
            notify(`'${delIntro.name}' 기록을 삭제했습니다`, () => dispatch({ type: "RESTORE_INTRO", intro: delIntro }));
          }}
          onCancel={() => setDelIntro(null)}
        />
      )}
    </div>
  );
}

/* =====================================================================
   재료 정보 추가·수정 모달 (기록 탭 "먹어본 재료" 겸 재료 도입 기록)
   ===================================================================== */
export function IntroEditModal({ intro, onClose }) {
  const { state, dispatch, notify } = useStore();
  const isNew = intro === "new";
  const base = isNew ? {} : intro;
  const [picker, setPicker] = useState(false);
  const [confirmingDel, setConfirmingDel] = useState(false);
  const [name, setName] = useState(base.name || "");
  const [cat, setCat] = useState(base.cat || defaultCategoryName(state));
  const [status, setStatus] = useState(base.status || "이상없음");
  const [memo, setMemo] = useState(base.memo || "");

  const save = () => {
    if (!name) return;
    dispatch({ type: "INTRO_UPSERT", intro: { id: isNew ? undefined : base.id, name, cat, status, memo, date: base.date || todayISO() } });
    onClose();
  };
  const del = () => {
    dispatch({ type: "INTRO_DELETE", id: base.id });
    notify(`'${base.name}' 기록을 삭제했습니다`, () => dispatch({ type: "RESTORE_INTRO", intro: base }));
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", borderRadius: "20px 20px 0 0", padding: "16px 18px calc(26px + env(safe-area-inset-bottom))", position: "relative" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{isNew ? "재료 추가" : "재료 정보 수정"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {isNew ? (
            <button onClick={() => setPicker(true)} className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", cursor: "pointer" }}>
              <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>재료</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: name ? C.ink : C.muted }}>{name || "선택"}</span>
            </button>
          ) : (
            <div className="flex items-center" style={{ gap: 8 }}><CatDot name={name} size={9} /><span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{name}</span></div>
          )}
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }}>카테고리</div>
            <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
              {categoryNames(state).map((c) => (
                <button key={c} onClick={() => setCat(c)} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                  border: "none", background: cat === c ? C.sage : C.sageLight, color: cat === c ? "#fff" : C.sageDeep }}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }}>반응</div>
            <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
              {["이상없음", "관찰중", "주의", "중단"].map((s) => (
                <button key={s} onClick={() => setStatus(s)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                  border: "none", background: status === s ? ((s === "주의" || s === "중단") ? C.apricot : C.sage) : C.sageLight, color: status === s ? "#fff" : C.sageDeep }}>{s}</button>
              ))}
            </div>
          </div>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: C.ink, outline: "none" }} />
          <button onClick={save} style={primaryBtn}>{isNew ? "추가" : "저장"}</button>
          {!isNew && <button onClick={() => setConfirmingDel(true)} style={{ background: "none", border: "none", color: C.apricot, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0" }}>이 기록 삭제</button>}
        </div>
        {picker && <IngredientPicker onPick={(n, c) => { setName(n); setCat(c || catOf(state, n)); setPicker(false); }} onClose={() => setPicker(false)} />}
        {confirmingDel && (
          <ConfirmModal
            title={`'${name}' 기록을 삭제할까요?`}
            onConfirm={del}
            onCancel={() => setConfirmingDel(false)}
          />
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   기록 히스토리 전체 보기
   ===================================================================== */
export function RecordHistoryScreen({ onBack }) {
  const { state, dispatch, notify } = useStore();
  const [delDay, setDelDay] = useState(null); // 삭제 확인 대상 날짜 (일자 전체 삭제)
  const [delEntry, setDelEntry] = useState(null); // 삭제 확인 대상 { date, logId, label } (개별 삭제)
  const logDates = Object.keys(state.logs).filter((d) => (state.logs[d] || []).length > 0).sort().reverse();

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title="급여 히스토리" onBack={onBack} />
      <div style={{ padding: "8px 18px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {logDates.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted }}>아직 급여 기록이 없습니다</div>}
        {logDates.map((d) => (
          <div key={d} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{d}</span>
              <button onClick={() => setDelDay(d)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <Trash2 size={13} color={C.muted} />
              </button>
            </div>
            {(state.logs[d] || []).map((log) => {
              const prov = logProvideG(log);
              const pct = prov ? Math.round((log.intakeG / prov) * 100) : 0;
              return (
                <div key={log.id} style={{ marginBottom: 5 }}>
                  <div className="flex items-center justify-between" style={{ gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: C.inkSoft }}>{log.label} · {prov}g 중 {log.intakeG}g</span>
                    <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: pct >= 85 ? C.sageDeep : C.apricot }}>{pct}%</span>
                      <button onClick={() => setDelEntry({ date: d, logId: log.id, label: log.label })} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                        <X size={13} color={C.muted} />
                      </button>
                    </div>
                  </div>
                  <AuthorInfo createdBy={log.createdBy} createdAt={log.createdAt} updatedBy={log.updatedBy} updatedAt={log.updatedAt} size={10} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {delDay && (
        <ConfirmModal
          title={`${delDay} 기록을 전체 삭제할까요?`}
          message="이 날짜의 급여 기록이 모두 삭제됩니다."
          warning="이 기록들이 차감했던 재고는 자동으로 복원됩니다."
          onConfirm={() => {
            const logsBackup = state.logs[delDay] || [];
            const miss = unrestorableStockNames(state, logsBackup);
            dispatch({ type: "LOG_DELETE_DAY", date: delDay });
            setDelDay(null);
            notify(`${delDay} 기록을 삭제하고 재고를 복원했습니다${miss.length > 0 ? ` (배치가 없어 복원 못함: ${miss.join(", ")})` : ""}`,
              () => dispatch({ type: "RESTORE_LOG_DAY", date: delDay, logs: logsBackup }));
          }}
          onCancel={() => setDelDay(null)}
        />
      )}
      {delEntry && (
        <ConfirmModal
          title={`'${delEntry.label}' 기록을 삭제할까요?`}
          warning="이 기록이 차감했던 재고는 자동으로 복원됩니다."
          onConfirm={() => {
            const log = (state.logs[delEntry.date] || []).find((l) => l.id === delEntry.logId);
            const miss = log ? unrestorableStockNames(state, [log]) : [];
            dispatch({ type: "LOG_DELETE_ENTRY", date: delEntry.date, logId: delEntry.logId });
            setDelEntry(null);
            if (log) notify(`'${delEntry.label}' 기록을 삭제하고 재고를 복원했습니다${miss.length > 0 ? ` (배치가 없어 복원 못함: ${miss.join(", ")})` : ""}`,
              () => dispatch({ type: "RESTORE_LOG_ENTRY", date: delEntry.date, log }));
          }}
          onCancel={() => setDelEntry(null)}
        />
      )}
    </div>
  );
}

/* =====================================================================
   급여표 셀 상세 - 계획(식단표) vs 실제(급여기록) 비교
   ===================================================================== */
export function FeedingCompareScreen({ date, logId, label: labelProp, onBack }) {
  const { state } = useStore();
  const dayLogs = state.logs[date] || [];
  // logId 우선 매칭 (같은 이름 기록이 2건 이상이어도 정확한 기록을 표시), 구 라우팅은 label 폴백
  const log = (logId ? dayLogs.find((l) => l.id === logId) : null)
    || (labelProp ? dayLogs.find((l) => l.label === labelProp) : null);
  const label = log ? log.label : labelProp;
  const planLive = (state.plans[date] || []).find((m) => m.label === label);
  // 기록 저장 당시의 식단표 스냅샷을 우선 사용 (이후 식단표가 바뀌어도 저장 당시 기준으로 비교).
  // 스냅샷이 없는 옛 기록은 현재 식단표로 대체
  const snapshotUsed = !!(log && log.planSnapshot);
  const plan = snapshotUsed ? log.planSnapshot : planLive;
  const planTotal = plan ? totalG(state, plan.items) : 0;
  const provTotal = log ? logProvideG(log) : 0;
  const pct = log && provTotal ? Math.round((log.intakeG / provTotal) * 100) : 0;

  // 항목별 계획 g / 실제 제공 g 비교 데이터 - 시판 제품은 name이 없으므로 productId 기반 키 사용
  const keyOf = (it) => (it.source === "product" ? `product:${it.productId}` : it.name);
  const rowLabel = {}; // key → 표시용 { text, isProduct }
  const planG = {};
  (plan ? plan.items : []).forEach((it) => {
    const k = keyOf(it);
    planG[k] = (planG[k] || 0) + gOf(state, it);
    rowLabel[k] = it.source === "product" ? { text: it.productName, isProduct: true } : { text: it.name, isProduct: false };
  });
  const actualG = {};
  (log ? log.items : []).forEach((it) => {
    const k = keyOf(it);
    actualG[k] = (actualG[k] || 0) + gOf(state, it);
    rowLabel[k] = it.source === "product" ? { text: it.productName, isProduct: true } : { text: it.name, isProduct: false };
  });
  const allNames = sortByCategory(
    state,
    Array.from(new Set([...Object.keys(planG), ...Object.keys(actualG)])).map((k) => ({ key: k, source: rowLabel[k].isProduct ? "product" : undefined, name: rowLabel[k].text })),
    (x) => x.name
  );
  const totalDiff = provTotal - planTotal;

  const diffText = (d) => (d > 0 ? `+${d}g` : d < 0 ? `${d}g` : "—");
  const diffColor = (d) => (d > 0 ? C.apricot : d < 0 ? "#4A7FB5" : C.muted);
  const cellStyle = { fontSize: 11.5, color: C.inkSoft, textAlign: "right" };
  const gridCols = "minmax(64px,1.4fr) 1fr 1fr 1fr";

  return (
    <div style={{ paddingBottom: 90 }}>
      <SubHeader title={`${date.slice(5)} · ${label}`} onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* 섭취 요약 */}
        <div style={{ background: C.sageLight, borderRadius: 16, padding: 14 }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 13, fontWeight: 700, color: C.sageDeep }}>섭취 요약</span>
            {log
              ? <span style={{ fontSize: 12.5, fontWeight: 800, color: C.sageDeep }}>{provTotal}g 중 {log.intakeG}g ({pct}%)</span>
              : <span style={{ fontSize: 12, color: C.muted }}>급여 기록 없음</span>}
          </div>
          {log && (
            <div style={{ marginTop: 8 }}>
              <AuthorInfo createdBy={log.createdBy} createdAt={log.createdAt} updatedBy={log.updatedBy} updatedAt={log.updatedAt} />
            </div>
          )}
        </div>

        {/* 항목별 계획 대비 기록 비교표 */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>계획 대비 기록</span>
            <span style={{ fontSize: 9.5, color: C.muted, fontWeight: 600 }}>
              {snapshotUsed ? "기록 저장 당시 식단표 기준" : plan ? "현재 식단표 기준 (저장 당시 스냅샷 없음)" : ""}
            </span>
          </div>
          {!plan && !log && <div style={{ textAlign: "center", padding: "16px 0", fontSize: 12, color: C.muted }}>계획·기록 정보가 없습니다</div>}
          {(plan || log) && (
            <>
              {!plan && <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 6 }}>이 끼니의 계획 정보가 없어 기록만 표시합니다(계획이 삭제되었을 수 있어요)</div>}
              <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 4, padding: "6px 8px", background: C.sageLight, borderRadius: "8px 8px 0 0", marginTop: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep }}>재료</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep, textAlign: "right" }}>계획</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep, textAlign: "right" }}>기록(제공)</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.sageDeep, textAlign: "right" }}>증감</span>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 8px 8px" }}>
                {allNames.map((row, i) => {
                  const p = planG[row.key]; const a = actualG[row.key];
                  const added = p == null;   // 계획엔 없고 기록에만 있음
                  const removed = a == null; // 계획에 있었지만 기록에서 빠짐
                  const d = (a || 0) - (p || 0);
                  return (
                    <div key={row.key} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 4, alignItems: "center", padding: "7px 8px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, opacity: removed ? 0.75 : 1 }}>
                      <div className="flex items-center" style={{ minWidth: 0, gap: 2 }}>
                        {row.source === "product" ? <ProductDot /> : <CatDot name={row.name} />}
                        <span style={{ fontSize: 12, color: C.ink, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
                      </div>
                      <span style={cellStyle}>{p != null ? `${p}g` : "—"}</span>
                      <span style={{ ...cellStyle, fontWeight: 700, color: C.ink }}>{a != null ? `${a}g` : "—"}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, textAlign: "right",
                        color: added ? C.sageDeep : removed ? C.apricot : diffColor(d) }}>
                        {added ? "추가" : removed ? "빠짐" : diffText(d)}
                      </span>
                    </div>
                  );
                })}
                {/* 합계 행 */}
                <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 4, alignItems: "center", padding: "8px 8px", borderTop: `1px dashed ${C.border}`, background: C.bg }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.ink }}>합계</span>
                  <span style={{ ...cellStyle, fontWeight: 700 }}>{plan ? `${planTotal}g` : "—"}</span>
                  <span style={{ ...cellStyle, fontWeight: 800, color: C.ink }}>{log ? `${provTotal}g` : "—"}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, textAlign: "right", color: plan && log ? diffColor(totalDiff) : C.muted }}>
                    {plan && log ? diffText(totalDiff) : "—"}
                  </span>
                </div>
              </div>
              <div className="flex items-center" style={{ gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9.5, color: C.sageDeep, fontWeight: 700 }}>추가 = 계획에 없던 재료</span>
                <span style={{ fontSize: 9.5, color: C.apricot, fontWeight: 700 }}>빠짐 = 계획엔 있었지만 안 준 재료</span>
                <span style={{ fontSize: 9.5, color: C.muted, fontWeight: 700 }}>증감 = 제공량 기준</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
