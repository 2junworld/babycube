/* 동기화 계층 - 로그인·가족 설정·Firestore 실시간 동기화·데모 Provider (C-2 2단계) */
import React, { useState, useEffect, useReducer, useRef, useCallback } from "react";
import { db, auth, googleProvider } from "../firebase";
import { doc, setDoc, getDoc, updateDoc, onSnapshot, arrayUnion, addDoc, collection } from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from "firebase/auth";
import { C, FONT_IMPORT, primaryBtn, MEMBER_COLOR_PALETTE } from "../theme";
import { addDaysISO, todayISO, uid } from "../lib/dates";
import { DOC_SIZE_LIMIT_BYTES, DOC_SIZE_WARN_BYTES, migrateState, reducer, seedState, totalG } from "../state/appState";
import { Store } from "../store";
import { CubeMark } from "../components/common";
import { Shell } from "../screens/Shell";
import { UpdateBanner } from "../pwa";

/* =====================================================================
   Firebase 연동 — 로그인 · 가족(공유 그룹) · 클라우드 저장
   - Google 로그인 후, 가족을 새로 만들거나 6자리 초대 코드로 합류
   - 가족 문서(families/{familyId})의 state 필드를 실시간 구독·저장
   ===================================================================== */
export function genInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I 제외
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function CenterMessage({ text }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{text}</span>
    </div>
  );
}

export function LoginScreen({ onLogin, busy, error }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24, fontFamily: "'Noto Sans KR', sans-serif", gap: 22 }}>
      <style>{FONT_IMPORT}</style>
      <CubeMark size={40} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Gowun Dodum', sans-serif", fontSize: 22, color: C.ink, marginBottom: 6 }}>베이비큐브</div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>로그인하면 데이터가 계정에 안전하게 저장되고,<br />배우자와 실시간으로 공유할 수 있습니다.</div>
      </div>
      <button onClick={onLogin} disabled={busy} className="flex items-center justify-center" style={{ gap: 9, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 24px", fontSize: 13.5, fontWeight: 700, color: C.ink, cursor: busy ? "default" : "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
        </svg>
        {busy ? "로그인 중..." : "Google로 로그인"}
      </button>
      {error && <span style={{ fontSize: 11.5, color: C.apricot, textAlign: "center" }}>{error}</span>}
    </div>
  );
}

/* (C-1) 가족 생성·합류 백엔드 로직 - 강화된 보안 규칙(멤버만 가족 문서 읽기) 대응
   - 생성: 가족 문서 + invites/{코드} 매핑 문서를 함께 만듦
   - 합류: invites/{코드}로 familyId를 알아낸 뒤, 가족 문서를 읽지 않고
     arrayUnion으로 본인만 추가 (비멤버는 가족 문서 읽기 권한이 없어도 동작)
   데모 미리보기(?demo=family)에서는 이 객체 대신 목(mock) api가 주입됨 */
export const familyApi = {
  async createFamily(user) {
    let fid = genInviteCode();
    // 코드 중복 확인: 신 규칙에서는 invites 조회, 실패(구 규칙에서는 invites 접근 불가)해도 진행
    for (let i = 0; i < 5; i++) {
      let exists = false;
      try { exists = (await getDoc(doc(db, "invites", fid))).exists(); } catch { /* 구 규칙: 확인 생략 */ }
      if (!exists) break;
      fid = genInviteCode();
    }
    await setDoc(doc(db, "families", fid), {
      ownerUid: user.uid,
      members: [user.uid],
      memberInfo: { [user.uid]: { name: user.displayName || "", email: user.email || "" } },
      createdAt: Date.now(),
      state: seedState(),
    });
    // 초대 코드 매핑 문서 발급 - 구 규칙에서는 거부되지만 코드=familyId 폴백이 있어 무해 (best-effort)
    try { await setDoc(doc(db, "invites", fid), { familyId: fid, createdAt: Date.now(), createdBy: user.uid }); } catch { /* 규칙 배포 전 호환 */ }
    await setDoc(doc(db, "users", user.uid), { familyId: fid }, { merge: true });
    return fid;
  },
  async joinByCode(user, code) {
    // 초대 코드 매핑 문서로 familyId 조회. 매핑이 없거나(구버전 가족) 읽을 수 없으면(규칙 배포 전) 코드=familyId 폴백
    let familyId = code;
    try {
      const inv = await getDoc(doc(db, "invites", code));
      if (inv.exists()) familyId = inv.data().familyId;
    } catch { /* 구 규칙: invites 접근 불가 - 폴백 사용 */ }
    await updateDoc(doc(db, "families", familyId), {
      members: arrayUnion(user.uid),
      [`memberInfo.${user.uid}`]: { name: user.displayName || "", email: user.email || "" },
    });
    await setDoc(doc(db, "users", user.uid), { familyId }, { merge: true });
    return familyId;
  },
};

