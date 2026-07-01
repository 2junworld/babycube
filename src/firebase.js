import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";

/* =====================================================================
   ⚠️ 아래 값을 Firebase 콘솔에서 복사한 실제 값으로 교체하세요.
   경로: Firebase 콘솔 → 프로젝트 설정(톱니바퀴) → 일반 → 내 앱 → 웹 앱(</>) 설정
   자세한 단계는 배포_공유_가이드.md 2부를 참고하세요.
   ===================================================================== */

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAVVLe1w70YDFBnKOHeb1m24ZlVfqWlokc",
  authDomain: "babycube-86215.firebaseapp.com",
  projectId: "babycube-86215",
  storageBucket: "babycube-86215.firebasestorage.app",
  messagingSenderId: "1071517013239",
  appId: "1:1071517013239:web:b6e04f07a42f5c63a2aff2",
  measurementId: "G-PYLYW1KREW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// 오프라인에서도 마지막으로 받은 데이터를 캐시해서 보여주고,
// 온라인 복귀 시 자동으로 서버와 동기화합니다.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});
