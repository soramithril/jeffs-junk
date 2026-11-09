// ── TODAY AT HQ, 3D: the office TV's dollhouse screen ──────────────────────────────
// Screen 4 of the office board (office-tv.html). Jeff's Junk HQ as a roofless 3D
// dollhouse - office, shop and yard - with a road out of the yard gate to one block for
// every town that has a bin out or a stop today. Replaces the pixel scene (app-hq.js)
// on Jake's word, 2026-11-09. Built from the mockup at
// https://claude.ai/artifact/GQ4Txu5eykSbyFpm1WKipf
//
// Same rule as the pixel scene: every number, truck, town, stop and bin comes from data
// the board already reads, and nothing is written anywhere. The office people, the dogs
// and the little surprises are decoration. A tag over a person only ever says something
// the data backs (how many jobs they entered today); drivers' tags come from the trucks'
// GPS visits. office-tv.html calls JJHQ.mount once, JJHQ.show(snapshot) each time the
// screen comes round (it replays today so far, then holds on now) and JJHQ.hide() when
// it rotates away, so nothing renders while the screen is off.
//
// Needs three.js r128 (window.THREE) and hq3d-models.js (window.LIB: Kenney + KayKit
// models, CC0) loaded first.
(function(){
'use strict';
var THREE = window.THREE, LIB = window.LIB;
if(!THREE) throw new Error('app-hq3d.js needs three.js loaded first');
if(!LIB) throw new Error('app-hq3d.js needs hq3d-models.js loaded first');
const V3 = THREE.Vector3, PI = Math.PI, MIN = 60000;
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const pickOf = a => a[(rnd() * a.length) | 0];
const REPLAY_MS = 20000;
let scene, renderer, camera, canvas, overlay, tagsEl, hemi, sun;

function boot(){
/* ======================= renderer, lights ======================= */
renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x1d2421, 170, 330);
// near plane far out on purpose: the camera never comes within ~70 m of anything, and the TV's depth buffer
// is coarse - with near at 1 m the yard's snow cover and the asphalt under it flickered white (Jake, 2026-11-09)
camera = new THREE.PerspectiveCamera(30, 16 / 9, 50, 1400);
hemi = new THREE.HemisphereLight(0xfbf7ee, 0x5d6660, 0.78); scene.add(hemi);
sun = new THREE.DirectionalLight(0xfff3df, 0.62); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left: -52, right: 52, top: 44, bottom: -44, near: 1, far: 260}); sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
sun.target.position.copy(SUN_C);
}
const SUN_C = new V3(28, 0, -6);
const BG_DAY = new THREE.Color(0x1d2421), BG_EVE = new THREE.Color(0x141a22);

const lam = (c, o) => new THREE.MeshLambertMaterial(Object.assign({color: c}, o || {}));
const pho = (c, s, o) => new THREE.MeshPhongMaterial(Object.assign({color: c, shininess: s || 60, specular: 0x555555}, o || {}));
const basic = (c, o) => new THREE.MeshBasicMaterial(Object.assign({color: c}, o || {}));
const VC = lam(0xffffff, {vertexColors: true});
const M = {grass: lam(0xb6cfa3), grass2: lam(0xaec79a), road: lam(0x5b616b), line: lam(0xeadb93), curb: lam(0xc9c2b0), side: lam(0xd8d2c4),
  gravel: lam(0xd3c8ae), wall: lam(0xf1e7d4), wallIn: lam(0xf4ecdc), trim: lam(0x2f5d43), brick: lam(0x8b5a44), roofG: lam(0x2f5d43),
  metal: lam(0xa3aab3), metal2: lam(0x6b7280), dark: lam(0x2c3130), mound: lam(0x8f8272), mound2: lam(0xa99c8a), mound3: lam(0x7a6b58),
  cap: lam(0x6f7d4e), fence: lam(0x7b5d41), trunk: lam(0x6b4a32), concrete: lam(0xc4c0b6), snow: lam(0xf4f7fa), ice: pho(0xe6f1f7, 80),
  water: pho(0x5f9fbf, 90, {specular: 0x99bbcc}), win: lam(0x9fc6d8, {emissive: 0x000000}), screen: basic(0x8fd0ff), bulb: basic(0x9aa0a6),
  steel: lam(0x2a2d32), chrome: pho(0xd6d9dd, 90, {specular: 0x888888}), glass: pho(0x1c2731, 100, {specular: 0x999999}),
  cab: pho(0xf3f2ee, 40), tire: lam(0x18181a), rimW: lam(0xc3c6ca), lift: lam(0x33373d),
  amber: lam(0xf59e0b, {emissive: 0x6b3f00}), red: lam(0xdc2626, {emissive: 0x500000}), lamp: lam(0xfff6dc, {emissive: 0x7a7050}),
  binBody: lam(0x24493a), binDark: lam(0x1a3529), shadow: basic(0x000000, {transparent: true, opacity: 0.2, depthWrite: false})};

/* ======================= geometry kit: many parts -> one mesh per material ======================= */
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylCache = {};
const CYL = (r, len, seg) => { const k = r + '|' + len + '|' + (seg || 12); return cylCache[k] || (cylCache[k] = new THREE.CylinderGeometry(r, r, len, seg || 12)); };
const UP = new V3(0, 1, 0), ONE = new V3(1, 1, 1);
function merge(list){
  let n = 0; const hasUV = list.every(p => p.geo.attributes.uv), hasC = list.some(p => p.c || p.geo.attributes.color);
  const parts = list.map(({geo, m, c}) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count; return {g, c}; });
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = hasUV ? new Float32Array(n * 2) : null, C = hasC ? new Float32Array(n * 3) : null;
  let o = 0;
  for (const {g, c} of parts){
    const cnt = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    if (UV) UV.set(g.attributes.uv.array, o * 2);
    if (C){ if (!c && g.attributes.color) C.set(g.attributes.color.array, o * 3);
      else { const cc = c || {r: 1, g: 1, b: 1}; for (let i = 0; i < cnt; i++){ C[(o + i) * 3] = cc.r; C[(o + i) * 3 + 1] = cc.g; C[(o + i) * 3 + 2] = cc.b; } } }
    o += cnt;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (UV) out.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); if (C) out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return out;
}
class Kit {
  constructor(){ this.L = new Map(); }
  p(mat, geo, x, y, z, o){
    o = o || {};
    const q = o.q || new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0));
    const m = new THREE.Matrix4().compose(new V3(x, y, z), q, o.s ? new V3(o.s[0], o.s[1], o.s[2]) : ONE);
    if (!this.L.has(mat)) this.L.set(mat, []);
    this.L.get(mat).push({geo, m, c: o.c != null ? new THREE.Color(o.c) : null}); return this;
  }
  box(mat, w, h, d, x, y, z, o){ return this.p(mat, B(w, h, d), x, y, z, o); }
  cyl(mat, r, len, x, y, z, axis, seg, o){ o = Object.assign({}, o); if (axis === 'z') o.rx = PI / 2; if (axis === 'x') o.rz = PI / 2; return this.p(mat, CYL(r, len, seg), x, y, z, o); }
  rod(mat, a, b, r, o){ const d = new V3().subVectors(b, a), len = d.length(); const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    const mid = a.clone().addScaledVector(d, 0.5); return this.p(mat, new THREE.CylinderGeometry(r, r, len, 10), mid.x, mid.y, mid.z, Object.assign({q}, o)); }
  geos(){ return [...this.L].map(([mat, list]) => [mat, merge(list)]); }
  group(){ const g = new THREE.Group(); for (const [mat, geo] of this.geos()) g.add(new THREE.Mesh(geo, mat)); return g; }
  m(name, x, y, z, o){ return this.p(VC, libGeo(name, o && o.recol), x, y, z, o); }
}

/* ======================= ready-made models: Kenney + KayKit (CC0), colours baked in ======================= */
const libCache = {};
function libGeo(name, recol){
  const key = name + (recol ? '|' + recol.key : '');
  if (libCache[key]) return libCache[key];
  const e = LIB[name]; if (!e) throw new Error('no model called ' + name);
  const b = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const qp = new Uint16Array(b(e.p).buffer), qn = new Int8Array(b(e.n).buffer), qc = b(e.c), qi = new Uint16Array(b(e.i).buffer), n = qp.length / 3;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++){ const a = i % 3; P[i] = e.lo[a] + qp[i] / 65535 * (e.hi[a] - e.lo[a]); N[i] = qn[i] / 127; C[i] = qc[i] / 255; }
  if (recol) for (let i = 0; i < n; i++){ const o = recol.fn(C[i * 3], C[i * 3 + 1], C[i * 3 + 2], P[i * 3 + 1]); if (o){ C[i * 3] = o[0]; C[i * 3 + 1] = o[1]; C[i * 3 + 2] = o[2]; } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setIndex(new THREE.BufferAttribute(qi, 1)); g.computeBoundingBox();
  return libCache[key] = g;
}
// split a model into [the rest, the triangles whose colour passes test] - used to give house windows the glowing window material
function splitGeo(geo, test){
  const src = geo.index ? geo.toNonIndexed() : geo, p = src.attributes.position.array, nn = src.attributes.normal.array, c = src.attributes.color.array;
  const A = [[], [], []], Bp = [[], [], []];
  for (let i = 0; i < p.length; i += 9){
    const hit = test(c[i], c[i + 1], c[i + 2]) && test(c[i + 3], c[i + 4], c[i + 5]) && test(c[i + 6], c[i + 7], c[i + 8]), T = hit ? Bp : A;
    for (let k = 0; k < 9; k++){ T[0].push(p[i + k]); T[1].push(nn[i + k]); T[2].push(c[i + k]); }
  }
  return [A, Bp].map(([P, N, C]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 3)); return g; });
}
// a snow blanket: the upward-facing triangles above minY, lifted off the surface a touch
function snowCap(geo, minY, lift){
  const src = geo.index ? geo.toNonIndexed() : geo, p = src.attributes.position.array, nn = src.attributes.normal.array, P = [], N = [];
  for (let i = 0; i < p.length; i += 9){
    if ((nn[i + 1] + nn[i + 4] + nn[i + 7]) / 3 < 0.35 || (p[i + 1] + p[i + 4] + p[i + 7]) / 3 < minY) continue;
    for (let v = 0; v < 9; v += 3){ P.push(p[i + v] + nn[i + v] * lift, p[i + v + 1] + nn[i + v + 1] * lift + lift * 0.5, p[i + v + 2] + nn[i + v + 2] * lift); N.push(nn[i + v], nn[i + v + 1], nn[i + v + 2]); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3)); return g;
}

/* ======================= canvas textures ======================= */
function canvasTex(w, h, draw, rep){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c);
  if (rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } t.anisotropy = 4; return t; }
const tileTex = (a, b, rep) => canvasTex(64, 64, (g) => { g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = b; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); }, rep);
const woodTex = rep => canvasTex(256, 256, (g) => { for (let i = 0; i < 8; i++){ g.fillStyle = ['#b98f66', '#ad845c', '#c29a70', '#a87f57'][i % 4]; g.fillRect(0, i * 32, 256, 32);
  g.fillStyle = 'rgba(80,50,20,.25)'; g.fillRect(0, i * 32, 256, 2); g.fillRect((i * 97) % 256, i * 32, 2, 32); } }, rep);
