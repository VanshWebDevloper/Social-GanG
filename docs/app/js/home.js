// home.js — the whole app after login.
// mental model: communities -> channels -> messages.
// everything lives in firestore so people sync in realtime.
//
// the default community "Hackclubers" (id: hackclubers) gets created by the
// first person who ever opens the app with the lounge / community / india / help
// channels baked in. everyone auto-joins it, so nobody starts at a dead screen.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, sendEmailVerification, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const $ = id => document.getElementById(id);

// app state. three globals, kept simple on purpose.
let me = null;                  // the logged-in firebase user
let myName = "anon";            // display name from users/{uid}
let communities = [];           // communities i'm a member of
let openComm = null;            // id of the community currently open
let openChannel = null;         // id of the open channel
let chansUnsub = null;          // firestore listeners, we swap them as you click around
let msgsUnsub = null;
let commsUnsub = null;

const DEFAULT_COMM = "hackclubers";

// small helper: random short code for invite links, like "kg7x2p"
const inviteCode = () => Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------
// bootstrap
// ---------------------------------------------------------------

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.replace("login.html"); return; }
  me = user;

  // my profile: created by auth.js at signup, but older accounts might miss it
  const meSnap = await getDoc(doc(db, "users", user.uid));
  myName = meSnap.exists() ? meSnap.data().name : (user.displayName || "anon");
  if (!meSnap.exists()) {
    await setDoc(doc(db, "users", user.uid), { name: myName, email: user.email, joined: Date.now() });
  }

  // unverified? show the gentle strip at the bottom, don't block anyone
  if (!user.emailVerified) {
    $("verifyStrip").hidden = false;
  }
  $("resendVerify").onclick = (e) => {
    e.preventDefault();
    sendEmailVerification(me);
    $("resendVerify").textContent = "sent";
  };

  await ensureDefaultCommunity();
  listenCommunities();

  // came in through an invite link? ?join=CODE  ->  join that community
  const joinCode = new URLSearchParams(location.search).get("join");
  if (joinCode) {
    await joinByInvite(joinCode);
    history.replaceState(null, "", location.pathname); // scrub it off the url
  }
});

// ---------------------------------------------------------------
// the default community
// ---------------------------------------------------------------

async function ensureDefaultCommunity() {
  const ref = doc(db, "communities", DEFAULT_COMM);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // first run ever: lay down Hackclubers with its starter channels
    await setDoc(ref, {
      name: "Hackclubers",
      icon: "H",
      owner: me.uid,
      inviteCode: inviteCode(),
      members: { [me.uid]: { name: myName, role: "owner" } },
      createdAt: Date.now()
    });
    const chans = collection(ref, "channels");
    for (const name of ["lounge", "community", "india", "help"]) {
      await addDoc(chans, { name, createdAt: Date.now() });
    }
  } else if (!snap.data().members?.[me.uid]) {
    // exists already, but i'm not in it -> join quietly. no ceremony.
    await updateDoc(ref, {
      [`members.${me.uid}`]: { name: myName, role: "member" }
    });
  }
  openComm = DEFAULT_COMM;
}

// ---------------------------------------------------------------
// my communities, live
// ---------------------------------------------------------------

// firestore can't query "where members contains my uid" on a map cheaply,
// so we just watch every community and filter client-side. fine for now.
commsUnsub = null;
function listenCommunities() {
  commsUnsub = onSnapshot(collection(db, "communities"), (snap) => {
    communities = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.members && c.members[me.uid]);
    renderRail();
    if (!openComm && communities.length) openCommunity(communities[0].id);
    else if (openComm) renderChannelsAndMembers(); // member counts may have changed
  });
}

// ---------------------------------------------------------------
// rail + channels rendering
// ---------------------------------------------------------------

function renderRail() {
  const rail = $("railList");
  rail.innerHTML = "";
  for (const c of communities) {
    const b = document.createElement("button");
    b.className = "rail-icon" + (c.id === openComm ? " active" : "");
    b.textContent = c.icon || c.name[0].toUpperCase();
    b.title = c.name;
    b.onclick = () => openCommunity(c.id);
    rail.appendChild(b);
  }
}

function currentComm() {
  return communities.find(c => c.id === openComm);
}

