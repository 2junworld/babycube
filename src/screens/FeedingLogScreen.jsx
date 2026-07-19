/* 급여 기록 화면 - 제공 재료·재고 반영·섭취량·식단표 동기화 */
import React, { useState } from "react";
import { Plus, Minus, Trash2, Refrigerator, Snowflake } from "lucide-react";
import { C, stepBtn, PRODUCT_COLOR } from "../theme";
import { fmtTime, uid } from "../lib/dates";
import { deductFridge, deductFrozen, deductProductPacks, isStaple, restoreFridge, restoreFrozen, restoreProductPacks, sortByCategory, stockFridgeG, stockTotalCubes, unitGOf } from "../state/appState";
import { pairingNamesOf } from "../lib/pairing";
import { useStore } from "../store";
import { AuthorInfo, CatDot, ConfirmModal, NumInput, ProductDot, Segmented, SubHeader, TimePicker } from "../components/common";
import { StockChangeHint, ProductStockChangeHint } from "../components/hints";
import { IngredientPicker, ProductPicker } from "../components/pickers";
import { primaryBtn } from "../theme";

// 재료·시판 제품 항목을 함께 다루기 위한 공통 식별키 (제품은 name이 없고 productId로 식별)
const keyOf = (it) => it.productId || it.name;

/* =====================================================================
   급여 기록 화면 (실제 먹인 끼니 → 재고 차감 + 섭취율)
   ===================================================================== */
