/* 계획(식단표) 끼니 재료 편집기 - MealEditScreen·BulkSaveScreen 공용 (UX-1) */
import React, { useState } from "react";
import { Plus, Minus, Trash2 } from "lucide-react";
import { C, stepBtn } from "../theme";
import { gOf, sortByCategory, unitGOf } from "../state/appState";
import { useStore } from "../store";
import { CatDot, NumInput, ProductDot, Segmented } from "./common";

// 재료·시판 제품 항목을 함께 다루기 위한 공통 식별키 (제품은 name이 없고 productId로 식별)
const keyOf = (it) => it.productId || it.name;

/* =====================================================================
   계획(식단표) 끼니 재료 편집 - MealEditScreen과 BulkSaveScreen이 공유하는 공용 로직/UI (UX-1)
   동작 규칙 통일: 수량 스텝퍼는 최소 1 유지, 재료 제거는 휴지통 버튼으로만
   ===================================================================== */
export function usePlanItemsEditor(initialItems) {
  const { state } = useStore();
  const [items, setItems] = useState(initialItems);
  // 수량 최소 1 클램프 - 스텝퍼 연타로 재료가 사라지는 실수 방지 (삭제는 휴지통으로)
  const upQty = (key, d) => setItems((p) => p.map((it) => keyOf(it) === key ? { ...it, qty: Math.max(1, it.qty + d) } : it));
  const upUnit = (key, v) => setItems((p) => p.map((it) => keyOf(it) === key ? { ...it, unitG: v } : it));
  const upGrams = (key, v) => setItems((p) => p.map((it) => keyOf(it) === key ? { ...it, gramsOverride: v } : it));
  const setMode = (key, mode) => setItems((p) => p.map((it) => {
    if (keyOf(it) !== key) return it;
    const curG = it.gramsOverride != null ? it.gramsOverride : it.qty * (it.unitG || 15);
    if (mode === "gram") return { ...it, gramsOverride: curG };
    return { ...it, gramsOverride: null, qty: Math.max(1, Math.round(curG / (it.unitG || 15))) };
  }));
  const rm = (key) => setItems((p) => p.filter((it) => keyOf(it) !== key));
  const addNames = (names) => {
    setItems((p) => {
      const existing = new Set(p.map((it) => it.name));
      const toAdd = names.filter((n) => !existing.has(n)).map((name) => ({ name, qty: 1, unitG: unitGOf(state, name), gramsOverride: null }));
      return [...p, ...toAdd];
    });
  };
  // 시판 제품 추가 - 기본은 "팩" 입력 모드(gramsOverride=null, qty가 곧 제공량이자 재고 차감 단위)
  const addProduct = (product) => {
    setItems((p) => {
      if (p.some((it) => it.productId === product.id)) return p;
      return [...p, { source: "product", productId: product.id, productName: product.name, packG: product.packG, qty: 1, gramsOverride: null }];
    });
  };
  // 시판 제품의 제공량(g) 직접 입력 - 재료 토글과 달리 재고 차감 단위(팩)가 함께 필요하므로,
  // 입력한 g을 담기 위해 필요한 최소 팩 수를 자동으로 계산해 qty에 반영(팩 수 입력칸은 숨김)
  const upProductGrams = (key, v) => setItems((p) => p.map((it) => keyOf(it) === key ? { ...it, gramsOverride: v, qty: Math.max(1, Math.ceil(v / (it.packG || 1))) } : it));
  // 시판 제품의 "팩"/"중량" 입력 방식 전환 - 재료의 큐브/그램 토글과 완전히 동일한 방식으로,
  // 전환 시점의 g을 그대로 이어받고(반대 방향은 팩 수로 반올림) 팩 수는 항상 그에 맞춰 재계산됨
  const setProductMode = (key, mode) => setItems((p) => p.map((it) => {
    if (keyOf(it) !== key) return it;
    const curG = it.gramsOverride != null ? it.gramsOverride : it.qty * (it.packG || 0);
    if (mode === "gram") return { ...it, gramsOverride: curG, qty: Math.max(1, Math.ceil(curG / (it.packG || 1))) };
    return { ...it, gramsOverride: null, qty: Math.max(1, Math.round(curG / (it.packG || 1))) };
  }));
  // 다른 끼니에서 통째로 복사해올 때 사용 (unitG·gramsOverride 기본값 정규화 포함)
  const replaceFrom = (srcItems) => {
    setItems(srcItems.map((it) => (it.source === "product" ? { ...it, gramsOverride: it.gramsOverride != null ? it.gramsOverride : null } : {
      ...it,
      unitG: it.unitG != null ? it.unitG : unitGOf(state, it.name),
      gramsOverride: it.gramsOverride != null ? it.gramsOverride : null,
    })));
  };
  return { items, setItems, upQty, upUnit, upGrams, upProductGrams, setMode, setProductMode, rm, addNames, addProduct, replaceFrom };
}