export function FamilySetupScreen({ user, onDone, onLogout, api = familyApi }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const create = async () => {
    setBusy(true); setErr("");
    try {
      const fid = await api.createFamily(user);
      onDone(fid, "create");
    } catch (e) {
      setErr("가족 생성에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    const fid = code.trim().toUpperCase();
    if (fid.length < 4) { setErr("초대 코드를 확인해 주세요."); return; }
    setBusy(true); setErr("");
    try {
      const joined = await api.joinByCode(user, fid);
      onDone(joined, "join");
    } catch (e) {
      setErr("합류에 실패했습니다. 코드를 다시 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24, fontFamily: "'Noto Sans KR', sans-serif", gap: 20 }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Gowun Dodum', sans-serif", fontSize: 20, color: C.ink, marginBottom: 6 }}>{user.displayName || user.email}님, 환영합니다</div>
        <div style={{ fontSize: 12, color: C.muted }}>가족 그룹을 새로 만들거나, 받은 초대 코드로 합류하세요.</div>
      </div>

      {!mode && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320 }}>
          <button onClick={() => setMode("create")} style={primaryBtn}>새 가족 만들기</button>
          <button onClick={() => setMode("join")} style={{ ...primaryBtn, background: C.sageLight, color: C.sageDeep }}>초대 코드로 합류하기</button>
        </div>
      )}

      {mode === "create" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320 }}>
          <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center", lineHeight: 1.5 }}>가족을 만들면 6자리 초대 코드가 생성됩니다.<br />그 코드를 배우자분에게 공유해 주세요.</div>
          <button onClick={create} disabled={busy} style={primaryBtn}>{busy ? "만드는 중..." : "가족 만들기"}</button>
          <button onClick={() => { setMode(null); setErr(""); }} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>뒤로</button>
        </div>
      )}

      {mode === "join" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320 }}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="초대 코드 6자리" maxLength={8}
            style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 14px", fontSize: 16, fontWeight: 700, letterSpacing: 2, textAlign: "center", color: C.ink, outline: "none" }} />
          <button onClick={join} disabled={busy} style={primaryBtn}>{busy ? "확인 중..." : "합류하기"}</button>
          <button onClick={() => { setMode(null); setErr(""); }} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>뒤로</button>
        </div>
      )}

      {err && <span style={{ fontSize: 11.5, color: C.apricot, textAlign: "center" }}>{err}</span>}
      <button onClick={onLogout} style={{ background: "none", border: "none", color: C.muted, fontSize: 11.5, cursor: "pointer", marginTop: 10 }}>다른 계정으로 로그인</button>
    </div>
  );
}

/* ----------------------------- 토스트 알림 공용 (UX-7) ----------------------------- */
// FamilyStoreProvider와 DemoProvider가 동일한 토스트 동작·모양을 공유
export function useToast() {
  const [toast, setToast] = useState(null); // { id, message, onUndo }
  const notify = (message, onUndo, duration = 5000) => {
    const id = uid();
    setToast({ id, message, onUndo });
    setTimeout(() => setToast((tv) => (tv && tv.id === id ? null : tv)), duration);
  };
  return { toast, setToast, notify };
}

