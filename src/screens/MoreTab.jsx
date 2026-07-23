/* 더보기 탭 - 설정·공유 멤버·여행 모드·끼니 설정 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { ChevronRight, Plus, X, Check, Settings2, Users, Plane, Clock, History, Activity, BookOpen, MessageSquareText, Copy, Trash2, Send, Palette } from "lucide-react";
import { db } from "../firebase";
import { doc, setDoc, collection, addDoc, deleteDoc, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { C, CATEGORY_COLOR_SWATCHES, primaryBtn, selectStyle } from "../theme";
import { addDaysISO, ageText, fmtTime, todayISO, uid } from "../lib/dates";
import { DOC_SIZE_LIMIT_BYTES, DOC_SIZE_WARN_BYTES, avgPlannedMealsPerDay, categoryUsageCount, isStaple, migrateState } from "../state/appState";
import { useStore } from "../store";
import { authorTime, CatDot, ConfirmModal, NumInput, ScreenHeader, Segmented, SubHeader, TimePicker } from "../components/common";
import { downloadFile, feedingLogsToCSV } from "../lib/exporters";
import { usePwaUpdate } from "../pwa";

/* =====================================================================
   더보기 하위 화면들
   ===================================================================== */
export function SettingsScreen({ onBack }) {
  const { state, dispatch, notify } = useStore();
  const s = state.settings;
  const baby = state.baby;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [importPending, setImportPending] = useState(null); // 검증 통과한 백업 데이터 (확인 대기)
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);
  const set = (key, value) => dispatch({ type: "SET_SETTING", key, value });
  const setBaby = (patch) => dispatch({ type: "BABY_SET", patch });
  const doReset = () => { dispatch({ type: "RESET" }); setConfirmingReset(false); };
  const handleFileSelected = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // 같은 파일을 다시 선택해도 onChange가 동작하도록 초기화
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        // 최소한의 형태 검증 - 베이비큐브 백업 파일인지 확인 (핵심 필드 존재 + 재료 마스터가 비어있지 않은지)
        const looksValid = parsed && typeof parsed === "object"
          && parsed.ingredients && typeof parsed.ingredients === "object" && Object.keys(parsed.ingredients).length > 0
          && parsed.stock && typeof parsed.stock === "object"
          && parsed.logs && typeof parsed.logs === "object"
          && parsed.plans && typeof parsed.plans === "object";
        if (!looksValid) {
          setImportError("올바른 베이비큐브 백업 파일이 아니거나, 재료 정보가 비어있는 파일입니다.");
          return;
        }
        setImportPending(parsed);
      } catch (err) {
        setImportError("파일을 읽을 수 없습니다. JSON 백업 파일인지 확인해 주세요.");
      }
    };
    reader.readAsText(file);
  };
  const doImport = () => {
    const backup = state; // 실행취소용 현재 데이터 백업 (가져오기 직전 상태)
    const migrated = migrateState(importPending);
    dispatch({ type: "HYDRATE", state: migrated });
    setImportPending(null);
    // 가족 공유 앱 특성상, 실행취소를 누르는 시점에 이미 다른 기기(배우자 등)의 변경이 반영돼 있을 수 있음.
    // 그 사이 변화가 없을 때만 조용히 되돌리고, 변화가 있었다면 그 변경을 덮어써도 되는지 다시 물어봄.
    notify("백업 데이터를 가져왔습니다", (currentState) => {
      const unchangedSinceImport = JSON.stringify(currentState) === JSON.stringify(migrated);
      if (!unchangedSinceImport) {
        const proceed = window.confirm(
          "가져오기 이후 추가로 반영된 변경사항이 있어요(다른 가족 구성원의 변경일 수 있어요). 그래도 가져오기 이전 데이터로 되돌릴까요? 그 사이 변경사항은 사라집니다."
        );
        if (!proceed) return;
      }
      dispatch({ type: "HYDRATE", state: backup });
    }, 15000);
  };
  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title="설정" onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>시간 표시 형식</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <Segmented value={s.timeFmt} onChange={(v) => set("timeFmt", v)} options={[{ value: "24h", label: "24시간 (18:00)" }, { value: "ampm", label: "오전/오후 (오후 6:00)" }]} />
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8, padding: "0 2px" }}>예시: {fmtTime("07:00", s.timeFmt)} · {fmtTime("18:00", s.timeFmt)}</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>글자 크기</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <Segmented value={s.fontScale || 1} onChange={(v) => set("fontScale", v)} options={[
              { value: 0.9, label: "작게" },
              { value: 1, label: "보통" },
              { value: 1.15, label: "크게" },
              { value: 1.3, label: "아주크게" },
            ]} />
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8, padding: "0 2px" }}>앱 전체 글자·화면 크기가 함께 조정됩니다.</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>알림 · 보관</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {[["frozenAlertDays", "냉동 소진 알림", "일 전"], ["fridgeAlertDays", "냉장 소진 알림", "일 전"], ["fridgeKeepDays", "냉장 보관 기본 기간", "일"]].map(([key, label, unit], i) => (
              <div key={key} className="flex items-center justify-between" style={{ padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{label}</span>
                <NumInput value={s[key]} onChange={(v) => set(key, v)} width={42} suffix={unit} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>시판 이유식</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>시판 이유식 재고관리</span>
              <button onClick={() => set("productStockEnabled", !s.productStockEnabled)}
                style={{ background: s.productStockEnabled ? C.sage : C.sageLight, border: "none", borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: s.productStockEnabled ? "#fff" : C.sageDeep, cursor: "pointer" }}>
                {s.productStockEnabled ? "켜짐" : "꺼짐"}
              </button>
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
              켜면 재고 탭에서 보유 팩 수와 유통기한을 관리하고, 기록 저장 시 재고가 차감돼요. 꺼둬도 시판 이유식 기록·제품 등록은 그대로 할 수 있어요(재고 차감만 안 함).
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>아기 정보</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12.5, color: C.ink }}>이름</span>
              <input value={baby.name} onChange={(e) => setBaby({ name: e.target.value })} placeholder="이름 (선택)"
                style={{ border: "none", background: "transparent", textAlign: "right", fontSize: 12.5, fontWeight: 700, color: C.ink, width: 130, outline: "none" }} />
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12.5, color: C.ink }}>성별</span>
              <Segmented value={baby.sex} onChange={(v) => setBaby({ sex: v })} options={[{ value: "남아", label: "남아" }, { value: "여아", label: "여아" }]} />
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12.5, color: C.ink }}>생년월일</span>
              <input type="date" value={baby.birth} onChange={(e) => setBaby({ birth: e.target.value })}
                style={{ border: "none", background: "transparent", fontSize: 12.5, fontWeight: 700, color: C.ink, outline: "none" }} />
            </div>
            <div className="flex items-center justify-between" style={{ paddingTop: 7, borderTop: `1px dashed ${C.border}` }}>
              <span style={{ fontSize: 12.5, color: C.ink }}>현재</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sageDeep }}>{ageText(baby.birth)}</span>
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>데이터</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(() => {
              // 클라우드 문서 사용량 - Firestore 문서 한도(1MiB) 대비 현재 크기
              const bytes = JSON.stringify(state).length;
              const pct = Math.round((bytes / DOC_SIZE_LIMIT_BYTES) * 100);
              const warn = bytes > DOC_SIZE_WARN_BYTES;
              return (
                <div style={{ background: C.surface, border: `1px solid ${warn ? C.apricot : C.border}`, borderRadius: 12, padding: "12px 14px" }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 7 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>저장 공간 사용량</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: warn ? C.apricot : C.sageDeep }}>{Math.round(bytes / 1024)}KB / 1MB ({pct}%)</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: warn ? C.apricot : C.sage }} />
                  </div>
                  {warn && (
                    <div style={{ fontSize: 11, color: C.apricot, fontWeight: 600, marginTop: 7 }}>
                      한도에 가까워지고 있어요. 오래된 급여 기록·식단을 정리하면 공간이 줄어듭니다.
                    </div>
                  )}
                </div>
              );
            })()}
            <button onClick={() => downloadFile(`babycube-backup-${todayISO()}.json`, JSON.stringify(state, null, 2), "application/json")}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, color: C.ink, cursor: "pointer" }}>
              전체 데이터 내보내기 (JSON 백업)
            </button>
            <button onClick={() => fileInputRef.current && fileInputRef.current.click()}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, color: C.ink, cursor: "pointer" }}>
              데이터 가져오기 (JSON 백업 복원)
            </button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileSelected} style={{ display: "none" }} />
            {importError && <div style={{ fontSize: 11, color: C.apricot, fontWeight: 600, padding: "0 2px" }}>{importError}</div>}
            <button onClick={() => downloadFile(`babycube-feeding-logs-${todayISO()}.csv`, "﻿" + feedingLogsToCSV(state), "text/csv;charset=utf-8;")}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, color: C.ink, cursor: "pointer" }}>
              급여 기록 내보내기 (CSV)
            </button>
            <button onClick={() => setConfirmingReset(true)}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.apricot}`, borderRadius: 12, padding: "12px 14px", fontSize: 12.5, fontWeight: 700, color: C.apricot, cursor: "pointer" }}>
              초기 데이터로 재설정
            </button>
          </div>
        </div>
      </div>
      {confirmingReset && (
        <ConfirmModal
          title="모든 데이터를 초기화할까요?"
          message="식단·재고·기록이 모두 초기 상태로 되돌아갑니다. 되돌릴 수 없습니다."
          confirmLabel="초기화"
          onConfirm={doReset}
          onCancel={() => setConfirmingReset(false)}
        />
      )}
      {importPending && (
        <ConfirmModal
          title="백업 데이터를 가져올까요?"
          message="가져오기를 하면 현재 저장된 모든 데이터(식단·재고·기록 등)가 선택한 백업 파일 내용으로 완전히 교체됩니다. 가족 구성원 모두의 화면에 즉시 반영돼요."
          warning="가져온 직후 잠시 동안은 하단 '실행취소'로 가져오기 전 데이터로 되돌릴 수 있습니다. 그 이후엔 되돌릴 수 없으니 신중하게 진행해 주세요."
          confirmLabel="가져오기"
          danger
          onConfirm={doImport}
          onCancel={() => setImportPending(null)}
        />
      )}
    </div>
  );
}

export function MembersScreen({ onBack, go }) {
  const { state, cloud } = useStore();
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // (C-1) 구버전 가족 호환: 초대 코드 매핑 문서(invites/{code})가 없으면
  // 멤버가 이 화면을 열 때 만들어 둠 - 강화된 규칙에서도 기존 코드로 합류 가능해짐
  const inviteFamilyId = cloud && cloud.user && cloud.user.uid !== "demo" ? cloud.familyId : null;
  useEffect(() => {
    if (!inviteFamilyId) return;
    setDoc(doc(db, "invites", inviteFamilyId), { familyId: inviteFamilyId }, { merge: true }).catch(() => {});
  }, [inviteFamilyId]);
  if (!cloud) return null;
  const { familyId, user, meta, leaveFamily, logout } = cloud;
  const profiles = state.memberProfiles || {};
  // 표시명은 직접 지정한 프로필(memberProfiles)을 우선 사용 - 구글 이름보다 최신 의사를 반영
  const memberList = (meta.members || []).map((uid) => ({ uid, ...(meta.memberInfo?.[uid] || {}), ...(profiles[uid] ? { name: profiles[uid].name } : {}) }));
  // 구성원별 최근 활동 1건 (미리보기)
  const lastActivityOf = (uid) => {
    for (let i = state.activity.length - 1; i >= 0; i--) {
      if (state.activity[i].by === uid) return state.activity[i];
    }
    return null;
  };

  const copyCode = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(familyId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title="공유 멤버" onBack={onBack} />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: C.sageLight, borderRadius: 14, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.sageDeep, fontWeight: 700, marginBottom: 6 }}>초대 코드</div>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 3, color: C.sageDeep, fontFamily: "'Gowun Dodum', sans-serif", marginBottom: 10 }}>{familyId}</div>
          <button onClick={copyCode} style={{ background: C.surface, border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 11.5, fontWeight: 700, color: C.sageDeep, cursor: "pointer" }}>{copied ? "복사됨" : "코드 복사"}</button>
        </div>

        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, padding: "0 2px" }}>구성원 ({memberList.length}) · 탭하면 활동 내역을 볼 수 있어요</div>
        {memberList.map((m) => {
          const last = lastActivityOf(m.uid);
          const displayName = m.name || m.email || "이름 없음";
          return (
            <button key={m.uid} onClick={() => go && go("activity", { uid: m.uid, name: displayName })}
              className="flex items-center" style={{ width: "100%", textAlign: "left", gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 14px", cursor: "pointer" }}>
              <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: "50%", background: profiles[m.uid] ? profiles[m.uid].color : C.sageLight, flexShrink: 0 }}>
                <Users size={16} color={profiles[m.uid] ? "#fff" : C.sageDeep} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{displayName}{m.uid === user.uid ? " (나)" : ""}</div>
                {m.email && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>{m.email}</div>}
                {last && <div style={{ fontSize: 10.5, color: C.sageDeep, marginTop: 3 }}>마지막 활동: {authorTime(last.at)} {last.summary}</div>}
              </div>
              <ChevronRight size={15} color={C.muted} />
            </button>
          );
        })}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <button onClick={() => setConfirmLeave(true)} style={{ background: "none", border: `1px solid ${C.apricot}`, borderRadius: 12, padding: "11px 0", fontSize: 12.5, fontWeight: 700, color: C.apricot, cursor: "pointer" }}>이 가족에서 나가기</button>
          <button onClick={logout} style={{ background: "none", border: "none", fontSize: 12, color: C.muted, cursor: "pointer" }}>로그아웃</button>
        </div>
      </div>
      {confirmLeave && (
        <ConfirmModal
          title="가족에서 나가시겠어요?"
          message="더 이상 이 가족의 데이터를 볼 수 없게 됩니다."
          confirmLabel="나가기"
          onConfirm={leaveFamily}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}

/* =====================================================================
   활동 내역 (작성자 추적) - 더보기 진입점 또는 공유 멤버 화면에서 구성원 탭으로 진입.
   filterUid가 있으면 그 구성원으로 필터 고정된 상태로 시작(초기값일 뿐, 안에서 전환 가능)
   ===================================================================== */
export function ActivityScreen({ onBack, go, filterUid, filterName }) {
  const { state, notify } = useStore();
  const [filter, setFilter] = useState(filterUid || "all");
  const profiles = state.memberProfiles || {};
  const memberOptions = Object.entries(profiles).map(([mUid, p]) => ({ value: mUid, label: p.name }));

  const NAVIGABLE_ACTIONS = ["LOG_SAVE", "RESTORE_LOG_ENTRY", "STOCK_ADD_BATCH", "STOCK_UPDATE_BATCH", "STOCK_DELETE_BATCH", "RESTORE_BATCH", "INTRO_UPSERT", "INTRO_DELETE", "RESTORE_INTRO", "INGREDIENT_SET_META", "INGREDIENT_TAGS_SET"];
  const isNavigable = (a) => a.ref && NAVIGABLE_ACTIONS.includes(a.action);
  const handleTap = (a) => {
    if (!isNavigable(a)) return;
    if (a.action === "LOG_SAVE" || a.action === "RESTORE_LOG_ENTRY") {
      const exists = (state.logs[a.ref.date] || []).some((l) => l.id === a.ref.logId);
      if (!exists) { notify("삭제된 항목입니다"); return; }
      go("feedCompare", { date: a.ref.date, logId: a.ref.logId, label: a.ref.label });
    } else if (["STOCK_ADD_BATCH", "STOCK_UPDATE_BATCH", "STOCK_DELETE_BATCH", "RESTORE_BATCH"].includes(a.action)) {
      go("stockDetail", { name: a.ref.name });
    } else {
      go("ingredientInfo", { name: a.ref.name });
    }
  };

  const list = [...state.activity].reverse().filter((a) => filter === "all" || a.by === filter);
  const groups = [];
  let curDate = null, curArr = null;
  list.forEach((a) => {
    const d = (a.at || "").slice(0, 10);
    if (d !== curDate) { curDate = d; curArr = []; groups.push({ date: d, items: curArr }); }
    curArr.push(a);
  });

  return (
    <div style={{ paddingBottom: 90 }}>
      <SubHeader title={filterName ? `${filterName}의 활동` : "활동 내역"} onBack={onBack} />
      {memberOptions.length > 1 && (
        <div style={{ padding: "0 18px 10px" }}>
          <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "전체" }, ...memberOptions]} />
        </div>
      )}
      <div style={{ padding: "6px 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {groups.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
            아직 활동 기록이 없어요.<br />지금부터의 활동이 기록됩니다.
          </div>
        )}
        {groups.map((g) => (
          <div key={g.date}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>{g.date}</div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
              {g.items.map((a, i) => {
                const p = profiles[a.by];
                const nav = isNavigable(a);
                return (
                  <button key={a.id} onClick={() => handleTap(a)} disabled={!nav}
                    className="flex items-center justify-between" style={{ width: "100%", textAlign: "left", padding: "11px 13px",
                      background: "none", border: "none", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, cursor: nav ? "pointer" : "default" }}>
                    <div className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
                      {p && <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, flexShrink: 0 }} />}
                      <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p ? `${p.name} · ` : ""}{a.summary}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: C.muted, flexShrink: 0, marginLeft: 8 }}>{authorTime(a.at)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =====================================================================
   개선 제안함 - 어느 가족이든 앱을 쓰는 누구나 짧게 개선 아이디어·오류를 남길 수 있는 창구.
   가족별 state가 아니라 전체 공유 Firestore 컬렉션(globalFeedback)에 직접 저장·구독한다 -
   가족마다 데이터가 완전히 분리되는 이 앱의 일반 구조상, 만약 state.feedback처럼 가족별로
   저장했다면 다른 가족(예: 지인에게 안내 링크로 공유해 따로 가입한 사람)이 남긴 제안은 영영
   보이지 않기 때문. globalFeedback은 조회는 로그인 없이도 가능하게 열어 두고(민감한 개인정보가
   아니므로), 작성/삭제는 로그인한 사용자 본인 것만 가능하도록 보안 규칙에서 제한한다(firestore.rules 참고).
   "전체 복사하기"로 날짜·작성자 포함 텍스트를 클립보드에 담아, 그대로 Claude Code 세션에
   붙여넣어 분석·반영을 요청할 수 있다.
   ===================================================================== */
export function FeedbackScreen({ onBack }) {
  const { state, notify, cloud } = useStore();
  const isDemo = !cloud || cloud.familyId === "demo";
  const myUid = cloud && cloud.user && cloud.user.uid;
  const myName = (state.memberProfiles[myUid] || {}).name || (cloud && cloud.user && cloud.user.displayName) || "이름 없음";
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [demoList, setDemoList] = useState([]); // 데모 모드 전용 - 실제 Firestore에 저장하지 않음(기존 데모 철학 유지)
  const [cloudList, setCloudList] = useState(null); // null = 아직 로딩 중

  useEffect(() => {
    if (isDemo) return;
    const q = query(collection(db, "globalFeedback"), orderBy("at", "desc"), limit(300));
    const unsub = onSnapshot(q, (snap) => setCloudList(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setCloudList([]));
    return unsub;
  }, [isDemo]);

  const list = isDemo ? demoList : (cloudList || []);
  const loading = !isDemo && cloudList === null;

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    if (isDemo) {
      setDemoList((p) => [{ id: uid(), text: t, by: myUid, byName: myName, familyId: "demo", at: new Date().toISOString() }, ...p]);
      return;
    }
    try {
      await addDoc(collection(db, "globalFeedback"), { text: t, by: myUid, byName: myName, familyId: cloud.familyId, at: new Date().toISOString() });
    } catch {
      notify("등록에 실패했어요. 인터넷 연결을 확인해 주세요");
    }
  };
  const remove = async (f) => {
    if (isDemo) {
      setDemoList((p) => p.filter((x) => x.id !== f.id));
      notify("삭제했습니다", () => setDemoList((p) => [f, ...p]));
      return;
    }
    try {
      await deleteDoc(doc(db, "globalFeedback", f.id));
      notify("삭제했습니다", () => addDoc(collection(db, "globalFeedback"), { text: f.text, by: f.by, byName: f.byName, familyId: f.familyId, at: f.at }));
    } catch {
      notify("삭제에 실패했어요. 인터넷 연결을 확인해 주세요");
    }
  };

  const dateTime = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${authorTime(iso)}`;
  };
  const copyAll = async () => {
    const lines = list.map((f) => `- [${dateTime(f.at)}] ${f.byName || "알 수 없음"}: ${f.text}`);
    const digest = `### 베이비큐브 개선 제안 모음 (${list.length}건)\n${lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify("복사에 실패했어요. 브라우저 권한을 확인해 주세요");
    }
  };

  return (
    <div style={{ paddingBottom: 90 }}>
      <SubHeader title="개선 제안" onBack={onBack} />
      <div style={{ padding: "6px 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, padding: "0 2px" }}>
          불편한 점이나 개선하면 좋을 아이디어를 자유롭게 남겨주세요. 앱을 쓰는 모든 가족이 함께 보는 목록이라, 다른 분이 남긴 제안도 여기서 볼 수 있어요.
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 재고 화면 정렬 옵션이 헷갈려요" rows={3}
            style={{ width: "100%", border: "none", outline: "none", fontSize: 13, color: C.ink, resize: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          <button onClick={submit} disabled={!text.trim()} className="flex items-center justify-center"
            style={{ ...primaryBtn, marginTop: 8, gap: 6, opacity: text.trim() ? 1 : 0.5, cursor: text.trim() ? "pointer" : "default" }}>
            <Send size={14} /> 보내기
          </button>
        </div>

        <div className="flex items-center justify-between" style={{ padding: "0 2px" }}>
          <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>{loading ? "불러오는 중..." : `지금까지 ${list.length}건`}</span>
          {list.length > 0 && (
            <button onClick={copyAll} className="flex items-center" style={{ gap: 5, background: "none", border: "none", color: C.sageDeep, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
              <Copy size={12} /> {copied ? "복사됨!" : "전체 복사하기"}
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!loading && list.length === 0 && (
            <div style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
              아직 남겨진 제안이 없어요.<br />위에 첫 의견을 남겨보세요.
            </div>
          )}
          {list.map((f) => {
            const mine = isDemo || f.by === myUid;
            const otherFamily = !isDemo && f.familyId && f.familyId !== cloud.familyId;
            return (
              <div key={f.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 13px" }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
                  <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.sageDeep }}>{f.byName || "알 수 없음"}</span>
                    <span style={{ fontSize: 10.5, color: C.muted }}>{dateTime(f.at)}</span>
                    {otherFamily && <span style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "1px 7px" }}>다른 가족</span>}
                  </div>
                  {mine && <button onClick={() => remove(f)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Trash2 size={13} color={C.apricot} /></button>}
                </div>
                <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{f.text}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TravelScreen({ onBack }) {
  const { state, dispatch } = useStore();
  const tv = state.travel;
  const set = (patch) => dispatch({ type: "TRAVEL_SET", patch });
  // 필요 큐브 산출: 최근 식단 평균 재료 사용량 기반
  const cubeNeed = useMemo(() => {
    if (!tv.start || !tv.end) return [];
    const days = Math.max(1, Math.round((new Date(tv.end) - new Date(tv.start)) / 86400000) + 1);
    const usage = {};
    const t = todayISO();
    let counted = 0;
    for (let i = 1; i <= 7; i++) {
      const meals = state.plans[addDaysISO(t, -i)] || [];
      if (meals.length) counted++;
      meals.forEach((m) => m.items.forEach((it) => { if (!isStaple(state, it.name)) usage[it.name] = (usage[it.name] || 0) + it.qty; }));
    }
    const perDay = counted || 1;
    // 분모: 하루 3끼 고정 대신 최근 7일 계획의 하루 평균 끼니 수 (계획 없으면 끼니 설정 개수) - P2-3
    const avgMeals = avgPlannedMealsPerDay(state);
    return Object.entries(usage).map(([name, q]) => ({ name, cubes: Math.ceil((q / perDay) * days * (tv.mealsPerDay / avgMeals)) })).sort((a, b) => b.cubes - a.cubes);
  }, [tv.start, tv.end, tv.mealsPerDay, state.plans, state.mealSlots]);

  const defChecklist = ["냉동 큐브 챙기기 (드라이아이스)", "카페리 탑승용 1끼 캐리어 별도 포장", "숙소 냉동고·전자레인지 확인", "상비용 시판 이유식"];
  const checklist = tv.checklist.length ? tv.checklist : defChecklist.map((t) => ({ text: t, done: false }));

  return (
    <div style={{ paddingBottom: 90 }}>
      <SubHeader title="여행 모드" onBack={onBack} right={
        <button onClick={() => set({ active: !tv.active })} style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 12px", borderRadius: 999, border: "none", cursor: "pointer", background: tv.active ? C.sage : C.sageLight, color: tv.active ? "#fff" : C.sageDeep }}>{tv.active ? "켜짐" : "꺼짐"}</button>
      } />
      <div style={{ padding: "10px 18px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
          <div className="flex items-center justify-between"><span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>출발</span><input type="date" value={tv.start} onChange={(e) => set({ start: e.target.value })} style={{ border: "none", background: "transparent", fontSize: 12.5, fontWeight: 700, color: C.ink, outline: "none" }} /></div>
          <div className="flex items-center justify-between"><span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>도착</span><input type="date" value={tv.end} onChange={(e) => set({ end: e.target.value })} style={{ border: "none", background: "transparent", fontSize: 12.5, fontWeight: 700, color: C.ink, outline: "none" }} /></div>
          <div className="flex items-center justify-between"><span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>하루 끼니 수</span>
            <select value={tv.mealsPerDay} onChange={(e) => set({ mealsPerDay: Number(e.target.value) })} style={selectStyle}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}끼</option>)}</select>
          </div>
        </div>
        {cubeNeed.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>필요 큐브 (예상)</div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 7, padding: "0 2px" }}>최근 7일 계획 기준 하루 평균 {Math.round(avgPlannedMealsPerDay(state) * 10) / 10}끼 대비 여행 중 {tv.mealsPerDay}끼로 환산한 값이에요.</div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 7 }}>
              {cubeNeed.map((c) => (
                <div key={c.name} className="flex items-center justify-between"><div className="flex items-center"><CatDot name={c.name} size={7} /><span style={{ fontSize: 12.5, color: C.ink }}>{c.name}</span></div><span style={{ fontSize: 12, fontWeight: 700, color: C.sageDeep }}>{c.cubes}큐브</span></div>
              ))}
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 7, padding: "0 2px" }}>준비 체크리스트</div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {checklist.map((c, i) => (
              <button key={i} onClick={() => { const nc = checklist.map((x, j) => j === i ? { ...x, done: !x.done } : x); set({ checklist: nc }); }}
                className="flex items-center" style={{ width: "100%", gap: 10, padding: "11px 13px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ width: 19, height: 19, borderRadius: 6, border: `1.5px solid ${c.done ? C.sage : C.border}`, background: c.done ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.done && <Check size={12} color="#fff" />}</span>
                <span style={{ fontSize: 12.5, color: c.done ? C.muted : C.ink, textDecoration: c.done ? "line-through" : "none" }}>{c.text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   끼니 설정 (끼니 종류 이름·시간을 미리 정의 → 식단표 입력 시 선택 목록으로 사용)
   ===================================================================== */
export function MealSlotsScreen({ onBack }) {
  const { state } = useStore();
  const [editing, setEditing] = useState(null); // null | 'new' | slotObj
  const timeFmt = state.settings.timeFmt;
  const sorted = [...state.mealSlots].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title="끼니 설정" onBack={onBack} right={
        <button onClick={() => setEditing("new")} className="flex items-center" style={{ gap: 3, background: "none", border: "none", cursor: "pointer" }}>
          <Plus size={14} color={C.sageDeep} /><span style={{ fontSize: 12, fontWeight: 700, color: C.sageDeep }}>추가</span>
        </button>
      } />
      <div style={{ padding: "6px 18px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, padding: "0 2px" }}>
          여기서 정한 끼니 이름과 시간이 식단표에서 끼니를 추가할 때 선택 목록으로 사용됩니다. 예: 아침 · 점심 · 저녁, 또는 첫 끼니 · 둘째 끼니 · 간식1
        </div>
        {sorted.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12.5, color: C.muted }}>등록된 끼니 종류가 없습니다.</div>}
        {sorted.map((s) => (
          <button key={s.id} onClick={() => setEditing(s)} className="flex items-center justify-between" style={{ width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 14px", cursor: "pointer" }}>
            <div className="flex items-center" style={{ gap: 10 }}>
              <div className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 9, background: C.sageLight, flexShrink: 0 }}><Clock size={14} color={C.sageDeep} /></div>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{s.label}</span>
            </div>
            <div className="flex items-center" style={{ gap: 6 }}>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{fmtTime(s.time, timeFmt)}</span>
              <ChevronRight size={15} color={C.muted} />
            </div>
          </button>
        ))}
      </div>
      {editing && <MealSlotEditModal slot={editing} timeFmt={timeFmt} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function MealSlotEditModal({ slot, timeFmt, onClose }) {
  const { dispatch } = useStore();
  const isNew = slot === "new";
  const base = isNew ? {} : slot;
  const [label, setLabel] = useState(base.label || "");
  const [time, setTime] = useState(base.time || "12:00");
  const [confirmingDel, setConfirmingDel] = useState(false);

  const save = () => {
    if (!label) return;
    dispatch({ type: "MEALSLOT_UPSERT", slot: { id: isNew ? undefined : base.id, label, time } });
    onClose();
  };
  const del = () => { dispatch({ type: "MEALSLOT_DELETE", id: base.id }); onClose(); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", borderRadius: "20px 20px 0 0", padding: "16px 18px calc(26px + env(safe-area-inset-bottom))", position: "relative" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{isNew ? "끼니 종류 추가" : "끼니 종류 수정"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>이름</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 간식1, 첫 끼니"
              style={{ border: "none", background: "transparent", textAlign: "right", fontSize: 13, fontWeight: 700, color: C.ink, width: 150, outline: "none" }} />
          </div>
          <TimePicker time={time} setTime={setTime} timeFmt={timeFmt} />
          <button onClick={save} style={primaryBtn}>{isNew ? "추가" : "저장"}</button>
          {!isNew && <button onClick={() => setConfirmingDel(true)} style={{ background: "none", border: "none", color: C.apricot, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0" }}>이 끼니 종류 삭제</button>}
        </div>
        {confirmingDel && (
          <ConfirmModal
            title={`'${label}' 끼니 종류를 삭제할까요?`}
            message="이미 식단표·기록에 저장된 항목은 그대로 남아있습니다."
            onConfirm={del}
            onCancel={() => setConfirmingDel(false)}
          />
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   카테고리 관리 (재료 분류 이름·라벨 색상을 사용자가 직접 추가/수정/삭제)
   이름을 바꾸면 이미 등록된 재료·먹어본 재료 기록에도 새 이름이 캐스케이드로 반영됨(리듀서 처리).
   삭제는 최소 1개를 남겨야 하고, 그 카테고리를 쓰는 재료가 있으면 막힘(리듀서가 조용히 no-op하므로
   여기서 미리 검사해 이유를 안내함) - MealSlotsScreen과 동일한 목록+수정모달 구조를 따름
   ===================================================================== */
export function CategoriesScreen({ onBack }) {
  const { state } = useStore();
  const [editing, setEditing] = useState(null); // null | 'new' | categoryObj
  const cats = state.categories;

  return (
    <div style={{ paddingBottom: 90, position: "relative" }}>
      <SubHeader title="카테고리 관리" onBack={onBack} right={
        <button onClick={() => setEditing("new")} className="flex items-center" style={{ gap: 3, background: "none", border: "none", cursor: "pointer" }}>
          <Plus size={14} color={C.sageDeep} /><span style={{ fontSize: 12, fontWeight: 700, color: C.sageDeep }}>추가</span>
        </button>
      } />
      <div style={{ padding: "6px 18px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, padding: "0 2px" }}>
          재료를 분류하는 카테고리의 이름과 라벨 색상을 직접 관리할 수 있어요. 이름을 바꾸면 이미 등록된 재료·먹어본 재료 기록에도 새 이름이 함께 반영돼요.
        </div>
        {cats.map((c) => (
          <button key={c.id} onClick={() => setEditing(c)} className="flex items-center justify-between" style={{ width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 14px", cursor: "pointer" }}>
            <div className="flex items-center" style={{ gap: 10 }}>
              <span style={{ width: 18, height: 18, borderRadius: "50%", background: c.color, flexShrink: 0, border: `1px solid ${C.border}` }} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{c.name}</span>
            </div>
            <div className="flex items-center" style={{ gap: 6 }}>
              <span style={{ fontSize: 11, color: C.muted }}>{categoryUsageCount(state, c.name)}개 재료</span>
              <ChevronRight size={15} color={C.muted} />
            </div>
          </button>
        ))}
      </div>
      {editing && <CategoryEditModal category={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function CategoryEditModal({ category, onClose }) {
  const { state, dispatch, notify } = useStore();
  const isNew = category === "new";
  const base = isNew ? {} : category;
  const [name, setName] = useState(base.name || "");
  const [color, setColor] = useState(base.color || "#9A9285");
  const [confirmingDel, setConfirmingDel] = useState(false);
  const trimmed = name.trim();
  const dup = trimmed && state.categories.some((c) => c.name === trimmed && c.id !== base.id);

  const save = () => {
    if (!trimmed || dup) return;
    if (isNew) dispatch({ type: "CATEGORY_ADD", name: trimmed, color });
    else dispatch({ type: "CATEGORY_UPDATE", id: base.id, patch: { name: trimmed, color } });
    onClose();
  };
  const del = () => {
    setConfirmingDel(false);
    if (state.categories.length <= 1) { notify("카테고리는 최소 1개 이상 있어야 해요"); return; }
    const usage = categoryUsageCount(state, base.name);
    if (usage > 0) { notify(`'${base.name}' 카테고리를 사용 중인 재료가 ${usage}개 있어서 삭제할 수 없어요. 먼저 재료들의 카테고리를 바꿔 주세요.`); return; }
    dispatch({ type: "CATEGORY_DELETE", id: base.id });
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: "100%", borderRadius: "20px 20px 0 0", padding: "16px 18px calc(26px + env(safe-area-inset-bottom))", position: "relative" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{isNew ? "카테고리 추가" : "카테고리 수정"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={C.muted} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>이름</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 견과류"
              style={{ border: "none", background: "transparent", textAlign: "right", fontSize: 13, fontWeight: 700, color: C.ink, width: 150, outline: "none" }} />
          </div>
          {dup && <div style={{ fontSize: 11, color: C.apricot, padding: "0 2px" }}>이미 있는 카테고리 이름이에요</div>}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, marginBottom: 9 }}>라벨 색상</div>
            <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
              {CATEGORY_COLOR_SWATCHES.map((sw) => {
                const active = color.toLowerCase() === sw.toLowerCase();
                return (
                  <button key={sw} onClick={() => setColor(sw)} aria-label={sw} style={{ width: 26, height: 26, borderRadius: "50%",
                    background: sw, cursor: "pointer", padding: 0, border: active ? `2px solid ${C.ink}` : `1px solid ${C.border}` }} />
                );
              })}
              {/* 프리셋에 없는 색이면(직접 선택) 마지막 원이 현재 색으로 채워져 선택 상태를 보여줌 */}
              <label style={{ width: 26, height: 26, borderRadius: "50%", background: color, cursor: "pointer", position: "relative",
                border: CATEGORY_COLOR_SWATCHES.some((sw) => sw.toLowerCase() === color.toLowerCase()) ? `1px dashed ${C.muted}` : `2px solid ${C.ink}` }}>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", padding: 0, border: "none" }} />
              </label>
            </div>
            <div style={{ fontSize: 9.5, color: C.muted, marginTop: 8 }}>맨 오른쪽 원을 누르면 직접 다른 색상도 고를 수 있어요</div>
          </div>
          <button onClick={save} disabled={!trimmed || dup} style={{ ...primaryBtn, opacity: !trimmed || dup ? 0.5 : 1, cursor: !trimmed || dup ? "default" : "pointer" }}>{isNew ? "추가" : "저장"}</button>
          {!isNew && <button onClick={() => setConfirmingDel(true)} style={{ background: "none", border: "none", color: C.apricot, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0" }}>이 카테고리 삭제</button>}
        </div>
        {confirmingDel && (
          <ConfirmModal
            title={`'${base.name}' 카테고리를 삭제할까요?`}
            message="이 카테고리를 사용 중인 재료가 있으면 삭제할 수 없어요."
            onConfirm={del}
            onCancel={() => setConfirmingDel(false)}
          />
        )}
      </div>
    </div>
  );
}

export function MoreTab({ go }) {
  const { notify } = useStore();
  const { needRefresh, checkForUpdate } = usePwaUpdate();
  const items = [
    { key: "mealSlots", icon: Clock, label: "끼니 설정", sub: "끼니 이름·시간 관리" },
    { key: "categories", icon: Palette, label: "카테고리 관리", sub: "재료 분류 이름·색상 추가/수정/삭제" },
    { key: "manufactureHistory", icon: History, label: "제조 이력", sub: "재료별 제조 배치 기록 조회" },
    { key: "members", icon: Users, label: "공유 멤버", sub: "초대 코드 · 구성원 관리" },
    { key: "activity", icon: Activity, label: "활동 내역", sub: "누가 언제 기록·수정했는지 확인" },
    { key: "feedback", icon: MessageSquareText, label: "개선 제안", sub: "불편한 점·아이디어 남기기" },
    { key: "travel", icon: Plane, label: "여행 모드", sub: "필요 큐브 자동 계산" },
    { key: "settings", icon: Settings2, label: "설정", sub: "시간 형식 · 알림 · 아기 정보" },
    // 로그인 없이 보는 고정 안내 페이지(/guide) - 실제 URL 이동이라 go() 라우팅 대신 새 탭 링크로 처리
    { icon: BookOpen, label: "설치·사용법 안내 다시 보기", sub: "지인에게 공유한 안내 페이지", href: "/guide" },
  ];
  return (
    <div style={{ paddingBottom: 90 }}>
      <ScreenHeader title="더보기" />
      <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it) => {
          const content = (
            <>
              <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: C.sageLight, flexShrink: 0 }}><it.icon size={16} color={C.sageDeep} /></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{it.label}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{it.sub}</div></div>
              <ChevronRight size={16} color={C.muted} />
            </>
          );
          const rowStyle = { gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 14px", cursor: "pointer", width: "100%", textAlign: "left", boxSizing: "border-box" };
          return it.href ? (
            <a key={it.label} href={it.href} target="_blank" rel="noopener noreferrer" className="flex items-center" style={{ ...rowStyle, textDecoration: "none" }}>{content}</a>
          ) : (
            <button key={it.key} onClick={() => go(it.key)} className="flex items-center" style={rowStyle}>{content}</button>
          );
        })}
      </div>
      <div style={{ textAlign: "center", fontSize: 10, color: C.muted, marginTop: 20 }}>
        <div>베이비큐브 · v{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "?"}</div>
        {needRefresh ? (
          <div style={{ marginTop: 4, color: C.sageDeep, fontWeight: 700 }}>새 버전이 있어요 — 화면 상단 배너에서 업데이트해 주세요</div>
        ) : (
          <button onClick={() => { checkForUpdate(); notify("최신 버전인지 확인했어요"); }}
            style={{ marginTop: 4, background: "none", border: "none", color: C.sageDeep, fontWeight: 700, fontSize: 10, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
            업데이트 확인
          </button>
        )}
      </div>
    </div>
  );
}