const carpetTex = (c, rep) => canvasTex(64, 64, (g) => { g.fillStyle = c; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 64; i += 8) g.fillRect(i, 0, 4, 64); }, rep);
const sidingTex = rep => canvasTex(64, 64, (g) => { g.fillStyle = '#f1e7d4'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(120,100,70,.22)'; for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 2); }, rep);
const ribTex = rep => canvasTex(64, 64, (g) => { g.fillStyle = '#a7aeb7'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(40,50,60,.28)'; for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 4, 64); g.fillStyle = 'rgba(255,255,255,.2)'; for (let x = 6; x < 64; x += 16) g.fillRect(x, 0, 2, 64); }, rep);
const fenceTex = rep => canvasTex(64, 64, (g) => { g.strokeStyle = '#9aa3ad'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.moveTo(32, -32); g.lineTo(96, 32); g.moveTo(-32, 32); g.lineTo(32, 96); g.moveTo(32, 96); g.lineTo(96, 32); g.moveTo(-32, 32); g.lineTo(32, -32); g.stroke(); }, rep);
function blobTex(rect){ return canvasTex(128, 128, (g) => { g.filter = 'blur(14px)'; g.fillStyle = 'rgba(0,0,0,0.9)';
  if (rect) g.fillRect(28, 28, 72, 72); else { g.beginPath(); g.arc(64, 64, 36, 0, PI * 2); g.fill(); } }); }
const SH_ROUND = basic(0x000000, {map: blobTex(false), transparent: true, opacity: 0.32, depthWrite: false});
const SH_RECT = basic(0x000000, {map: blobTex(true), transparent: true, opacity: 0.38, depthWrite: false});
function shadowPlane(w, d, round, parent, x, z){ const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), round ? SH_ROUND : SH_RECT); m.rotation.x = -PI / 2; m.position.set(x || 0, 0.06, z || 0); m.renderOrder = 1; (parent || scene).add(m); return m; }
function signTexture(txt, sub, w, h){
  return canvasTex(w, h, (g) => { g.fillStyle = '#17402a'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8b34a'; g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 ' + Math.round(h * 0.5) + 'px "Baloo 2", Arial, sans-serif'; g.fillText(txt, w / 2, h * 0.58);
    if (sub){ g.font = '700 ' + Math.round(h * 0.2) + 'px "Hanken Grotesk", Arial, sans-serif'; g.fillStyle = '#cfe3d4'; g.fillText(sub, w / 2, h * 0.84); } });
}
const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);

const FT = 0.3048;
const BIN_FT = {4: {L: 6, W: 6, H: 3}, 7: {L: 10, W: 6, H: 3.15}, 14: {L: 14, W: 7, H: 3.86}, 20: {L: 16, W: 7.5, H: 4.5}};
const RIM = {4: 0x0ea5e9, 7: 0x8b5cf6, 14: 0xe8b34a, 20: 0xef4444};
const rimMat = {}; for (const s in RIM) rimMat[s] = lam(RIM[s]);
const decalMat = {};
for (const s in RIM) decalMat[s] = lam(0xffffff, {map: canvasTex(512, 160, (g, w, h) => { g.fillStyle = '#16a34a'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center';
  g.font = '800 70px "Arial Black", Arial, sans-serif'; g.fillText("JEFF'S JUNK", w / 2, 82); g.font = '700 38px Arial, sans-serif'; g.fillText(s + ' YARD', w / 2, 136); })});
const binCache = {};
function binGeos(size, loaded){
  const key = size + (loaded ? 'L' : '');
  if (binCache[key]) return binCache[key];
  const {L, W: Wd, H: Ht} = BIN_FT[size], k = new Kit(), y0 = 0.45, hw = Wd / 2;
  for (const z of [-1, 1]) k.box(M.steel, L, 0.45, 0.4, L / 2, 0.225, z * (hw - 0.7)).cyl(M.steel, 0.36, 0.42, 0.35, 0.36, z * (hw - 0.7), 'z', 10);
  k.box(M.binDark, L, 0.2, Wd, L / 2, y0 + 0.1, 0);
  for (const z of [-1, 1]) k.box(M.binBody, L, Ht, 0.12, L / 2, y0 + Ht / 2, z * hw);
  k.box(M.binBody, 0.12, Ht, Wd, L - 0.06, y0 + Ht / 2, 0).box(M.binBody, 0.14, Ht - 0.1, Wd - 0.1, 0.07, y0 + Ht / 2, 0);
  for (const z of [-1, 1]){
    for (let x = 1; x < L - 0.5; x += 2) k.box(M.binDark, 0.28, Ht, 0.24, x, y0 + Ht / 2, z * (hw + 0.13));
    k.box(rimMat[size], L + 0.3, 0.36, 0.42, L / 2, y0 + Ht + 0.06, z * (hw + 0.05));
    k.box(M.binDark, L, 0.32, 0.32, L / 2, y0 + 0.2, z * (hw + 0.12));
  }
  for (const x of [-0.05, L + 0.05]) k.box(rimMat[size], 0.42, 0.36, Wd + 0.5, x, y0 + Ht + 0.06, 0);
  for (let i = 0; i < 3; i++) k.cyl(M.chrome, 0.11, 0.45, -0.12, y0 + 0.5 + i * (Ht - 1) / 2, hw - 0.2, 'y', 8);
  for (const z of [-hw / 2, hw / 2]) k.cyl(M.chrome, 0.07, Ht - 0.3, -0.16, y0 + Ht / 2, z, 'y', 6);
  const ax = L + 1.3, ay = y0 + Ht + 0.85;
  for (const z of [-1, 1]){ k.rod(M.steel, new V3(L, 0.5, z * 1.5), new V3(ax, ay, z * 0.65), 0.17); k.rod(M.steel, new V3(L, y0 + Ht, z * 0.9), new V3(ax, ay, z * 0.65), 0.12); }
  k.cyl(M.chrome, 0.16, 1.7, ax, ay, 0, 'z', 10);
  const dw = Math.min(5.5, L * 0.42), dh = Math.min(1.7, Ht * 0.44);
  k.p(decalMat[size], new THREE.PlaneGeometry(dw, dh), L * 0.5, y0 + Ht * 0.55, hw + 0.27);
  k.p(decalMat[size], new THREE.PlaneGeometry(dw, dh), L * 0.5, y0 + Ht * 0.55, -hw - 0.27, {ry: PI});
  if (loaded){
    const cols = [0x8b6b4a, 0xa98a62, 0x6f7378, 0x4b5563, 0xb45309, 0x7c2d12, 0x9ca3af, 0x3f6212, 0xd6d3d1, 0x57534e];
    let s2 = size * 977 + 13; const r = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
    for (let i = 0, n = Math.round(L * Wd * 0.6); i < n; i++){
      const x = 0.8 + r() * (L - 1.6), z = (r() - 0.5) * (Wd - 1.4), heap = 1 - Math.pow(Math.abs(x - L * 0.55) / (L * 0.55), 2) * 0.6, s = 0.5 + r() * 1.5;
      k.box(VC, s * (0.8 + r()), s * (0.4 + r() * 0.6), s * (0.6 + r() * 0.8), x, y0 + 0.3 + r() * Ht * heap * 0.95, z, {c: cols[(r() * cols.length) | 0], rx: (r() - 0.5) * 0.8, ry: r() * 3, rz: (r() - 0.5) * 0.8});
    }
    if (L >= 10){ const cx = L * 0.4, cy = y0 + Ht * 0.85; k.box(VC, 5.5, 1.1, 2.4, cx, cy, 0.4, {c: 0x7f1d1d, rz: -0.15}).box(VC, 5.5, 1.5, 0.7, cx, cy + 0.8, -0.5, {c: 0x7f1d1d, rz: -0.15}); }
  }
  const geos = k.geos(); for (const [, g] of geos) g.scale(FT, FT, FT);
  return binCache[key] = {geos, L: L * FT, W: Wd * FT, H: (Ht + y0) * FT};
}
function buildBin(size, loaded){ const g = new THREE.Group(); for (const [mat, geo] of binGeos(size, loaded).geos) g.add(new THREE.Mesh(geo, mat)); return g; }

/* ======================= hook-lift truck (built in feet, shown at true size) ======================= */
let truckParts = null;
function truckGeos(){
  if (truckParts) return truckParts;
  const k = new Kit(), stripe = new Kit(), lk = new Kit();
  const wheel = (x, z, w, s) => { k.cyl(M.tire, 1.65, w, x, 1.65, z, 'z', 18); k.cyl(M.rimW, 1.02, 0.08, x, 1.65, z + s * (w / 2 + 0.01), 'z', 14); k.cyl(M.chrome, 0.42, 0.22, x, 1.65, z + s * (w / 2 + 0.08), 'z', 10); };
  for (const z of [-1, 1]) k.box(M.steel, 25, 0.7, 0.35, -1.5, 2.85, z * 1.45);
  for (const x of [-12, -7, -2, 3, 8]) k.box(M.steel, 0.35, 0.5, 2.6, x, 2.85, 0);
  k.cyl(M.steel, 0.28, 6.8, 8.2, 1.65, 0, 'z').cyl(M.steel, 0.32, 7.6, -6.4, 1.65, 0, 'z').box(M.steel, 1.6, 1, 1.4, -6.4, 1.9, 0);
  for (const s of [-1, 1]){ wheel(8.2, s * 3.35, 1.05, s); wheel(-6.4, s * 2.75, 0.95, -s); wheel(-6.4, s * 3.75, 0.95, s); }
  k.box(M.cab, 5.3, 6.3, 7.4, 6.4, 6.45, 0).box(M.cab, 0.6, 0.35, 7.5, 8.85, 9.55, 0).box(M.glass, 0.1, 2.6, 6.5, 9.06, 8, 0).box(M.chrome, 0.12, 0.18, 6.9, 9.1, 9.35, 0);
  for (const s of [-1, 1]){
    k.box(M.glass, 2.8, 2.3, 0.06, 7.3, 8.05, s * 3.72).box(M.glass, 1.4, 1.6, 0.06, 4.7, 8.25, s * 3.72).box(M.steel, 0.06, 5, 0.04, 5.75, 6.4, s * 3.73).box(M.chrome, 0.5, 0.12, 0.12, 6.2, 6.6, s * 3.78);
    stripe.box(M.cab, 5.32, 0.55, 0.04, 6.4, 4.6, s * 3.72);
    k.box(M.steel, 0.18, 0.18, 1.1, 8.7, 8.4, s * 4.25).box(M.steel, 0.25, 1.5, 0.65, 8.6, 8.2, s * 4.85).box(M.glass, 0.06, 1.3, 0.5, 8.46, 8.2, s * 4.85);
    k.box(M.cab, 4.2, 0.3, 1.5, 8.3, 3.75, s * 3.4).box(M.cab, 0.9, 0.3, 1.5, 10.2, 3.45, s * 3.4).box(M.chrome, 1.3, 0.14, 0.75, 5, 2.3, s * 3.95).box(M.chrome, 1.3, 0.14, 0.75, 5, 3.3, s * 3.95);
    k.box(M.lamp, 0.16, 0.6, 1, 12.67, 5.65, s * 2.45).box(M.amber, 0.14, 0.3, 0.5, 12.67, 4.95, s * 2.6).box(M.red, 0.3, 0.35, 0.35, -14, 3, s * 1.4).box(M.tire, 0.08, 1.7, 1.9, -8.6, 1.45, s * 3.3);
  }
  for (let i = -2; i <= 2; i++) k.box(M.amber, 0.3, 0.16, 0.5, 8.85, 9.78, i * 1.2);
  k.box(M.cab, 3.7, 3, 6.4, 10.8, 5.1, 0); stripe.box(M.cab, 3.7, 0.08, 1.2, 10.8, 6.62, 0);
  k.box(M.steel, 0.12, 2.5, 3.8, 12.66, 5.05, 0);
  for (let i = 0; i < 6; i++) k.box(M.chrome, 0.08, 0.1, 3.7, 12.74, 4 + i * 0.42, 0);
  k.box(M.chrome, 0.8, 0.85, 7.8, 13.05, 3.4, 0).cyl(M.chrome, 0.85, 3.4, 1.4, 2.55, 3, 'x').box(M.steel, 2, 1.4, 1.2, 1.4, 2.6, -3);
  k.cyl(M.chrome, 0.24, 7, 3.55, 7.8, -3.95, 'y', 8).cyl(M.steel, 0.3, 0.6, 3.55, 11.2, -3.95, 'y', 8);
  k.box(M.steel, 0.25, 5.4, 0.25, 3.4, 5.9, -3.4).box(M.steel, 0.25, 5.4, 0.25, 3.4, 5.9, 3.4).box(M.steel, 0.25, 0.25, 7, 3.4, 8.5, 0);
  for (let z = -2.6; z <= 2.7; z += 0.65) k.box(M.steel, 0.1, 5.2, 0.1, 3.4, 5.9, z);
  for (const z of [-1, 1]) lk.box(M.lift, 16.2, 0.5, 0.4, 8.1, 0.25, z * 1.2);
  for (const x of [2, 6, 10, 14]) lk.box(M.lift, 0.3, 0.4, 2.4, x, 0.25, 0);
  lk.cyl(M.chrome, 0.45, 3.2, 0, 0.05, 0, 'z', 12).box(M.lift, 0.85, 6.6, 1.1, 16.4, 3.3, 0).box(M.lift, 1.2, 0.6, 0.9, 15.9, 6.4, 0);
  lk.p(M.chrome, new THREE.TorusGeometry(0.45, 0.15, 8, 14, PI * 1.3), 15.45, 5.75, 0, {rz: PI * 0.35});
  for (const z of [-0.75, 0.75]) lk.rod(M.chrome, new V3(12.5, 0.5, z), new V3(16, 4.6, z), 0.16);
  return truckParts = {body: k.geos(), stripe: merge(stripe.L.get(M.cab)), lift: lk.geos()};
}
const ramGeo = new THREE.CylinderGeometry(0.28, 0.28, 1, 10);
function placeRod(m, a, b){ const d = new V3().subVectors(b, a); m.scale.set(1, d.length(), 1); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); }
function makeTruck(color){
  const P = truckGeos(), holder = new THREE.Group(), g = new THREE.Group(); g.scale.setScalar(FT); holder.add(g);
  for (const [mat, geo] of P.body) g.add(new THREE.Mesh(geo, mat));
  g.add(new THREE.Mesh(P.stripe, lam(new THREE.Color(color).getHex())));
  const L = new THREE.Group(); L.position.set(-13.6, 3.25, 0); g.add(L);
  for (const [mat, geo] of P.lift) L.add(new THREE.Mesh(geo, mat));
  const ram = new THREE.Mesh(ramGeo, M.chrome); g.add(ram);
  const slot = new THREE.Group(); slot.position.set(0.2, 0.5, 0); slot.scale.setScalar(1 / FT); L.add(slot);
  shadowPlane(9.4, 3.4, false, holder);
  const t = {holder, g, L, ram, slot, tip: 0, cargo: null, cargoKey: undefined};
  updateRam(t); return t;
}
const ramA = new V3(-3, 2.9, 0), ramBl = new V3(9.5, 0, 0), _wb = new V3();
function updateRam(t){ t.L.rotation.z = t.tip; t.L.updateMatrixWorld(true); _wb.copy(ramBl).applyMatrix4(t.L.matrix); placeRod(t.ram, ramA, _wb); }
function setCargo(t, carry){
  if (t.cargoKey === carry) return;
  if (t.cargo){ t.slot.remove(t.cargo); t.cargo = null; }
  t.cargoKey = carry; if (carry == null) return;
  const loaded = typeof carry === 'string', size = loaded ? +carry.slice(1) : carry;
  t.cargo = buildBin(size, loaded); t.slot.add(t.cargo);
}


// every bin in our green (Jake, 2026-11-09)
M.binBody.color.setHex(0x16a34a); M.binDark.color.setHex(0x11843b); for (const sz in rimMat) rimMat[sz].color.setHex(0x0e7434);

const DOGS = {
  sawyer: {L: 0.95, H: 0.42, W: 0.3, c: 0xa0683a, c2: 0x3b2a1e, chest: 0xd9b27a},
  vincent: {L: 0.8, H: 0.38, W: 0.3, c: 0xf2efe8, c2: 0xe6e1d6, chest: 0xffffff},
  winnie: {L: 0.55, H: 0.28, W: 0.22, c: 0x8a5a3c, c2: 0x5e3a25, chest: 0xf4efe3},
  leo: {L: 0.45, H: 0.24, W: 0.2, c: 0xf8f6f0, c2: 0xeeeae0, chest: 0xffffff}
};
function makeDog(key){
  const d = DOGS[key], k = new Kit(), h = d.H, legH = h * 0.9;
  k.box(VC, d.W, h, d.L, 0, legH + h / 2, 0, {c: d.c}).box(VC, d.W * 1.02, h * 0.35, d.L * 0.55, 0, legH + h * 0.85, -d.L * 0.05, {c: d.c2});
  k.box(VC, d.W * 0.9, h * 0.5, 0.06, 0, legH + h * 0.35, d.L / 2, {c: d.chest});
  k.box(VC, d.W * 0.95, h * 0.85, h * 0.85, 0, legH + h * 1.15, d.L / 2 + h * 0.25, {c: d.c});
  k.box(VC, d.W * 0.55, h * 0.4, h * 0.45, 0, legH + h * 0.95, d.L / 2 + h * 0.8, {c: d.c2}).box(VC, 0.06, 0.05, 0.04, 0, legH + h * 1.05, d.L / 2 + h * 1.04, {c: 0x111111});
  for (const s of [-1, 1]) k.box(VC, 0.05, h * 0.45, h * 0.3, s * d.W * 0.45, legH + h * 1.45, d.L / 2 + h * 0.2, {c: d.c2, rz: s * 0.3});
  k.box(VC, 0.07, 0.07, h * 1.0, 0, legH + h * 1.15, -d.L / 2 - h * 0.3, {c: d.c, rx: -0.7});
  const g = new THREE.Group(), body = new THREE.Mesh(merge(k.L.get(VC)), VC); g.add(body);
  const lk = new Kit(); lk.box(VC, d.W * 0.28, legH, d.W * 0.3, 0, -legH / 2, 0, {c: d.c2});
  const lgeo = merge(lk.L.get(VC));
  const legs = [[-1, 1], [1, -1], [1, 1], [-1, -1]].map(([sx, sz], i) => { const m = new THREE.Mesh(lgeo, VC); m.position.set(sx * d.W * 0.32, legH, sz * d.L * 0.38); g.add(m); return m; });
  shadowPlane(d.L * 1.4, d.L * 1.4, true, g);
  return {g, body, legs, kind: 'dog', legH};
}


/* ======================= small helpers ======================= */
const FL = 0.2, WH = 1.5, WT = 0.22;
const COL = {floor: 0xeadcc0, skirt: 0xf7f5f0, wall: 0xf8f6f1, cap: 0xdcd6cb, reception: 0x2fae96, bookings: 0x8478d8, barb: 0xe6b331,
  jeff: 0x1f4a33, brk: 0xe0606a, meet: 0x3b9ad9, shopFloor: 0xa8a59e, asphalt: 0x3b4146, walk: 0xb9b5ab};
const shadowy = (m, cast, recv) => { m.castShadow = !!cast; m.receiveShadow = recv !== false; return m; };
// things built for one day's data (towns, bays, yard bins) are tracked so the next rebuild can free them on the GPU
let TRACK = null;
function addKit(k, cast, recv, parent){ const g = k.group(); g.traverse(o => { if (o.isMesh){ shadowy(o, cast, recv); if (TRACK) TRACK.geos.push(o.geometry); } }); (parent || scene).add(g); return g; }
const sph = (r, ws, hs, a, b, c, d) => new THREE.SphereGeometry(r, ws || 18, hs || 12, a, b, c, d);
const FONT_D = 'Inter, "Arial Rounded MT Bold", Arial, sans-serif', FONT_B = 'Inter, Arial, sans-serif';
function textPlane(w, h, px, draw){
  const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * h / w); const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  const mat = basic(0xffffff, {map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4});
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.renderOrder = 2;
  if (TRACK){ TRACK.geos.push(m.geometry); TRACK.mats.push(mat); TRACK.texs.push(t); }
  m.userData.draw = (...a) => { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); draw(g, c.width, c.height, ...a); t.needsUpdate = true; };
  m.userData.draw(); return m;
}
const floorLabels = {};
function floorLabel(key, x, z, w, onRug, parent){
  const m = textPlane(w, w * 0.22, 1024, (g, W, H, name, sub) => {
    if (!name) return;
    g.fillStyle = onRug ? 'rgba(255,255,255,.95)' : '#f6f1e4'; g.font = '800 ' + Math.round(H * 0.5) + 'px ' + FONT_D;
    g.fillText(name, 8, H * 0.52);
    if (sub){ g.fillStyle = onRug ? 'rgba(255,255,255,.8)' : '#c9d1cb'; g.font = '700 ' + Math.round(H * 0.27) + 'px ' + FONT_B; g.fillText(sub, 10, H * 0.88); }
  });
  m.rotation.x = -PI / 2; m.position.set(x + w / 2, (onRug ? FL : 0.05) + 0.02, z); (parent || scene).add(m);
  floorLabels[key] = {m, txt: ''}; return m;
}
function setLabel(key, name, sub){ const L = floorLabels[key]; if (!L) return; const k = name + '|' + (sub || ''); if (L.txt === k) return; L.txt = k; L.m.userData.draw(name, sub); }