export function ToastView({ toast, setToast, state }) {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 90, display: "flex", justifyContent: "center", zIndex: 50, padding: "0 18px", pointerEvents: "none" }}>
      <div className="flex items-center justify-between" style={{ gap: 14, maxWidth: 480, width: "100%", background: C.charcoal, borderRadius: 12, padding: "12px 14px", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", pointerEvents: "auto" }}>
        <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 600 }}>{toast.message}</span>
        {toast.onUndo && (
          <button onClick={() => { toast.onUndo(state); setToast(null); }}
            style={{ background: "none", border: "none", color: C.butter, fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>실행취소</button>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- 표시명 입력 바텀시트 (작성자 추적) -----------------------------
   가족 합류 후 내 uid가 memberProfiles에 없으면 1회 표시. 급여 기록·식단표·제조 배치에
   "누가 했는지" 뱃지를 남기려면 표시명이 필요하므로, 취소 없이 확인해야 닫힘 */
function DisplayNameSheet({ defaultName, onSubmit }) {
  const [name, setName] = useState(defaultName || "");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 90, display: "flex", alignItems: "flex-end", fontFamily: "'Noto Sans KR', sans-serif" }}>
      <div style={{ background: C.bg, width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: "20px 18px calc(26px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 6 }}>표시명을 입력해 주세요</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
          급여 기록·식단표 등에서 "누가 했는지" 표시할 때 사용돼요. 나중에 공유 멤버 화면에서 바꿀 수 있어요.
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 엄마, 아빠" maxLength={12}
          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 14px", fontSize: 14, fontWeight: 700, color: C.ink, outline: "none", boxSizing: "border-box", marginBottom: 14 }} />
        <button onClick={() => name.trim() && onSubmit(name.trim())} disabled={!name.trim()}
          style={{ ...primaryBtn, opacity: name.trim() ? 1 : 0.5, cursor: name.trim() ? "pointer" : "default" }}>확인</button>
      </div>
    </div>
  );
}

// 원격 스냅샷(remote) 위에, 마지막 동기화 기준점(base) 이후 바뀐 로컬 최상위 키를 덮어 병합.
// 아직 서버에 보내지 못한 내 변경이 배우자 기기의 스냅샷에 덮여 사라지는 것을 방지 (P0-1)
export function mergeRemoteWithLocalChanges(remote, local, base) {
  if (!local || !base) return remote;
  const changed = Object.keys(local).filter(
    (k) => JSON.stringify(local[k]) !== JSON.stringify(base[k])
  );
  if (changed.length === 0) return remote;
  const merged = { ...remote };
  changed.forEach((k) => {
    if (k === "activity") {
      // 활동 로그는 append-only이고 id가 유일하므로, 다른 키처럼 통째로 한쪽 값으로 덮지 않고
      // 원격·로컬을 id 기준 union 후 시각순 정렬·최근 200건만 유지한다 (작성자 추적).
      // 그렇지 않으면 두 기기가 거의 동시에 기록해 activity가 동시에 바뀐 경우, 한쪽 기기의
      // append가 흔적 없이 사라질 수 있다.
      const byId = new Map();
      [...(remote.activity || []), ...(local.activity || [])].forEach((a) => byId.set(a.id, a));
      merged.activity = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-200);
    } else {
      merged[k] = local[k];
    }
  });
  return merged;
}

export function FamilyStoreProvider({ familyId, user, onLogout }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, () => seedState());
  // 모든 액션에 작성자(_actor)·시각(_at)을 자동 주입 - 화면 코드는 dispatch를 그대로 쓰면 됨 (작성자 추적)
  const dispatch = useCallback(
    (action) => rawDispatch({ ...action, _actor: user.uid, _at: new Date().toISOString() }),
    [user.uid]
  );
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState({ members: [], memberInfo: {}, ownerUid: null });
  const [syncError, setSyncError] = useState(false);
  // lastSyncedRef: 마지막으로 로컬↔원격이 일치했던 state 객체(전체) - 다음 저장 시 "무엇이 바뀌었는지" 비교하는 기준점
  const lastSyncedRef = useRef(null);
  // stateRef: 최신 state를 항상 가리키는 ref - retry 등 이벤트 리스너 콜백이 오래된 클로저 값을 참조하지 않도록 함
  const stateRef = useRef(state);
  stateRef.current = state;
  // pendingRef: 현재 진행 중인 저장 요청(Promise). 동시에 두 개 이상의 updateDoc 요청이 겹치면,
  // 먼저 실패한 요청의 lastSyncedRef 롤백이 나중에 성공한 요청의 동기화 기록을 덮어써서
  // "실제로는 저장 안 된 변경이 동기화된 것으로 착각"하는 레이스가 생길 수 있어 항상 순차적으로만 보냄.
  const pendingRef = useRef(null);
  // queuedRef: 진행 중인 요청이 끝난 뒤, 그 사이 바뀐 최신 state로 한 번 더 동기화가 필요한지
  const queuedRef = useRef(false);
  // readyRef: 최초 원격 수신 전(로컬이 아직 seed일 때)에는 스냅샷 병합을 하지 않기 위한 플래그
  const readyRef = useRef(false);
  // 문서 용량 모니터링: Firestore 문서 한도(1MiB) 대비 현재 state 크기 (bytes)
  const [docBytes, setDocBytes] = useState(0);

  useEffect(() => {
    const famRef = doc(db, "families", familyId);
    const unsub = onSnapshot(famRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const migrated = migrateState(data.state);
      // (레이스 방지) 아직 서버로 보내지 못한 로컬 변경(저장 진행 중에 추가로 바뀐 키)이 있으면,
      // 스냅샷으로 통째로 덮어쓰지 않고 원격 state 위에 로컬 변경 키를 덮어 병합한다.
      // 예: 내 급여기록 저장이 진행 중일 때 식단을 수정했는데 그 사이 배우자의 스냅샷이
      // 도착하면, 기존에는 식단 수정이 흔적 없이 사라졌다 (최상위 키 단위 병합 - 부분
      // 업데이트 전략과 동일한 granularity)
      const next = mergeRemoteWithLocalChanges(
        migrated,
        readyRef.current ? stateRef.current : null,
        lastSyncedRef.current
      );
      // lastSyncedRef는 원격 원본 기준으로 둔다 - 병합해서 남긴 로컬 변경 키가
      // 다음 syncToCloud에서 diff로 잡혀 자동으로 재전송됨
      lastSyncedRef.current = migrated;
      dispatch({ type: "HYDRATE", state: next });
      setMeta({ members: data.members || [], memberInfo: data.memberInfo || {}, ownerUid: data.ownerUid });
      setDocBytes(JSON.stringify(migrated).length);
      setReady(true);
      readyRef.current = true;
    });
    return unsub;
  }, [familyId]);

  // 로컬 state 중 마지막 동기화 시점과 달라진 최상위 항목(재고/식단/기록 등)만 골라
  // "state.항목명" 경로로 부분 업데이트함. 예: 내가 재고만 바꿨다면 state.stock만 보내고,
  // 배우자가 그 사이 식단(state.plans)만 바꿔서 먼저 저장했더라도 그 값은 건드리지 않음.
  // (기존에는 state 전체를 통째로 덮어써서, 서로 다른 항목을 거의 동시에 바꾸면 한쪽이 사라질 수 있었음)
  const syncToCloud = () => {
    if (pendingRef.current) {
      // 이미 저장 요청이 진행 중이면 새 요청을 겹쳐 보내지 않고, 그 요청이 끝난 뒤
      // 최신 state 기준으로 다시 한번 동기화하도록 예약만 해둠 (요청 순차 처리)
      queuedRef.current = true;
      return;
    }
    const current = stateRef.current;
    const prevSynced = lastSyncedRef.current;
    const changedKeys = Object.keys(current).filter(
      (k) => JSON.stringify(current[k]) !== JSON.stringify(prevSynced ? prevSynced[k] : undefined)
    );
    if (changedKeys.length === 0) return;
    // 문서 용량 추적 (Firestore 문서 한도 1MiB 대비 경고용)
    setDocBytes(JSON.stringify(current).length);
    const updates = {};
    changedKeys.forEach((k) => { updates[`state.${k}`] = current[k]; });
    lastSyncedRef.current = current;
    pendingRef.current = updateDoc(doc(db, "families", familyId), updates)
      .then(() => setSyncError(false))
      .catch((err) => {
        console.error("Firestore 저장 실패:", err);
        // 저장이 실패하면 다음 변경 시 재시도될 수 있도록 되돌려 둠 (조용히 유실되는 것 방지)
        lastSyncedRef.current = prevSynced;
        // 실패 원인 구분: 문서 크기 초과(invalid-argument)는 네트워크 문제와 다른 안내 필요
        setSyncError(err && err.code === "invalid-argument" ? "size" : "network");
      })
      .finally(() => {
        pendingRef.current = null;
        if (queuedRef.current) {
          queuedRef.current = false;
          syncToCloud(); // 진행 중이던 요청이 끝나는 사이 쌓인 변경사항을 최신 state 기준으로 다시 동기화
        }
      });
  };

  useEffect(() => {
    if (!ready) return; // 최초 원격 데이터 수신 전에는 로컬 seed로 덮어쓰지 않음
    syncToCloud();
  }, [state, ready, familyId]);

  // 네트워크가 복구되면 마지막으로 실패했던 저장을 다시 시도
  useEffect(() => {
    const retry = () => { if (ready) syncToCloud(); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [ready, familyId]);

  // 개선 제안함을 가족별 state → 전체 공유 컬렉션(globalFeedback)으로 옮기는 1회성 마이그레이션.
  // 이 기능이 가족별 state.feedback이던 시절에 이미 남겨진 제안이 있으면 새 컬렉션에 복사한 뒤
  // 로컬에서 비운다(FEEDBACK_MIGRATED). 실패하면 state.feedback이 그대로 남아 다음 로드 때 재시도됨
  useEffect(() => {
    if (!ready) return;
    const old = state.feedback;
    if (!old || old.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        for (const f of old) {
          const by = f.by || user.uid;
          const byName = (state.memberProfiles[by] || {}).name || user.displayName || "익명";
          await addDoc(collection(db, "globalFeedback"), { text: f.text, by, byName, familyId, at: f.at || new Date().toISOString() });
        }
        if (!cancelled) dispatch({ type: "FEEDBACK_MIGRATED" });
      } catch { /* 실패하면 state.feedback이 비워지지 않아 다음 로드 때 다시 시도됨 */ }
    })();
    return () => { cancelled = true; };
  }, [ready, state.feedback, familyId, user.uid, user.displayName, dispatch]);

  const leaveFamily = async () => {
    const ref = doc(db, "families", familyId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const members = (snap.data().members || []).filter((u) => u !== user.uid);
      await updateDoc(ref, { members });
    }
    await setDoc(doc(db, "users", user.uid), { familyId: null }, { merge: true });
    window.location.reload();
  };

  const { toast, setToast, notify } = useToast();

  if (!ready) return <CenterMessage text="데이터를 불러오는 중..." />;

  return (
    <Store.Provider value={{ state, dispatch, cloud: { familyId, user, meta, leaveFamily, logout: onLogout }, notify }}>
      <Shell />
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 70, display: "flex", flexDirection: "column" }}>
        {syncError && (
          <div style={{ background: C.apricot, color: "#fff", fontSize: 12, fontWeight: 700, textAlign: "center", padding: "8px 12px" }}>
            {syncError === "size"
              ? "저장 용량이 한도를 초과해 저장에 실패했어요. 더보기 > 설정에서 데이터 사용량을 확인해 주세요."
              : "저장에 실패했어요. 인터넷 연결을 확인해 주세요. 연결되면 자동으로 다시 저장을 시도합니다."}
          </div>
        )}
        {!syncError && docBytes > DOC_SIZE_WARN_BYTES && (
          <div style={{ background: C.butterLight, color: "#9A7416", fontSize: 12, fontWeight: 700, textAlign: "center", padding: "8px 12px" }}>
            데이터 사용량이 저장 한도의 {Math.round((docBytes / DOC_SIZE_LIMIT_BYTES) * 100)}%에 도달했어요. 오래된 기록 정리를 권장합니다.
          </div>
        )}
        {/* 업데이트 적용(새로고침) 전 진행 중인 저장 요청이 있으면 끝나길 기다림(P0-1 pendingRef 재사용) */}
        <UpdateBanner waitFor={() => pendingRef.current || Promise.resolve()} />
      </div>
      <ToastView toast={toast} setToast={setToast} state={state} />
      {!state.memberProfiles[user.uid] && (
        <DisplayNameSheet
          defaultName={user.displayName || ""}
          onSubmit={(name) => dispatch({ type: "MEMBER_PROFILE_SET", uid: user.uid, name })}
        />
      )}
    </Store.Provider>
  );
}

