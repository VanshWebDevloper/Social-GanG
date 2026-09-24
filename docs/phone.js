// 3d phone hero: phone.glb with the app video playing on its screen.
// clicking the hero cta zooms the camera into the screen and opens the app.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const stage = document.getElementById('phoneStage');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 0.4, 6.2);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(4, 6, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xc8f24c, 0.9);
rim.position.set(-5, 3, -4);
scene.add(rim);
scene.add(new THREE.AmbientLight(0xffffff, 0.9));

// video texture for the screen
const video = document.createElement('video');
video.src = './assets/app-video.mp4';
video.loop = true;
video.muted = true;
video.playsInline = true;
const screenTex = new THREE.VideoTexture(video);
screenTex.colorSpace = THREE.SRGBColorSpace;
// keep the video crisp on large screens: no mipmap smoothing, max anisotropy
screenTex.minFilter = THREE.LinearFilter;
screenTex.magFilter = THREE.LinearFilter;
screenTex.generateMipmaps = false;
screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
video.play().catch(() => {});

const phone = new THREE.Group();
scene.add(phone);

function addScreen(w, h, z) {
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })
  );
  screen.position.set(0, 0, z);
  phone.add(screen);
  return screen;
}

let screenZ = 0.09;
let screenMat = null;
new GLTFLoader().load('./assets/phone.glb', (gltf) => {
  const obj = gltf.scene;
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  obj.scale.setScalar(3 / Math.max(size.x, size.y, size.z));
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x, -c.y, -c.z);
  const wrap = new THREE.Group();
  wrap.add(obj);

  // stand it upright: thinnest axis becomes z (thickness), screen face at camera
  const s0 = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  if (s0.y <= s0.x && s0.y <= s0.z) wrap.rotation.x = -Math.PI / 2;
  else if (s0.x <= s0.y && s0.x <= s0.z) wrap.rotation.y = Math.PI / 2;
  wrap.updateMatrixWorld(true);
  // measure while wrap is still detached: setFromObject reads world matrices,
  // and phone is mid-intro-spin here, so parenting first would bake a random angle in
  const b = new THREE.Box3().setFromObject(wrap);
  const s = b.getSize(new THREE.Vector3());
  // screen plane sized to the video's exact aspect so it fits the phone with no stretch
  const va = 720 / 1370; // app-video.mp4 portrait aspect
  let sw = s.x * 0.86, sh = sw / va;
  if (sh > s.y * 0.9) { sh = s.y * 0.9; sw = sh * va; }
  screenZ = s.z / 2 + 0.012;
  screenMat = addScreen(sw, sh, screenZ).material;
  phone.add(wrap);
});

// fallback: no model file, build a clean procedural phone so the hero never breaks
function fallbackPhone() {
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(1.45, 3.0, 0.14, 6, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x232428, metalness: 0.85, roughness: 0.3 })
  );
  phone.add(body);
  screenMat = addScreen(1.3, 2.85, 0.075).material;
  screenZ = 0.078;
}

// ---- animation ----
const clock = new THREE.Clock();
let introDone = false;
const INTRO = 4.5;
let entering = false;
let enterT = 0;

const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  if (entering) {
    // zoom the camera straight into the screen, then the page takes over
    const p = Math.min((t - enterT) / 1.15, 1);
    const e = easeInOut(p);
    const targetZ = screenZ + 0.03;
    camera.position.set(
      THREE.MathUtils.lerp(0, 0, e),
      THREE.MathUtils.lerp(0.4 * (1 - e), 0, e),
      THREE.MathUtils.lerp(4.7, targetZ, e)
    );
    camera.lookAt(0, 0, screenZ);
    phone.rotation.y = (1 - e) * phone.rotation.y;
    if (p >= 1 && !window.__phoneRedirected) {
      window.__phoneRedirected = true;
      location.href = '/app/home.html';
    }
  } else if (t < INTRO) {
    // original phone-site intro: phone does 2 full spins while gliding in from the back,
    // camera swings around it, screen lights up near the end
    const p = easeInOut(t / INTRO);
    phone.rotation.y = (1 - p) * Math.PI * 4;
    phone.position.z = THREE.MathUtils.lerp(-14, 0, easeOut(t / INTRO));
    const ang = THREE.MathUtils.lerp(2.2, 0, p);
    // glide radius eases in so the phone ends big, no jump at intro handoff
    const R = THREE.MathUtils.lerp(6.5, 4.7, p);
    camera.position.set(Math.sin(ang) * R, THREE.MathUtils.lerp(2.5, 1.2, p), Math.cos(ang) * R);
    camera.lookAt(0, 0, 0);
    const glow = THREE.MathUtils.clamp((t - INTRO * 0.7) / (INTRO * 0.3), 0, 1);
    if (screenMat) screenMat.color.setScalar(0.15 + glow * 0.85);
  } else {
    if (!introDone) { introDone = true; phone.rotation.set(0, 0, 0); phone.position.set(0, 0, 0); }
    // gentle idle float + sway
    const i = t - INTRO;
    phone.position.y = Math.sin(i * 1.1) * 0.08;
    phone.rotation.y = Math.sin(i * 0.6) * 0.12 + 0.1 * Math.sin(i * 0.23);
    camera.position.set(0, 0.4, 4.7);
    camera.lookAt(0, 0, 0);
  }
  renderer.render(scene, camera);
}
animate();

// cta hook: smooth zoom into the phone screen, then redirect to the app
window.__enterPhone = () => {
  if (entering || window.__phoneRedirected) return;
  entering = true;
  enterT = clock.getElapsedTime();
  const ov = document.getElementById('phoneFade');
  if (ov) setTimeout(() => ov.classList.add('on'), 620);
};

// clicking anywhere on the phone hero zooms in and opens the app
stage.addEventListener('click', () => window.__enterPhone());