/* ======================= the building, built once ======================= */
const BUILDINGS = [{x0: 0, z0: 0, x1: 28, z1: 18}, {x0: 34, z0: 0, x1: 56, z1: 18}, {x0: 0, z0: -33, x1: 56, z1: -4}];
function inside(x, z){ return BUILDINGS.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1); }
const SEATS = {}, BEDS = [[1.1, 2.3], [1.1, 4.6], [8.8, 3.2], [8.6, 5.5]];
let groundMat, flip, tv, ticketWall, bulbsA, bulbsB, ghost, flakes, flakeGeo, rain, rainGeo, sparks, sparkGeo;
const SEAS = {};
function buildStatic(){
  const gridTex = canvasTex(128, 128, g => { g.fillStyle = '#1d2421'; g.fillRect(0, 0, 128, 128); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, 0, 128, 3); g.fillRect(0, 0, 3, 128); }, [250, 250]);
  groundMat = lam(0xffffff, {map: gridTex});
  const ground = shadowy(new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), groundMat), false, true); ground.rotation.x = -PI / 2; ground.position.set(120, 0, -6); scene.add(ground);
  const aoTex = canvasTex(8, 64, g => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 64); });
  const AO_MAT = basic(0x000000, {map: aoTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2});
  const aoKit = new Kit(), walls = new Kit(), glassKit = new Kit(), floors = new Kit();
  const GLASS = pho(0xbfe3f2, 90, {transparent: true, opacity: 0.32, depthWrite: false, specular: 0xffffff});
  function aoStrip(ax, x, z, len, side){
    const w = 0.75, cx = ax === 'x' ? x : x + side * (WT / 2 + w / 2), cz = ax === 'x' ? z + side * (WT / 2 + w / 2) : z;
    const y = inside(cx, cz) ? FL + 0.012 : 0.012, ry = ax === 'x' ? (side > 0 ? 0 : PI) : (side > 0 ? PI / 2 : -PI / 2);
    aoKit.p(AO_MAT, new THREE.PlaneGeometry(len, w), cx, y, cz, {q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-PI / 2, ry, 0, 'YXZ'))});
  }
  function wall(ax, at, from, to, segs){
    segs = (segs || []).slice().sort((a, b) => a[0] - b[0]);
    const runs = []; let p = from;
    for (const [a, b, kind] of segs){ if (a > p) runs.push([p, a, 'solid']); runs.push([a, b, kind]); p = b; }
    if (p < to) runs.push([p, to, 'solid']);
    for (const [a, b, kind] of runs){
      if (kind === 'door') continue;
      const len = b - a, mid = (a + b) / 2, h = kind === 'glass' ? 0.45 : WH;
      const x = ax === 'x' ? mid : at, z = ax === 'x' ? at : mid, w = ax === 'x' ? len : WT, d = ax === 'x' ? WT : len;
      walls.box(VC, w, h, d, x, FL + h / 2, z, {c: COL.wall}).box(VC, w + 0.02, 0.05, d + 0.02, x, FL + h + 0.02, z, {c: COL.cap});
      if (kind === 'glass'){
        glassKit.box(GLASS, ax === 'x' ? len : 0.05, WH - h, ax === 'x' ? 0.05 : len, x, FL + h + (WH - h) / 2, z);
        walls.box(VC, ax === 'x' ? len : WT * 0.6, 0.06, ax === 'x' ? WT * 0.6 : len, x, FL + WH, z, {c: COL.cap});
      }
      for (const s of [-1, 1]) aoStrip(ax, x, z, len, s);
    }
    for (const [a, b, kind] of runs) if (kind === 'door') for (const e of [a, b]){
      const x = ax === 'x' ? e : at, z = ax === 'x' ? at : e; walls.box(VC, WT + 0.04, WH + 0.06, WT + 0.04, x, FL + (WH + 0.06) / 2, z, {c: COL.wall});
    }
  }
  function rug(x0, z0, x1, z1, c){ const i = 0.45; floors.box(VC, x1 - x0 - 2 * i, 0.012, z1 - z0 - 2 * i, (x0 + x1) / 2, FL + 0.006, (z0 + z1) / 2, {c}); }
  // the office: x 0-28, z 0-18 (front row faces the camera)
  floors.box(VC, 28.3, FL - 0.02, 18.3, 14, (FL - 0.02) / 2, 9, {c: COL.skirt}).box(VC, 28, 0.04, 18, 14, FL - 0.02, 9, {c: COL.floor});
  floors.box(VC, 28, 0.004, 3, 14, FL + 0.012, 8.5, {c: 0xe3d3b4});
  rug(0, 10, 9, 18, COL.reception); rug(9, 10, 21, 18, COL.bookings); rug(21, 10, 28, 18, COL.barb);
  rug(0, 0, 10, 7, COL.jeff); rug(10, 0, 19, 7, COL.brk); rug(19, 0, 28, 7, COL.meet);
  wall('x', 0, 0, 28, [[13.6, 14.9, 'door']]);
  wall('x', 18, 0, 28, [[3.4, 5.6, 'door'], [10, 20, 'glass'], [22.2, 27, 'glass']]);
  wall('z', 0, 0, 18, [[12, 16, 'glass']]); wall('z', 28, 0, 18, [[7.6, 9.4, 'door']]);
  wall('x', 7, 0, 28, [[4, 5.4, 'door'], [13.5, 15, 'door'], [19.6, 22.3, 'glass'], [22.5, 24, 'door'], [24.2, 27.6, 'glass']]);
  wall('x', 10, 0, 28, [[1.6, 7.4, 'door'], [10, 12, 'door'], [23, 24.6, 'door']]);
  wall('z', 10, 0, 7); wall('z', 19, 0, 7);
  wall('z', 9, 10, 18, [[12.6, 15.6, 'door']]); wall('z', 21, 10, 18, [[12, 16, 'glass']]);
  // Darrin's shop: x 34-56, z 0-18, two bays open to the front
  floors.box(VC, 22.3, FL - 0.02, 18.3, 45, (FL - 0.02) / 2, 9, {c: COL.skirt}).box(VC, 22, 0.04, 18, 45, FL - 0.02, 9, {c: COL.shopFloor});
  for (const x of [35.6, 44.4, 53.2]) floors.box(VC, 0.16, 0.01, 15.5, x, FL + 0.012, 10, {c: 0xf2c14e});
  wall('x', 0, 34, 56, [[51.8, 53.8, 'door']]); wall('x', 18, 34, 56, [[36.2, 43.8, 'door'], [45, 52.6, 'door']]);
  wall('z', 34, 0, 18, [[7.6, 9.4, 'door']]); wall('z', 56, 0, 18);
  for (const x of [36.2, 43.8, 45, 52.6]) for (let i = 0; i < 4; i++) walls.box(VC, WT + 0.06, 0.3, WT + 0.06, x, FL + 0.15 + i * 0.36, 18, {c: i % 2 ? 0x1f2125 : 0xf2c14e});
  const walkK = new Kit();
  walkK.box(VC, 6, 0.05, 1.8, 31, 0.025, 8.5, {c: COL.walk}).box(VC, 1.4, 0.05, 4, 14.25, 0.025, -2, {c: COL.walk}).box(VC, 1.8, 0.05, 4, 52.8, 0.025, -2, {c: COL.walk});
  walkK.box(VC, 62, 0.05, 3.2, 26, 0.025, 20.4, {c: 0x283130});
  // the yard: x 0-56, z -33 to -4, chain-link all round, gate on the east side
  floors.box(VC, 56, 0.06, 29, 28, 0.03, -18.5, {c: COL.asphalt});
  const FENCE = lam(0xffffff, {map: fenceTex([1, 1]), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide});
  const fence = new Kit();
  function fenceRun(ax, at, a, b){
    const len = b - a, mid = (a + b) / 2, x = ax === 'x' ? mid : at, z = ax === 'x' ? at : mid;
    const g = new THREE.PlaneGeometry(len, 1.4); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 1.2, uv.getY(i) * 1.4 / 1.2);
    fence.p(FENCE, g, x, 0.75, z, {ry: ax === 'x' ? 0 : PI / 2});
    for (let p = a; p <= b + 0.01; p += Math.max(2.5, len / Math.ceil(len / 3))) fence.cyl(M.metal, 0.05, 1.55, ax === 'x' ? p : at, 0.78, ax === 'x' ? at : p, 'y', 6);
    fence.box(M.metal, ax === 'x' ? len : 0.06, 0.06, ax === 'x' ? 0.06 : len, x, 1.5, z);
  }
  fenceRun('x', -33, 0, 56); fenceRun('z', 0, -33, -4); fenceRun('z', 56, -33, -22.5); fenceRun('z', 56, -17, -4);
  fenceRun('x', -4, 0, 13.4); fenceRun('x', -4, 15.6, 51.8); fenceRun('x', -4, 53.8, 56);
  // furniture: one vertex-coloured mesh for the lot
  const f = new Kit();
  const DESK = 0xe7d2ad, LEG = 0xf3f1ec, MON = 0x2a2d33, CHAIR = 0xeceef0, CHAIRD = 0x5f646c, GREEN = 0x4f9a4a, GREEN2 = 0x3c7f3a;
  function desk(x, z, w){ w = w || 1.6; const y = FL;
    f.box(VC, w, 0.05, 0.8, x, y + 0.75, z, {c: DESK});
    for (const s of [-1, 1]) f.box(VC, 0.05, 0.73, 0.74, x + s * (w / 2 - 0.04), y + 0.365, z, {c: LEG});
    f.box(VC, w - 0.1, 0.34, 0.03, x, y + 0.52, z + 0.37, {c: LEG});
    f.box(VC, 0.64, 0.38, 0.04, x, y + 1.06, z + 0.2, {c: MON}).box(VC, 0.06, 0.2, 0.06, x, y + 0.87, z + 0.23, {c: MON}).box(VC, 0.24, 0.02, 0.16, x, y + 0.785, z + 0.23, {c: MON});
    f.box(VC, 0.45, 0.02, 0.15, x, y + 0.785, z - 0.14, {c: 0xd9dce0}).box(VC, 0.07, 0.03, 0.1, x + 0.34, y + 0.79, z - 0.14, {c: 0xd9dce0});
    f.cyl(VC, 0.045, 0.1, x - w / 2 + 0.22, y + 0.83, z - 0.05, 'y', 8, {c: 0xf7f5ef});
  }
  function chair(x, z, ry){ const y = FL; ry = ry || 0; const c = Math.cos(ry), s = Math.sin(ry);
    f.box(VC, 0.5, 0.08, 0.5, x, y + 0.46, z, {c: CHAIR, ry}).box(VC, 0.48, 0.5, 0.07, x - s * 0.24, y + 0.76, z - c * 0.24, {c: CHAIR, ry});
    f.cyl(VC, 0.035, 0.34, x, y + 0.25, z, 'y', 6, {c: CHAIRD}).box(VC, 0.56, 0.04, 0.06, x, y + 0.06, z, {c: CHAIRD}).box(VC, 0.06, 0.04, 0.56, x, y + 0.06, z, {c: CHAIRD});
  }
  function plant(x, z, s){ s = s || 1; const y = FL;
    f.cyl(VC, 0.2 * s, 0.36 * s, x, y + 0.18 * s, z, 'y', 10, {c: 0xf3f1ec});
    f.p(VC, new THREE.IcosahedronGeometry(0.34 * s, 0), x, y + 0.62 * s, z, {c: GREEN}).p(VC, new THREE.IcosahedronGeometry(0.24 * s, 0), x + 0.16 * s, y + 0.86 * s, z - 0.06 * s, {c: GREEN2});
  }
  function planter(x, z, len){
    f.box(VC, len, 0.16, 0.22, x, FL + 0.86, z, {c: LEG});
    for (let i = 0; i < len / 0.32; i++) f.p(VC, new THREE.IcosahedronGeometry(0.13 + (i % 3) * 0.02, 0), x - len / 2 + 0.16 + i * 0.32, FL + 1.02, z + ((i % 2) - 0.5) * 0.05, {c: i % 2 ? GREEN : GREEN2});
  }
  for (const [i, key] of ['kelly', 'rachel', 'sam'].entries()){ const x = 11.6 + i * 3.1; desk(x, 12.7); chair(x, 11.9); SEATS[key] = {x, z: 11.9, room: 'bookings'}; f.m('cactus', x + 0.62, FL + 0.775, 12.85); }
  for (const [i, key] of ['jake', 'spare'].entries()){ const x = 11.6 + i * 3.1; desk(x, 15.9); chair(x, 15.1); SEATS[key] = {x, z: 15.1, room: 'bookings'}; f.m('cactus', x + 0.62, FL + 0.775, 16.05); }
  planter(18.0, 15.9, 1.4); plant(20.2, 10.8, 1.1); plant(9.8, 17.2, 0.9);
  f.box(VC, 0.06, 1.25, 0.06, 18.6, FL + 0.62, 17.1, {c: 0x444a50}).box(VC, 0.06, 1.25, 0.06, 20.0, FL + 0.62, 17.1, {c: 0x444a50});
  f.box(VC, 3.2, 1.05, 0.7, 4.5, FL + 0.525, 12.6, {c: 0xd9b98a}).box(VC, 3.3, 0.06, 0.8, 4.5, FL + 1.08, 12.6, {c: 0xf3f1ec});
  for (let i = 0; i < 9; i++) f.box(VC, 0.16, 0.95, 0.03, 3.05 + i * 0.36, FL + 0.5, 12.97, {c: 0xc49e6c});
  f.p(VC, new THREE.SphereGeometry(0.1, 10, 6, 0, PI * 2, 0, PI / 2), 5.7, FL + 1.11, 12.6, {c: 0xf2c14e});
  f.m('couch', 6.6, FL, 16.9, {ry: PI}); f.m('lampS', 8.2, FL, 17.1); plant(0.8, 17.2, 1.2); plant(8.3, 10.8); chair(4.5, 11.9);
  desk(24.5, 13.2, 1.8); chair(24.5, 12.4); SEATS.barb = {x: 24.5, z: 12.4, room: 'barb'};
  f.m('cabinet', 26.9, FL, 10.75, {s: [0.6, 0.85, 0.6]}); f.m('lampS', 22, FL, 17.1); plant(27.2, 17.2, 1.0); f.m('cactus', 25.2, FL + 0.775, 13.4);
  f.m('armchair', 23.5, FL, 15.8, {ry: PI}); f.m('frameA', 24.5, FL + 0.55, 10.2);
  f.box(VC, 2.6, 0.07, 1.1, 5, FL + 0.78, 3.4, {c: 0x6b3f22}).box(VC, 2.6, 0.74, 0.06, 5, FL + 0.39, 3.92, {c: 0x4e2d17});
  for (const s of [-1, 1]) f.box(VC, 0.06, 0.74, 1.05, 5 + s * 1.27, FL + 0.39, 3.4, {c: 0x4e2d17});
  f.box(VC, 0.64, 0.38, 0.04, 5, FL + 1.06, 3.75, {c: MON}).box(VC, 0.06, 0.2, 0.06, 5, FL + 0.9, 3.8, {c: MON});
  chair(5, 2.6); SEATS.jeff = {x: 5, z: 2.6, room: 'jeff'};
  f.m('armchair', 4, FL, 5.6, {ry: PI}); f.m('armchair', 6.2, FL, 5.6, {ry: PI});
  f.m('sideboard', 2.0, FL, 0.45); f.m('lampS', 8.9, FL, 0.9); plant(0.9, 6.2, 1.0); f.m('books', 2.0, FL + 0.65, 0.45);
  for (const [x, z] of BEDS) f.cyl(VC, 0.52, 0.14, x, FL + 0.07, z, 'y', 14, {c: 0x7c5c46}).cyl(VC, 0.4, 0.16, x, FL + 0.1, z, 'y', 14, {c: 0xcbb89a});
  f.m('fridge', 11.1, FL, 0.55); f.m('counter', 13, FL, 0.6); f.m('sink', 16.6, FL, 0.6);
  f.box(VC, 0.36, 0.3, 0.3, 12.6, FL + 1.3, 0.55, {c: 0x2a2d33}).box(VC, 0.5, 0.3, 0.35, 13.6, FL + 1.3, 0.5, {c: 0xe5e7eb});
  f.m('ktable', 14.5, FL, 4.2); for (const [x, z, r] of [[13.4, 4.2, PI / 2], [15.6, 4.2, -PI / 2], [14.5, 3.1, 0], [14.5, 5.3, PI]]) f.m('kchair', x, FL, z, {ry: r});
  plant(18.3, 6.2, 0.9);
  f.box(VC, 4.6, 0.07, 1.5, 23.5, FL + 0.76, 3.8, {c: DESK}).box(VC, 0.1, 0.72, 1.2, 21.6, FL + 0.37, 3.8, {c: LEG}).box(VC, 0.1, 0.72, 1.2, 25.4, FL + 0.37, 3.8, {c: LEG});
  for (const x of [22, 23.5, 25]){ chair(x, 2.6); chair(x, 5.0, PI); }
  f.box(VC, 2.8, 1.5, 0.08, 23.5, FL + 1.05, 0.2, {c: 0x1b1e22});
  plant(27.2, 6.2, 1.0); plant(19.8, 0.9, 0.8);
  plant(0.8, 8.5, 0.8); f.box(VC, 0.45, 1.25, 0.45, 26.9, FL + 0.62, 7.6, {c: 0xdbe7ef}).cyl(VC, 0.15, 0.42, 26.9, FL + 1.45, 7.6, 'y', 8, {c: 0x7fb3d5});
  f.m('frameB', 16.5, FL + 0.55, 7.25); f.m('frameA', 6.8, FL + 0.55, 7.25);
  // the shop: workbench, tool chests, lockers, drums, parts shelf
  f.box(VC, 0.9, 0.9, 5, 55.2, FL + 0.45, 9, {c: 0x8a6a4a}).box(VC, 1.0, 0.06, 5.1, 55.2, FL + 0.92, 9, {c: 0x5c4630});
  for (const z of [5.4, 6.5]) f.box(VC, 0.7, 1.1, 0.9, 55.3, FL + 0.55, z, {c: 0xc81e1e}).box(VC, 0.72, 0.04, 0.92, 55.3, FL + 0.8, z, {c: 0x9b1515});
  for (let i = 0; i < 6; i++) f.box(VC, 0.62, 1.8, 0.5, 35 + i * 0.66, FL + 0.9, 0.4, {c: i % 2 ? 0x6b7f99 : 0x7c90aa});
  f.box(VC, 3, 1.9, 0.6, 48, FL + 0.95, 0.45, {c: 0x5a5f66});
  for (let i = 0; i < 3; i++) f.box(VC, 2.9, 0.04, 0.6, 48, FL + 0.5 + i * 0.6, 0.45, {c: 0x30343a});
  f.m('barrel', 55, FL, 1.1); f.m('barrelB', 54.0, FL, 1.0); f.m('barrelC', 55.1, FL, 2.1); f.m('palletBoxes', 52.6, FL, 16.6); f.m('boxA', 54.8, FL + 0.95, 10.4);
  f.box(VC, 0.5, 0.9, 0.5, 38.2, FL + 0.45, 2.2, {c: 0x2f6f9f}).cyl(VC, 0.16, 1.0, 38.0, FL + 0.6, 2.6, 'y', 8, {c: 0x7a8088});
  // the yard's far corner: dumpster, pallets, drums, tires; cones at the gate
  f.m('dumpster', 53.4, 0.06, -31.6); for (let i = 0; i < 4; i++) f.m('pallet', 50.4, 0.06 + i * 0.15, -31.8);
  f.m('barrel', 47.8, 0.06, -32); for (let i = 0; i < 3; i++) f.m('tire', 46.6, 0.06 + i * 0.66, -32.2, {rz: PI / 2});
  for (const z of [-22, -17.6]) f.m('cone', 56.8, 0, z);
  addKit(floors, false, true); addKit(walkK, false, true); addKit(walls, true, true); addKit(f, true, true); addKit(fence, false, false);
  scene.add(glassKit.group()); const aoG = aoKit.group(); aoG.renderOrder = 1; scene.add(aoG);
  // signs and boards
  const sign1 = textPlane(5, 1.1, 1024, (g, W, H) => { g.fillStyle = '#17402a'; g.font = '800 ' + Math.round(H * 0.72) + 'px ' + FONT_D; g.textAlign = 'center'; g.fillText("JEFF'S JUNK", W / 2, H * 0.74); g.fillStyle = '#e8b34a'; g.fillRect(W * 0.2, H * 0.84, W * 0.6, H * 0.06); });
  sign1.position.set(0.13, FL + 0.95, 14); sign1.rotation.y = PI / 2; scene.add(sign1);
  const sign2 = textPlane(3.2, 0.7, 512, (g, W, H) => { g.fillStyle = '#17402a'; g.fillRect(0, 0, W, H); g.fillStyle = '#e8b34a'; g.font = '800 ' + Math.round(H * 0.62) + 'px ' + FONT_D; g.textAlign = 'center'; g.fillText("JEFF'S JUNK", W / 2, H * 0.7); });
  sign2.position.set(5, FL + 1.12, 0.13); scene.add(sign2);
  const rugLogo = textPlane(3.4, 1.4, 512, (g, W, H) => { g.strokeStyle = 'rgba(232,179,74,.85)'; g.lineWidth = 10; g.strokeRect(10, 10, W - 20, H - 20); g.fillStyle = 'rgba(232,179,74,.9)'; g.font = '800 ' + Math.round(H * 0.5) + 'px ' + FONT_D; g.textAlign = 'center'; g.fillText('JJ', W / 2, H * 0.68); });
  rugLogo.rotation.x = -PI / 2; rugLogo.position.set(5, FL + 0.02, 5.2); scene.add(rugLogo);
  // the ticket wall: one ticket for every job entered today, coloured by service
  ticketWall = textPlane(4.4, 0.95, 1024, (g, W, H, list) => { g.fillStyle = '#b08a5a'; g.fillRect(0, 0, W, H); g.fillStyle = '#8a6a44'; g.fillRect(0, 0, W, 8); g.fillRect(0, H - 8, W, 8);
    list = list || []; const n = list.length, per = n > 18 ? 18 : 9, s = n > 18 ? 0.5 : 1;
    for (let i = 0; i < Math.min(n, per * 2); i++){ const cx = 30 + (i % per) * 108 * s, cy = 26 + Math.floor(i / per) * 92 * s; g.save(); g.translate(cx + 40 * s, cy + 34 * s); g.rotate(((i * 37) % 9 - 4) * 0.02);
      g.fillStyle = '#f7f5ef'; g.fillRect(-40 * s, -34 * s, 80 * s, 68 * s); g.fillStyle = TICKET_COL[list[i]] || '#9aa0a6'; g.fillRect(-40 * s, -22 * s, 80 * s, 56 * s);
      g.fillStyle = '#c81e1e'; g.beginPath(); g.arc(0, -30 * s, 5 * s, 0, PI * 2); g.fill(); g.restore(); } });
  ticketWall.position.set(16.4, FL + 0.95, 10.13); scene.add(ticketWall);
  flip = textPlane(1.5, 1.0, 256, (g, W, H, done, all) => { g.fillStyle = '#17402a'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 72px ' + FONT_D; g.fillText((done || 0) + '/' + (all || 0), W / 2, 108); g.font = '700 22px ' + FONT_B; g.fillStyle = '#cfe3d4'; g.fillText('STOPS DONE', W / 2, 146); });
  flip.position.set(19.3, FL + 1.3, 17.14); scene.add(flip);
  tv = textPlane(2.6, 1.35, 512, (g, W, H, tomorrow, quotesDue) => { g.fillStyle = '#0f1513'; g.fillRect(0, 0, W, H); g.fillStyle = '#e8b34a'; g.font = '800 40px ' + FONT_D; g.fillText('Tomorrow', 24, 56);
    g.fillStyle = '#fff'; g.font = '800 64px ' + FONT_D; g.fillText((tomorrow || 0) + ' jobs', 24, 140); g.fillStyle = '#a7b1aa'; g.font = '700 30px ' + FONT_B; g.fillText((quotesDue || 0) + ' quotes to chase', 24, 196); });
  tv.material.transparent = false; tv.position.set(23.5, FL + 1.05, 0.25); scene.add(tv);
  // Darrin's job in the shop: a bin up on the floor for patching (decoration - says nothing about any real truck)
  const shopBin = buildBin(14, false); shopBin.position.set(46.6, FL, 9.6); shopBin.rotation.y = -PI / 2; shopBin.traverse(o => { if (o.isMesh) shadowy(o, true, true); }); scene.add(shopBin);
  sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
  sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({color: 0xffc061, size: 0.09})); scene.add(sparks);
  // floor labels for the rooms
  floorLabel('reception', 0.3, 20.4, 8.4); floorLabel('bookings', 9.3, 20.4, 11); floorLabel('barb', 21.3, 20.4, 7.6); floorLabel('shop', 34.3, 20.4, 12);
  floorLabel('jeff', 6.3, 6.1, 3.4, true); floorLabel('brk', 10.7, 6.1, 4.6, true); floorLabel('meet', 19.7, 6.2, 4.6, true); floorLabel('yard', 30.4, -1.9, 18);
  setLabel('reception', 'Front desk', ''); setLabel('barb', "Barb's office", ''); setLabel('shop', "Darrin's shop", '');
  setLabel('jeff', "Jeff's office", ''); setLabel('brk', 'Break room', ''); setLabel('meet', 'Meeting room', '');
  buildSeasons();
}
const TICKET_COL = {'Bin Rental': '#22c55e', 'Junk Removal': '#a8632a', 'Junk Quote': '#e39a1c', 'Furniture Pickup': '#8b5cf6', 'Furniture Delivery': '#8b5cf6'};

