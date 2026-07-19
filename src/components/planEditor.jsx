/* 계획(식단표) 끼니 재료 편집기 - MealEditScreen·BulkSaveScreen 공용 (UX-1) */
import React, { useState } from "react";
import { Plus, Minus, Trash2 } from "lucide-react";
import { C, stepBtn, PRODUCT_COLOR } from "../theme";
import { gOf, sortByCategory, unitGOf } from "../state/appState";
import { useStore } from "../store";
import { CatDot, NumInput, ProductDot, Segmented } from "./common";
import { ProductPicker } from "./pickers";

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
  // 시판 제품 추가 - 재고 차감 단위인 qty(팩)와, 한 팩을 다 안 먹인 경우를 위한 gramsOverride(실제 제공량)를
  // 별도로 다룸. gramsOverride가 null이면 기본값(qty*packG)을 그대로 사용
  const addProduct = (product) => {
    setItems((p) => {
      if (p.some((it) => it.productId === product.id)) return p;
      return [...p, { source: "product", productId: product.id, productName: product.name, packG: product.packG, qty: 1, gramsOverride: null }];
    });
  };
  // 시판 제품의 제공량 직접 입력 켜기/끄기 - qty(팩 수, 재고 차감 단위)는 그대로 두고 표시용 제공량만 override
  const toggleProductGramMode = (key) => setItems((p) => p.map((it) => {
    if (keyOf(it) !== key) return it;
    return { ...it, gramsOverride: it.gramsOverride != null ? null : it.qty * (it.packG || 0) };
  }));
  // 다른 끼니에서 통째로 복사해올 때 사용 (unitG·gramsOverride 기본값 정규화 포함)
  const replaceFrom = (srcItems) => {
    setItems(srcItems.map((it) => (it.source === "product" ? { ...it, gramsOverride: it.gramsOverride != null ? it.gramsOverride : null } : {
      ...it,
      unitG: it.unitG != null ? it.unitG : unitGOf(state, it.name),
      gramsOverride: it.gramsOverride != null ? it.gramsOverride : null,
    })));
  };
  return { items, setItems, upQty, upUnit, upGrams, setMode, toggleProductGramMode, rm, addNames, addProduct, replaceFrom };
}

export function PlanItemsEditor({ editor }) {
  const { state } = useStore();
  const { items, upQty, upUnit, upGrams, setMode, toggleProductGramMode, rm } = editor;
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
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 10.5, color: C.muted }}>1팩 {it.packG}g</span>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <button onClick={() => upQty(key, -1)} style={stepBtn}><Minus size={12} color={C.inkSoft} /></button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, minWidth: 40, textAlign: "center", whiteSpace: "nowrap" }}>{it.qty}팩</span>
                    <button onClick={() => upQty(key, 1)} style={stepBtn}><Plus size={12} color={C.inkSoft} /></button>
                  </div>
                </div>
                {isGram && (
                  <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 10.5, color: C.muted }}>실제 제공량 (한 팩을 다 안 먹인 경우)</span>
                    <NumInput value={it.gramsOverride} onChange={(v) => upGrams(key, v)} width={56} suffix="g" />
                  </div>
                )}
                <button onClick={() => toggleProductGramMode(key)} style={{ marginTop: 7, background: "none", border: "none", fontSize: 10, fontWeight: 700, color: C.sageDeep, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                  {isGram ? "팩 용량 기준으로 되돌리기" : "제공량 직접 입력"}
                </button>
                <div style={{ textAlign: "right", fontSize: 10.5, color: C.muted, marginTop: 5 }}>= {gOf(state, it)}g</div>
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

// 식단표 편집 화면에서 "+ 시판 제품 추가" 버튼과 ProductPicker 연결을 한 번에 제공하는 헬퍼 컴포넌트
export function AddProductButton({ editor }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center justify-center" style={{ flex: 1, gap: 6, border: `1.5px dashed ${PRODUCT_COLOR}`, borderRadius: 12, padding: "10px 0", fontSize: 12.5, fontWeight: 700, color: PRODUCT_COLOR, background: "transparent", cursor: "pointer" }}>
        <Plus size={14} /> 시판 제품 추가
      </button>
      {open && <ProductPicker onPick={(p) => { editor.addProduct(p); setOpen(false); }} onClose={() => setOpen(false)} />}
    </>
  );
}