// 팝업 로그인이 지원되지 않거나 막혔을 때만 리다이렉트로 재시도 - 사용자가 그냥 팝업을 닫은
// 경우(popup-closed-by-user)까지 자동으로 페이지를 이동시키면 오히려 당황스러우므로 제외.
// (실기기 확인 결과) 홈 화면에 설치된 standalone 앱(안드로이드·iOS 모두)에서는 signInWithRedirect가
// 구글에서 돌아온 뒤 로그인 상태를 못 받아오고 조용히 로그인 화면으로 되돌아가는 문제가 있어서,
// standalone 여부와 무관하게 항상 팝업을 우선 사용하고 리다이렉트는 팝업이 명백히 실패했을 때만
// 최후 수단으로 시도함
const POPUP_FALLBACK_CODES = new Set(["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"]);

export function AuthGate() {
  const [user, setUser] = useState(undefined); // undefined=확인중, null=로그아웃
  const [familyId, setFamilyId] = useState(undefined); // undefined=확인중, null=없음
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setBusy(false);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        setFamilyId(snap.exists() ? (snap.data().familyId || null) : null);
      } else {
        setFamilyId(undefined);
      }
    });
    return unsub;
  }, []);

  // signInWithRedirect로 로그인한 경우, 구글에서 돌아온 직후 결과를 확인해 실패를 화면에 알려줌
  // (성공은 위 onAuthStateChanged가 그대로 감지하므로 여기서는 에러 처리만 담당)
  useEffect(() => {
    getRedirectResult(auth).catch(() => {
      setError("로그인에 실패했습니다. 다시 시도해 주세요.");
      setBusy(false);
    });
  }, []);

  const login = async () => {
    setError(""); setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e && POPUP_FALLBACK_CODES.has(e.code)) {
        try { await signInWithRedirect(auth, googleProvider); return; } catch { /* 아래 공통 에러 처리로 진행 */ }
      }
      setError("로그인에 실패했습니다. 다시 시도해 주세요.");
      setBusy(false);
    }
  };
  const logout = () => signOut(auth);

  if (user === undefined) return <CenterMessage text="불러오는 중..." />;
  if (!user) return <LoginScreen onLogin={login} busy={busy} error={error} />;
  if (familyId === undefined) return <CenterMessage text="불러오는 중..." />;
  if (!familyId) return <FamilySetupScreen user={user} onDone={setFamilyId} onLogout={logout} />;
  return <FamilyStoreProvider familyId={familyId} user={user} onLogout={logout} />;
}