/* ======================= seasons and weather (built once, shown by date and the real weather) ======================= */
function buildSeasons(){
  for (const k of ['christmas', 'halloween', 'snow', 'snowfall', 'rain']){ SEAS[k] = new THREE.Group(); scene.add(SEAS[k]); }
  const xk = new Kit(); xk.m('pine', 1.6, FL, 16.4, {s: [0.33, 0.33, 0.33]}); xk.p(VC, new THREE.OctahedronGeometry(0.16, 0), 1.6, FL + 2.55, 16.4, {c: 0xf2c14e});
  for (const [x, z, c] of [[1.0, 15.9, 0xc81e1e], [2.1, 16.8, 0x2563eb], [1.9, 15.8, 0xe8b34a]]) xk.box(VC, 0.34, 0.26, 0.34, x, FL + 0.13, z, {c});
  xk.p(VC, new THREE.TorusGeometry(0.34, 0.1, 8, 18), 4.5, FL + 1.3, 18.16, {c: 0x2f6f3a}); xk.box(VC, 0.16, 0.12, 0.05, 4.5, FL + 1.0, 18.2, {c: 0xc81e1e});
  addKit(xk, true, true, SEAS.christmas);
  const bulbA = [], bulbB = []; let n = 0;
  for (const [x0, z0, x1, z1] of [[0, 18, 28, 18], [0, 0, 0, 18], [28, 0, 28, 18], [34, 18, 56, 18], [56, 0, 56, 18], [34, 0, 34, 18]]){
    const len = Math.hypot(x1 - x0, z1 - z0), c = Math.round(len / 0.9);
    for (let i = 0; i <= c; i++){ const u = i / c; (n++ % 2 ? bulbA : bulbB).push([lerp(x0, x1, u), FL + WH + 0.1 - Math.sin(u * c * PI) * 0.06, lerp(z0, z1, u)]); } }
  for (let i = 0; i < 26; i++){ const a = i * 0.9, h = 0.35 + i * 0.075, r = 0.85 * (1 - i / 30); (i % 2 ? bulbA : bulbB).push([1.6 + Math.cos(a) * r, FL + h, 16.4 + Math.sin(a) * r]); }
  const bulbGeo = sph(0.07, 6, 4), cols = [0xff4d4d, 0xffd166, 0x5ad1ff, 0x7ee081, 0xff8fd8];
  const bulbMesh = list => { const k = new Kit(); list.forEach((p, i) => k.p(VC, bulbGeo, p[0], p[1], p[2], {c: cols[i % cols.length]})); const m = new THREE.Mesh(merge(k.L.get(VC)), basic(0xffffff, {vertexColors: true})); SEAS.christmas.add(m); return m; };
  bulbsA = bulbMesh(bulbA); bulbsB = bulbMesh(bulbB);
  const hk = new Kit();
  for (const [x, z, nm] of [[3.0, 18.7, 'pumpkinC'], [6.0, 18.8, 'pumpkin'], [6.6, 18.6, 'pumpkinT'], [33.5, 18.7, 'pumpkinC'], [36, 18.9, 'pumpkin']]) hk.m(nm, x, 0.05, z, {s: [1.4, 1.4, 1.4], ry: rnd() * 6});
  for (const k of ['kelly', 'sam', 'jake']) hk.m('pumpkinC', SEATS[k].x - 0.55, FL + 0.775, SEATS[k].z + 0.6, {s: [0.5, 0.5, 0.5], ry: 0.4});
  addKit(hk, true, true, SEAS.halloween);
  ghost = new THREE.Mesh(libGeo('ghost'), lam(0xffffff, {vertexColors: true, transparent: true, opacity: 0.85})); ghost.scale.setScalar(0.8); ghost.position.set(40, 4, -24); SEAS.halloween.add(ghost);
  const snowYard = shadowy(new THREE.Mesh(new THREE.PlaneGeometry(56, 29), lam(0xe6ecf1, {transparent: true, opacity: 0.86, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2})), false, true);
  snowYard.rotation.x = -PI / 2; snowYard.position.set(28, 0.1, -18.5); SEAS.snow.add(snowYard);
  const FLAKES = 1600; flakeGeo = new THREE.BufferGeometry(); const fp = new Float32Array(FLAKES * 3);
  for (let i = 0; i < FLAKES; i++){ fp[i * 3] = -14 + rnd() * 84; fp[i * 3 + 1] = rnd() * 26; fp[i * 3 + 2] = -40 + rnd() * 66; }
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  flakes = new THREE.Points(flakeGeo, new THREE.PointsMaterial({color: 0xffffff, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false})); SEAS.snowfall.add(flakes);
  const DROPS = 900; rainGeo = new THREE.BufferGeometry(); const rp = new Float32Array(DROPS * 6);
  for (let i = 0; i < DROPS; i++){ const x = -14 + rnd() * 84, y = rnd() * 26, z = -40 + rnd() * 66; rp.set([x, y, z, x - 0.05, y - 0.7, z], i * 6); }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({color: 0xaebfd0, transparent: true, opacity: 0.55})); SEAS.rain.add(rain);
}
function seasonFor(d){ const m = d.getMonth() + 1, day = d.getDate(); if (m === 10) return 'halloween'; if (m === 11 || m === 12) return 'christmas'; if (m <= 2 || (m === 3 && day < 15)) return 'winter'; return 'normal'; }
function wxKind(code){ if (code == null) return null; if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'; if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rain'; return null; }

