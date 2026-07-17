/* 계획(식단표) 끼니 재료 편집기 - MealEditScreen·BulkSaveScreen 공용 (UX-1) */
import React, { useState } from "react";
import { Plus, Minus, Trash2 } from "lucide-react";
import { C, stepBtn } from "../theme";
import { gOf, sortByCategory, unitGOf } from "../state/appState";
import { useStore } from "../store";
import { CatDot, NumInput, Segmented } from "./common";

/* =====================================================================
   계획(식단표) 끼니 재료 편집 - MealEditScreen과 BulkSaveScreen이 공유하는 공용 로직/UI (UX-1)
   동작 규칙 통일: 수량 스텝퍼는 최소 1 유지, 재료 제거는 휴지통 버튼으로만
   ===================================================================== */
export function usePlanItemsEditor(initialItems) {
  const { state } = useStore();
  const [items, setItems] = useState(initialItems);
  // 수량 최소 1 클램프 - 스텝퍼 연타로 재료가 사라지는 실수 방지 (삭제는 휴지통으로)
  const upQty = (name, d) => setItems((p) => p.map((it) => it.name === name ? { ...it, qty: Math.max(1, it.qty + d) } : it));
  const upUnit = (name, v) => setItems((p) => p.map((it) => it.name === name ? { ...it, unitG: v } : it));
  const upGrams = (name, v) => setItems((p) => p.map((it) => it.name === name ? { ...it, gramsOverride: v } : it));
  const setMode = (name, mode) => setItems((p) => p.map((it) => {
    if (it.name !== name) return it;
    const curG = it.gramsOverride != null ? it.gramsOverride : it.qty * (it.unitG || 15);
    if (mode === "gram") return { ...it, gramsOverride: curG };
    return { ...it, gramsOverride: null, qty: Math.max(1, Math.round(curG / (it.unitG || 15))) };
  }));
  const rm = (name) => setItems((p) => p.filter((it) => it.name !== name));
  const addNames = (names) => {
    setItems((p) => {
      const existing = new Set(p.map((it) => it.name));
      const toAdd = names.filter((n) => !existing.has(n)).map((name) => ({ name, qty: 1, unitG: unitGOf(state, name), gramsOverride: null }));
      return [...p, ...toAdd];
    });
  };
  // 다른 끼니에서 통째로 복사해올 때 사용 (unitG·gramsOverride 기본값 정규화 포함)
  const replaceFrom = (srcItems) => {
    setItems(srcItems.map((it) => ({
      ...it,
      unitG: it.unitG != null ? it.unitG : unitGOf(state, it.name),
      gramsOverride: it.gramsOverride != null ? it.gramsOverride : null,
    })));
  };
  return { items, setItems, upQty, upUnit, upGrams, setMode, rm, addNames, replaceFrom };
}

export function PlanItemsEditor({ editor }) {
  const { state } = useStore();
  const { items, upQty, upUnit, upGrams, setMode, rm } = editor;
  return (
    <div>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginBottom: 6, padding: "0 2px" }}>재료 ({items.length})</div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        {sortByCategory(state, items).map((it, i) => {
          const isGram = it.gramsOverride != null;
          return (
            <div key={it.name} style={{ padding: "11px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: C.surface }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div className="flex items-center"><CatDot name={it.name} size={8} /><span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{it.name}</span></div>
                <button onClick={() => rm(it.name)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Trash2 size={14} color={C.apricot} /></button>
              </div>
              <div style={{ marginBottom: 8 }}>
                <Segmented value={isGram ? "gram" : "cube"} onChange={(v) => setMode(it.name, v)} options={[{ value: "cube", label: "큐브로 입력" }, { value: "gram", label: "그램으로 입력" }]} />
              </div>
              {isGram ? (
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 10.5, color: C.muted }}>총 중량</span>
                  <NumInput value={it.gramsOverride} onChange={(v) => upGrams(it.name, v)} width={56} suffix="g" />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: 6 }}>
                    <span style={{ fontSize: 10.5, color: C.muted }}>큐브당</span>
                    <NumInput value={it.unitG} onChange={(v) => upUnit(it.name, v)} width={38} suffix="g" />
                  </div>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <button onClick={() => upQty(it.name, -1)} style={stepBtn}><Minus size={12} color={C.inkSoft} /></button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, minWidth: 40, textAlign: "center", whiteSpace: "nowrap" }}>{it.qty}큐브</span>
                    <button onClick={() => upQty(it.name, 1)} style={stepBtn}><Plus size={12} color={C.inkSoft} /></button>
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
