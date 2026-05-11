import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDMGG5irMMsrTmfos1KcBeXUc8NaM3E1AY",
  authDomain: "blockchain-certificates-7bea4.firebaseapp.com",
  projectId: "blockchain-certificates-7bea4",
  storageBucket: "blockchain-certificates-7bea4.firebasestorage.app",
  messagingSenderId: "407135696622",
  appId: "1:407135696622:web:a916046d52742ee852e5ff",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");
export { app };