/* ======================= big-head crew (decoration: they carry no claims about what anyone is doing) ======================= */
const SKIN = 0xf0c39a, HIP = 0.42;
const P = {
  kelly: {hair: 0xc4401f, long: true, shirt: 0x2f74c8, headset: true, dot: '#2f74c8'},
  rachel: {hair: 0x6b4226, long: true, shirt: 0xd6336c, glasses: true, dot: '#d6336c'},
  sam: {hair: 0x7a4e2c, long: true, shirt: 0x3a5168, dot: '#6d8bb0'},
  barb: {hair: 0x4a3020, long: true, shirt: 0x8b5cf6, pearls: true, dot: '#8b5cf6'},
  jake: {hair: 0xecc95c, shirt: 0x3a3f47, hood: true, phones: 0xd9412b, dot: '#d9412b'},
  jeff: {hair: 0x5a4030, cap: 0x1f7a33, shirt: 0x2f8f46, beard: true},
  josh: {hair: 0x3b2416, shirt: 0x1d1d1d, pants: 0x1d1d1d, bigHat: 0x6b3fa0, chain: true, dot: '#6b3fa0'},
  darrin: {hair: 0x2b2b2b, shirt: 0x56606e, hardhat: 0xf2c14e},
  jordan: {hair: 0x3b2a1e, cap: 0x1e3a8a}, kevin: {hair: 0x6b4a32, cap: 0x831843}, neil: {hair: 0x2b2b2b, cap: 0x14532d, beard: true}, max: {hair: 0x8a5a3c, cap: 0x0f766e}
};
function makeChibi(sp){
  const k = new Kit(), pants = sp.pants || 0x2b2f36, top = HIP + 0.5, hy = top + 0.36;
  k.p(VC, new THREE.CylinderGeometry(0.21, 0.25, 0.5, 16), 0, HIP + 0.25, 0, {c: sp.shirt});
  k.p(VC, sph(0.215, 16, 8, 0, PI * 2, 0, PI / 2), 0, top - 0.02, 0, {c: sp.shirt, s: [1.12, 0.55, 1]});
  k.p(VC, new THREE.CylinderGeometry(0.255, 0.25, 0.14, 16), 0, HIP + 0.03, 0, {c: pants});
  k.box(VC, 0.13, 0.1, 0.02, 0.08, HIP + 0.36, 0.228, {c: 0xf4f1e8});
  k.cyl(VC, 0.08, 0.1, 0, top + 0.04, 0, 'y', 10, {c: SKIN});
  k.p(VC, sph(0.36), 0, hy, 0, {c: SKIN, s: [1, 0.96, 0.96]});
  for (const s of [-1, 1]){ k.p(VC, sph(0.048, 10, 8), s * 0.12, hy, 0.318, {c: 0x1d1d1d}); k.p(VC, sph(0.05, 8, 6), s * 0.19, hy - 0.09, 0.28, {c: 0xf2a68a, s: [1, 0.6, 0.4]}); k.p(VC, sph(0.06, 8, 6), s * 0.355, hy - 0.02, 0, {c: SKIN}); }
  const hc = sp.hair;
  k.p(VC, sph(0.385, 18, 10, 0, PI * 2, 0, PI * 0.42), 0, hy + 0.01, -0.01, {c: hc, rx: -0.25});
  k.p(VC, sph(0.375, 18, 10, PI * 0.5, PI, 0, PI * 0.62), 0, hy, -0.02, {c: hc});
  if (sp.long) k.p(VC, sph(0.36, 14, 10), 0, hy - 0.26, -0.13, {c: hc, s: [1.05, 0.95, 0.6]});
  if (sp.cap){ k.p(VC, sph(0.395, 18, 8, 0, PI * 2, 0, PI * 0.38), 0, hy + 0.02, 0, {c: sp.cap}); k.box(VC, 0.42, 0.03, 0.24, 0, hy + 0.17, 0.4, {c: sp.cap, rx: 0.12}); }
  if (sp.hardhat){ k.p(VC, sph(0.4, 18, 8, 0, PI * 2, 0, PI * 0.45), 0, hy + 0.04, 0, {c: sp.hardhat}); k.cyl(VC, 0.47, 0.03, 0, hy + 0.1, 0.02, 'y', 18, {c: sp.hardhat}); }
  if (sp.bigHat){ k.cyl(VC, 0.6, 0.035, 0, hy + 0.27, 0, 'y', 20, {c: sp.bigHat}); k.p(VC, new THREE.CylinderGeometry(0.28, 0.32, 0.3, 16), 0, hy + 0.42, 0, {c: sp.bigHat}); k.cyl(VC, 0.325, 0.06, 0, hy + 0.3, 0, 'y', 16, {c: 0xe8b34a}); }
  if (sp.beard) k.p(VC, sph(0.3, 14, 8, 0, PI * 2, PI * 0.55, PI * 0.45), 0, hy + 0.02, 0.07, {c: hc});
  if (sp.glasses) for (const s of [-1, 1]) k.p(VC, new THREE.TorusGeometry(0.07, 0.014, 6, 14), s * 0.12, hy, 0.335, {c: 0x1d1d1d});
  if (sp.headset){ k.p(VC, new THREE.TorusGeometry(0.39, 0.025, 6, 20, PI), 0, hy + 0.02, 0, {c: 0x222222}); k.p(VC, sph(0.07, 8, 6), -0.37, hy - 0.02, 0, {c: 0x222222}); k.box(VC, 0.03, 0.03, 0.26, -0.3, hy - 0.12, 0.16, {c: 0x222222, ry: 0.4}); }
  if (sp.phones){ k.p(VC, new THREE.TorusGeometry(0.4, 0.035, 6, 20, PI), 0, hy + 0.02, 0, {c: 0x222222}); for (const s of [-1, 1]) k.cyl(VC, 0.1, 0.08, s * 0.38, hy - 0.02, 0, 'x', 12, {c: sp.phones}); }
  if (sp.hood) k.p(VC, sph(0.3, 14, 8), 0, top + 0.04, -0.2, {c: sp.shirt, s: [1.1, 0.5, 0.7]});
  if (sp.pearls) for (let i = 0; i < 9; i++){ const a = PI * 0.35 - PI * 0.15 + i * PI * 0.3 / 8; k.p(VC, sph(0.025, 6, 4), Math.cos(a) * 0.17, top, Math.sin(a) * 0.17 + 0.02, {c: 0xfaf7ef}); }
  if (sp.chain) for (let i = 0; i < 9; i++){ const a = PI * 0.2 + i * PI * 0.6 / 8; k.p(VC, sph(0.025, 6, 4), Math.cos(a) * 0.18, top - 0.08 - Math.sin(a) * 0.08, Math.sin(a) * 0.2 + 0.05, {c: 0xe8b34a}); }
  const g = new THREE.Group(), body = shadowy(new THREE.Mesh(merge(k.L.get(VC)), VC), true, false); g.add(body);
  const lk = new Kit(); lk.cyl(VC, 0.095, 0.32, 0, -0.17, 0, 'y', 10, {c: pants}).box(VC, 0.17, 0.09, 0.26, 0, -0.36, 0.04, {c: 0x1f1f22});
  const lgeo = merge(lk.L.get(VC));
  const legs = [-1, 1].map(s => { const m = shadowy(new THREE.Mesh(lgeo, VC), true, false); m.position.set(s * 0.12, HIP, 0); g.add(m); return m; });
  const ak = new Kit(); ak.cyl(VC, 0.075, 0.34, 0, -0.17, 0, 'y', 10, {c: sp.shirt}).p(VC, sph(0.08, 10, 8), 0, -0.36, 0, {c: SKIN});
  const agro = merge(ak.L.get(VC));
  const arms = [-1, 1].map(s => { const m = shadowy(new THREE.Mesh(agro, VC), true, false); m.position.set(s * 0.29, top - 0.07, 0); m.rotation.z = s * 0.12; body.add(m); return m; });
  return {g, body, legs, arms, kind: 'person'};
}
function poseChibi(o, state, t, ph){
  const sit = state === 'sit' || state === 'type', walk = state === 'walk' || state === 'run', sp = state === 'run' ? 15 : 9;
  o.body.position.y = sit ? 0.06 : walk ? Math.abs(Math.sin(t * sp + ph)) * 0.05 : Math.sin(t * 1.6 + ph) * 0.008;
  o.legs.forEach((l, i) => { l.position.y = sit ? HIP + 0.06 : HIP; l.rotation.x = sit ? -PI / 2 : walk ? Math.sin(t * sp + ph + i * PI) * 0.6 : 0; });
  o.arms.forEach((a, i) => {
    if (state === 'type'){ a.rotation.x = -1.1 + Math.sin(t * 14 + i * 2 + ph) * 0.08; a.rotation.z = (i ? 1 : -1) * 0.05; }
    else if (state === 'cheer'){ a.rotation.x = -PI + 0.25 + Math.sin(t * 10 + i) * 0.15; a.rotation.z = (i ? 1 : -1) * 0.25; }
    else if (state === 'weld'){ a.rotation.x = i ? -1.25 : -0.9; a.rotation.z = (i ? 1 : -1) * 0.1; }
    else { a.rotation.x = walk ? Math.sin(t * sp + ph + i * PI + PI) * 0.6 : 0; a.rotation.z = (i ? 1 : -1) * 0.12; }
  });
}
function poseDog(o, state, t){
  const lie = state === 'lie', run = state === 'walk' || state === 'run';
  o.body.position.y = lie ? -o.legH * 0.85 : (run ? Math.abs(Math.sin(t * 12)) * 0.05 : 0);
  o.legs.forEach((l, i) => { l.visible = !lie; l.rotation.x = run ? Math.sin(t * 12 + (i < 2 ? 0 : PI)) * 0.7 : 0; });
}
const CORR = 8.5;
const CHAINS = {corridor: [], reception: [[4.5, CORR], [4.5, 11]], bookings: [[11, CORR], [11, 11]], barb: [[23.8, CORR], [23.8, 11]],
  jeff: [[4.7, CORR], [4.7, 6.2]], brk: [[14.25, CORR], [14.25, 6.2]], meet: [[23.25, CORR], [23.25, 6.2]],
  shop: [[27.4, CORR], [31, CORR], [35.2, CORR], [37, 6.2]],
  yard: [[14.25, CORR], [14.25, 6.2], [14.25, 0.2], [14.25, -2.6], [14.5, -6.4], [29.6, -6.6], [29.6, -19.6]]};
const ROOM_NAME = {reception: 'Front desk', bookings: 'Bookings', barb: "Barb's office", jeff: "Jeff's office", brk: 'Break room', meet: 'Meeting room', corridor: 'Hallway', shop: 'Shop', yard: 'Yard'};
const S = (x, z, room, face, pose) => ({x, z, room, face: face || 0, pose: pose || 'stand'});
function route(a, b){ if (a.room === b.room) return [[b.x, b.z]]; return [...(CHAINS[a.room] || []).slice().reverse(), ...(CHAINS[b.room] || []), [b.x, b.z]]; }
const actors = {};
function actor(key, obj, start, opts){
  const a = Object.assign({key, o: obj, at: start, path: [], state: start.pose, speed: 1.5, next: 4 + rnd() * 10, hidden: false, ph: rnd() * 6}, opts || {});
  obj.g.position.set(start.x, start.room === 'yard' ? 0.06 : FL, start.z); obj.g.rotation.y = start.face; scene.add(obj.g); actors[key] = a; return a;
}
function goTo(a, spot, speed){ a.path = route(a.at, spot); a.dest = spot; if (speed) a.speed = speed; }
function stepActor(a, dt, t){
  a.o.g.visible = !a.hidden; if (a.hidden) return;
  const g = a.o.g;
  if (a.path.length){
    const [tx, tz] = a.path[0], dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz), step = a.speed * dt;
    let dr = Math.atan2(dx, dz) - g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); g.rotation.y += dr * Math.min(1, dt * 10);
    if (d <= step){ g.position.x = tx; g.position.z = tz; a.path.shift(); } else { g.position.x += dx / d * step; g.position.z += dz / d * step; }
    g.position.y = inside(g.position.x, g.position.z) ? (g.position.z < -3.9 ? 0.06 : FL) : 0.05;
    if (!a.path.length){ a.at = a.dest; a.state = a.dest.pose; }
  } else { let dr = a.at.face - g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); g.rotation.y += dr * Math.min(1, dt * 6); }
  (a.o.kind === 'person' ? poseChibi : poseDog)(a.o, a.path.length ? 'walk' : a.state, t, a.ph);
}
const seat = (key, pose) => S(SEATS[key].x, SEATS[key].z, SEATS[key].room, 0, pose || 'type');
const SP = {coffee: S(12.8, 1.6, 'brk', PI), brkSit2: S(15.6, 4.2, 'brk', -PI / 2, 'sit'), fridge: S(11.2, 1.7, 'brk', PI), tickets: S(16.4, 10.9, 'bookings', PI),
  cooler: S(26.4, 8.3, 'corridor', PI / 2), meet1: S(22, 2.6, 'meet', 0, 'sit'), front: S(4.5, 11.0, 'reception'), jeffChat: S(4, 5.6, 'jeff', PI, 'sit'),
  shopVisit: S(44.2, 12.6, 'shop', PI / 2), yardWalk: S(29.6, -19.6, 'yard'), frontChat: S(4.5, 13.7, 'reception', PI)};
const OFFICE = ['kelly', 'rachel', 'sam', 'barb', 'jake'];
const DARRIN_SPOTS = [S(46.6, 8.2, 'shop', 0, 'weld'), S(54.4, 9.2, 'shop', PI / 2), S(44.9, 11.4, 'shop', PI / 2, 'weld'), S(48, 1.3, 'shop', PI)];
const DOG_KEYS = ['sawyer', 'vincent', 'winnie', 'leo'];
function buildCrew(){
  for (const key of OFFICE) actor(key, makeChibi(P[key]), seat(key));
  actor('jeff', makeChibi(P.jeff), seat('jeff', 'sit'));
  actor('josh', makeChibi(P.josh), SP.brkSit2);
  actor('darrin', makeChibi(P.darrin), DARRIN_SPOTS[0]);
  DOG_KEYS.forEach((d, i) => { const o = makeDog(d); o.g.traverse(m => { if (m.isMesh && m.material === VC) shadowy(m, true, false); });
    actor(d, o, S(BEDS[i][0], BEDS[i][1], 'jeff', i * 1.3, 'lie'), {dog: true, speed: 2.4}); });
}
const rachelIn = () => new Date(Date.now()).getHours() >= 15;   // Rachel comes in at 3 pm (Jake, 2026-11-03)
function chooseNext(a){
  const k = a.key;
  if (a.dog){
    if (k === 'winnie') return null;
    if (a.at.pose === 'lie' && rnd() < 0.5) return pickOf([S(3 + rnd() * 3, 13.5 + rnd() * 3, 'reception', rnd() * 6), S(7.5, 1.8, 'jeff', 2), S(12 + rnd() * 6, 8.5, 'corridor', PI / 2), S(14 + rnd() * 3, 2.5 + rnd() * 2, 'brk', rnd() * 6)]);
    const i = DOG_KEYS.indexOf(k); return S(BEDS[i][0], BEDS[i][1], 'jeff', i * 1.3, 'lie');
  }
  if (k === 'darrin') return pickOf(DARRIN_SPOTS.filter(s => s !== a.at));
  if (k === 'josh') return pickOf([SP.coffee, SP.brkSit2, SP.jeffChat, SP.front, SP.shopVisit, SP.yardWalk, SP.cooler].filter(s => s !== a.at));
  if (k === 'jeff') return a.at.room === 'jeff' ? pickOf([SP.yardWalk, SP.shopVisit, SP.tickets, SP.coffee, SP.frontChat]) : seat('jeff', 'sit');
  const home = seat(k), atHome = Math.abs(a.at.x - SEATS[k].x) < 0.1 && Math.abs(a.at.z - SEATS[k].z) < 0.1;
  if (atHome && rnd() < 0.35) return pickOf([SP.coffee, SP.fridge, SP.tickets, SP.cooler, SP.jeffChat, SP.meet1]);
  return home;
}

/* ======================= the day, from the snapshot ======================= */
const BOOKER_KEY = {kelly: 'kelly', rachel: 'rachel', sam: 'sam', barb: 'barb', barbara: 'barb', jake: 'jake', josh: 'josh'};
const SVC_SHORT = {'Bin Rental': 'bin rental', 'Junk Removal': 'junk removal', 'Junk Quote': 'junk quote', 'Furniture Pickup': 'furniture pickup', 'Furniture Delivery': 'furniture delivery', 'Extra Jobs': 'extra job'};
function needsEmail(j){ return j.status !== 'Cancelled' && !(j.email_sent || j.email_confirmed || j.no_email); }
function vehicleKind(name){ name = String(name || ''); if (/van/i.test(name)) return 'van'; if (/^hino/i.test(name)) return 'truck'; return 'pickup'; }
function vehicleName(name){ name = String(name || '').trim();
  if (/furniture bank/i.test(name)) return 'FB Van'; if (/mercedes/i.test(name)) return 'Merc Van'; if (/silverado/i.test(name)) return 'Chevy';
  if (/L7/i.test(name)) return 'L7'; const hy = name.match(/^hino\s+\d\d(\d\d)$/i); if (hy) return 'Hino ' + hy[1];
  return name.replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 10); }
const BADGE_DEFS = ['early', 'ten', 'big', 'phone', 'sweep', 'nodriver', 'inbox', 'quotes'];
let M_ = null;   // this showing's model
function buildModel(s){
  const m = {now: s.now, dayStart: s.dayStart, counts: s.counts, bins: s.bins};
  const geo = {};
  s.notifs.forEach(n => { const t = Date.parse(n.created_at), r = geo[n.job_id] || (geo[n.job_id] = {any: Infinity, left: Infinity}); r.any = Math.min(r.any, t); if (n.status === 'pickedup') r.left = Math.min(r.left, t); });
  m.stops = s.stops.map((e, i) => {
    const kind = e.kind || 'other', r = geo[e.jobId]; let doneAt = null;
    if (e.done && r){ const t = kind === 'pick' ? r.left : r.any; doneAt = isFinite(t) ? t : null; }
    return {i, jobId: e.jobId, kind, service: e.service, town: String(e.town || '').trim(), size: +e.size || null, hasDriver: !!e.hasDriver, done: !!e.done, doneAt};
  });
  // one block per town with a bin out on rental or a stop today, the busiest first
  const towns = {}, order = [];
  const townOf = name => { const nm = String(name || '').trim() || 'No town', k = nm.toLowerCase(); if (!towns[k]){ towns[k] = {key: k, name: nm, out: [], stops: []}; order.push(towns[k]); } return towns[k]; };
  (s.outBins || []).forEach(b => townOf(b.city).out.push(+b.size || 14));
  m.stops.forEach(st => { const T = townOf(st.town); T.stops.push(st); st.townObj = T; });
  // the bins out now already include today's finished drops and the pickups still to come: their own lots carry those instead
  order.forEach(T => T.stops.forEach(st => { if ((st.kind === 'drop' && st.done) || (st.kind === 'pick' && !st.done)){ const j = T.out.indexOf(st.size || 14); T.out.splice(j >= 0 ? j : 0, T.out.length ? 1 : 0); } }));
  order.sort((a, b) => (b.out.length + b.stops.length) - (a.out.length + a.stops.length) || a.name.localeCompare(b.name));
  m.towns = order;
  // vehicles: who drives each, in their crew colour; hook-lifts get the yard bays, the rest the lot
  const byJob = {}; m.stops.forEach(st => (byJob[st.jobId] = byJob[st.jobId] || []).push(st));
  const trucks = s.trucks.map(t => ({id: t.id, driver: t.driver || null, label: t.driver || vehicleName(t.name) || 'Truck', kind: vehicleKind(t.name),
    color: (t.driver && s.crewColor[t.driver]) || '#9aa3ad', state: t.state, visits: []}));
  const byId = {}; trucks.forEach(T => byId[T.id] = T);
  const used = {};
  s.visits.slice().sort((a, b) => Date.parse(a.entered_at) - Date.parse(b.entered_at)).forEach(v => {
    const T = byId[v.device_id]; if (!T) return;
    const legs = byJob[v.job_id] || [], u = used[v.job_id] || 0, st = legs[Math.min(u, legs.length - 1)] || null; used[v.job_id] = u + 1;
    T.visits.push({tin: Date.parse(v.entered_at), tout: v.exited_at ? Date.parse(v.exited_at) : null, inside: !!v.inside && !v.exited_at, stop: st});
  });
  m.trucks = trucks.sort((a, b) => (a.kind === 'truck' ? 0 : 1) - (b.kind === 'truck' ? 0 : 1) || (b.visits.length ? 1 : 0) - (a.visits.length ? 1 : 0) || a.label.localeCompare(b.label)).slice(0, 11);
  m.entered = s.entered.map(j => ({t: Date.parse(j.created_at), service: j.service, city: j.city || '', by: String(j.created_by || '').trim()})).sort((a, b) => a.t - b.t);
  m.emails = s.entered.filter(needsEmail).length;
  m.noDriver = m.stops.filter(st => (st.kind === 'drop' || st.kind === 'pick') && !st.hasDriver).length;
  // team badges, the same rules as the pixel screen (the board shows how many)
  const doneT = m.stops.filter(st => st.doneAt != null).map(st => st.doneAt).sort((a, b) => a - b), binStops = m.stops.filter(st => st.kind === 'drop' || st.kind === 'pick');
  const e = {};
  if (doneT.length && doneT[0] < s.dayStart + (8 * 60 + 45) * MIN) e.early = 1;
  if (doneT.length >= 10 && doneT[9] < s.dayStart + 12 * 60 * MIN) e.ten = 1;
  if (doneT.length >= 15) e.big = 1;
  if (m.entered.length >= 10) e.phone = 1;
  if (binStops.length && binStops.every(st => st.done)) e.sweep = 1;
  if (m.stops.length && !m.noDriver) e.nodriver = 1;
  if (m.entered.length && !m.emails) e.inbox = 1;
  if (!s.counts.quotesDue) e.quotes = 1;
  m.badges = BADGE_DEFS.filter(b => e[b]).length;
  m.start = Math.min(s.now, s.dayStart + 7 * 60 * MIN);
  return m;
}

