/* 날짜·포맷·ID 유틸 - 순수 함수만 (C-2 파일 분리) */

// UTC 변환을 거치지 않고 로컬 날짜 요소만으로 계산 (타임존에 따라 날짜가 밀리는 버그 방지)
export const pad2 = (n) => String(n).padStart(2, "0");

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const addDaysISO = (iso, n) => {
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID)
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; // 구형 브라우저 대비 폴백

export function fmtTime(hhmm, mode) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (mode === "ampm") {
    const period = h < 12 ? "오전" : "오후";
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return `${period} ${h12}:${String(m).padStart(2, "0")}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// 생년월일이 설정되지 않았으면 null 반환 - 표시하는 쪽에서 "미설정" 안내로 처리
export function ageMonths(birthISO) {
  if (!birthISO) return null;
  const birth = new Date(birthISO + "T00:00:00");
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  return Math.max(0, months);
}

export function ageText(birthISO) {
  const m = ageMonths(birthISO);
  return m == null ? "생년월일 미설정" : `생후 ${m}개월`;
}

/* =====================================================================
   식단표 탭
   ===================================================================== */
export const WD = ["일", "월", "화", "수", "목", "금", "토"];