function openCommunity(id) {
  openComm = id;
  openChannel = null;
  renderRail();

  const c = currentComm();
  $("communityName").textContent = c ? c.name : "…";
  $("adminBtn").hidden = !(c && c.owner === me.uid);

  // swap the channel listener over to this community
  if (chansUnsub) chansUnsub();
  chansUnsub = onSnapshot(collection(db, "communities", id, "channels"), (snap) => {
    renderChannels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

function renderChannels(chans) {
  const list = $("chList");
  list.innerHTML = "";

  for (const ch of chans) {
    const b = document.createElement("button");
    b.className = "ch-item" + (ch.id === openChannel ? " active" : "");
    b.innerHTML = `<span># ${ch.name}</span>`;

    // owners get an x on each channel to delete it
    const c = currentComm();
    if (c && c.owner === me.uid && chans.length > 1) {
      const x = document.createElement("span");
      x.className = "ch-x";
      x.textContent = "✕";
      x.title = "delete channel";
      x.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`delete #${ch.name}? messages go with it`)) return;
        await deleteDoc(doc(db, "communities", openComm, "channels", ch.id));
      };
      b.appendChild(x);
    }
    b.onclick = () => openChannelFn(ch.id, ch.name);
    list.appendChild(b);

    if (!openChannel) openChannelFn(ch.id, ch.name); // auto-open first channel
  }

  const add = document.createElement("button");
  add.className = "ch-add";
  add.textContent = "+ channel";
  add.onclick = () => askChannelName();
  list.appendChild(add);
}

// ---------------------------------------------------------------
// chat
// ---------------------------------------------------------------

function openChannelFn(chId, chName) {
  openChannel = chId;
  $("channelTitle").textContent = "# " + chName;
  $("msgs").innerHTML = "";
  renderChannelsRedraw();

  if (msgsUnsub) msgsUnsub();
  const q = query(
    collection(db, "communities", openComm, "channels", chId, "messages"),
    orderBy("ts", "asc")
  );
  msgsUnsub = onSnapshot(q, (snap) => {
    const box = $("msgs");
    box.innerHTML = "";
    for (const d of snap.docs) {
      const m = d.data();
      const div = document.createElement("div");
      div.className = "msg" + (m.uid === me.uid ? " mine" : "");
      const when = m.ts?.toDate ? m.ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      div.innerHTML = `
        <div class="who">${esc(m.name)}</div>
        <div class="bubble">${esc(m.text)}</div>
        ${when ? `<div class="when">${when}</div>` : ""}`;
      box.appendChild(div);
    }
    box.scrollTop = box.scrollHeight;
  });
}

function renderChannelsRedraw() {
  // cheap way to re-highlight the active channel: re-fire the click path
  const items = document.querySelectorAll(".ch-item");
  items.forEach(el => el.classList.remove("active"));
  // find and re-mark the open one
  const open = [...items].find(el => el.textContent.trim() === "# " + document.querySelector("#channelTitle").textContent.slice(2));
  if (open) open.classList.add("active");
}

// sending. the doc keeps uid + name so we don't need to join anything.
$("msgForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("msgInput").value.trim();
  if (!text || !openComm || !openChannel) return;

  $("msgInput").value = "";
  try {
    await addDoc(collection(db, "communities", openComm, "channels", openChannel, "messages"), {
      uid: me.uid,
      name: myName,
      text,
      ts: serverTimestamp()
    });
  } catch (err) {
    alert("message didn't send: " + err.code + "\n(make sure you published the firestore rules)");
    $("msgInput").value = text; // give it back so they can retry
  }
});

