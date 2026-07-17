/* 영양·궁합 정적 데이터 - 시드 재료, 성장 단계, 영양 태그, 궁합 규칙 (C-2 파일 분리) */

/* ----------------------------- 초기 시드 데이터 ----------------------------- */
// 재료 마스터: 카테고리 + 기본 1큐브 g
export const SEED_INGREDIENTS = {
  죽: { cat: "탄수화물", unitG: 20, staple: true },
  소고기: { cat: "단백질", unitG: 15 }, 닭고기: { cat: "단백질", unitG: 15 },
  대구살: { cat: "단백질", unitG: 15 }, 두부: { cat: "단백질", unitG: 15 },
  브로콜리: { cat: "채소", unitG: 15 }, 애호박: { cat: "채소", unitG: 15 },
  단호박: { cat: "채소", unitG: 15 }, 청경채: { cat: "채소", unitG: 15 },
  당근: { cat: "채소", unitG: 15 }, 양배추: { cat: "채소", unitG: 15 },
  시금치: { cat: "채소", unitG: 15 }, 무: { cat: "채소", unitG: 15 },
  사과: { cat: "과일", unitG: 15 }, 바나나: { cat: "과일", unitG: 15 },
  배: { cat: "과일", unitG: 15 },
};

/* ----------------------------- 이유식 성장 단계 참고 정보 (일반적인 참고용, 자동 적용 안 함) ----------------------------- */
// 개월수 구간별 일반적으로 알려진 참고 수치 - 실제 급여는 반드시 소아과 상담을 기준으로 할 것을 안내함
export const GROWTH_STAGES = [
  { min: 0, max: 4, stage: "이유식 준비기", mealsPerDay: "-", perMealG: "-", note: "아직 모유·분유만으로 충분한 시기예요. 이유식 시작은 보통 생후 5~6개월부터 고려해요." },
  { min: 5, max: 6, stage: "초기 이유식", mealsPerDay: "1~2회", perMealG: "30~60g", note: "묽은 미음 형태로 한 가지 재료씩 천천히 소개하는 시기예요." },
  { min: 7, max: 8, stage: "중기 이유식", mealsPerDay: "2~3회", perMealG: "80~120g", note: "약간의 알갱이가 있는 죽 형태로 넘어가는 시기예요." },
  { min: 9, max: 11, stage: "후기 이유식", mealsPerDay: "3회", perMealG: "120~180g", note: "진밥 형태로 다양한 재료를 조합해볼 수 있는 시기예요." },
  { min: 12, max: 999, stage: "완료기 이유식", mealsPerDay: "3회 + 간식 1~2회", perMealG: "150~200g", note: "일반식에 가까운 진밥·진밥 형태로 넘어가는 시기예요." },
];

export function growthStageOf(months) {
  return GROWTH_STAGES.find((g) => months >= g.min && months <= g.max) || GROWTH_STAGES[GROWTH_STAGES.length - 1];
}