export function FeedingLogScreen({ date, planMeal, existingLog, onBack }) {
  const { state, dispatch, notify } = useStore();
  // 바로 기록 모드: 계획 없이 진입 - 현재 시각 + 지금 시간대에 가장 가까운 끼니 이름으로 시작
  const adhoc = !existingLog && !planMeal;
  const [adhocBase] = useState(() => {
    const n = new Date();
    const nowHM = `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
    const toMin = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
    const nearest = [...state.mealSlots].sort((a, b) => Math.abs(toMin(a.time) - toMin(nowHM)) - Math.abs(toMin(b.time) - toMin(nowHM)))[0];
    return { label: nearest ? nearest.label : "끼니", time: nowHM, items: [] };
  });
  const base = existingLog || planMeal || adhocBase;
  // 실제 급여 시간: 계획 시간과 별개로 수정 가능 (계획은 그대로 두고 기록에만 반영됨)
  const [time, setTime] = useState(base.time || "12:00");
  const [label, setLabel] = useState(base.label || "끼니");
  // 기록 내용을 식단표에도 반영할지 여부 - 같은 이름의 끼니가 식단표에 있으면
  // 그 끼니를 기록 내용으로 업데이트(동기화)하고, 없으면 새로 추가. 모두 '바로기록' 표시가 붙음
  const [addToPlan, setAddToPlan] = useState(false);
  // 현재 선택된 끼니 이름에 해당하는 오늘 식단표 끼니 (동기화 대상)
  const targetPlanMeal = (planMeal && planMeal.id) ? planMeal : (state.plans[date] || []).find((m) => m.label === label);
  // 제공 항목: 출처(냉동/냉장) + 수량. 식단표에서 "그램으로 입력"(gramsOverride)한 재료는
  // 실제 중량을 그대로 이어받도록 냉장(계량) 방식으로 옮겨온다 (기본 15g으로 뭉개지는 문제 방지)
  const [items, setItems] = useState(
    base.items.map((it) => {
      // 시판 제품 항목: 재료와 달리 unitG 개념이 없고 팩 단위로만 다룸. gramsOverride가 있으면
      // 한 팩을 다 먹이지 않은 경우로, 재고 차감 단위(qty=팩)와 별개로 표시용 제공량을 override함
      if (it.source === "product") {
        return { source: "product", productId: it.productId, productName: it.productName, packG: it.packG, qty: it.qty || 1,
          gramsOverride: it.gramsOverride != null ? it.gramsOverride : null, deduct: it.deduct !== false };
      }
      const effectiveUnitG = it.unitG != null ? it.unitG : unitGOf(state, it.name);
      // 기존 급여기록을 다시 불러오는 경우: 저장 당시의 source(냉동/냉장)를 그대로 존중해야
      // 냉장(중량) 입력값이 냉동(큐브) 개수로 잘못 바뀌는 문제가 없음
      if (it.source === "fridge") {
        return { name: it.name, source: "fridge", qty: 1, fridgeG: it.qty || 0, unitG: effectiveUnitG, deduct: it.deduct !== false };
      }
      if (it.source === "frozen") {
        return { name: it.name, source: "frozen", qty: it.qty || 1, fridgeG: effectiveUnitG * (it.qty || 1), unitG: effectiveUnitG, deduct: it.deduct !== false };
      }
      // 식단표 항목(아직 급여기록으로 저장된 적 없음, source 필드 없음)
      const hasGramsOverride = it.gramsOverride != null;
      const totalGForItem = hasGramsOverride ? it.gramsOverride : (it.qty || 1) * effectiveUnitG;
      // 기본 출처 선택: 냉동 재고가 조금이라도 있으면 냉동을 기본으로 한다.
      // (버그 수정) 예전엔 "냉장 보관분이 조금이라도 있으면 무조건 냉장"으로 기본값을 잡아서,
      // 실제로는 냉동 큐브로 준 재료인데 남아있던 소량의 냉장 보관분(g)만 차감되고 냉동 재고는
      // 전혀 줄지 않는 문제가 있었음(deductFridge가 부족분을 그냥 버리고 조용히 끝남).
      // 냉동 재고가 아예 없고 냉장 재고만 있을 때만 냉장을 기본값으로 함.
      const hasFrozen = stockTotalCubes(state, it.name) > 0;
      const hasFridge = stockFridgeG(state, it.name) > 0;
      const source = hasGramsOverride ? "fridge" : (!hasFrozen && hasFridge && !isStaple(state, it.name) ? "fridge" : "frozen");
      return {
        name: it.name,
        source,
        qty: hasGramsOverride ? Math.max(1, Math.round(totalGForItem / (effectiveUnitG || 15))) : (it.qty || 1),
        fridgeG: hasGramsOverride ? totalGForItem : (effectiveUnitG * (it.qty || 1)),
        unitG: effectiveUnitG,
        deduct: it.deduct !== false,
      };
    })
  );
  const [picker, setPicker] = useState(false);
  const [productPicker, setProductPicker] = useState(false);
  const [intake, setIntake] = useState(existingLog ? existingLog.intakeG : null);
  const [confirmingSave, setConfirmingSave] = useState(false);

  const provideG = (it) => it.source === "product" ? (it.gramsOverride != null ? it.gramsOverride : it.qty * it.packG) : it.source === "fridge" ? it.fridgeG : it.qty * it.unitG;
  const totalProvide = items.reduce((s, it) => s + provideG(it), 0);

  const setSource = (key, src) => setItems((p) => p.map((it) => keyOf(it) === key ? { ...it, source: src } : it));
  const upQty = (key, d) => setItems((p) => p.map((it) => keyOf(it) === key ? { ...it, qty: Math.max(1, it.qty + d) } : it));
  const upUnit = (key, v) => setItems((p) => p.map((it) => keyOf(it) === key ? { ...it, unitG: v } : it));
  const upFridge = (key, v) => setItems((p) => p.map((it) => keyOf(it) === key ? { ...it, fridgeG: v } : it));
  const upGrams = (key, v) => setItems((p) => p.map((it) => keyOf(it) === key ? { ...it, gramsOverride: v } : it));
  // 시판 제품의 제공량 직접 입력 켜기/끄기 - qty(팩 수, 재고 차감 단위)는 그대로 두고 표시용 제공량만 override
  const toggleProductGramMode = (key) => setItems((p) => p.map((it) => keyOf(it) === key ? { ...it, gramsOverride: it.gramsOverride != null ? null : it.qty * it.packG } : it));
  const toggleDeduct = (key) => setItems((p) => p.map((it) => keyOf(it) === key ? { ...it, deduct: !it.deduct } : it));
  const rm = (key) => setItems((p) => p.filter((it) => keyOf(it) !== key));
  const addItems = (names) => {
    setPicker(false);
    setItems((p) => {
      const existing = new Set(p.map((it) => it.name));
      const toAdd = names.filter((n) => !existing.has(n)).map((name) => ({ name, source: "frozen", qty: 1, fridgeG: 15, unitG: unitGOf(state, name), deduct: true }));
      return [...p, ...toAdd];
    });
  };
  const addProduct = (product) => {
    setProductPicker(false);
    setItems((p) => {
      if (p.some((it) => it.productId === product.id)) return p; // 이미 담긴 제품
      return [...p, { source: "product", productId: product.id, productName: product.name, packG: product.packG, qty: 1, gramsOverride: null, deduct: state.settings.productStockEnabled }];
    });
  };

  const quick = [["완식", 1], ["3/4", 0.75], ["절반", 0.5], ["조금", 0.25], ["거부", 0]];

  const save = () => {
    const logItems = items.map((it) => it.source === "product"
      ? { source: "product", productId: it.productId, productName: it.productName, packG: it.packG, qty: it.qty, gramsOverride: it.gramsOverride != null ? it.gramsOverride : null, deduct: it.deduct !== false }
      : it.source === "fridge"
      ? { name: it.name, source: "fridge", qty: it.fridgeG, unitG: 1, deduct: it.deduct !== false }
      : { name: it.name, source: "frozen", qty: it.qty, unitG: it.unitG, deduct: it.deduct !== false });
    // 저장 시점의 식단표(계획)를 스냅샷으로 함께 저장 - 이후 식단표가 수정·삭제돼도
    // 급여표의 '계획 대비 비교'는 기록 저장 당시의 계획 기준으로 유지됨.
    // 기존 기록을 수정하는 경우엔 최초 저장 때 담아둔 스냅샷을 그대로 보존.
    const planSnapshot = existingLog && existingLog.planSnapshot
      ? existingLog.planSnapshot
      : (planMeal && planMeal.items && planMeal.items.length > 0
        ? { label: planMeal.label, time: planMeal.time,
            items: planMeal.items.map(({ name, qty, unitG, gramsOverride }) => ({
              name, qty, unitG: unitG != null ? unitG : unitGOf(state, name),
              gramsOverride: gramsOverride != null ? gramsOverride : null })) }
        : null);
    dispatch({ type: "LOG_SAVE", date, log: { id: existingLog ? existingLog.id : uid(), label, time, items: logItems, intakeG: intake == null ? totalProvide : intake, planSnapshot } });
    // 기록 내용을 식단표에 반영: 같은 이름의 끼니가 있으면 그 끼니의 재료를 기록 내용으로
    // 교체(계획 시간은 유지)하고, 없으면 새 끼니로 추가. 모두 fromRecord(바로기록) 표시가 붙음.
    // 급여표의 '계획 대비 비교'는 저장 시점 스냅샷(planSnapshot) 기준이라 원래 계획과의 비교는 유지됨
    if (addToPlan) {
      const planItems = items.map((it) => it.source === "product"
        ? { source: "product", productId: it.productId, productName: it.productName, packG: it.packG, qty: it.qty, gramsOverride: it.gramsOverride != null ? it.gramsOverride : null }
        : it.source === "fridge"
        ? { name: it.name, qty: 1, unitG: it.unitG, gramsOverride: it.fridgeG }
        : { name: it.name, qty: it.qty, unitG: it.unitG, gramsOverride: null });
      const target = (planMeal && planMeal.id) ? planMeal : (state.plans[date] || []).find((m) => m.label === label);
      const meal = target
        ? { id: target.id, label: target.label, time: target.time, items: planItems, fromRecord: true }
        : { id: uid(), label, time, items: planItems, fromRecord: true };
      dispatch({ type: "PLAN_SAVE_MEAL", date, meal });
    }
    // 저장 직후 "재고가 실제로 얼마나 차감되었는지"를 토스트로 안내.
    // 재고보다 많이 기록하면 있는 만큼만 차감되므로, 요청량이 아니라 실제 차감량 기준으로
    // 계산해야 함 (LOG_SAVE와 동일한 로직을 복제 재고에 시뮬레이션해서 미리 구함)
    const stockSim = JSON.parse(JSON.stringify(state.stock));
    const productStockSim = JSON.parse(JSON.stringify(state.productStock));
    if (existingLog && existingLog.stockAffected !== false) {
      existingLog.items.forEach((it) => {
        if (it.deduct === false) return;
        const amt = it.deductedQty != null ? it.deductedQty : it.qty;
        if (it.source === "product") restoreProductPacks(productStockSim, it.productId, amt);
        else if (it.source === "fridge") restoreFridge(stockSim, it.name, amt);
        else restoreFrozen(stockSim, it.name, amt);
      });
    }
    const productStockEnabled = state.settings.productStockEnabled;
    const dedInfo = logItems
      .filter((it) => it.deduct !== false)
      .map((it) => {
        if (it.source === "product") {
          return { name: it.productName, unit: "팩", requested: it.qty, actual: productStockEnabled ? deductProductPacks(productStockSim, it.productId, it.qty) : 0 };
        }
        return {
          name: it.name,
          unit: it.source === "fridge" ? "g" : "큐브",
          requested: it.qty,
          actual: it.source === "fridge" ? deductFridge(stockSim, it.name, it.qty) : deductFrozen(stockSim, it.name, it.qty),
        };
      });
    const parts = dedInfo.filter((d) => d.actual > 0).map((d) => `${d.name} ${d.actual}${d.unit}`);
    const shortNames = dedInfo.filter((d) => d.actual < d.requested).map((d) => d.name);
    let msg = parts.length > 0 ? `기록 저장 · 재고 차감: ${parts.join(", ")}` : "기록 저장됨 (재고 차감 없음)";
    if (shortNames.length > 0) msg += ` · 재고 부족(기록만 저장): ${shortNames.join(", ")}`;
    notify(msg);
    onBack();
  };
  const intakeVal = intake == null ? totalProvide : intake;
  const deductCount = items.filter((it) => it.deduct !== false).length;

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title={`${label} 급여 기록`} onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {adhoc && (
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>끼니</span>
            <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {state.mealSlots.map((s) => {
                const active = label === s.label;
                return (
                  <button key={s.id} onClick={() => setLabel(s.label)} style={{ fontSize: 11.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999, cursor: "pointer",
                    border: "none", background: active ? C.sage : C.sageLight, color: active ? "#fff" : C.sageDeep }}>{s.label}</button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
          {/* 앱 공통 TimePicker로 통일 (식단 편집·끼니 설정과 동일 UI, 오전/오후 설정 반영) */}
          <TimePicker bare label="급여 시간" time={time} setTime={setTime} timeFmt={state.settings.timeFmt} />
          <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
            <span style={{ fontSize: 10.5, color: C.muted }}>{fmtTime(time, state.settings.timeFmt)}</span>
            <button onClick={() => { const n = new Date(); setTime(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`); }}
              style={{ fontSize: 11.5, fontWeight: 700, color: C.sageDeep, background: C.sageLight, border: "none", borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}>지금</button>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600, padding: "0 2px" }}>
          재료별로 재고 반영 여부를 선택할 수 있어요
        </div>

        <div>
          <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginBottom: 6, padding: "0 2px" }}>제공한 재료</div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            {sortByCategory(state, items).map((it, i) => {
              const key = keyOf(it);
              return (
                <div key={key} style={{ padding: "11px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: C.surface }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                    <div className="flex items-center">
                      {it.source === "product" ? <ProductDot size={8} /> : <CatDot name={it.name} size={8} />}
                      <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{it.source === "product" ? it.productName : it.name}</span>
                    </div>
                    <button onClick={() => rm(key)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Trash2 size={14} color={C.apricot} /></button>
                  </div>
                  {it.source === "product" ? (
                    <>
                      {(state.products[it.productId] || {}).ingredients && (state.products[it.productId] || {}).ingredients.length > 0 && (
                        <div className="flex items-center" style={{ gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                          {state.products[it.productId].ingredients.map((n) => (
                            <span key={n} style={{ fontSize: 10, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "1px 7px" }}>{n}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 10.5, color: C.muted }}>1팩 {it.packG}g</span>
                        <div className="flex items-center" style={{ gap: 8 }}>
                          <button onClick={() => upQty(key, -1)} style={stepBtn}><Minus size={12} color={C.inkSoft} /></button>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, minWidth: 40, textAlign: "center", whiteSpace: "nowrap" }}>{it.qty}팩</span>
                          <button onClick={() => upQty(key, 1)} style={stepBtn}><Plus size={12} color={C.inkSoft} /></button>
                        </div>
                      </div>
                      {it.gramsOverride != null && (
                        <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                          <span style={{ fontSize: 10.5, color: C.muted }}>실제 제공량 (한 팩을 다 안 먹인 경우)</span>
                          <NumInput value={it.gramsOverride} onChange={(v) => upGrams(key, v)} width={52} suffix="g" />
                        </div>
                      )}
                      <button onClick={() => toggleProductGramMode(key)} style={{ marginTop: 7, background: "none", border: "none", fontSize: 10, fontWeight: 700, color: C.sageDeep, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                        {it.gramsOverride != null ? "팩 용량 기준으로 되돌리기" : "제공량 직접 입력"}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                        <Segmented value={it.source} onChange={(v) => setSource(key, v)} options={[
                          { value: "frozen", label: <span className="flex items-center justify-center" style={{ gap: 4 }}><Snowflake size={12} /> 냉동</span> },
                          { value: "fridge", label: <span className="flex items-center justify-center" style={{ gap: 4 }}><Refrigerator size={12} /> 냉장</span> },
                        ]} />
                      </div>
                      {it.source === "frozen" ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center" style={{ gap: 6 }}>
                            <span style={{ fontSize: 10.5, color: C.muted }}>큐브당</span>
                            <NumInput value={it.unitG} onChange={(v) => upUnit(key, v)} width={38} suffix="g" />
                          </div>
                          <div className="flex items-center" style={{ gap: 8 }}>
                            <button onClick={() => upQty(key, -1)} style={stepBtn}><Minus size={12} color={C.inkSoft} /></button>
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, minWidth: 40, textAlign: "center", whiteSpace: "nowrap" }}>{it.qty}큐브</span>
                            <button onClick={() => upQty(key, 1)} style={stepBtn}><Plus size={12} color={C.inkSoft} /></button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span style={{ fontSize: 10.5, color: C.muted }}>냉장 보관분 (계량)</span>
                          <NumInput value={it.fridgeG} onChange={(v) => upFridge(key, v)} width={52} suffix="g" />
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ textAlign: "right", fontSize: 10.5, color: C.muted, marginTop: 5 }}>제공 {provideG(it)}g</div>
                  {it.source === "product"
                    ? <ProductStockChangeHint item={it} checked={it.deduct !== false} onToggle={() => toggleDeduct(key)} />
                    : <StockChangeHint item={it} checked={it.deduct !== false} onToggle={() => toggleDeduct(key)} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center" style={{ gap: 8 }}>
          <button onClick={() => setPicker(true)} className="flex items-center justify-center" style={{ flex: 1, gap: 6, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: C.muted, background: "transparent", cursor: "pointer" }}>
            <Plus size={14} /> 재료 추가
          </button>
          <button onClick={() => setProductPicker(true)} className="flex items-center justify-center" style={{ flex: 1, gap: 6, border: `1.5px dashed ${PRODUCT_COLOR}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: PRODUCT_COLOR, background: "transparent", cursor: "pointer" }}>
            <Plus size={14} /> 시판 제품 추가
          </button>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>섭취량</span>
            <span style={{ fontSize: 12, color: C.muted }}>총 제공 {totalProvide}g</span>
          </div>
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {quick.map(([lab, r]) => {
              const v = Math.round(totalProvide * r);
              const active = intake === v;
              return (
                <button key={lab} onClick={() => setIntake(v)} style={{ fontSize: 11.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999, cursor: "pointer",
                  border: "none", background: active ? C.sage : C.sageLight, color: active ? "#fff" : C.sageDeep }}>{lab}</button>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11.5, color: C.inkSoft }}>직접 입력</span>
            <div className="flex items-center" style={{ gap: 6 }}>
              <input type="number" value={intake == null ? "" : intake} placeholder={String(totalProvide)} onChange={(e) => setIntake(e.target.value === "" ? null : Number(e.target.value))}
                style={{ width: 60, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 13, textAlign: "center", color: C.ink, outline: "none" }} />
              <span style={{ fontSize: 12, color: C.muted }}>g</span>
            </div>
          </div>
          {intake != null && totalProvide > 0 && (
            <div style={{ marginTop: 10, textAlign: "right", fontSize: 12, fontWeight: 700, color: C.sageDeep }}>
              섭취율 {Math.round((intake / totalProvide) * 100)}%
            </div>
          )}
        </div>

        <label className="flex items-center" style={{ gap: 9, padding: "2px 4px", cursor: "pointer" }}>
          <input type="checkbox" checked={addToPlan} onChange={(e) => setAddToPlan(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.sage, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, lineHeight: 1.5 }}>
            {targetPlanMeal ? "이 기록대로 식단표 끼니 업데이트" : "이 기록을 식단표에도 추가"}<br />
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>
              {targetPlanMeal
                ? `식단표 '${targetPlanMeal.label}' 끼니의 재료가 이 기록 내용으로 바뀌어요 (계획 시간은 유지)`
                : "식단표에 '바로 기록' 표시가 붙어 계획한 끼니와 구분돼요"}
            </span>
          </span>
        </label>
        {existingLog && (
          <AuthorInfo createdBy={existingLog.createdBy} createdAt={existingLog.createdAt} updatedBy={existingLog.updatedBy} updatedAt={existingLog.updatedAt} />
        )}
        <button onClick={() => items.length > 0 && setConfirmingSave(true)} disabled={items.length === 0}
          style={{ ...primaryBtn, opacity: items.length === 0 ? 0.5 : 1, cursor: items.length === 0 ? "default" : "pointer" }}>
          {items.length === 0 ? "재료를 추가해 주세요" : "기록 저장"}
        </button>
      </div>
      {picker && <IngredientPicker multi onPick={addItems} alreadyAdded={items.filter((it) => it.source !== "product").map((it) => it.name)} pairingNames={pairingNamesOf(state, items)} onClose={() => setPicker(false)} date={date} />}
      {productPicker && <ProductPicker onPick={addProduct} onClose={() => setProductPicker(false)} />}
      {confirmingSave && (
        <ConfirmModal
          title={`${label} 급여 기록을 저장할까요?`}
          message={`제공 ${totalProvide}g 중 섭취 ${intakeVal}g${totalProvide ? ` (${Math.round((intakeVal / totalProvide) * 100)}%)` : ""}${deductCount > 0 ? ` · 재고 반영이 켜진 재료 ${deductCount}개의 재고가 차감됩니다.` : ""}`}
          confirmLabel="저장"
          danger={false}
          onConfirm={() => { setConfirmingSave(false); save(); }}
          onCancel={() => setConfirmingSave(false)}
        />
      )}
    </div>
  );
}
