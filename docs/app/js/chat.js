import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection, doc, addDoc, onSnapshot, query, orderBy, limit, getDoc, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// don't render anything until we know who's logged in
let me = null;
let currentRoom = localStorage.getItem("room") || "general";
let msgUnsub = null;

onAuthStateChanged(auth, async (user) => {
  // not logged in / not verified -> back to login page
  if (!user || !user.emailVerified) {
    location.href = "login.html";
    return;
  }

  me = { uid: user.uid, name: user.displayName || user.email.split("@")[0], email: user.email };

  // make sure a user doc exists (backup for people who skipped the signup path)
  const ref = doc(db, "users", user.uid);
  if (!(await getDoc(ref)).exists()) {
    await setDoc(ref, { name: me.name, email: me.email, joined: Date.now() });
  }

  $("me-name").textContent = me.name;
  $("me-email").textContent = me.email;
  $("avatar").textContent = me.name.slice(0, 2).toUpperCase();
  document.body.style.visibility = "";
});

/* rooms */

const roomsCol = collection(db, "rooms");

function renderRoomTabs(rooms) {
  const box = $("room-tabs");
  box.innerHTML = "";
  // 'general' always shows up first even if nobody created it yet
  const names = ["general", ...rooms.map(r => r.id).filter(id => id !== "general")];
  for (const id of names) {
    const b = document.createElement("button");
    b.className = "room-tab" + (id === currentRoom ? " active" : "");
    b.textContent = id === "general" ? "general" : "#" + id;
    b.onclick = () => switchRoom(id);
    box.appendChild(b);
  }
}

// watch the rooms collection so new rooms pop up live
onSnapshot(roomsCol, snap => renderRoomTabs(snap.docs.map(d => ({ id: d.id }))));

$("new-room-btn").onclick = async () => {
  const id = prompt("room name (lowercase, no spaces):").trim().toLowerCase();
  if (!id || id === "general") return;
  // rooms are just docs, messages live inside rooms/{id}/messages
  await setDoc(doc(db, "rooms", id), { madeBy: me.name, made: Date.now() }, { merge: true });
  switchRoom(id);
};

function switchRoom(id) {
  currentRoom = id;
  localStorage.setItem("room", id);
  $("room-label").textContent = id === "general" ? "# general" : "# " + id;
  listenMessages();
  // re-render tabs to move the active highlight
  document.querySelectorAll(".room-tab").forEach(b =>
    b.classList.toggle("active", b.textContent === (id === "general" ? "general" : "#" + id)));
}

/* messages */

function listenMessages() {
  if (msgUnsub) msgUnsub(); // kill the old listener before starting a new one

  const q = query(collection(db, "rooms", currentRoom, "messages"), orderBy("at", "asc"), limit(200));
  msgUnsub = onSnapshot(q, snap => {
    const box = $("messages");
    box.innerHTML = "";
    let last = "";
    for (const d of snap.docs) {
      const m = d.data();
      // group consecutive messages from the same person, looks way cleaner
      const grouped = m.name === last;
      last = m.name;

      const row = document.createElement("div");
      row.className = "msg-row" + (grouped ? " grouped" : "") + (m.uid === me.uid ? " mine" : "");
      row.innerHTML = `
        ${grouped ? "" : `<span class="msg-name">${esc(m.name)}</span>`}
        <span class="msg-text">${esc(m.text)}</span>`;
      box.appendChild(row);
    }
    box.scrollTop = box.scrollHeight;
  });
}

// no html injections please
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

$("send-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("msg-input");
  const text = input.value.trim();
  if (!text || !me) return;

  input.value = "";
  await addDoc(collection(db, "rooms", currentRoom, "messages"), {
    uid: me.uid,
    name: me.name,
    text,
    at: serverTimestamp() // server time so everyone agrees on order
  });
});

/* header stuff */

$("avatar").onclick = () => $("profile-card").classList.toggle("open");

$("signout").onclick = async () => {
  await signOut(auth);
  location.href = "login.html";
};
