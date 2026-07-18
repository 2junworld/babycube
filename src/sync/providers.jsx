/* 동기화 계층 - 로그인·가족 설정·Firestore 실시간 동기화·데모 Provider (C-2 2단계) */
import React, { useState, useEffect, useReducer, useRef, useCallback } from "react";
import { db, auth, googleProvider } from "../firebase";
import { doc, setDoc, getDoc, updateDoc, onSnapshot, arrayUnion } from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { C, FONT_IMPORT, primaryBtn, MEMBER_COLOR_PALETTE } from "../theme";
import { addDaysISO, todayISO, uid } from "../lib/dates";
import { DOC_SIZE_LIMIT_BYTES, DOC_SIZE_WARN_BYTES, migrateState, reducer, seedState, totalG } from "../state/appState";
import { Store } from "../store";
import { CubeMark } from "../components/common";
import { Shell } from "../screens/Shell";

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
      <div style={{ background: C.bg, width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: "20px 18px 26px", boxSizing: "border-box" }}>
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
  changed.forEach((k) => { merged[k] = local[k]; });
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
      {syncError && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 70, background: C.apricot, color: "#fff", fontSize: 12, fontWeight: 700, textAlign: "center", padding: "8px 12px" }}>
          {syncError === "size"
            ? "저장 용량이 한도를 초과해 저장에 실패했어요. 더보기 > 설정에서 데이터 사용량을 확인해 주세요."
            : "저장에 실패했어요. 인터넷 연결을 확인해 주세요. 연결되면 자동으로 다시 저장을 시도합니다."}
        </div>
      )}
      {!syncError && docBytes > DOC_SIZE_WARN_BYTES && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 69, background: C.butterLight, color: "#9A7416", fontSize: 12, fontWeight: 700, textAlign: "center", padding: "8px 12px" }}>
          데이터 사용량이 저장 한도의 {Math.round((docBytes / DOC_SIZE_LIMIT_BYTES) * 100)}%에 도달했어요. 오래된 기록 정리를 권장합니다.
        </div>
      )}
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

  const login = async () => {
    setError(""); setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
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
  logs[t] = [mk("아침", "07:00", [fz("죽", 4, 20), fz("소고기", 1), fz("브로콜리", 1), fz("애호박", 1)], 118)];
  // 데모 전용 풍부한 재고·식단·먹어본 재료 (seedState는 중립 예시만 담으므로 여기서 채움)
  const stock = {
    죽: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 20, frozen: 8, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
    소고기: { batches: [{ id: uid(), date: addDaysISO(t, -3), unitG: 15, frozen: 2, fridgeG: 40, frozenExp: addDaysISO(t, 11), fridgeExp: addDaysISO(t, 1) }] },
    브로콜리: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 4, fridgeG: 20, frozenExp: addDaysISO(t, 12), fridgeExp: addDaysISO(t, 1) }] },
    애호박: { batches: [{ id: uid(), date: addDaysISO(t, -1), unitG: 15, frozen: 9, fridgeG: 0, frozenExp: addDaysISO(t, 13), fridgeExp: null }] },
    단호박: { batches: [{ id: uid(), date: addDaysISO(t, -1), unitG: 15, frozen: 6, fridgeG: 0, frozenExp: addDaysISO(t, 13), fridgeExp: null }] },
    닭고기: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 5, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
    청경채: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 5, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
    당근: { batches: [{ id: uid(), date: addDaysISO(t, -2), unitG: 15, frozen: 7, fridgeG: 0, frozenExp: addDaysISO(t, 12), fridgeExp: null }] },
  };
  const plans = {
    [t]: [
      { id: uid(), label: "아침", time: "07:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "브로콜리", qty: 1 }, { name: "애호박", qty: 1 }] },
      { id: uid(), label: "점심", time: "12:00", items: [{ name: "죽", qty: 4 }, { name: "소고기", qty: 1 }, { name: "단호박", qty: 1 }] },
      { id: uid(), label: "저녁", time: "18:00", items: [{ name: "죽", qty: 4 }, { name: "닭고기", qty: 1 }, { name: "청경채", qty: 1 }] },
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
  intros.unshift({ id: uid(), name: "새송이버섯", cat: "채소", status: "관찰중", memo: "곱게 갈아서 제공", date: addDaysISO(t, -2) });
  // 작성자 추적 기능 데모: 고정 uid "demo"를 미리 등록해 표시명 입력 바텀시트를 건너뜀
  const memberProfiles = { demo: { name: "데모 사용자", color: MEMBER_COLOR_PALETTE[0], joinedAt: addDaysISO(t, -20) } };
  // 가상의 생일 (~생후 9개월) - 실제 개인 정보 아님
  return { ...s, stock, plans, logs, intros, memberProfiles, members: ["엄마", "아빠"], baby: { name: "", sex: "남아", birth: addDaysISO(t, -280) } };
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
    meta: { members: ["demo"], memberInfo: { demo: { name: "데모" } }, ownerUid: "demo" },
    leaveFamily: () => {},
    logout: () => {},
  };
  return (
    <Store.Provider value={{ state, dispatch, cloud, notify }}>
      <Shell />
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