/* ----------------------------- 데모 모드 (스크린샷용, 임시) ----------------------------- */
// URL에 ?demo 를 붙이면 로그인 없이 데모 데이터로 앱을 보여줌. Firebase에 아무것도 저장하지 않음.
// 작성자 추적 기능 미리보기: 구글 로그인 없이도 확인할 수 있도록 두 번째 가상 구성원("아빠")과
// 예시 작성자 메타·활동 로그를 함께 심어둔다 (실제 계정·데이터에는 영향 없음)
const DEMO_UID_2 = "demo2";
// 지금 시각 기준 "daysAgo일 전 hh:mm"의 ISO 문자열 (authorTime()이 로컬시간으로 다시 읽으므로 왕복 일관성 유지)
const atTime = (daysAgo, hh, mm) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
export function demoState() {
  const s = seedState();
  const t = todayISO();
  const mk = (label, time, items, intakeG) => ({ id: uid(), label, time, items, intakeG, planSnapshot: null });
  const fz = (name, qty, unitG = 15) => ({ name, source: "frozen", qty, unitG, deduct: true });
  const menus = [
    [fz("죽", 4, 20), fz("소고기", 1), fz("브로콜리", 1)],
    [fz("죽", 4, 20), fz("닭고기", 1), fz("애호박", 1)],
    [fz("죽", 4, 20), fz("소고기", 1), fz("단호박", 1)],
    [fz("죽", 4, 20), fz("대구살", 1), fz("당근", 1)],
    [fz("죽", 4, 20), fz("닭고기", 1), fz("청경채", 1)],
    [fz("죽", 4, 20), fz("소고기", 1), fz("시금치", 1)],
  ];
  const totalG = (items) => items.reduce((s2, it) => s2 + it.qty * it.unitG, 0);
  const logs = {};
  for (let d = 13; d >= 1; d--) {
    const iso = addDaysISO(t, -d);
    const ratios = [[0.95, 1], [0.8, 0.9], [1, 0.75]];
    logs[iso] = [
      mk("아침", "07:00", menus[d % menus.length], Math.round(totalG(menus[d % menus.length]) * ratios[0][d % 2])),
      mk("점심", "12:00", menus[(d + 2) % menus.length], Math.round(totalG(menus[(d + 2) % menus.length]) * ratios[1][d % 2])),
      mk("저녁", "18:00", menus[(d + 4) % menus.length], Math.round(totalG(menus[(d + 4) % menus.length]) * ratios[2][d % 2])),
    ];
  }
  // 작성자 추적 데모: 오늘 아침 기록은 "아빠"가 남기고 "데모 사용자"가 섭취량을 다시 확인·수정한 것으로 구성
  const todayBreakfastLogId = uid();
  logs[t] = [{
    ...mk("아침", "07:00", [fz("죽", 4, 20), fz("소고기", 1), fz("브로콜리", 1), fz("애호박", 1)], 118),
    id: todayBreakfastLogId,
    createdBy: DEMO_UID_2, createdAt: atTime(0, 7, 12),
    updatedBy: "demo", updatedAt: atTime(0, 7, 45),
  }];
  // 데모 전용 풍부한 재고·식단·먹어본 재료 (seedState는 중립 예시만 담으므로 여기서 채움)
  const jukBatchId = uid(), beefBatchId = uid(), zucchiniBatchId = uid(), carrotBatchId = uid();
  const stock = {
    죽: { batches: [{ id: jukBatchId, date: addDaysISO(t, -2), unitG: 20, frozen: 8, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null,
      createdBy: DEMO_UID_2, createdAt: atTime(2, 10, 5) }] },
    소고기: { batches: [{ id: beefBatchId, date: addDaysISO(t, -3), unitG: 15, frozen: 2, fridgeG: 40, frozenExp: addDaysISO(t, 11), fridgeExp: addDaysISO(t, 1),
      createdBy: "demo", createdAt: atTime(3, 14, 30), updatedBy: DEMO_UID_2, updatedAt: atTime(0, 8, 0) }] },
    브로콜리: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 4, fridgeG: 20, frozenExp: addDaysISO(t, 12), fridgeExp: addDaysISO(t, 1) }] },
    애호박: { batches: [{ id: zucchiniBatchId, date: addDaysISO(t, -1), unitG: 15, frozen: 9, fridgeG: 0, frozenExp: addDaysISO(t, 13), fridgeExp: null,
      createdBy: DEMO_UID_2, createdAt: atTime(1, 19, 40) }] },
    단호박: { batches: [{ id: uid(), date: addDaysISO(t, -1), unitG: 15, frozen: 6, fridgeG: 0, frozenExp: addDaysISO(t, 13), fridgeExp: null }] },
    닭고기: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 5, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
    청경채: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 5, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
    당근: { batches: [{ id: carrotBatchId, date: addDaysISO(t, -2), unitG: 15, frozen: 7, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null,
      createdBy: "demo", createdAt: atTime(2, 9, 20) }] },
  };
  const todayLunchMealId = uid(), todayDinnerMealId = uid();
  const plans = {
    [t]: [
      { id: uid(), label: "아침", time: "07:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "브로콜리", qty: 1 }, { name: "애호박", qty: 1 }],
        createdBy: DEMO_UID_2, createdAt: atTime(1, 20, 10) },
      { id: todayLunchMealId, label: "점심", time: "12:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "단호박", qty: 1 }],
        createdBy: "demo", createdAt: atTime(1, 20, 12) },
      { id: todayDinnerMealId, label: "저녁", time: "18:00", items: [{ name: "죽", qty: 4 }, { name: "닭고기", qty: 1 }, { name: "청경채", qty: 1 }],
        createdBy: "demo", createdAt: atTime(1, 20, 15), updatedBy: DEMO_UID_2, updatedAt: atTime(0, 11, 5) },
    ],
    [addDaysISO(t, 1)]: [
      { id: uid(), label: "아침", time: "07:00", items: [{ name: "죽", qty: 4 }, { name: "두부", qty: 1 }, { name: "시금치", qty: 1 }] },
      { id: uid(), label: "점심", time: "12:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "무", qty: 1 }] },
    ],
    [addDaysISO(t, -1)]: [
      { id: uid(), label: "아침", time: "07:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "시금치", qty: 1 }] },
      { id: uid(), label: "점심", time: "12:00", items: [{ name: "죽", qty: 4 }, { name: "대구살", qty: 1 }, { name: "당근", qty: 1 }] },
      { id: uid(), label: "저녁", time: "18:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "양배추", qty: 1 }] },
    ],
  };
  const eatenSeed = {
    채소: ["토마토", "양배추", "브로콜리", "애호박", "단호박", "고구마", "감자", "시금치", "청경채", "무", "양파", "당근", "가지", "배추"],
    단백질: ["닭고기", "대구살", "소고기", "두부", "달걀노른자"],
    과일: ["사과", "바나나", "배"],
    탄수화물: ["쌀", "잡곡(귀리)"],
  };
  const intros = [];
  Object.entries(eatenSeed).forEach(([cat, names]) =>
    names.forEach((name) => intros.push({ id: uid(), name, cat, status: "이상없음", memo: "", date: addDaysISO(t, -20) }))
  );
  const songiId = uid();
  intros.unshift({ id: songiId, name: "새송이버섯", cat: "채소", status: "관찰중", memo: "곱게 갈아서 제공", date: addDaysISO(t, -2) });
  // 작성자 추적 기능 데모: 고정 uid "demo" + 가상의 두 번째 구성원("아빠")을 미리 등록해
  // 구글 로그인 없이도 뱃지·활동 내역·구성원 필터를 확인할 수 있게 함
  const memberProfiles = {
    demo: { name: "데모 사용자", color: MEMBER_COLOR_PALETTE[0], joinedAt: addDaysISO(t, -20) },
    [DEMO_UID_2]: { name: "아빠", color: MEMBER_COLOR_PALETTE[1], joinedAt: addDaysISO(t, -18) },
  };
  // 시판 이유식 데모 예시: 제품 2개(하나는 재고 있음, 하나는 소진 상태) + 오늘 점심을
  // "계획은 제작 이유식이었지만 실제로는 시판 제품으로 먹인" 시나리오로 구성해
  // 계획 대비 비교 화면에서 재료/시판 항목이 함께 보이는 걸 바로 확인할 수 있게 함
  const productId1 = uid(), productId2 = uid();
  const products = {
    [productId1]: { id: productId1, name: "소고기미역진밥", brand: "배즐거워", packG: 100, ingredients: ["소고기", "미역", "쌀"], memo: "",
      createdBy: DEMO_UID_2, createdAt: atTime(2, 11, 0) },
    [productId2]: { id: productId2, name: "단호박아기죽", brand: "아이배냇", packG: 120, ingredients: ["단호박", "쌀"], memo: "완식률이 좋아요",
      createdBy: "demo", createdAt: atTime(3, 9, 30) },
  };
  const productStock = {
    [productId1]: { lots: [{ id: uid(), buyDate: addDaysISO(t, -2), exp: addDaysISO(t, 180), packs: 3, createdBy: DEMO_UID_2, createdAt: atTime(2, 11, 5) }] },
    [productId2]: { lots: [{ id: uid(), buyDate: addDaysISO(t, -10), exp: addDaysISO(t, 60), packs: 0, createdBy: "demo", createdAt: atTime(3, 9, 35) }] },
  };
  const todayLunchLogId = uid();
  logs[t].push({
    ...mk("점심", "12:05", [{ source: "product", productId: productId1, productName: "소고기미역진밥", packG: 100, qty: 1, deduct: true, deductedQty: 1, deductedLots: [{ lotId: productStock[productId1].lots[0].id, qty: 1 }] }], 95),
    id: todayLunchLogId,
    planSnapshot: { label: "점심", time: "12:00", items: plans[t][1].items },
    createdBy: DEMO_UID_2, createdAt: atTime(0, 12, 5),
  });
  productStock[productId1].lots[0].packs = 2; // 위 기록으로 1팩 차감된 이후 상태(3 - 1)
  // 활동 내역 화면 미리보기용 예시 로그 - 위에서 만든 실제 배치·끼니·기록과 동일한 id를 참조해
  // 활동 내역에서 항목을 탭하면 해당 상세 화면으로 정상 이동한다
  const activity = [
    { id: uid(), at: atTime(2, 9, 20), by: "demo", action: "STOCK_ADD_BATCH", kind: "create", summary: "당근 제조 기록 추가 (냉동 7큐브)", ref: { name: "당근" } },
    { id: uid(), at: atTime(2, 10, 5), by: DEMO_UID_2, action: "STOCK_ADD_BATCH", kind: "create", summary: "죽 제조 기록 추가 (냉동 8큐브)", ref: { name: "죽" } },
    { id: uid(), at: atTime(1, 19, 40), by: DEMO_UID_2, action: "STOCK_ADD_BATCH", kind: "create", summary: "애호박 제조 기록 추가 (냉동 9큐브)", ref: { name: "애호박" } },
    { id: uid(), at: atTime(1, 20, 0), by: DEMO_UID_2, action: "INTRO_UPSERT", kind: "create", summary: "새송이버섯 먹어본 재료 등록 (관찰중)", ref: { name: "새송이버섯" } },
    { id: uid(), at: atTime(1, 20, 10), by: DEMO_UID_2, action: "PLAN_SAVE_MEAL", kind: "create", summary: `${t.slice(5)} 아침 식단 추가 (재료 4개)`, ref: { date: t, mealId: plans[t][0].id, label: "아침" } },
    { id: uid(), at: atTime(1, 20, 12), by: "demo", action: "PLAN_SAVE_MEAL", kind: "create", summary: `${t.slice(5)} 점심 식단 추가 (재료 3개)`, ref: { date: t, mealId: todayLunchMealId, label: "점심" } },
    { id: uid(), at: atTime(1, 20, 15), by: "demo", action: "PLAN_SAVE_MEAL", kind: "create", summary: `${t.slice(5)} 저녁 식단 추가 (재료 3개)`, ref: { date: t, mealId: todayDinnerMealId, label: "저녁" } },
    { id: uid(), at: atTime(0, 7, 12), by: DEMO_UID_2, action: "LOG_SAVE", kind: "create", summary: `${t.slice(5)} 아침 급여 기록 저장 (재료 4개, 125g)`, ref: { date: t, logId: todayBreakfastLogId, label: "아침" } },
    { id: uid(), at: atTime(0, 7, 45), by: "demo", action: "LOG_SAVE", kind: "update", summary: `${t.slice(5)} 아침 급여 기록 수정 (재료 4개, 125g)`, ref: { date: t, logId: todayBreakfastLogId, label: "아침" } },
    { id: uid(), at: atTime(0, 8, 0), by: DEMO_UID_2, action: "STOCK_UPDATE_BATCH", kind: "update", summary: "소고기 제조 배치 수정", ref: { name: "소고기" } },
    { id: uid(), at: atTime(0, 11, 5), by: DEMO_UID_2, action: "PLAN_SAVE_MEAL", kind: "update", summary: `${t.slice(5)} 저녁 식단 수정 (재료 3개)`, ref: { date: t, mealId: todayDinnerMealId, label: "저녁" } },
    { id: uid(), at: atTime(3, 9, 30), by: "demo", action: "PRODUCT_UPSERT", kind: "create", summary: "단호박아기죽 시판 제품 등록", ref: { productId: productId2 } },
    { id: uid(), at: atTime(2, 11, 0), by: DEMO_UID_2, action: "PRODUCT_UPSERT", kind: "create", summary: "소고기미역진밥 시판 제품 등록", ref: { productId: productId1 } },
    { id: uid(), at: atTime(0, 12, 5), by: DEMO_UID_2, action: "LOG_SAVE", kind: "create", summary: `${t.slice(5)} 점심 급여 기록 저장 (항목 1개, 100g)`, ref: { date: t, logId: todayLunchLogId, label: "점심" } },
  ];
  // 가상의 생일 (~생후 9개월) - 실제 개인 정보 아님. 시판 이유식 재고관리는 데모에서 기본 ON으로 시작해
  // 구글 로그인 없이도 전체 기능(재고 섹션·비교 화면·활동 내역)을 바로 볼 수 있게 함
  return {
    ...s, stock, plans, logs, intros, memberProfiles, activity, products, productStock,
    settings: { ...s.settings, productStockEnabled: true },
    members: ["엄마", "아빠"], baby: { name: "", sex: "남아", birth: addDaysISO(t, -280) },
  };
}

export function DemoProvider() {
  const [state, rawDispatch] = useReducer(reducer, undefined, () => demoState());
  const dispatch = useCallback(
    (action) => rawDispatch({ ...action, _actor: "demo", _at: new Date().toISOString() }),
    []
  );
  // 실제 앱과 동일한 공용 토스트 (데모에서도 저장/삭제 피드백 확인 가능)
  const { toast, setToast, notify } = useToast();
  const cloud = {
    familyId: "demo",
    user: { uid: "demo", displayName: "데모", email: "demo@babycube.app" },
    // 작성자 추적 데모: 가상의 두 번째 구성원("아빠")도 함께 노출해 구성원 필터·뱃지를 확인할 수 있게 함
    meta: {
      members: ["demo", DEMO_UID_2],
      memberInfo: { demo: { name: "데모 사용자", email: "demo@babycube.app" }, [DEMO_UID_2]: { name: "아빠", email: "dad@babycube.app" } },
      ownerUid: "demo",
    },
    leaveFamily: () => {},
    logout: () => {},
  };
  return (
    <Store.Provider value={{ state, dispatch, cloud, notify }}>
      <Shell />
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 70 }}>
        <UpdateBanner />
      </div>
      <ToastView toast={toast} setToast={setToast} state={state} />
    </Store.Provider>
  );
}

