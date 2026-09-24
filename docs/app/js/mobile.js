// mobile.js — on phones the rail + channels slide in from the left.
// this just injects the hamburger that opens the drawer and closes it again.
const chat = document.querySelector(".chat");
if (chat) {
  let head = chat.querySelector(".chat-head");
  if (!head) {
    head = document.createElement("header");
    head.className = "chat-head";
    chat.prepend(head);
  }
  const btn = document.createElement("button");
  btn.className = "hamburger";
  btn.textContent = "☰";
  btn.setAttribute("aria-label", "open menu");
  btn.addEventListener("click", () => document.body.classList.toggle("drawer-open"));
  head.prepend(btn);
}

const closeDrawer = () => document.body.classList.remove("drawer-open");

// tapping a channel, a rail icon, the scrim (which registers as body), or esc closes it
document.addEventListener("click", (e) => {
  if (!document.body.classList.contains("drawer-open")) return;
  if (e.target.closest(".ch-item, .rail-icon, .rail-add") || e.target === document.body) closeDrawer();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
