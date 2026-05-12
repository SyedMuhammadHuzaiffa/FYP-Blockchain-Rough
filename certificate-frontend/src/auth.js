import { auth, db, functions } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";

import { doc, getDoc } from "firebase/firestore";

// REGISTER
export const registerUser = async (email, password, name = "") => {
  const userCred = await createUserWithEmailAndPassword(auth, email, password);
  const createStudentProfile = httpsCallable(functions, "createStudentProfile");

  await userCred.user.getIdToken(true);

  await createStudentProfile({
    name,
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