// tiny escape helper. chat is user input, never trust it into innerHTML raw.
function esc(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// member count badge
async function renderChannelsAndMembers() {
  const c = currentComm();
  if (c) $("membersCount").textContent = Object.keys(c.members || {}).length + " members";
}

// ---------------------------------------------------------------
// the "+" button: create or join
// ---------------------------------------------------------------

$("addCommunityBtn").onclick = () => {
  openModal(`
    <h3>make a community</h3>
    <input type="text" id="newCommName" placeholder="community name" maxlength="24">
    <input type="text" id="newCommIcon" placeholder="one emoji or letter as its icon" maxlength="2">
    <div class="row">
      <button id="cancelM">cancel</button>
      <button class="primary" id="createComm">create</button>
    </div>
    <h3 style="margin-top:22px">or join one</h3>
    <input type="text" id="joinCode" placeholder="invite code (like kg7x2p)">
    <div class="row">
      <button class="primary" id="joinBtn">join</button>
    </div>
  `);
  $("cancelM").onclick = closeModal;
  $("createComm").onclick = createCommunity;
  $("joinBtn").onclick = () => joinByInvite($("joinCode").value.trim());
};

async function createCommunity() {
  const name = $("newCommName")?.value?.trim() || $("newCommIcon")?.value && "" || "";
  // read them properly (ids above)
  const cName = document.getElementById("newCommName").value.trim();
  const cIcon = document.getElementById("newCommIcon").value.trim();
  if (!cName) return alert("give it a name");

  const code = inviteCode();
  const ref = await addDoc(collection(db, "communities"), {
    name: cName,
    icon: cIcon || cName[0].toUpperCase(),
    owner: me.uid,
    inviteCode: code,
    members: { [me.uid]: { name: myName, role: "owner" } },
    createdAt: Date.now()
  });
  // every community starts with a lounge so it's never empty
  await addDoc(collection(ref, "channels"), { name: "lounge", createdAt: Date.now() });

  closeModal();
  openComm = ref.id;
}

async function joinByInvite(code) {
  if (!code) return;
  // we already watch every community via listenCommunities, so the codes are
  // all sitting in `communities`. match there, join, done.
  const target = communities.find(c => c.inviteCode === code);
  if (!target) { alert("no community with that code"); return; }
  try {
    await updateDoc(doc(db, "communities", target.id), {
      [`members.${me.uid}`]: { name: myName, role: "member" }
    });
    openCommunity(target.id);
    closeModal();
  } catch (err) {
    alert("couldn't join: " + err.code);
  }
}

// ---------------------------------------------------------------
// invite link + admin panel
// ---------------------------------------------------------------

$("inviteBtn").onclick = () => {
  const c = currentComm();
  if (!c) return;
  const link = location.origin + location.pathname + "?join=" + (c.inviteCode || "");
  openModal(`
    <h3>invite to ${esc(c.name)}</h3>
    <div class="invite-link">${esc(link)}</div>
    <div class="row">
      <button id="copyL">copy link</button>
      <button id="cancelM">close</button>
    </div>
  `);
  $("copyL").onclick = () => {
    navigator.clipboard.writeText(link).then(() => { $("copyL").textContent = "copied"; });
  };
  $("cancelM").onclick = closeModal;
};

$("adminBtn").onclick = () => {
  const c = currentComm();
  if (!c) return;

  const memberRows = Object.entries(c.members || {}).map(([uid, info]) => {
    const isOwner = uid === c.owner;
    return `<div class="member">
      <span>${esc(info.name || uid)}${uid === c.owner ? " (owner)" : ""}</span>
      ${uid !== c.owner ? `<button class="kick" data-uid="${uid}">kick</button>` : ""}
    </div>`;
  }).join("");

  openModal(`
    <h3>${esc(c.name)} — admin</h3>
    <input type="text" id="admName" value="${esc(c.name)}" maxlength="24" placeholder="community name">
    <input type="text" id="admIcon" value="${esc(c.icon || "")}" maxlength="2" placeholder="icon">
    <div class="row"><button class="primary" id="saveComm">save</button></div>
    <h3 style="margin-top:20px">members (${Object.keys(c.members || {}).length})</h3>
    ${memberRows}
    <div class="row" style="margin-top:16px"><button id="danger" style="border-color:#b3261e;color:#b3261e">delete community</button></div>
    <div class="row"><button id="cancelM">close</button></div>
  `);

  $("saveComm").onclick = async () => {
    await updateDoc(doc(db, "communities", openComm), {
      name: $("admName").value.trim() || c.name,
      icon: $("admIcon").value.trim() || c.icon
    });
    closeModal();
  };

  // kicking: remove the uid from the members map. rules only let the owner do it.
  document.querySelectorAll(".kick").forEach(btn => {
    btn.onclick = async () => {
      const uid = btn.dataset.uid;
      if (!confirm("kick this member?")) return;
      await updateDoc(doc(db, "communities", openComm), {
        [`members.${uid}`]: null // setting a map field to null removes it. neat trick.
      });
      closeModal();
      $("adminBtn").click(); // re-render the panel fresh
    };
  });

  $("danger").onclick = async () => {
    if (!confirm(`delete ${c.name} for everyone? this cannot be undone`)) return;
    await deleteDoc(doc(db, "communities", openComm));
    openComm = DEFAULT_COMM;
    closeModal();
    location.reload();
  };

  $("cancelM").onclick = closeModal;
};

// ---------------------------------------------------------------
// modal plumbing
// ---------------------------------------------------------------

function openModal(html) {
  $("modalBox").innerHTML = html;
  $("overlay").hidden = false;
}
function closeModal() { $("overlay").hidden = true; }
$("overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeModal(); });

// sign out: double-tap the S logo up top. hidden but discoverable.
let lastTap = 0;
document.querySelector(".rail-top").addEventListener("click", () => {
  const now = Date.now();
  if (now - lastTap < 400) signOut(auth); // double-tap the S to log out
  lastTap = now;
});
