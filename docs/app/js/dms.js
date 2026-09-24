// dms page: one-on-one conversations.
// dm doc id is the two uids sorted and joined with __, so the pair is stable
// no matter who opened it first.

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, collection, addDoc, onSnapshot,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

let me = null, myName = "anon";
let openDm = null, msgsUnsub = null;

function avatarColor(seed) {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${h} 55% 50%)`;
}
const initials = (n) => (n || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const dmId = (a, b) => [a, b].sort().join("__");
const otherUid = (id) => id.split("__").find(u => u !== me.uid);

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.replace("login.html"); return; }
  me = user;

  const meSnap = await getDoc(doc(db, "users", user.uid));
  myName = meSnap.exists() ? meSnap.data().name : (user.displayName || "anon");

  listenDms();

  // ?u=UID from a profile's message button opens that conversation directly
  const target = new URLSearchParams(location.search).get("u");
  if (target && target !== me.uid) {
    openDmFn(dmId(me.uid, target));
    history.replaceState(null, "", location.pathname);
  }
});

// ---------------------------------------------------------------
// conversation list
// ---------------------------------------------------------------

function listenDms() {
  onSnapshot(collection(db, "dms"), (snap) => {
    const list = $("dmList");
    list.innerHTML = "";

    const mine = snap.docs
      .filter(d => d.id.includes(me.uid))
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    for (const dm of mine) {
      const oUid = otherUid(dm.id);
      const oName = dm.names?.[oUid] || "anon";
      const b = document.createElement("button");
      b.className = "ch-item person-ch";
      b.setAttribute("data-dm", dm.id);
      b.classList.toggle("active", dm.id === openDm);
      b.innerHTML = `
        <span class="p-avatar-sm" style="background:${avatarColor(oUid)}">
          ${dm.avatars?.[oUid] ? `<img src="${dm.avatars[oUid]}" alt="">` : initials(oName)}
        </span>
        <span class="person-meta"><strong>${esc(oName)}</strong><span class="dm-preview">${esc(dm.lastMsg || "say hi")}</span></span>`;
      b.onclick = () => openDmFn(dm.id);
      list.appendChild(b);
    }

    renderStartNew();
  });
}

// everyone signed up, quick message buttons. live so new accounts show up.
function renderStartNew() {
  onSnapshot(collection(db, "users"), (uSnap) => {
    const list = $("dmList");
    const old = list.querySelector(".start-new");
    if (old) old.remove();

    const section = document.createElement("div");
    section.className = "start-new";
    const head = document.createElement("div");
    head.className = "people-head";
    head.textContent = "start a new dm";
    section.appendChild(head);

    const people = uSnap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .filter(p => p.uid !== me.uid)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    for (const p of people) {
      const row = document.createElement("div");
      row.className = "person";
      row.innerHTML = `
        <span class="p-avatar-sm" style="background:${avatarColor(p.uid)}">
          ${p.avatar ? `<img src="${p.avatar}" alt="">` : initials(p.name)}
        </span>
        <span class="person-meta"><strong>${esc(p.name || "anon")}</strong><span>${esc(p.bio || "")}</span></span>
        <button class="mini">message</button>`;
      row.querySelector(".mini").onclick = () => openDmFn(dmId(me.uid, p.uid), p);
      section.appendChild(row);
    }
    list.appendChild(section);
  });
}

// ---------------------------------------------------------------
// open / create a conversation
// ---------------------------------------------------------------

async function openDmFn(id, knownPerson) {
  openDm = id;
  const oUid = otherUid(id);
  let oName = knownPerson?.name;

  const snap = await getDoc(doc(db, "dms", id));
  if (snap.exists()) {
    oName = snap.data().names?.[oUid] || oName;
    // refresh my name in case it changed
    updateDoc(doc(db, "dms", id), { [`names.${me.uid}`]: myName }).catch(() => {});
  } else {
    if (!oName) {
      const pSnap = await getDoc(doc(db, "users", oUid));
      oName = pSnap.exists() ? pSnap.data().name : "anon";
    }
    await setDoc(doc(db, "dms", id), {
      members: [oUid, me.uid],
      names: { [me.uid]: myName, [oUid]: oName },
      lastMsg: "",
      updatedAt: Date.now()
    });
  }
  // header name always comes from the live user doc, so renames show
  try {
    const live = await getDoc(doc(db, "users", oUid));
    if (live.exists() && live.data().name) oName = live.data().name;
  } catch {}

  $("dmTitle").textContent = oName || "anon";
  $("dmSub").textContent = "direct message";
  $("msgs").innerHTML = "";

  if (msgsUnsub) msgsUnsub();
  const q = query(collection(db, "dms", id, "messages"), orderBy("ts", "asc"));
  msgsUnsub = onSnapshot(q, async (mSnap) => {
    const box = $("msgs");
    // live names from user docs so renames show up on old dms too
    const uids = [...new Set(mSnap.docs.map(d => d.data().uid))];
    const nameMap = {};
    await Promise.all(uids.map(async (u) => {
      try {
        const s = await getDoc(doc(db, "users", u));
        nameMap[u] = s.exists() ? s.data().name : "";
      } catch {}
    }));
    box.innerHTML = "";
    for (const d of mSnap.docs) {
      const m = d.data();
      const div = document.createElement("div");
      div.className = "msg" + (m.uid === me.uid ? " mine" : "");
      const when = m.ts?.toDate ? m.ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      div.innerHTML = `
        <div class="msg-body">
          <div class="who">${esc(nameMap[m.uid] || m.name)}</div>
          <div class="bubble">${esc(m.text)}</div>
          ${when ? `<div class="when">${when}</div>` : ""}
        </div>`;
      box.appendChild(div);
    }
    box.scrollTop = box.scrollHeight;
  });

  listenDmsHighlight(id);
}

function listenDmsHighlight(id) {
  document.querySelectorAll(".person-ch").forEach(el => {
    el.classList.toggle("active", el.getAttribute("data-dm") === id);
  });
}

$("msgForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("msgInput").value.trim();
  if (!text || !openDm) return;
  $("msgInput").value = "";
  try {
    await addDoc(collection(db, "dms", openDm, "messages"), {
      uid: me.uid, name: myName, text, ts: serverTimestamp()
    });
    await updateDoc(doc(db, "dms", openDm), { lastMsg: text, updatedAt: Date.now() });
  } catch (err) {
    toast("message didn't send: " + err.code);
    $("msgInput").value = text;
  }
});

$("navHome").onclick = () => location.href = "home.html";
$("navDms").onclick = () => {};
$("navMe").onclick = () => location.href = "profile.html";
$("logoutBtn").onclick = async () => { await signOut(auth); location.replace("login.html"); };

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => t.hidden = true, 2600);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
