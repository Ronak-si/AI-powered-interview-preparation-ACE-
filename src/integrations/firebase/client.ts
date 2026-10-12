import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: "AIzaSyBiq-h0I-gpRRzPgvRKMY-quubJWVFaZZA",
  authDomain: "gen-lang-client-0224543585.firebaseapp.com",
  projectId: "gen-lang-client-0224543585",
  storageBucket: "gen-lang-client-0224543585.firebasestorage.app",
  messagingSenderId: "93361576335",
  appId: "1:93361576335:web:3383f109f12c7461dbd3fa",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(config);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