/* (C-1 데모) 가족 생성·합류 흐름 미리보기 - ?demo=family
   실제 Firebase를 전혀 사용하지 않고, 새 초대코드 문서 방식의 UI 흐름을 체험:
   생성 → 초대 코드 확인 → (그 코드로) 합류 테스트 → 데모 앱 진입 */
export function DemoFamilyFlow() {
  const [phase, setPhase] = useState("setup"); // setup | created | app
  const [createdCode, setCreatedCode] = useState(null);
  const invitesRef = useRef({}); // 데모용 인메모리 invites/{code} 컬렉션
  const demoUser = { uid: "demo", displayName: "데모 사용자", email: "demo@babycube.app" };

  const api = {
    async createFamily() {
      await new Promise((r) => setTimeout(r, 500));
      const code = genInviteCode();
      invitesRef.current[code] = code; // invites/{code} = { familyId } 생성에 해당
      setCreatedCode(code);
      return code;
    },
    async joinByCode(_user, code) {
      await new Promise((r) => setTimeout(r, 500));
      // invites/{code} 단건 조회에 해당 - 없는 코드는 실패 (가족 목록을 뒤질 수 없음)
      if (!invitesRef.current[code]) throw new Error("invite-not-found");
      return invitesRef.current[code];
    },
  };

  if (phase === "app") return <DemoProvider />;
  return (
    <>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 80, background: C.butterLight, color: "#9A7416", fontSize: 12, fontWeight: 700, textAlign: "center", padding: "8px 12px" }}>
        데모 미리보기 — 실제 계정·데이터에 영향 없음 (새 초대코드 방식)
      </div>
      {phase === "created" ? (
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24, fontFamily: "'Noto Sans KR', sans-serif", gap: 18 }}>
          <style>{FONT_IMPORT}</style>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Gowun Dodum', sans-serif", fontSize: 20, color: C.ink, marginBottom: 6 }}>가족이 만들어졌어요</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>아래 초대 코드가 invites 문서로 발급됐어요.<br />배우자는 이 코드만으로 합류할 수 있어요 (가족 데이터 열람 불가).</div>
          </div>
          <div style={{ background: C.sageLight, borderRadius: 14, padding: "16px 34px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.sageDeep, fontWeight: 700, marginBottom: 6 }}>초대 코드</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 4, color: C.sageDeep, fontFamily: "'Gowun Dodum', sans-serif" }}>{createdCode}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320 }}>
            <button onClick={() => setPhase("setup")} style={primaryBtn}>이 코드로 합류 흐름 테스트하기</button>
            <button onClick={() => setPhase("app")} style={{ ...primaryBtn, background: C.sageLight, color: C.sageDeep }}>바로 앱으로 들어가기</button>
          </div>
          <div style={{ fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 1.6, maxWidth: 300 }}>
            팁: 합류 화면에서 위 코드가 아닌 아무 코드나 넣으면 "합류 실패"가 나와요 — 코드를 모르면 어떤 가족도 찾을 수 없다는 뜻이에요.
          </div>
        </div>
      ) : (
        <FamilySetupScreen
          user={demoUser}
          api={api}
          onDone={(fid, action) => setPhase(action === "create" ? "created" : "app")}
          onLogout={() => {}}
        />
      )}
    </>
  );
}