/* ======================= today's layer: bays, yard bins, the road and the towns ======================= */
const ROAD_Z = -20.8, ROAD_W = 6, LOT_W = 5.0, LOT_D = 9.6, ST_W = 6, BLOCK_W = 2 * LOT_D + ST_W, COL0 = 66, HOUSE_S = 0.55, ROWS_PER_ST = 10;
const BAY_Z = -27.6, LANE_Z = ROAD_Z, BAY_W = 5.8;
const LAWN = 0x7d9f68, PAD = 0xcfc9bc, STREET = 0x41474d;
let DAY = null, daySig = '', roadEnd = 120;
function freeDay(){
  if (!DAY) return;
  scene.remove(DAY.group);
  DAY.track.geos.forEach(g => g.dispose()); DAY.track.mats.forEach(m => m.dispose()); DAY.track.texs.forEach(t => t.dispose());
  for (const k in floorLabels) if (DAY.labels.indexOf(k) >= 0) delete floorLabels[k];
  DAY = null;
}
function buildDay(m){
  const group = new THREE.Group(); scene.add(group);
  const track = {geos: [], mats: [], texs: []}, labelsBefore = Object.keys(floorLabels);
  TRACK = track;
  const k = new Kit(), hk = new Kit(), pk = new Kit(), staticBins = new Kit(), paint = new Kit();
  // bays for the hook-lifts across the back of the yard; pickups and vans park beside them
  const hooks = m.trucks.filter(T => T.kind === 'truck').slice(0, 5), others = m.trucks.filter(T => T.kind !== 'truck').slice(0, 6);
  hooks.forEach((T, i) => { const x = 3.7 + BAY_W / 2 + i * BAY_W; T.park = {x, z: BAY_Z, bay: true};
    for (const s of [-1, 1]) paint.box(VC, 0.12, 0.012, 10, x + s * (BAY_W / 2), 0.08, -27.5, {c: 0xe9e6dd});
    paint.box(VC, BAY_W, 0.014, 0.6, x, 0.082, -32.4, {c: new THREE.Color(T.color).getHex()});
    const lab = textPlane(5.2, 1.1, 512, (g, W, H) => { g.fillStyle = 'rgba(240,236,226,.85)'; g.font = '800 ' + Math.round(H * 0.7) + 'px ' + FONT_D; g.textAlign = 'center'; g.fillText(T.label.toUpperCase(), W / 2, H * 0.78); });
    lab.rotation.x = -PI / 2; lab.position.set(x, 0.1, -31.2); group.add(lab); });
  const lot0 = 3.7 + hooks.length * BAY_W + 1.6;
  others.forEach((T, i) => { T.park = {x: lot0 + 1.5 + i * 3.1, z: -27.4}; paint.box(VC, 0.1, 0.012, 6, lot0 + i * 3.1, 0.08, -27.4, {c: 0xe9e6dd}); });
  // bins ready in the yard, by size, in two rows with a walkway in the middle
  const ready = [];
  for (const sz of [20, 14, 7, 4]) for (let i = 0; i < ((m.bins.readyBySize || {})[sz] || 0); i++) ready.push(sz);
  let bx = 1.4, row = 0;
  for (const sz of ready){
    const inf = binGeos(sz, false);
    if (bx + inf.W > 28.4 && bx < 30.8) bx = 30.8;
    if (bx + inf.W > 55){ if (++row > 1) break; bx = 1.4; }
    const z = row ? -10.2 : -16.9;
    for (const [mat, geo] of inf.geos) staticBins.p(mat, geo, bx + inf.W / 2, 0.06, z - inf.L / 2, {ry: -PI / 2});
    bx += inf.W + 0.45;
  }
  // the main road out of the yard gate, then one block per town
  const blocks = [];
  // a town with one lot gets half a block: houses on one side of its street only
  m.towns.forEach((T, i) => { const n = T.out.length + T.stops.length, streets = Math.max(1, Math.ceil(n / (ROWS_PER_ST * 2))), oneSide = n === 1; blocks.push({T, n, streets, oneSide, w: oneSide ? ST_W + LOT_D : streets * BLOCK_W}); });
  let colX = COL0;
  for (let c = 0; c < blocks.length; c += 2){
    const pair = blocks.slice(c, c + 2), w = Math.max(...pair.map(b => b.w));
    pair.forEach((b, j) => { b.x0 = colX + (w - b.w) / 2; b.dir = j === 0 ? 1 : -1; });
    colX += w + 5;
  }
  roadEnd = colX + 4;
  k.box(VC, roadEnd - 56, 0.06, ROAD_W, (56 + roadEnd) / 2, 0.03, ROAD_Z, {c: STREET});
  for (let x = 60; x < roadEnd - 2; x += 4) k.box(VC, 2, 0.01, 0.16, x, 0.08, ROAD_Z, {c: 0xe8c55a});
  const HT = 'acghikpq'.split('').map(c => 'house_' + c);
  const rc = ['#8a6f62', '#5f6f7a', '#7d5a4f', '#6b7d63', '#9a7b5c'], wc = ['#f4efe3', '#efe6d2', '#e3eaee', '#f3e6dd', '#e9efe2'];
  const glass = (r, g, b) => b > 0.85 && b - r > 0.25;
  const pins = [];
  blocks.forEach((b, bi) => {
    const T = b.T, dir = b.dir, edge = ROAD_Z + dir * (ROAD_W / 2), z0 = edge + dir * 4;
    const rows = Math.min(ROWS_PER_ST, Math.ceil(b.n / (2 * b.streets))), depth = Math.max(2, rows) * LOT_W + 2, z1 = z0 + dir * depth;
    k.box(VC, b.w + 0.3, 0.1, depth + 0.3, b.x0 + b.w / 2, 0.05, (z0 + z1) / 2, {c: 0xf7f5f0}).box(VC, b.w, 0.04, depth, b.x0 + b.w / 2, 0.1, (z0 + z1) / 2, {c: LAWN});
    const order = [...T.stops.map(st => ({st})), ...T.out.map(size => ({size}))];
    T.label = 'town_' + T.key; floorLabel(T.label, b.x0 + 0.2, edge + dir * 2.0, Math.min(15, b.w + 4), false, group);
    T.anchor = {x: b.x0 + b.w / 2, z: edge + dir * 1.5};
    const stX = s => b.oneSide ? b.x0 + LOT_D + ST_W / 2 : b.x0 + BLOCK_W / 2 + s * BLOCK_W;
    for (let s = 0; s < b.streets; s++){
      const cx = stX(s);
      k.box(VC, ST_W, 0.06, Math.abs(z1 - edge), cx, 0.13, (edge + z1) / 2, {c: STREET});
    }
    order.forEach((it, j) => {
      const s = Math.floor(j / (ROWS_PER_ST * 2)), jj = j % (ROWS_PER_ST * 2), side = b.oneSide ? -1 : jj % 2 ? 1 : -1, r = b.oneSide ? 0 : jj >> 1;
      const cx = stX(s), z = z0 + dir * (1 + LOT_W / 2 + r * LOT_W);
      const tint = (bi * 3 + j) % 5, name = HT[(bi * 5 + j * 3) % HT.length], roof = new THREE.Color(rc[tint]), wall = new THREE.Color(wc[tint]);
      const recol = {key: 'roof' + tint, fn: (rr, gg, bb, y) => (y > 2.2 && gg > rr + 0.12 && gg > bb + 0.05) ? [roof.r, roof.g, roof.b] : (rr > 0.8 && gg > 0.8 && bb > 0.8) ? [wall.r * rr / 0.92, wall.g * gg / 0.92, wall.b * bb / 0.92] : null};
      const [walls, wins] = libCache[name + '|split' + tint] || (libCache[name + '|split' + tint] = splitGeo(libGeo(name, recol), glass));
      const bbx = libGeo(name).boundingBox, hd = (bbx.max.z - bbx.min.z) * HOUSE_S, hx = cx + side * (ST_W / 2 + LOT_D - hd / 2 - 0.3), ry = side < 0 ? PI / 2 : -PI / 2, sc = [HOUSE_S, HOUSE_S, HOUSE_S];
      hk.p(VC, walls, hx, 0.12, z, {ry, s: sc}).p(M.win, wins, hx, 0.12, z, {ry, s: sc});
      if (j % 3 === 1) pk.m(j % 2 ? 'pumpkinC' : 'pumpkin', hx - side * (hd / 2 + 0.5), 0.12, z + 1.4, {s: [1.2, 1.2, 1.2], ry: side * 1.2});
      const st = it.st, isBin = !st || st.kind === 'drop' || st.kind === 'pick';
      if (isBin) k.box(VC, 5.6, 0.04, 3.2, cx + side * (ST_W / 2 + 2.8), 0.16, z, {c: PAD});
      const size = st ? (st.size || 14) : it.size, inf = binGeos(size, false);
      const bx2 = side < 0 ? cx - ST_W / 2 - 0.5 - inf.L : cx + ST_W / 2 + 0.5 + inf.L, bry = side < 0 ? 0 : PI;
      if (st){
        st.lot = {cx, dir, z, edge, px: cx + side * 1.4, binX: bx2 + (side < 0 ? inf.L / 2 : -inf.L / 2)};
        if (isBin){ const g = buildBin(size, st.kind === 'pick'); g.position.set(bx2, 0.18, z); g.rotation.y = bry; g.traverse(o => { if (o.isMesh) shadowy(o, true, true); }); group.add(g); st.bin = g; }
        pins.push({st, x: cx + side * (ST_W / 2 + 5.4), z: z - dir * 1.2});
      } else for (const [mat, geo] of binGeos(size, j % 2 === 0).geos) staticBins.p(mat, geo, bx2, 0.18, z, {ry: bry});
    });
  });
  // stop pins: one mesh each so its colour can change (white still to do, gold now, red needs a driver)
  const postGeo = CYL(0.05, 2.2, 6), ballGeo = sph(0.36, 14, 10);
  pins.forEach(p => { const mat = lam(0xf4efe3); track.mats.push(mat); const g = new THREE.Group(); const post = new THREE.Mesh(postGeo, M.metal2); post.position.y = 1.1; const ball = new THREE.Mesh(ballGeo, mat); ball.position.y = 2.4;
    g.add(post, ball); g.position.set(p.x, 0.13, p.z); group.add(g); p.st.pin = {g, mat, ball}; });
  addKit(k, false, true, group); addKit(paint, false, true, group); addKit(staticBins, true, true, group);
  const hg = addKit(hk, true, true, group);
  for (const c of hg.children) if (c.material === VC){ const sn = new THREE.Mesh(snowCap(c.geometry, 1.4, 0.05), M.snow); track.geos.push(sn.geometry); sn.userData.snow = true; group.add(sn); }
  const pg = addKit(pk, true, true, group); pg.userData.halloween = true;
  TRACK = null;
  return {group, track, labels: Object.keys(floorLabels).filter(x => labelsBefore.indexOf(x) < 0), pg};
}
function daySignature(m){
  return JSON.stringify([m.trucks.map(T => [T.id, T.kind, T.label, T.color]), m.towns.map(T => [T.name, T.out, T.stops.map(st => [st.jobId, st.kind, st.size])]), m.bins.readyBySize]);
}

/* ======================= vehicles ======================= */
const vehicles = {};   // by vehicle id, kept between showings
function makeVehicle(T){
  let v;
  if (T.kind === 'truck') v = makeTruck(T.color);
  else {
    const holder = new THREE.Group(), inner = new THREE.Group(); inner.rotation.y = PI / 2; holder.add(inner);
    const k = new Kit();
    if (T.kind === 'van'){ k.box(VC, 2.0, 2.2, 5.4, 0, 1.45, -0.3, {c: 0xf3f2ee}).box(VC, 1.9, 1.0, 1.2, 0, 0.95, 2.9, {c: 0xf3f2ee}).box(VC, 1.7, 0.6, 0.06, 0, 1.6, 2.4, {c: 0x1c2731});
      k.box(VC, 2.02, 0.25, 5.4, 0, 1.0, -0.3, {c: new THREE.Color(T.color).getHex()});
      for (const [x, z] of [[-0.95, 2.4], [0.95, 2.4], [-0.95, -2.0], [0.95, -2.0]]) k.cyl(VC, 0.38, 0.28, x, 0.38, z, 'x', 12, {c: 0x18181a}); }
    else k.m('pickup', 0, 0, 0);
    const g = k.group(); g.traverse(o => { if (o.isMesh) shadowy(o, true, true); }); inner.add(g); shadowPlane(2.6, 6, false, inner);
    v = {holder, kind: T.kind};
  }
  v.holder.traverse(o => { if (o.isMesh && o.material !== SH_RECT && o.material !== SH_ROUND) shadowy(o, true, true); });
  v.holder.rotation.y = -PI / 2; scene.add(v.holder);
  const key = String(T.driver || '').toLowerCase();
  v.drv = makeChibi(Object.assign({shirt: new THREE.Color(T.color).getHex()}, P[key] || {hair: 0x4a3020})); v.drv.g.visible = false; scene.add(v.drv.g);
  v.ph = rnd() * 6; return v;
}
// where a vehicle is at time t, from its GPS visits: yard, at a stop, driving between, or out on the road
function truckAt(T, t){
  const v = T.visits; let i;
  if (t >= M_.now){
    for (i = 0; i < v.length; i++) if (v[i].inside) return {mode: 'stop', stop: v[i].stop};
    if (T.state === 'yard') return {mode: 'yard'};
    return {mode: 'road', near: v.length ? v[v.length - 1].stop : null};
  }
  for (i = 0; i < v.length; i++){ const a = v[i], end = a.tout != null ? a.tout : (a.inside ? Infinity : a.tin + 15 * MIN); if (t >= a.tin && t < end) return {mode: 'stop', stop: a.stop, visit: a}; }
  let prev = null, next = null;
  for (i = 0; i < v.length; i++){ const e2 = v[i].tout != null ? v[i].tout : v[i].tin + 15 * MIN; if (e2 <= t) prev = v[i]; else if (v[i].tin > t){ next = v[i]; break; } }
  if (!prev && !next) return T.state === 'yard' ? {mode: 'yard'} : {mode: 'road', near: null};
  if (!prev){ const leave = next.tin - 20 * MIN; if (t < leave) return {mode: 'yard'}; return {mode: 'drive', from: 'yard', to: next.stop, p: (t - leave) / (next.tin - leave)}; }
  const pend = prev.tout != null ? prev.tout : prev.tin + 15 * MIN;
  if (next) return {mode: 'drive', from: prev.stop, to: next.stop, p: (t - pend) / (next.tin - pend)};
  if (T.state === 'yard'){ const arr = pend + 20 * MIN; if (t >= arr) return {mode: 'yard'}; return {mode: 'drive', from: prev.stop, to: 'yard', p: (t - pend) / (arr - pend)}; }
  return {mode: 'road', near: prev.stop};
}
function chainFor(T, place){
  if (place === 'yard'){ const P2 = T.park; return [[58, ROAD_Z], [P2.x + 4, LANE_Z], [P2.x, LANE_Z + 0.6], [P2.x, P2.z]]; }
  if (!place || !place.lot) return [[roadEnd, ROAD_Z]];   // a visit to a job that isn't on today's list
  const L = place.lot; return [[L.cx, ROAD_Z], [L.px, L.edge + L.dir * 2.5], [L.px, L.z]];
}
function pathPoint(pts, k){
  const seg = []; let tot = 0; for (let i = 1; i < pts.length; i++){ const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); tot += l; }
  let d = k * tot; for (let i = 0; i < seg.length; i++){ if (d <= seg[i] || i === seg.length - 1){ const u = seg[i] ? clamp(d / seg[i], 0, 1) : 0, a = pts[i], b = pts[i + 1]; return {x: lerp(a[0], b[0], u), z: lerp(a[1], b[1], u), h: Math.atan2(b[0] - a[0], b[1] - a[1]), i}; } d -= seg[i]; }
  return {x: pts[0][0], z: pts[0][1], h: 0, i: 0};
}
function stopDone(st, t){ return st.doneAt != null ? t >= st.doneAt : (st.done && t >= M_.now); }
function poseOf(T, idx, t, nowS){
  const s = truckAt(T, t), P2 = T.park;
  if (s.mode === 'yard') return {x: P2.x, z: P2.z, h: 0, yard: true, s};
  if (s.mode === 'stop' && s.stop && s.stop.lot){ const L = s.stop.lot, st = s.stop, before = !stopDone(st, t);
    const carry = T.kind !== 'truck' ? null : st.kind === 'drop' ? (before ? (st.size || 14) : null) : st.kind === 'pick' ? (before ? null : 'L' + (st.size || 14)) : null;
    return {x: L.px, z: L.z, h: L.dir > 0 ? 0 : PI, carry, s}; }
  if (s.mode === 'drive'){
    const pts = [...chainFor(T, s.from).slice().reverse(), ...chainFor(T, s.to)], q = pathPoint(pts, clamp(s.p, 0, 1)), rev = s.to === 'yard' && q.i === pts.length - 2;
    const fromSt = s.from !== 'yard' ? s.from : null, toSt = s.to !== 'yard' ? s.to : null;
    const carry = T.kind !== 'truck' ? null : fromSt && fromSt.kind === 'pick' ? 'L' + (fromSt.size || 14) : toSt && toSt.kind === 'drop' ? (toSt.size || 14) : null;
    return {x: q.x, z: q.z, h: q.h + (rev ? PI : 0), carry, s};
  }
  // out on the road, no stop to show: up and down the main road, each vehicle its own way round
  const len = roadEnd - 62, u = ((nowS * 6 / (2 * len)) + idx * 0.29) % 1, back = u > 0.5, x = 62 + (back ? (1 - u) * 2 : u * 2) * len;
  return {x, z: ROAD_Z + (back ? -1.4 : 1.4), h: back ? -PI / 2 : PI / 2, s};
}
function statusOf(T, s, t){
  const town = st => st && st.town ? st.town : '';
  const done = T.visits.filter(v => v.tout != null && v.tout <= t).length, prog = done ? ` · ${done} done today` : '';
  if (s.mode === 'yard') return {where: T.kind === 'truck' ? 'In the yard' : 'Parked', what: done ? `Back · ${done} done today` : 'In the yard'};
  if (s.mode === 'stop'){ const st = s.stop; const what = !st ? 'At a stop' : st.kind === 'drop' ? 'Dropping off a bin' : st.kind === 'pick' ? 'Picking up a bin' : (SVC_SHORT[st.service] || 'A job').replace(/^./, c => c.toUpperCase()); return {where: town(st) || 'At a stop', what: what + prog}; }
  if (s.mode === 'drive') return {where: 'On the road', what: (s.to === 'yard' ? 'Heading back to the yard' : 'Driving to ' + (town(s.to) || 'a stop')) + prog};
  return {where: 'On the road', what: 'Out on the road' + prog};
}

