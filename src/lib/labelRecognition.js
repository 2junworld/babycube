/* 시판 이유식 성분표 AI 인식 - 이미지 전처리 + 인식 결과를 재료 마스터에 매칭
   (성분표 AI 인식 기능 작업지시서 PR2) */

// 사진을 그대로 보내지 않고 canvas로 리사이즈해 전송량·토큰을 아낌 - 세로로 긴 파우치 성분표라도
// 긴 변 기준 1568px면 글씨가 뭉개지지 않는 하한선(작업지시서 엣지케이스 참고)
export function resizeLabelImage(file, maxSide = 1568, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSide || height > maxSide) {
        if (width > height) { height = Math.round((height / width) * maxSide); width = maxSide; }
        else { width = Math.round((width / height) * maxSide); height = maxSide; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(dataUrl.split(",")[1] || ""); // 데이터 URL 접두사(data:image/jpeg;base64,) 제거 후 순수 base64만
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 불러올 수 없습니다")); };
    img.src = url;
  });
}

// 성분표에 흔한 첨가물·비식재료 표기 - 매칭되면 제품의 "포함 재료"에 넣지 않고 참고용으로만 보여줌.
// 필요할 때 이 배열에 추가하면 됨
export const LABEL_EXCLUDE_DICT = [
  "정제수", "산도조절제", "혼합제제", "유화제", "증점제", "pH조정제", "향료", "산화방지제", "합성착향료",
];

// 성분표 표기 → 이 앱의 재료 마스터에서 실제로 쓰는 이름으로 정규화 (예: 쇠고기 → 소고기)
export const INGREDIENT_SYNONYMS = {
  쇠고기: "소고기", 우육: "소고기", 계란: "달걀", 계란노른자: "달걀노른자",
  닭가슴살: "닭고기", 백미: "쌀", 현미: "쌀", 흰살생선: "대구살",
};

function normalizeLabelIngredient(raw) {
  // Gemini 프롬프트에서 1차로 함량%·괄호 표기를 제거해 달라고 했지만, 혹시 남아있을 수 있는
  // 잔여 표기를 클라이언트에서 한 번 더 정리(이중 안전장치)
  return (raw || "").replace(/\([^)]*\)/g, "").replace(/\d+(\.\d+)?\s*%/g, "").trim();
}

// 인식된 재료명 배열을 재료 마스터와 매칭한다.
// matched: 마스터에 있는 이름으로 정규화된 재료 / newOnes: 마스터에 없어 새로 등록될 재료 /
// excluded: 첨가물 사전에 해당해 재료 목록에서 제외한 항목
export function matchIngredientsFromLabel(state, rawList) {
  const masterNames = Object.keys(state.ingredients || {});
  const matched = [];
  const newOnes = [];
  const excluded = [];

  (rawList || []).forEach((raw) => {
    const clean = normalizeLabelIngredient(raw);
    if (!clean) return;
    if (LABEL_EXCLUDE_DICT.some((ex) => clean.includes(ex))) { excluded.push(clean); return; }
    // 1단계: 완전 일치
    if (masterNames.includes(clean)) { matched.push(clean); return; }
    // 2단계: 동의어 사전
    const syn = INGREDIENT_SYNONYMS[clean];
    if (syn && masterNames.includes(syn)) { matched.push(syn); return; }
    // 3단계: 부분 문자열 포함 (예: "국내산 브로콜리" ⊃ "브로콜리")
    const partial = masterNames.find((m) => clean.includes(m) || m.includes(clean));
    if (partial) { matched.push(partial); return; }
    newOnes.push(clean);
  });

  return {
    matched: Array.from(new Set(matched)),
    newOnes: Array.from(new Set(newOnes)),
    excluded: Array.from(new Set(excluded)),
  };
}
