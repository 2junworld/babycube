/* 앱 공통 테마 - 색상 팔레트·카테고리 상수·공용 스타일 (C-2 파일 분리) */

/* --------------------------------- 토큰 --------------------------------- */
export const C = {
  bg: "#FAF7F1", surface: "#FFFFFF", border: "#ECE5D6",
  ink: "#2A2722", inkSoft: "#534D43", muted: "#9A9285",
  sage: "#6B8F71", sageDeep: "#4F6E55", sageLight: "#E4ECE2",
  apricot: "#E07A3F", apricotLight: "#FBE6D6",
  butter: "#E8B94A", butterLight: "#FBF0D6",
  charcoal: "#1E1C19",
};

export const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Noto+Sans+KR:wght@400;500;700;900&display=swap');";

export const CATEGORY = {
  탄수화물: { color: "#9A9285", light: "#ECE9E1", label: "탄수화물" },
  단백질: { color: "#B9695C", light: "#F3E2DE", label: "단백질" },
  채소: { color: "#6B8F71", light: "#E4ECE2", label: "채소" },
  과일: { color: "#E8B94A", light: "#FBF0D6", label: "과일" },
  유제품: { color: "#7BA7BC", light: "#E3EEF2", label: "유제품" },
};

export const CATEGORIES = ["탄수화물", "단백질", "채소", "과일", "유제품"];

export const selectStyle = { border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 6px",
  fontSize: 12, fontWeight: 700, color: C.ink, background: C.surface, cursor: "pointer", outline: "none" };

export const stepBtn = { width: 24, height: 24, borderRadius: "50%", border: `1px solid ${C.border}`,
  background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 };

export const primaryBtn = { background: C.sage, border: "none", borderRadius: 14, padding: "13px 0",
  fontSize: 13.5, fontWeight: 700, color: "#fff", cursor: "pointer", width: "100%" };

// 구성원별 뱃지·타임라인 색상 - 가족 참여 순서대로 자동 배정 (작성자 추적 기능)
export const MEMBER_COLOR_PALETTE = ["#5B8DEF", "#E07A3F", "#6B8F71", "#BB6BD9", "#EB5757", "#4F9DA6"];

// 시판 이유식 항목 강조색 - 냉동(파랑 계열 CatDot)·냉장과 구분되는 별도 색점 (시판 이유식 기능)
export const PRODUCT_COLOR = "#8E6FCB";
export const PRODUCT_COLOR_LIGHT = "#EEE7F7";
