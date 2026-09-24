// auth.js — signup and login. boring on purpose.
// rule of the file: once you're signed in, you go home. no "check your email first" gate.
// the verification mail still fires, but it's a side quest, not a wall.

// one shared firebase instance comes from firebase-config.js — never call
// initializeApp twice in the same page, firebase throws "duplicate app".
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, sendEmailVerification, updateProfile
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const errBox = $("err");
function fail(msg) {
  errBox.textContent = msg;
  errBox.hidden = false;
}

// --- signup / login toggle -------------------------------------------------
// we always START on signup because new people outnumber returning ones here.
// clicking "log in" flips the form in place, same page, no routing.

let mode = "signup";

function renderMode() {
  $("name").hidden = mode === "login";
  $("goBtn").textContent = mode === "signup" ? "sign up" : "log in";
  $("swap").innerHTML = mode === "signup"
    ? 'already in the gang? <a href="#" id="swapLink">log in</a>'
    : 'new here? <a href="#" id="swapLink">make an account</a>';
  $("tagline").textContent = mode === "signup"
    ? "create an account, no email rabbit holes"
    : "welcome back, log in to the gang";
  $("swapLink").onclick = (e) => { e.preventDefault(); flip(); };
}

function flip() {
  mode = mode === "signup" ? "login" : "signup";
  errBox.hidden = true;
  renderMode();
}

// the swap link is re-created every render, so wire it inside renderMode,
// and call renderMode once on load or the name field shows up in login mode.
renderMode();

// --- the actual form -------------------------------------------------------

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  errBox.hidden = true;

  const btn = $("goBtn");
  btn.disabled = true;

  try {
    if (mode === "signup") {
      const cred = await createUserWithEmailAndPassword(auth, $("email").value.trim(), $("pass").value);
      const name = $("name").value.trim() || "anon";

      await updateProfile(cred.user, { displayName: name });

      // save the profile card in firestore so others can see who you are
      await setDoc(doc(db, "users", cred.user.uid), {
        name: name,
        email: cred.user.email,
        joined: Date.now()
      });

      // fire and forget the verification mail. don't make the user wait on it.
      sendEmailVerification(cred.user).catch(() => { /* sometimes rate limited, whatever */ });
    } else {
      await signInWithEmailAndPassword(auth, $("email").value.trim(), $("pass").value);
    }
    // onAuthStateChanged at the bottom does the redirect. nothing else needed.

  } catch (err) {
    // google's error codes are ugly, translate the ones people actually hit
    const map = {
      "auth/email-already-in-use": "that email already has an account, log in instead",
      "auth/invalid-email": "that email doesn't look right",
      "auth/weak-password": "password needs at least 6 characters",
      "auth/invalid-credential": "wrong email or password",
      "auth/user-not-found": "no account with that email",
      "auth/wrong-password": "wrong password",
      "auth/network-request-failed": "network hiccup, try again"
    };
    fail(map[err.code] || err.code);
    btn.disabled = false;
  }
});

// --- the bouncer -----------------------------------------------------------
// already logged in? home. that's the whole flow you asked for:
// signup -> home, login -> home. the only thing that stops you is being signed out.

onAuthStateChanged(auth, (user) => {
  if (user && user.uid) {
    location.replace("home.html");
  } else {
    btn.disabled = false;
  }
});