/* ======================= floating tags ======================= */
const tagList = [];
function makeTag(color){ const el = document.createElement('div'); el.className = 'h3-tag'; el.style.setProperty('--c', color); el.innerHTML = '<div class="who"><i></i><b></b><em></em></div><div class="what"></div>'; tagsEl.appendChild(el);
  const t = {el, b: el.querySelector('b'), em: el.querySelector('em'), what: el.querySelector('.what'), txt: '', w: 0, h: 0}; tagList.push(t); return t; }
function setTag(t, name, where, what, cls){ const k = name + where + what + (cls || ''); if (t.txt === k) return; t.txt = k; t.b.textContent = name; t.em.textContent = where; t.em.className = /road|Parked|In at/.test(where) ? 'off' : ''; t.what.textContent = what; t.el.className = 'h3-tag' + (cls ? ' ' + cls : ''); t.w = t.el.offsetWidth; t.h = t.el.offsetHeight; }
function dropTag(t){ t.el.remove(); const i = tagList.indexOf(t); if (i >= 0) tagList.splice(i, 1); }
const _v = new V3();
function placeTags(list){
  const cw = canvas.clientWidth || 1920, ch = canvas.clientHeight || 1080, live = [];
  for (const [t, x, y, z] of list){ _v.set(x, y, z).project(camera); const px = (_v.x + 1) / 2 * cw, py = (1 - _v.y) / 2 * ch;
    if (_v.z >= 1 || px < -100 || px > cw + 100 || py < ch * 0.1 || py > ch + 40){ t.el.hidden = true; continue; } t.el.hidden = false; live.push({t, x: px, y: py}); }
  for (const t of tagList) if (!list.some(l => l[0] === t)) t.el.hidden = true;
  live.sort((a, b) => b.y - a.y);
  const placed = [], sc = clamp(50 / cam.dist, 0.66, 1) * cw / 1920;
  for (const L of live){
    const w = (L.t.w || 200) * sc, h = ((L.t.h || 56) + 8) * sc; let x = L.x - w / 2, y = L.y - h;
    const hits = (cx, cy) => placed.find(q => cx < q.x + q.w + 4 && cx + w + 4 > q.x && cy < q.y + q.h && cy + h > q.y);
    const free = [[x, y], [x - w * 0.55, y], [x + w * 0.55, y], [x, y - h * 0.5]].find(([cx, cy]) => !hits(cx, cy));
    if (free){ x = free[0]; y = free[1]; } else for (let pass = 0; pass < 8; pass++){ const q = hits(x, y); if (!q) break; y = q.y - h - 2; }
    placed.push({x, y, w, h}); L.t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
  }
}

/* ======================= camera: holds on HQ, then glides over to the towns (Jake, 2026-11-09) ======================= */
// HQ zoomed in on the office and the bin yard (Jake, 2026-11-09); the shop sits at the right edge
const VIEWS = {hq: {x: 22, z: -6.5, dist: 86, pitch: 0.88, yaw: 0.42}, towns: {x: 120, z: -20, dist: 150, pitch: 0.9, yaw: 0.25}};
const AUTO = [['hq', 58000], ['towns', 26000]];
const cam = Object.assign({}, VIEWS.hq); let camTo = VIEWS.hq, autoAt = 0, autoIx = 0;
function placeCamera(){ const cp = Math.cos(cam.pitch); camera.position.set(cam.x + Math.sin(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, cam.z + Math.cos(cam.yaw) * cp * cam.dist); camera.lookAt(cam.x, 0, cam.z); }

/* ======================= surprises (decoration) and real bookings ======================= */
let SUR = null, banner;
const SUR_DEFS = {
  squirrel: {title: 'The dogs spot a squirrel in the yard', dur: 12, start(s){
      s.sq = new THREE.Group(); const k = new Kit(); k.box(VC, 0.16, 0.16, 0.34, 0, 0.12, 0, {c: 0x8a5a3c}).p(VC, sph(0.1, 8, 6), 0, 0.22, 0.2, {c: 0x8a5a3c}).p(VC, sph(0.16, 8, 6), 0, 0.3, -0.24, {c: 0x9a6a48, s: [0.7, 1.4, 0.8]});
      s.geo = merge(k.L.get(VC)); s.sq.add(new THREE.Mesh(s.geo, VC)); scene.add(s.sq);
      s.dogs = DOG_KEYS.map(d => { actors[d].hidden = true; const o = makeDog(d); scene.add(o.g); return o; }); },
    tick(s, p, t){ const x = lerp(-2, 60, p), z = LANE_Z + 1.4 + Math.sin(p * 14) * 0.5; s.sq.position.set(x, 0.06, z); s.sq.rotation.y = PI / 2;
      s.dogs.forEach((o, i) => { o.g.position.set(x - 2.4 - i * 1.5, 0.06, z + (i % 2 ? 0.7 : -0.7)); o.g.rotation.y = PI / 2; poseDog(o, 'walk', t + i); }); },
    end(s){ scene.remove(s.sq); s.geo.dispose(); s.dogs.forEach(o => { scene.remove(o.g); o.g.traverse(m => { if (m.isMesh) m.geometry.dispose(); }); }); DOG_KEYS.forEach(d => actors[d].hidden = false); }},
  geese: {title: 'The geese chase Darrin past the shop', dur: 13, start(s){
      actors.darrin.hidden = true; s.d = makeChibi(P.darrin); scene.add(s.d.g);
      s.geese = [0, 1, 2].map(() => { const k = new Kit(); k.p(VC, sph(0.28, 10, 8), 0, 0.42, 0, {c: 0xf3f1ea, s: [0.8, 0.8, 1.3]}).cyl(VC, 0.06, 0.5, 0, 0.75, 0.25, 'y', 6, {c: 0x2b2b2b, rx: 0.3}).p(VC, sph(0.09, 8, 6), 0, 1.0, 0.33, {c: 0x2b2b2b}).box(VC, 0.06, 0.05, 0.14, 0, 0.98, 0.45, {c: 0xe8a33a});
        const g = new THREE.Mesh(merge(k.L.get(VC)), VC); scene.add(g); return g; }); },
    tick(s, p, t){ const x = lerp(57.5, 26, p), z = 20.4; s.d.g.position.set(x, 0.05, z); s.d.g.rotation.y = -PI / 2; poseChibi(s.d, 'run', t, 0);
      s.geese.forEach((g, i) => { g.position.set(x + 1.6 + i * 0.9, 0.05 + Math.abs(Math.sin(t * 9 + i)) * 0.08, z + (i - 1) * 0.6); g.rotation.y = -PI / 2; }); },
    end(s){ scene.remove(s.d.g); s.d.g.traverse(m => { if (m.isMesh) m.geometry.dispose(); }); s.geese.forEach(g => { scene.remove(g); g.geometry.dispose(); }); actors.darrin.hidden = false; }},
  // a real booking: whoever entered it gets up and cheers; the banner says what it was
  booking: {dur: 7, start(s){
      const a = actors[s.who]; if (a && !a.hidden){ a.locked = true; s.prev = a.state; a.state = 'cheer'; s.a = a; }
      const n = 140, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), cs = [[1, .3, .3], [1, .82, .3], [.35, .8, 1], [.5, .9, .5]];
      s.v = []; for (let i = 0; i < n; i++){ col.set(cs[i % 4], i * 3); s.v.push([(rnd() - 0.5) * 3, 3 + rnd() * 3, (rnd() - 0.5) * 3]); }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      s.pts = new THREE.Points(geo, new THREE.PointsMaterial({size: 0.14, vertexColors: true})); scene.add(s.pts);
      s.o = (s.a ? s.a.o.g.position : new V3(16.4, FL, 11)).clone(); },
    tick(s, p){ const pos = s.pts.geometry.attributes.position, tt = p * 8; for (let i = 0; i < s.v.length; i++){ const v = s.v[i]; pos.setXYZ(i, s.o.x + v[0] * tt * 0.35, Math.max(FL, s.o.y + 2 + v[1] * tt * 0.3 - 2.2 * tt * tt * 0.25), s.o.z + v[2] * tt * 0.35); } pos.needsUpdate = true; },
    end(s){ scene.remove(s.pts); s.pts.geometry.dispose(); s.pts.material.dispose(); if (s.a){ s.a.locked = false; s.a.state = s.prev; } }}
};
function startSurprise(key, nowS, extra){ if (SUR) endSurprise(); const def = SUR_DEFS[key]; SUR = {key, def, t0: nowS, s: Object.assign({}, extra)}; def.start(SUR.s); banner.textContent = SUR.s.title || def.title; banner.hidden = false; }
function endSurprise(){ SUR.def.end(SUR.s); SUR = null; banner.hidden = true; }
let bookSeen = null, BQ = [], bookNextAt = 0;
function queueBookings(){
  const fresh = bookSeen == null ? M_.entered.filter(e => e.t > M_.now - 30 * MIN).slice(-1) : M_.entered.filter(e => e.t > bookSeen);
  BQ = fresh.slice(-3); if (M_.entered.length) bookSeen = M_.entered[M_.entered.length - 1].t;
}

