import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCCPvHvfVATidac7mrDgLxlw1053Jzfw8k",
  authDomain: "social-gang.firebaseapp.com",
  projectId: "social-gang",
  storageBucket: "social-gang.firebasestorage.app",
  messagingSenderId: "608622712045",
  appId: "1:608622712045:web:6cca8d84d6832b0674a8e4"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// re-export the raw config so pages that need it (auth.js before this fix) can import it
export { firebaseConfig };