export function PlanItemsEditor({ editor }) {
  const { state } = useStore();
  const { items, upQty, upUnit, upGrams, upProductGrams, setMode, setProductMode, rm } = editor;
  return (
    <div>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginBottom: 6, padding: "0 2px" }}>재료 ({items.length})</div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        {sortByCategory(state, items).map((it, i) => {
          const key = keyOf(it);
          if (it.source === "product") {
            const isGram = it.gramsOverride != null;
            const productIngredients = (state.products[it.productId] || {}).ingredients || [];
            return (
              <div key={key} style={{ padding: "11px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: C.surface }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <div className="flex items-center"><ProductDot size={8} /><span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{it.productName}</span></div>
                  <button onClick={() => rm(key)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Trash2 size={14} color={C.apricot} /></button>
                </div>
                {productIngredients.length > 0 && (
                  <div className="flex items-center" style={{ gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                    {productIngredients.map((n) => (
                      <span key={n} style={{ fontSize: 10, color: C.sageDeep, background: C.sageLight, borderRadius: 999, padding: "1px 7px" }}>{n}</span>
                    ))}
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <Segmented value={isGram ? "gram" : "pack"} onChange={(v) => setProductMode(key, v)} options={[{ value: "pack", label: "팩으로 입력" }, { value: "gram", label: "중량으로 입력" }]} />
                </div>
                {isGram ? (
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 10.5, color: C.muted }}>실제 제공량</span>
                    <NumInput value={it.gramsOverride} onChange={(v) => upProductGrams(key, v)} width={56} suffix="g" />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 10.5, color: C.muted }}>1팩 {it.packG}g</span>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <button onClick={() => upQty(key, -1)} style={stepBtn}><Minus size={12} color={C.inkSoft} /></button>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, minWidth: 40, textAlign: "center", whiteSpace: "nowrap" }}>{it.qty}팩</span>
                      <button onClick={() => upQty(key, 1)} style={stepBtn}><Plus size={12} color={C.inkSoft} /></button>
                    </div>
                  </div>
                )}
                <div style={{ textAlign: "right", fontSize: 10.5, color: C.muted, marginTop: 5 }}>
                  = {gOf(state, it)}g{isGram ? ` (재고 차감 ${it.qty}팩)` : ""}
                </div>
              </div>
            );
          }
          const isGram = it.gramsOverride != null;
          return (
            <div key={key} style={{ padding: "11px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: C.surface }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div className="flex items-center"><CatDot name={it.name} size={8} /><span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{it.name}</span></div>
                <button onClick={() => rm(key)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Trash2 size={14} color={C.apricot} /></button>
              </div>
              <div style={{ marginBottom: 8 }}>
                <Segmented value={isGram ? "gram" : "cube"} onChange={(v) => setMode(key, v)} options={[{ value: "cube", label: "큐브로 입력" }, { value: "gram", label: "그램으로 입력" }]} />
              </div>
              {isGram ? (
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 10.5, color: C.muted }}>총 중량</span>
                  <NumInput value={it.gramsOverride} onChange={(v) => upGrams(key, v)} width={56} suffix="g" />
                </div>
              ) : (
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
              )}
              <div style={{ textAlign: "right", fontSize: 10.5, color: C.muted, marginTop: 5 }}>
                = {gOf(state, it)}g{isGram && it.unitG ? ` (약 ${Math.round((it.gramsOverride / it.unitG) * 10) / 10}큐브 상당)` : ""}
              </div>
            </div>
          );
        })}
        {items.length === 0 && <div style={{ padding: 18, textAlign: "center", fontSize: 12, color: C.muted }}>추가된 재료가 없습니다</div>}
      </div>
    </div>
  );
}

