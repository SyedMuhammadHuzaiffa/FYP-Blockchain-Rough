import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";

import { doc, setDoc, getDoc } from "firebase/firestore";

// REGISTER
export const registerUser = async (email, password, role) => {
  const userCred = await createUserWithEmailAndPassword(auth, email, password);

  await setDoc(doc(db, "users", userCred.user.uid), {
    uid: userCred.user.uid,
    email,
    role,
    createdAt: new Date()
  });

  return userCred.user;
};

// LOGIN
export const loginUser = async (email, password) => {
  const userCred = await signInWithEmailAndPassword(auth, email, password);
  return userCred.user;
};

// GET USER ROLE
export const getUserRole = async (uid) => {
  const docRef = doc(db, "users", uid);
  const snap = await getDoc(docRef);

  if (snap.exists()) {
    return snap.data().role;
  }
  return null;
};

// LOGOUT
export const logoutUser = async () => {
  await signOut(auth);
};