/* ======================= one showing ======================= */
let fixedQuality = false, raf = 0, showAt = 0, last = 0, TAGS = {}, quality = 1, shadowsOn = true, frames = 0, fpsT = 0, fps = 0, slow = 0, perf = {fps: 0, quality: 1, shadows: true, calls: 0};
let season = 'normal', wx = null, nextAmbient = 0;
function gameTime(nowMs){ const p = clamp((nowMs - showAt) / REPLAY_MS, 0, 1); return p < 1 ? lerp(M_.start, M_.now, p * p * (3 - 2 * p)) : M_.now + (nowMs - showAt - REPLAY_MS); }
function applyLook(nowMs){
  const d = new Date(gameTime(nowMs)), hour = d.getHours() + d.getMinutes() / 60, eve = hour >= 17 || hour < 7;
  const a = clamp((hour - 6) / 12, 0, 1) * PI, up = Math.sin(a);
  sun.position.copy(SUN_C).add(new V3(Math.cos(a) * 44, 20 + up * 50, 34));
  sun.color.setRGB(1, lerp(0.96, 0.78, 1 - up), lerp(0.88, 0.6, 1 - up));
  sun.intensity = eve ? 0.42 : lerp(0.42, 0.66, up); hemi.intensity = eve ? 0.66 : lerp(0.62, 0.8, up); hemi.color.set(eve ? 0xc9cfe6 : 0xfbf7ee);
  const bg = eve ? BG_EVE : BG_DAY; renderer.setClearColor(bg); scene.fog.color.copy(bg); groundMat.color.set(eve ? 0xb4bccb : 0xffffff);
  M.win.emissive.setHex(eve ? 0x8a6a2a : 0x000000);
  scene.fog.near = cam.dist + 40; scene.fog.far = cam.dist + 300;
}
function setRes(){ renderer.setPixelRatio(1); renderer.setSize(Math.round(1920 * quality), Math.round(1080 * quality), false); }
function selfCheck(nowMs){
  frames++; if (nowMs - fpsT < 2000) return;
  fps = frames * 1000 / (nowMs - fpsT); frames = 0; fpsT = nowMs;
  if (!fixedQuality && fps < 24 && ++slow >= 2){ slow = 0; if (shadowsOn){ shadowsOn = false; renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); } else if (quality > 0.55){ quality = Math.round((quality - 0.15) * 100) / 100; setRes(); } }
  perf = {fps: Math.round(fps), quality, shadows: shadowsOn, calls: renderer.info.render.calls};
}
const fmtClock = ms => { const d = new Date(ms), h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m; };
let lastHead = '';
function updateHead(t){
  const all = M_.stops.length, done = M_.stops.filter(st => stopDone(st, t)).length, booked = M_.entered.filter(e => e.t <= t).length;
  const out = M_.trucks.filter(T => truckAt(T, t).mode !== 'yard').length, d = new Date(t);
  const key = [done, all, booked, out, fmtClock(t)].join('|'); if (key === lastHead) return; lastHead = key;
  overlay.querySelector('[data-h="stops"]').textContent = done + '/' + all;
  overlay.querySelector('[data-h="booked"]').textContent = booked;
  overlay.querySelector('[data-h="tomorrow"]').textContent = M_.counts.tomorrow || 0;
  overlay.querySelector('[data-h="out"]').textContent = out + '/' + M_.trucks.length;
  overlay.querySelector('[data-h="bins"]').textContent = M_.counts.binsOut || 0;
  overlay.querySelector('[data-h="clock"]').innerHTML = fmtClock(t) + '<small>' + (d.getHours() >= 12 ? 'pm' : 'am') + ' · ' + d.toLocaleDateString('en-CA', {weekday: 'long'}) + '</small>';
  flip.userData.draw(done, all); tv.userData.draw(M_.counts.tomorrow, M_.counts.quotesDue);
  ticketWall.userData.draw(M_.entered.filter(e => e.t <= t).map(e => e.service));
  const bk = {}; M_.entered.forEach(e => { if (e.t <= t){ const k = BOOKER_KEY[e.by.toLowerCase()]; if (k) bk[k] = (bk[k] || 0) + 1; } }); M_.bookedBy = bk;
  setLabel('bookings', 'Bookings', booked + ' booked today');
  const rb = M_.bins.readyBySize || {}, parts = [20, 14, 7, 4].filter(s => rb[s]).map(s => rb[s] + ' × ' + s + ' yd');
  setLabel('yard', 'The yard', (M_.bins.ready || 0) + ' bins ready' + (parts.length ? ' · ' + parts.join(' · ') : ''));
  setLabel('shop', "Darrin's shop", (M_.bins.prep || 0) + ' bins being got ready · ' + (M_.bins.off || 0) + ' out of rotation');
  for (const T of M_.towns){ const n = T.out.length + T.stops.filter(st => st.bin && (st.kind === 'pick' ? !stopDone(st, t) : stopDone(st, t))).length, left = T.stops.filter(st => !stopDone(st, t)).length;
    setLabel(T.label, T.name, `${n} bin${n === 1 ? '' : 's'} out · ${left ? left + ' stop' + (left > 1 ? 's' : '') + ' left today' : 'no stops left today'}`); }
}
function frame(nowMs){
  raf = requestAnimationFrame(frame);
  const now = nowMs / 1000, dt = clamp((nowMs - last) / 1000, 0, 0.1); last = nowMs;
  const t = gameTime(nowMs), sinceShow = nowMs - showAt;
  // camera: HQ, then the towns, then back
  if (sinceShow - autoAt > AUTO[autoIx][1]){ autoAt = sinceShow; autoIx = (autoIx + 1) % AUTO.length; camTo = VIEWS[AUTO[autoIx][0]]; }
  const k = Math.min(1, dt * 0.7); for (const p of ['x', 'z', 'dist', 'pitch', 'yaw']) cam[p] += (camTo[p] - cam[p]) * k;
  placeCamera(); applyLook(nowMs);
  for (const key in actors){
    const a = actors[key];
    if (key === 'rachel'){ a.hidden = !rachelIn(); }
    if (!a.locked && !a.path.length && !a.hidden){ a.next -= dt; if (a.next <= 0){ const n = chooseNext(a); a.next = (a.dog ? 10 : 14) + rnd() * 18; if (n) goTo(a, n); } }
    if (key === 'winnie'){ a.o.g.visible = !a.hidden; continue; }
    stepActor(a, dt, now);
  }
  { const w = actors.winnie, j = actors.jeff.o.g; if (!w.hidden){ const wg = w.o.g, dx = j.position.x + 0.8 - wg.position.x, dz = j.position.z + 0.6 - wg.position.z, d = Math.hypot(dx, dz);
    if (d > 0.4){ const sp = Math.min(d, 3.2 * dt); wg.position.x += dx / d * sp; wg.position.z += dz / d * sp; wg.position.y = j.position.y; wg.rotation.y = Math.atan2(dx, dz); poseDog(w.o, 'walk', now); }
    else poseDog(w.o, actors.jeff.path.length ? 'walk' : (actors.jeff.state === 'sit' ? 'lie' : 'stand'), now); } }
  { const a = actors.darrin, on = !a.hidden && !a.path.length && a.state === 'weld'; sparks.visible = on;
    if (on){ const pos = sparkGeo.attributes.position, g = a.o.g.position, fx = g.x + Math.sin(a.o.g.rotation.y) * 0.75, fz = g.z + Math.cos(a.o.g.rotation.y) * 0.75;
      for (let i = 0; i < 60; i++){ const u = (now * 3 + i / 60) % 1; pos.setXYZ(i, fx + Math.sin(i * 7.3) * u * 0.6, g.y + 1.0 + u * 0.4 - u * u * 1.2, fz + Math.cos(i * 3.1) * u * 0.6); } pos.needsUpdate = true; } }
  // vehicles and their drivers
  const tagPlaces = [];
  M_.trucks.forEach((T, idx) => {
    const V = vehicles[T.id], q = poseOf(T, idx, t, now), st = statusOf(T, q.s, t);
    V.holder.position.set(q.x, q.yard ? 0.06 : 0.16, q.z);
    let dr = (q.h - PI / 2) - V.holder.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); V.holder.rotation.y += Math.abs(dr) > 2.4 ? dr : dr * 0.3;
    if (V.slot) setCargo(V, q.carry == null ? null : q.carry);
    const parked = q.yard && T.park.bay;
    V.drv.g.visible = parked && !!T.driver; if (V.drv.g.visible){ V.drv.g.position.set(T.park.x + 2.15, 0.06, T.park.z + 3.4); V.drv.g.rotation.y = -0.5; poseChibi(V.drv, 'stand', now, V.ph); }
    setTag(TAGS['v' + T.id], T.label, st.where, st.what);
    tagPlaces.push([TAGS['v' + T.id], parked && T.driver ? T.park.x + 2.15 : q.x, parked && T.driver ? 2.1 : (T.kind === 'truck' ? 4.3 : 2.8), parked && T.driver ? T.park.z + 3.4 : q.z]);
  });
  // stops: bins come and go as they're done, pins show what's left
  for (const st of M_.stops){
    const doneNow = stopDone(st, t), here = M_.trucks.some(T => { const s = truckAt(T, t); return s.mode === 'stop' && s.stop === st; });
    if (st.bin) st.bin.visible = st.kind === 'pick' ? !doneNow : doneNow;
    if (st.pin){ const need = (st.kind === 'drop' || st.kind === 'pick') && !st.hasDriver && !doneNow, c = need ? 0xef4444 : here ? 0xe8b34a : 0xf4efe3;
      st.pin.mat.color.setHex(c); st.pin.mat.emissive.setHex(need ? 0x4a0a0a : here ? 0x5a3a00 : 0); st.pin.g.visible = !doneNow; st.pin.ball.scale.setScalar(here ? 1 + Math.sin(now * 5) * 0.12 : 1); }
  }
  if (camTo === VIEWS.towns && Math.abs(cam.dist - VIEWS.towns.dist) < 25) for (const T of M_.towns){
    const n = T.out.length + T.stops.filter(st => st.bin && (st.kind === 'pick' ? !stopDone(st, t) : stopDone(st, t))).length, left = T.stops.filter(st => !stopDone(st, t)).length;
    setTag(TAGS['town_' + T.key], T.name, '', n + ' bin' + (n === 1 ? '' : 's') + ' out' + (left ? ' · ' + left + ' to do' : ''), 'town'); tagPlaces.push([TAGS['town_' + T.key], T.anchor.x, 0.5, T.anchor.z]); }
  for (const T of M_.towns){ const need = T.stops.filter(st => (st.kind === 'drop' || st.kind === 'pick') && !st.hasDriver && !stopDone(st, t)), tg = TAGS['need_' + T.key];
    if (need.length){ const L = need[0].lot; setTag(tg, 'Needs a driver', T.name, need.length > 1 ? need.length + ' bin stops' : (need[0].kind === 'drop' ? 'Bin drop-off' : 'Bin pick-up') + (need[0].size ? ' · ' + need[0].size + ' yd' : ''), 'quiet'); tagPlaces.push([tg, L.binX, 2.9, L.z]); } }
  // office people only get a tag the data backs: how many jobs they've entered today
  for (const k of ['kelly', 'rachel', 'sam', 'barb', 'jake', 'josh']){
    const a = actors[k], n = (M_.bookedBy || {})[k] || 0;
    if (k === 'rachel' && a.hidden){ setTag(TAGS.rachel, 'Rachel', 'In at 3 pm', 'Desk is free until then', 'quiet'); tagPlaces.push([TAGS.rachel, SEATS.rachel.x, FL + 1.25, SEATS.rachel.z]); continue; }
    if (!n || a.hidden) continue;
    const pop = SUR && SUR.key === 'booking' && SUR.s.who === k;
    setTag(TAGS[k], k[0].toUpperCase() + k.slice(1), ROOM_NAME[a.at.room] || '', n + ' booked today', pop ? 'pop' : '');
    const g = a.o.g.position; tagPlaces.push([TAGS[k], g.x, g.y + 1.9, g.z]);
  }
  placeTags(tagPlaces);
  updateHead(t);
  // seasons and weather
  if (SEAS.christmas.visible){ const on = Math.floor(now / 0.8) % 2; bulbsA.visible = !!on; bulbsB.visible = !on; }
  if (SEAS.halloween.visible){ ghost.position.y = 4 + Math.sin(now * 1.2) * 0.4; ghost.position.x = 40 + Math.sin(now * 0.3) * 6; ghost.rotation.y = Math.sin(now * 0.3) > 0 ? -PI / 2 : PI / 2; }
  if (SEAS.snowfall.visible){ const pp = flakeGeo.attributes.position; for (let i = 0; i < pp.count; i++){ let y = pp.getY(i) - dt * 1.6; if (y < 0) y += 26; pp.setY(i, y); } pp.needsUpdate = true; }
  if (SEAS.rain.visible){ const pp = rainGeo.attributes.position; for (let i = 0; i < pp.count; i += 2){ let y = pp.getY(i) - dt * 22; if (y < 0) y += 26; pp.setY(i, y); pp.setY(i + 1, y - 0.7); } pp.needsUpdate = true; }
  // after the replay: real bookings since last time, one at a time; otherwise a little surprise now and then
  if (sinceShow > REPLAY_MS + 800){
    if (!SUR && BQ.length && sinceShow > bookNextAt){ const e = BQ.shift(), who = BOOKER_KEY[e.by.toLowerCase()] || null, sv = SVC_SHORT[e.service] || 'job', nm = e.by && !/^system$/i.test(e.by) ? e.by[0].toUpperCase() + e.by.slice(1) : '';
      startSurprise('booking', now, {who, title: (nm ? nm + ' booked a ' : 'New ') + sv + (e.city ? ' · ' + e.city : '')}); bookNextAt = sinceShow + 9000; }
    else if (!SUR && !BQ.length && sinceShow > nextAmbient){ startSurprise(pickOf(['squirrel', 'geese']), now); nextAmbient = sinceShow + 9e9; }
  }
  if (SUR){ const p = (now - SUR.t0) / SUR.def.dur; if (SUR.def.tick) SUR.def.tick(SUR.s, clamp(p, 0, 1), now); if (p >= 1) endSurprise(); }
  renderer.render(scene, camera);
  selfCheck(nowMs);
}
function injectStyle(){
  const st = document.createElement('style');
  st.textContent = `
  .h3-over{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#f6f1e4}
  .h3-tag{position:absolute;left:0;top:0;transform-origin:0 0;background:rgba(20,24,22,.94);color:#fff;border-radius:13px;padding:7px 13px 9px;box-shadow:0 6px 18px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.09);white-space:nowrap}
  .h3-tag::after{content:"";position:absolute;left:50%;bottom:-7px;width:13px;height:13px;margin-left:-7px;background:#141816;transform:rotate(45deg);border-right:1px solid rgba(255,255,255,.09);border-bottom:1px solid rgba(255,255,255,.09)}
  .h3-tag .who{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;color:#a7b1aa}
  .h3-tag .who i{width:10px;height:10px;border-radius:50%;background:var(--c);flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.12)}
  .h3-tag .who b{font-weight:800;color:#fff}
  .h3-tag .who em{margin-left:auto;padding-left:14px;font-style:normal;font-size:13px;font-weight:700;color:#6fd49a}
  .h3-tag .who em.off{color:#a7b1aa}
  .h3-tag .what{font-weight:800;font-size:19px;margin-top:2px}
  .h3-tag.quiet{background:rgba(20,24,22,.72)} .h3-tag.quiet .what{color:#cdd3ce;font-weight:700}
  .h3-tag.pop{background:#7a4f0c} .h3-tag.pop::after{background:#7a4f0c}
  .h3-tag.town{background:rgba(23,64,42,.94)} .h3-tag.town::after{background:#17402a} .h3-tag.town .who i{display:none} .h3-tag.town .who b{font-size:20px;color:#f2c14e}
  .h3-hd{position:absolute;left:0;right:0;top:0;height:110px;display:flex;align-items:center;gap:18px;padding:0 40px;background:linear-gradient(rgba(14,18,16,.92),rgba(14,18,16,0))}
  .h3-logo{font-weight:900;font-size:42px;letter-spacing:.2px;color:#fff;line-height:1}
  .h3-logo span{color:#e8b34a}
  .h3-stats{margin-left:auto;display:flex;gap:10px}
  .h3-chip{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:6px 16px 8px;display:flex;flex-direction:column;min-width:104px}
  .h3-chip b{font-weight:900;font-size:32px;line-height:1.05;font-variant-numeric:tabular-nums}
  .h3-chip small{font-size:13px;font-weight:800;color:#a7b1aa;letter-spacing:.4px;text-transform:uppercase}
  .h3-clock{font-weight:900;font-size:50px;color:#fff;font-variant-numeric:tabular-nums;min-width:200px;text-align:right;line-height:1}
  .h3-clock small{display:block;font-size:15px;font-weight:800;color:#a7b1aa;letter-spacing:.5px;text-transform:uppercase;margin-top:3px}
  .h3-banner{position:absolute;left:50%;top:126px;transform:translateX(-50%);background:#e8b34a;color:#3b2a06;font-weight:900;font-size:32px;padding:9px 28px 8px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:nowrap}`;
  document.head.appendChild(st);
}

window.JJHQ = {
  /* opts: {canvas} - the board's own canvas; the 3D scene renders into it */
  mount: function(opts){
    if (!opts || !opts.canvas) throw new Error('JJHQ.mount needs a canvas');
    canvas = opts.canvas; fixedQuality = !!opts.fixedQuality; boot(); setRes();
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); console.error('HQ 3D: graphics context lost'); });
    injectStyle();
    const host = canvas.parentNode; host.style.position = 'relative';
    overlay = document.createElement('div'); overlay.className = 'h3-over';
    overlay.innerHTML = '<div class="h3-hd"><div class="h3-logo">Today at <span>HQ</span></div><div class="h3-stats">' +
      [['stops', 'Stops done'], ['booked', 'Booked today'], ['tomorrow', 'Tomorrow'], ['out', 'Trucks out'], ['bins', 'Bins out']].map(([k, l]) => `<div class="h3-chip"><b data-h="${k}">0</b><small>${l}</small></div>`).join('') +
      '</div><div class="h3-clock" data-h="clock"></div></div><div class="h3-tags"></div><div class="h3-banner" hidden></div>';
    host.appendChild(overlay); tagsEl = overlay.querySelector('.h3-tags'); banner = overlay.querySelector('.h3-banner');
    buildStatic(); buildCrew();
    for (const k of ['kelly', 'rachel', 'sam', 'barb', 'jake', 'josh']) TAGS[k] = makeTag(P[k].dot);
  },
  /* snap: the board's data for this showing (built in office-tv.html hqSnapshot) */
  show: function(snap){
    if (!renderer) throw new Error('JJHQ.show before JJHQ.mount');
    M_ = buildModel(snap);
    const sig = daySignature(M_);
    if (sig !== daySig){ freeDay(); DAY = buildDay(M_); daySig = sig; }
    else { // same layout: hand the new model the lots, bins and pins already built
      const old = DAY.model; M_.trucks.forEach(T => { const o = old.trucks.find(x => x.id === T.id); T.park = o.park; });
      M_.towns.forEach(T => { const o = old.towns.find(x => x.key === T.key); T.label = o.label; T.stops.forEach((st, i) => { const os = o.stops[i]; st.lot = os.lot; st.bin = os.bin; st.pin = os.pin; }); });
    }
    DAY.model = M_;
    M_.trucks = M_.trucks.filter(T => T.park);   // more vehicles than bays and lot spaces: the extras sit this one out
    for (const T of M_.trucks){ if (!vehicles[T.id]) vehicles[T.id] = makeVehicle(T); if (!TAGS['v' + T.id]) TAGS['v' + T.id] = makeTag(T.color); }
    for (const id in vehicles){ const on = M_.trucks.some(T => String(T.id) === id); vehicles[id].holder.visible = on; vehicles[id].drv.g.visible = false; }
    for (const T of M_.towns) if (!TAGS['need_' + T.key]) TAGS['need_' + T.key] = makeTag('#ef4444');
    for (const k in TAGS) if (k.startsWith('need_') && !M_.towns.some(T => 'need_' + T.key === k)){ dropTag(TAGS[k]); delete TAGS[k]; }
    VIEWS.towns = {x: (COL0 - 4 + roadEnd) / 2 - 14, z: ROAD_Z + 4, dist: clamp((roadEnd - COL0 + 8) * 1.12, 90, 360), pitch: 0.9, yaw: 0.2};
    for (const T of M_.towns) if (!TAGS['town_' + T.key]) TAGS['town_' + T.key] = makeTag('#e8b34a');
    for (const k in TAGS) if (k.startsWith('town_') && !M_.towns.some(T => 'town_' + T.key === k)){ dropTag(TAGS[k]); delete TAGS[k]; }
    season = seasonFor(new Date(snap.now)); wx = wxKind(snap.wx);
    const snowy = season === 'christmas' || season === 'winter' || wx === 'snow';
    SEAS.christmas.visible = season === 'christmas'; SEAS.halloween.visible = season === 'halloween'; DAY.pg.visible = season === 'halloween';
    SEAS.snow.visible = snowy; SEAS.snowfall.visible = wx === 'snow'; SEAS.rain.visible = wx === 'rain';
    DAY.group.traverse(o => { if (o.userData.snow) o.visible = snowy; });
    queueBookings(); bookNextAt = 0; nextAmbient = REPLAY_MS + 30000 + rnd() * 20000;
    if (SUR) endSurprise();
    lastHead = ''; for (const k in floorLabels) floorLabels[k].txt = '';
    Object.assign(cam, VIEWS.hq); camTo = VIEWS.hq; autoAt = 0; autoIx = 0;
    cancelAnimationFrame(raf);
    showAt = last = fpsT = performance.now(); frames = 0;
    if (document.hidden){ showAt -= REPLAY_MS; frame(performance.now()); cancelAnimationFrame(raf); return; }
    raf = requestAnimationFrame(frame);
  },
  hide: function(){ cancelAnimationFrame(raf); raf = 0; },
  badgeCount: function(){ return M_ ? M_.badges : 0; },
  /* jump to one of the views (for test screenshots) */
  view: function(name){ if (!VIEWS[name]) throw new Error('JJHQ.view: no view called ' + name); Object.assign(cam, VIEWS[name]); camTo = VIEWS[name]; autoIx = name === 'towns' ? 1 : 0; autoAt = performance.now() - showAt; },
  /* for the board's log: how the TV is coping */
  perf: function(){ return Object.assign({}, perf); }
};
})();
