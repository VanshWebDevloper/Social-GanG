// settings page: account info, password change, sign out.
// communities you own live in the profile page's admin, not here.

import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, updatePassword, signOut, EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

let me = null, myDoc = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.replace("login.html"); return; }
  me = user;

  const snap = await getDoc(doc(db, "users", user.uid));
  myDoc = snap.exists() ? snap.data() : { name: user.displayName || "anon", email: user.email };

  const commsSnap = await getDocs(collection(db, "communities"));
  const owned = commsSnap.docs.filter(d => d.data().owner === me.uid).length;

  render(owned);
});

function render(owned) {
  const box = $("settingsList");
  const joined = myDoc.joined ? new Date(myDoc.joined).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "—";

  box.innerHTML = `
    <div class="set-head">account</div>
    <div class="set-row">
      <div class="set-meta"><strong>${esc(myDoc.name || "anon")}</strong><span>${esc(me.email)}</span></div>
      <span class="members-count">member since ${joined.toLowerCase()}</span>
    </div>
    <div class="set-head">security</div>
    <div class="set-row">
      <div class="set-meta"><strong>password</strong><span>change your password</span></div>
      <button class="mini" id="pwBtn">change</button>
    </div>
    <div class="set-head">session</div>
    <div class="set-row">
      <div class="set-meta"><strong>log out</strong><span>end this session</span></div>
      <button class="mini" id="outBtn">log out</button>
    </div>
    <div class="set-row">
      <div class="set-meta"><strong>delete account</strong><span>removes your profile, permanent</span></div>
      <button class="mini" id="delBtn" style="color:#b3261e">delete</button>
    </div>`;

  $("pwBtn").onclick = () => {
    const modal = $("modalBox");
    $("overlay").hidden = false;
    modal.innerHTML = `
      <h3>change password</h3>
      <input type="password" id="curPw" placeholder="current password">
      <input type="password" id="newPw" placeholder="new password (6+ chars)">
      <div class="row">
        <button id="cancelM">cancel</button>
        <button class="primary" id="savePw">save</button>
      </div>`;
    $("cancelM").onclick = () => $("overlay").hidden = true;
    $("savePw").onclick = async () => {
      try {
        const cred = EmailAuthProvider.credential(me.email, $("curPw").value);
        await reauthenticateWithCredential(me, cred);
        await updatePassword(me, $("newPw").value);
        $("overlay").hidden = true;
        toast("password updated");
      } catch (err) {
        const map = {
          "auth/wrong-password": "current password is wrong",
          "auth/weak-password": "new password needs 6+ characters",
          "auth/too-many-requests": "too many tries, wait a bit"
        };
        toast(map[err.code] || err.code);
      }
    };
  };

  $("outBtn").onclick = async () => { await signOut(auth); location.replace("login.html"); };

  $("delBtn").onclick = () => {
    const modal = $("modalBox");
    $("overlay").hidden = false;
    modal.innerHTML = `
      <h3>delete account?</h3>
      <p style="font-size:14px;color:#6f6650;margin-bottom:14px">this can't be undone. your profile goes away, messages you sent stay up.</p>
      <div class="row">
        <button id="cancelM">keep my account</button>
        <button class="primary" id="confirmDel" style="background:#b3261e;color:#fff">delete</button>
      </div>`;
    $("cancelM").onclick = () => $("overlay").hidden = true;
    $("confirmDel").onclick = () => {
      // deleting needs the users/{uid} doc + auth user gone; auth delete
      // requires a recent login, so route through reauth first
      $("overlay").hidden = true;
      toast("account deletion isn't wired up yet, ping the dev");
    };
  };
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => t.hidden = true, 2500);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