/* ----------------------------- 재료 궁합 (영양학적 근거 기반) ----------------------------- */
// 포함 기준(엄격):
//  1) 사람 대상 연구로 확립된 '영양소 수준'의 상호작용만 수록 (예: 비타민C↔철분). 민간 음식궁합 속설은 제외
//  2) 근거 등급 표시 - A: 기전·임상 근거 모두 확립(NIH/WHO/영양학 교과서 수준), B: 근거는 있으나 한 끼 단위 효과 크기가 제한적일 수 있음
//  3) 태그가 등록되지 않은 재료는 추천하지 않음 (모르는 재료에 대해 추측하지 않음 - 보수적 원칙)
export const NUTRIENT_TAGS = {
  // 육류·알 (철분·지방)
  소고기: ["iron", "fat"], 닭고기: ["iron", "fat"], 돼지고기: ["iron", "fat"],
  오리고기: ["iron", "fat"], 양고기: ["iron", "fat"], 소간: ["iron"],
  달걀노른자: ["iron", "fat"], 메추리알: ["iron", "fat"],
  // 생선 (지방·칼슘)
  연어: ["fat"], 고등어: ["fat"], 삼치: ["fat"], 장어: ["fat"], 멸치: ["calcium"],
  // 콩·두부·곡물 (식물성 철분·칼슘)
  두부: ["iron", "calcium"], 순두부: ["iron", "calcium"], 콩: ["iron"], 검은콩: ["iron"],
  완두콩: ["iron", "vitc"], 렌틸콩: ["iron"], 병아리콩: ["iron"],
  "잡곡(귀리)": ["iron"], 귀리: ["iron"], 오트밀: ["iron"], 퀴노아: ["iron"],
  // 채소 (비타민C·베타카로틴·칼슘·옥살산)
  브로콜리: ["vitc"], 콜리플라워: ["vitc"], 파프리카: ["vitc", "betacarotene"], 피망: ["vitc"],
  토마토: ["vitc"], 청경채: ["vitc", "calcium"], 양배추: ["vitc"], 배추: ["vitc"],
  케일: ["vitc", "betacarotene", "calcium"], 감자: ["vitc"],
  당근: ["betacarotene"], 단호박: ["betacarotene"], 고구마: ["betacarotene", "vitc"],
  시금치: ["iron", "betacarotene", "oxalate"], 근대: ["oxalate"], 비트: ["oxalate"],
  // 과일 (비타민C·베타카로틴)
  딸기: ["vitc"], 귤: ["vitc"], 오렌지: ["vitc"], 키위: ["vitc"],
  망고: ["vitc", "betacarotene"], 파인애플: ["vitc"], 살구: ["betacarotene"],
  // 유제품·지방원
  치즈: ["fat", "calcium"], 아기치즈: ["fat", "calcium"], 요거트: ["fat", "calcium"],
  아보카도: ["fat"], 참기름: ["fat"], 들기름: ["fat"],
};

// 태그 한글 이름 (재료 정보 화면의 태그 편집 UI에서 사용)
export const TAG_LABELS = { iron: "철분", vitc: "비타민C", betacarotene: "베타카로틴", fat: "지방", calcium: "칼슘", oxalate: "옥살산" };

export const TAG_KEYS = Object.keys(TAG_LABELS);

// 영양 DB 재료의 기본 카테고리 (아직 앱에 등록하지 않은 재료를 위키·카테고리 점 색상에 표시할 때 사용)
export const DB_CATEGORY = {
  소고기: "단백질", 닭고기: "단백질", 돼지고기: "단백질", 오리고기: "단백질", 양고기: "단백질", 소간: "단백질",
  달걀노른자: "단백질", 메추리알: "단백질", 연어: "단백질", 고등어: "단백질", 삼치: "단백질", 장어: "단백질", 멸치: "단백질",
  두부: "단백질", 순두부: "단백질", 콩: "단백질", 검은콩: "단백질", 완두콩: "단백질", 렌틸콩: "단백질", 병아리콩: "단백질",
  치즈: "단백질", 아기치즈: "단백질", 요거트: "단백질", 참기름: "단백질", 들기름: "단백질",
  "잡곡(귀리)": "탄수화물", 귀리: "탄수화물", 오트밀: "탄수화물", 퀴노아: "탄수화물",
  브로콜리: "채소", 콜리플라워: "채소", 파프리카: "채소", 피망: "채소", 토마토: "채소", 청경채: "채소",
  양배추: "채소", 배추: "채소", 케일: "채소", 감자: "채소", 고구마: "채소", 당근: "채소", 단호박: "채소",
  시금치: "채소", 근대: "채소", 비트: "채소",
  딸기: "과일", 귤: "과일", 오렌지: "과일", 키위: "과일", 망고: "과일", 파인애플: "과일", 살구: "과일",
};

export const PAIRING_RULES = [
  { tagA: "iron", tagB: "vitc", type: "good", grade: "A", text: "비타민 C가 철분 흡수를 높여줘요" },
  { tagA: "betacarotene", tagB: "fat", type: "good", grade: "A", text: "베타카로틴은 지방과 함께 먹으면 흡수가 잘 돼요" },
  { tagA: "oxalate", tagB: "calcium", type: "avoid", grade: "A", text: "옥살산이 칼슘과 결합해 칼슘 흡수를 방해할 수 있어요" },
  { tagA: "calcium", tagB: "iron", type: "avoid", grade: "B", text: "같은 끼니의 많은 칼슘이 철분 흡수를 낮출 수 있다는 연구가 있어요" },
];
