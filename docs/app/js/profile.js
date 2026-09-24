// profile page: own profile (pfp, name, bio) or another user's (?u=UID).
// avatars are stored as compressed data urls on the users doc, so this
// works without a storage bucket (free Spark plan).

import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, updateProfile, signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, collection, getDocs
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

function avatarColor(seed) {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${h} 55% 50%)`;
}
const initials = (n) => (n || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
// reuse the dm id scheme from dms.js: sorted pair joined by __
const dmId = (a, b) => [a, b].sort().join("__");

let me = null, myDoc = null;
let viewingUid = null; // set when ?u= points at someone else

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.replace("login.html"); return; }
  me = user;

  let snap = null;
  try { snap = await getDoc(doc(db, "users", user.uid)); } catch (e) { /* old rules may deny reads */ }
  myDoc = snap?.exists() ? snap.data() : { name: user.displayName || "anon", email: user.email, joined: Date.now() };
  try {
    if (!snap || !snap.exists()) await setDoc(doc(db, "users", user.uid), { ...myDoc });
  } catch { }

  viewingUid = new URLSearchParams(location.search).get("u");
  if (viewingUid === me.uid) viewingUid = null;

  if (viewingUid) {
    renderOther(viewingUid);
  } else {
    renderMy();
  }
  listenPeople();
});

// ---------------------------------------------------------------
// my profile
// ---------------------------------------------------------------

async function renderMy() {
  let mine = 0;
  try {
    const commsSnap = await getDocs(collection(db, "communities"));
    mine = commsSnap.docs.filter(d => d.data().members?.[me.uid]).length;
  } catch { /* rules may deny listing communities, profile still renders */ }

  const name = myDoc.name || "anon";
  const joined = myDoc.joined ? new Date(myDoc.joined).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "recently";
  const bio = myDoc.bio || "";
  const color = avatarColor(me.uid);
  const hue = [...me.uid].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  const avatarInner = myDoc.avatar
    ? `<img src="${myDoc.avatar}" alt="">`
    : initials(name);

  $("profileWrap").innerHTML = `
    <div class="profile-card2">
      <div class="p-avatar-wrap">
        <div class="p-avatar" style="background: linear-gradient(145deg, hsl(${hue} 55% 50%), hsl(${hue - 30} 50% 38%))">${avatarInner}</div>
        <button class="p-avatar-edit" id="editPfp" title="change photo">✎</button>
      </div>
      <h1 class="p-bigname">${esc(name)}</h1>
      <p class="p-bio ${bio ? "" : "empty"}">${bio ? esc(bio) : "no bio yet"}</p>
      <div class="p-stats">
        <div class="p-stat"><b>${mine}</b><span>communities</span></div>
        <div class="p-stat"><b>${joined.split(" ")[1] || ""}</b><span>joined</span></div>
        <div class="p-stat"><b>${me.emailVerified ? "yes" : "no"}</b><span>verified</span></div>
      </div>
      <div class="p-actions">
        <button class="p-btn primary" id="editBtn">edit profile</button>
      </div>
    </div>`;

  $("editBtn").onclick = editModal;
  $("editPfp").onclick = () => $("pfpInput").click();
  $("pfpInput").onchange = uploadPfp;
}

function editModal() {
  const modal = $("modalBox");
  $("overlay").hidden = false;
  modal.innerHTML = `
    <h3>edit profile</h3>
    <input type="text" id="nName" placeholder="display name" maxlength="24" value="${esc(myDoc.name || "anon")}">
    <input type="text" id="nBio" placeholder="bio (a line about you)" maxlength="140" value="${esc(myDoc.bio || "")}">
    <div class="row">
      <button id="cancelM">cancel</button>
      <button class="primary" id="saveName">save</button>
    </div>`;
  $("cancelM").onclick = () => $("overlay").hidden = true;
  $("saveName").onclick = async () => {
    const nn = $("nName").value.trim();
    const nb = $("nBio").value.trim();
    if (!nn) return toast("name can't be empty");
    try {
      await updateProfile(me, { displayName: nn });
      await updateDoc(doc(db, "users", me.uid), { name: nn, bio: nb });
      // sync the member maps in my communities
      const commsSnap = await getDocs(collection(db, "communities"));
      for (const d of commsSnap.docs) {
        if (d.data().members?.[me.uid]) {
          await updateDoc(doc(db, "communities", d.id), { [`members.${me.uid}.name`]: nn });
        }
      }
      $("overlay").hidden = true;
      toast("saved");
      setTimeout(() => location.reload(), 500);
    } catch (err) { toast("couldn't save: " + err.code); }
  };
}

// pick a file, downscale to 192px jpeg, store as data url on the user doc.
// keeps each doc well under the 1mb firestore limit.
function uploadPfp() {
  const file = $("pfpInput").files[0];
  if (!file) return;
  const img = new Image();
  img.onload = async () => {
    const c = document.createElement("canvas");
    const size = 192;
    const scale = Math.min(size / img.width, size / img.height, 1);
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.82);
    try {
      await updateDoc(doc(db, "users", me.uid), { avatar: dataUrl });
      toast("photo updated");
      setTimeout(() => location.reload(), 500);
    } catch (err) { toast("upload failed: " + err.code); }
  };
  img.src = URL.createObjectURL(file);
}

// ---------------------------------------------------------------
// someone else's profile (?u=uid)
// ---------------------------------------------------------------

async function renderOther(uid) {
  $("sideTitle").textContent = "people";
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) throw new Error("gone");
    const p = snap.data();
    const color = avatarColor(uid);

    $("profileWrap").innerHTML = `
      <div class="profile-card2">
        <div class="p-avatar-wrap">
          <div class="p-avatar" style="background:${color}">
            ${p.avatar ? `<img src="${p.avatar}" alt="">` : initials(p.name)}
          </div>
        </div>
        <h1 class="p-bigname">${esc(p.name || "anon")}</h1>
        <p class="p-bio ${p.bio ? "" : "empty"}">${p.bio ? esc(p.bio) : "no bio yet"}</p>
        <div class="p-actions">
          <button class="p-btn primary" id="msgBtn">message</button>
          <button class="p-btn" id="backBtn">back</button>
        </div>
      </div>`;

    $("msgBtn").onclick = () => location.href = `dms.html?u=${uid}`;
    $("backBtn").onclick = () => location.href = "profile.html";
  } catch {
    $("profileWrap").innerHTML = `<div class="profile-card2"><h1 class="p-bigname">user not found</h1><p class="p-mail">their account may have been deleted</p></div>`;
  }
}

// ---------------------------------------------------------------
// people directory (own profile only)
// ---------------------------------------------------------------

function listenPeople() {
  if (viewingUid) return;
  onSnapshot(collection(db, "users"), (snap) => {
    const list = $("peopleList");
    list.innerHTML = "";    const people = snap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .filter(p => p.uid !== me.uid)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    for (const p of people) {
      const row = document.createElement("div");
      row.className = "person";
      row.innerHTML = `
        <div class="p-avatar-sm" style="background:${avatarColor(p.uid)}">
          ${p.avatar ? `<img src="${p.avatar}" alt="">` : initials(p.name)}
        </div>
        <div class="person-meta"><strong>${esc(p.name || "anon")}</strong><span>${esc(p.bio || "")}</span></div>
        <button class="mini">view</button>`;
      row.querySelector(".mini").onclick = () => location.href = `profile.html?u=${p.uid}`;
      list.appendChild(row);
    }
    if (!people.length) {
      list.innerHTML = `<div class="people-empty">no one else here yet</div>`;
    }
  }, () => { /* denied under old rules, directory just stays empty */ });
}

$("logoutBtn").onclick = async () => { await signOut(auth); location.replace("login.html"); };

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => t.hidden = true, 2500);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
