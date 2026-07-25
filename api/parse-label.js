/* Vercel Serverless Function - 시판 이유식 성분표 사진 → Gemini 2.5 Flash로 제품명·재료 인식
   (성분표 AI 인식 기능 작업지시서 PR1)

   흐름: ID 토큰 검증 → 가족 멤버십 확인(Firestore REST, 본인 토큰 그대로 사용) → 일일 호출
   한도(가족당 30회) 확인 → Gemini 호출 → 결과 반환. API 키는 이 파일(서버)에서만 쓰이고
   클라이언트 번들에는 전혀 포함되지 않는다(VITE_ 접두사가 없는 서버 전용 환경변수). */
import { createRemoteJWKSet, jwtVerify } from "jose";

// src/firebase.js의 projectId와 동일해야 함 - 별도 시크릿이 아니라 공개 식별자라 하드코딩함
const FIREBASE_PROJECT_ID = "babycube-86215";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const DAILY_LIMIT = 30;
const RETAIN_DAYS = 30; // 이보다 오래된 사용량 카운트 키는 문서 갱신 시 함께 정리

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

// 한국 시각(KST, UTC+9) 기준 "오늘" 날짜 - 사용자가 체감하는 하루 단위와 맞추기 위함
// (서버리스 함수 자체는 UTC로 돌지만 카운트는 자정 경계만 중요하므로 오프셋만 더해 계산)
function kstDateStr() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function verifyIdToken(idToken) {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });
  const uid = payload.user_id || payload.sub;
  if (!uid) throw new Error("no_uid_in_token");
  return uid;
}

// 가족 문서를 "본인 idToken"으로 그대로 조회 - firestore.rules가 이미 "멤버만 읽기 허용"을
// 강제하므로, 이 요청이 200으로 성공한다는 것 자체가 곧 멤버십 증명이다(별도 검증 로직 불필요)
async function fetchFamilyMembers(idToken, familyId) {
  const r = await fetch(`${FIRESTORE_BASE}/families/${encodeURIComponent(familyId)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!r.ok) return null;
  const doc = await r.json();
  const values = doc?.fields?.members?.arrayValue?.values || [];
  return values.map((v) => v.stringValue).filter(Boolean);
}

function decodeIntMap(fields) {
  const out = {};
  if (!fields) return out;
  for (const [k, v] of Object.entries(fields)) {
    const n = v?.integerValue;
    if (n !== undefined) out[k] = parseInt(n, 10);
  }
  return out;
}

async function getVisionUsageCounts(idToken, familyId) {
  const r = await fetch(`${FIRESTORE_BASE}/families/${encodeURIComponent(familyId)}/meta/visionUsage`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (r.status === 404) return {};
  if (!r.ok) throw new Error(`usage_read_failed_${r.status}`);
  const doc = await r.json();
  return decodeIntMap(doc?.fields?.counts?.mapValue?.fields);
}

// 오래된 날짜 키(30일 이전)는 걸러내고 오늘 카운트를 1 늘려서 통째로 다시 씀(카운트 문서 비대화 방지)
async function bumpVisionUsage(idToken, familyId, counts, today) {
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 86400000).toISOString().slice(0, 10);
  const pruned = {};
  Object.entries(counts).forEach(([k, v]) => { if (k >= cutoff) pruned[k] = v; });
  pruned[today] = (pruned[today] || 0) + 1;
  const fields = {};
  Object.entries(pruned).forEach(([k, v]) => { fields[k] = { integerValue: String(v) }; });
  const url = `${FIRESTORE_BASE}/families/${encodeURIComponent(familyId)}/meta/visionUsage?updateMask.fieldPaths=counts`;
  await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { counts: { mapValue: { fields } } } }),
  });
}

const GEMINI_PROMPT = `한국 시판 이유식 제품의 성분표 사진이다.
반드시 JSON 객체 하나만 출력하라 (마크다운 코드펜스 금지, 다른 설명 문장 금지).
필드 구성:
- productName: 제품명 (문자열)
- manufacturer: 제조사 (문자열, 모르면 빈 문자열)
- ingredients: 재료명 배열(문자열 배열). 함량 %, 괄호 원산지 표기는 제거한다. 예: "쇠고기 12%(국내산)" → "쇠고기"
- stage: 월령 표기 원문 (문자열, 예: "만 9개월부터", 모르면 빈 문자열)
- confidence: 0~1 사이 숫자 (인식 신뢰도)
첨가물·비식재료(정제수, 산도조절제 등)도 일단 ingredients에 그대로 포함하고 분류하지 않는다.
사진이 성분표가 아니거나 판독이 불가능하면 다른 필드 없이 {"error":"unreadable"} 만 출력한다.`;

// 실패(네트워크·타임아웃·비정상 응답)는 그대로 throw해서 호출부가 502로 응답하게 하고,
// Gemini가 정상 응답했지만 JSON 파싱이 안 되는 경우만 {error:"unreadable"}로 취급(422 처리용)
async function callGemini(base64Image) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("gemini_api_key_missing");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [
          { text: GEMINI_PROMPT },
          { inline_data: { mime_type: "image/jpeg", data: base64Image } },
        ] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!r.ok) throw new Error(`gemini_http_${r.status}`);
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("gemini_empty_response");
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return { error: "unreadable" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const { image, idToken, familyId } = req.body || {};
  if (!image || !idToken || !familyId) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  let uid;
  try {
    uid = await verifyIdToken(idToken);
  } catch {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  const members = await fetchFamilyMembers(idToken, familyId).catch(() => null);
  if (!members || !members.includes(uid)) {
    res.status(401).json({ error: "not_family_member" });
    return;
  }

  const today = kstDateStr();
  let counts;
  try {
    counts = await getVisionUsageCounts(idToken, familyId);
  } catch {
    counts = {}; // 사용량 문서를 못 읽어도 인식 자체를 막지는 않음(안전장치가 목적이지 필수 관문이 아님)
  }
  if ((counts[today] || 0) >= DAILY_LIMIT) {
    res.status(429).json({ error: "daily_limit_exceeded" });
    return;
  }

  let parsed;
  try {
    parsed = await callGemini(image);
  } catch (err) {
    console.error("Gemini 호출 실패:", err);
    res.status(502).json({ error: "gemini_error" });
    return;
  }

  // 카운트 갱신은 실제로 Gemini를 호출(쿼터 소모)한 뒤에만 - 응답 자체를 막지는 않음(best-effort)
  bumpVisionUsage(idToken, familyId, counts, today).catch((err) => console.error("사용량 카운트 갱신 실패:", err));

  if (!parsed || parsed.error === "unreadable") {
    res.status(422).json({ error: "unreadable" });
    return;
  }

  res.status(200).json({
    productName: parsed.productName || "",
    manufacturer: parsed.manufacturer || "",
    ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
    stage: parsed.stage || "",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
  });
}
