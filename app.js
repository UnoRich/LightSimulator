import { createStage, lightTargets, MAX_DANCERS } from './stage3d.js?v=19';

/* =========================================================
   상수
   ========================================================= */
// 0~17: 워시 조명 (3줄 x 6), 18~25: 빔 상단 8대, 26~29: 빔 하단(바닥) 4대
const ROWS = 3, COLS = 6, N_WASH = ROWS * COLS;
const N_BEAM_TOP = 8, N_BEAM_FLOOR = 4, N = N_WASH + N_BEAM_TOP + N_BEAM_FLOOR;
const ROW_NAMES = ['뒷줄', '중간줄', '앞줄', '빔 상단', '빔 하단'];
const SWATCHES = [
  ['#ffffff', '화이트'], ['#ffd59a', '웜화이트'], ['#ff2a2a', '빨강'], ['#ff7a1a', '주황'],
  ['#ffd21a', '노랑'], ['#2aff6a', '초록'], ['#1ae0ff', '시안'], ['#2a5bff', '파랑'],
  ['#8a2aff', '보라'], ['#ff2ad0', '핑크'],
];
const DEFAULT_FADE = 0.5;

const DEFAULT_NAME = '새 공연';

/* =========================================================
   유틸
   ========================================================= */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isBeam = i => i >= N_WASH;
const rowOf = i => i < N_WASH ? Math.floor(i / COLS) : i < N_WASH + N_BEAM_TOP ? 3 : 4;
const colOf = i => i < N_WASH ? i % COLS : i < N_WASH + N_BEAM_TOP ? i - N_WASH : i - N_WASH - N_BEAM_TOP;
const WASH_IDX = [...Array(N_WASH).keys()];
const BEAM_IDX = [...Array(N - N_WASH).keys()].map(i => i + N_WASH);

/* ---------- 인원 배치 (무대 평면 좌표, 단위 m) ----------
   x: 왼쪽(-)=SR(상수) ~ 오른쪽(+)=SL(하수), z: 뒤(-)=US ~ 앞(+)=DS(객석 쪽) */
const STAGE_X = 6.2, STAGE_Z_BACK = -4.1, STAGE_Z_FRONT = 4.2;
const DEFAULT_DANCERS = 7;
const OLD_DANCERS = [[0, -0.6], [-1.6, 0.4], [1.6, 0.4], [-3.2, 1.3], [3.2, 1.3], [-1.6, -1.8], [1.6, -1.8]];
const snap = v => Math.round(v * 4) / 4;
const clampPos = ([x, z]) => [snap(clamp(x, -STAGE_X, STAGE_X)), snap(clamp(z, STAGE_Z_BACK, STAGE_Z_FRONT))];
// 대형: n명의 위치 배열을 만듦
const spread = (n, w) => Array.from({ length: n }, (_, i) => n === 1 ? 0 : -w / 2 + w * i / (n - 1));
const FORMATIONS = {
  line: { name: '한 줄', make: (n, z = 0.6) => spread(n, Math.min(11, (n - 1) * 1.1)).map(x => [x, z]) },
  rows: { name: '두 줄', make: n => {
    const f = Math.ceil(n / 2), b = n - f, w = Math.min(10, (f - 1) * 1.4);
    return [...spread(f, w).map(x => [x, 1.2]), ...spread(b, Math.max(0, w - 1.4)).map(x => [x, -0.4])];
  } },
  v: { name: 'V자', make: (n, z0 = 2.2) => Array.from({ length: n }, (_, i) => {
    const k = Math.ceil(i / 2), s = i % 2 ? -1 : 1;
    return [s * k * 1.0, z0 - k * 0.75];
  }) },
  invV: { name: '역V자', make: n => Array.from({ length: n }, (_, i) => {
    const k = Math.ceil(i / 2), s = i % 2 ? -1 : 1;
    return [s * k * 1.0, -2.2 + k * 0.75];
  }) },
  tri: { name: '삼각형', make: (n, z0 = 2.4) => {
    const out = [];
    for (let r = 0; out.length < n; r++) {
      const m = Math.min(r + 1, n - out.length);
      spread(m, r * 1.2).forEach(x => out.push([x, z0 - r * 1.1]));
    }
    return out;
  } },
  circle: { name: '원형', make: (n, cx = 0, cz = 0) => {
    const r = Math.max(1.4, n * 0.3);
    return Array.from({ length: n }, (_, i) => [cx + r * Math.sin(i / n * Math.PI * 2), cz - r * Math.cos(i / n * Math.PI * 2) * 0.8]);
  } },
  clump: { name: '모이기', make: (n, cx = 0, cz = 0.3) => {
    const out = [[cx, cz]];
    for (let ring = 1; out.length < n; ring++) {
      const m = ring * 6;
      for (let k = 0; k < m && out.length < n; k++) out.push([cx + ring * 0.85 * Math.cos(k / m * Math.PI * 2), cz + ring * 0.8 * Math.sin(k / m * Math.PI * 2)]);
    }
    return out;
  } },
};
// 20칸을 항상 채운 위치 배열 (보이는 건 앞쪽 count명)
function fullPos(first) {
  const base = FORMATIONS.rows.make(MAX_DANCERS);
  return Array.from({ length: MAX_DANCERS }, (_, i) => clampPos(first[i] || base[i]));
}
const DEFAULT_POS = fullPos(OLD_DANCERS);
function normalizePos(pos) {
  const ok = p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]);
  return fullPos(Array.isArray(pos) ? pos.map((p, i) => ok(p) ? [+p[0], +p[1]] : DEFAULT_POS[i]) : DEFAULT_POS);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fmt(t) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
function parseTime(str) {
  const m = String(str).trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return (m[1] ? +m[1] * 60 : 0) + +m[2];
}
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
// 밝기 가중 평균 색 + 평균 밝기
function avgLight(lights) {
  let r = 0, g = 0, b = 0, w = 0;
  for (const l of lights) {
    if (!l.b) continue;
    const [lr, lg, lb] = hexToRgb(l.c);
    r += lr * l.b; g += lg * l.b; b += lb * l.b; w += l.b;
  }
  if (!w) return { c: '#000000', b: 0 };
  return { c: rgbToHex(r / w, g / w, b / w), b: w / lights.length };
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}

/* =========================================================
   조명 데이터 / 프리셋
   ========================================================= */
// c: 색, b: 밝기(0~100), p: 프리즘, f: 센터 모으기 (p/f는 빔 조명만 의미 있음)
const L = (c, b, p = false, f = false) => ({ c, b, p, f });
// 워시 조명만 c/b로 채우고 빔은 꺼둠
const fill = (c, b) => Array.from({ length: N }, (_, i) => L(c, isBeam(i) ? 0 : b));
const cloneLights = ls => ls.map(l => L(l.c, l.b, !!l.p, !!l.f));
function lightsWhere(pred, c = '#ffffff', b = 100) {
  return Array.from({ length: N }, (_, i) => !isBeam(i) && pred(rowOf(i), colOf(i)) ? L(c, b) : L(c, 0));
}
// 빔 조명만 정의 (워시는 꺼둠). pred(top, k): top=상단 여부, k=그 줄에서 몇 번째
function beamsWhere(pred, c = '#ffffff', b = 100, p = false, f = false) {
  return Array.from({ length: N }, (_, i) => isBeam(i) && pred(rowOf(i) === 3, colOf(i)) ? L(c, b, p, f) : L(c, 0));
}

const BUILTIN_PRESETS = [
  { name: '밝기 100', make: () => fill('#ffffff', 100) },
  { name: '밝기 50', make: () => fill('#ffffff', 50) },
  { name: '밝기 10', make: () => fill('#ffffff', 10) },
  { name: '암전', make: () => fill('#ffffff', 0) },
  { name: '왼쪽 스팟', make: () => lightsWhere((r, c) => r > 0 && c < 2) },
  { name: '가운데 스팟', make: () => lightsWhere((r, c) => r > 0 && (c === 2 || c === 3)) },
  { name: '오른쪽 스팟', make: () => lightsWhere((r, c) => r > 0 && c > 3) },
  { name: '센터 핀 (솔로)', make: () => lightsWhere((r, c) => r === 1 && (c === 2 || c === 3)) },
  { name: '파란 분위기', make: () => fill('#2a5bff', 70) },
  { name: '빨간 분위기', make: () => fill('#ff2a2a', 70) },
  { name: '보라 분위기', make: () => fill('#8a2aff', 70) },
  { name: '따뜻한 분위기', make: () => fill('#ffb050', 70) },
  { name: '실루엣 (뒷줄만)', make: () => lightsWhere(r => r === 0) },
  { name: '앞줄만', make: () => lightsWhere(r => r === 2) },
];
// 빔 프리셋은 빔 조명만 바꾸고 워시 조명은 그대로 둠
const BEAM_PRESETS = [
  { name: '빔 전체', make: () => beamsWhere(() => true) },
  { name: '빔 상단만', make: () => beamsWhere(top => top) },
  { name: '빔 하단만', make: () => beamsWhere(top => !top) },
  { name: '빔 프리즘', make: () => beamsWhere(() => true, '#ffffff', 100, true) },
  { name: '빔 센터 프리즘', make: () => beamsWhere(top => top, '#6a7cff', 100, true, true) },
  { name: '빔 교차 (짝수)', make: () => beamsWhere((top, k) => k % 2 === 0, '#1ae0ff') },
  { name: '빔 끄기', make: () => beamsWhere(() => false) },
];

/* =========================================================
   데모 공연: 힙합 드릴 비트 1:40까지, 약 136 BPM 마디에 맞춘 큐
   (암전에서 시작해 서서히 밝아지는 인트로 → 0:14 드롭)
   노래 파일은 포함하지 않음 → 무음으로 조명만 재생, 파일을 올리면 같이 재생
   ========================================================= */
// 데모 큐를 짤 때 쓰는 도구 모음
function demoKit() {
  // 여러 워시 레이어 합치기: 같은 조명은 앞쪽 레이어 우선
  const layer = (...ws) => ws[0].map((l, i) => ws.map(w => w[i]).find(x => x.b) || L('#ffffff', 0));
  const W = {
    all: (c, b) => fill(c, b),
    off: () => fill('#ffffff', 0),
    rows: (rs, c, b) => lightsWhere(r => rs.includes(r), c, b),
    cols: (cs, c, b) => lightsWhere((r, k) => r > 0 && cs.includes(k), c, b),
    pin: (c, b) => lightsWhere((r, k) => r === 1 && (k === 2 || k === 3), c, b),
  };
  const B = {
    off: () => beamsWhere(() => false),
    all: (c, b = 100, p = false) => beamsWhere(() => true, c, b, p),
    top: (c, b = 100, p = false, f = false) => beamsWhere(top => top, c, b, p, f),
    floor: (c, b = 100, p = false) => beamsWhere(top => !top, c, b, p),
    alt: (c, b = 100, p = false) => beamsWhere((top, k) => top && k % 2 === 0, c, b, p),
    all2: (c, b = 100, p = false, f = false) => beamsWhere(() => true, c, b, p, f),
  };
  // 워시 + 빔(여러 개면 켜진 쪽 우선) 합치기
  const mix = (wash, ...beams) => wash.map((l, i) => {
    if (!isBeam(i)) return l;
    return beams.map(bs => bs[i]).find(x => x.b) || L('#ffffff', 0);
  });
  const C = (time, name, fade, lights, front = 100) => ({ id: uid(), time, name, fade, lights, front });
  const COLORS = { WHITE: '#ffffff', BLUE: '#2a5bff', CYAN: '#1ae0ff', PURPLE: '#8a2aff', RED: '#ff2a2a',
    PINK: '#ff2ad0', WARM: '#ffd59a', LAV: '#6a7cff' };
  return { layer, W, B, mix, C, ...COLORS };
}

function makeDrillCues() {
  const { layer, W, B, mix, C, WHITE, BLUE, CYAN, PURPLE, RED, PINK, WARM } = demoKit();
  const list = [
    C(0, '암전', 0, mix(W.off(), B.off()), 0),
    C(1.81, '페이드 인 1 - 뒷줄 희미하게', 3, mix(W.rows([0], BLUE, 15), B.off()), 0),
    C(5.22, '페이드 인 2 - 중간줄', 3, mix(layer(W.rows([0], BLUE, 40), W.rows([1], BLUE, 15)), B.off()), 0),
    C(8.66, '페이드 인 3 - 빔 깨어남', 3, mix(layer(W.rows([0], BLUE, 60), W.rows([1], BLUE, 30)), B.top(WHITE, 20)), 0),
    C(12.24, '드롭 직전', 1.5, mix(W.all(WHITE, 15), B.top(WHITE, 60)), 50),
    C(14.05, '드롭', 0, mix(W.all(WHITE, 100), B.all(WHITE))),
    C(22.78, '빨강 + 프리즘', 0.3, mix(W.all(RED, 80), B.all(WHITE, 100, true))),
    C(28.0, '808 멈춤 - 핀', 0, mix(W.pin(WHITE, 40), B.off()), 0),
    C(29.84, '재드롭 - 벌스 1', 0, mix(W.all(BLUE, 80), B.all(WHITE), B.floor(CYAN))),
    C(38.24, '벌스 1 - 교차 빔', 0.1, mix(W.all(BLUE, 60), B.alt(WHITE), B.floor(CYAN))),
    C(41.66, '벌스 1 - 보라', 0.3, mix(W.all(PURPLE, 60), B.top(PURPLE))),
    C(48.51, '벌스 1 - 프리즘', 0.2, mix(W.all(RED, 70), B.top(WHITE, 100, true))),
    C(53.64, '벌스 1 끝', 0.1, mix(W.all(WHITE, 50), B.all(WHITE, 100, true))),
    C(55.36, '쉼', 0.2, mix(W.off(), B.off()), 0),
    C(56.63, '벌스 2 - 빨간 실루엣', 0, mix(W.rows([0], RED, 100), B.floor(RED)), 0),
    C(62.23, '벌스 2 - 웜', 0.5, mix(W.all(WARM, 50), B.top(WARM, 80)), 50),
    C(69.06, '훅 2', 0, mix(W.all(BLUE, 100), B.all(WHITE))),
    C(75.88, '훅 2 - 핑크 프리즘', 0.1, mix(W.all(PINK, 70), B.all(WHITE, 100, true))),
    C(79.34, '좌우 스팟', 0.1, mix(W.cols([0, 1, 4, 5], WHITE, 100), B.top(CYAN))),
    C(86.22, '빨강 + 바닥 빔', 0, mix(W.all(RED, 80), B.top(WHITE), B.floor(RED))),
    C(93.09, '센터 프리즘', 1, mix(W.all(PURPLE, 25), B.top('#6a7cff', 100, true, true)), 0),
    C(98.13, '마무리 풀 화이트', 0, mix(W.all(WHITE, 100), B.all(WHITE, 100, true))),
    C(100, '엔딩 암전', 2, mix(W.off(), B.off()), 0),
  ];
  // 11명 대형: 해당 시각부터 다음 지정 시각까지 유지
  const n = 11, F = FORMATIONS;
  const back = F.line.make(n, -2.6);
  const grid = [...spread(4, 4.5).map(x => [x, 1.4]), ...spread(3, 3).map(x => [x, 0]), ...spread(4, 4.5).map(x => [x, -1.4])];
  const tri = [[0, 2.4], ...spread(2, 1.4).map(x => [x, 1.3]), ...spread(3, 2.8).map(x => [x, 0.2]), ...spread(5, 5.6).map(x => [x, -0.9])];
  const solo = [[0, -0.3], ...spread(10, 11.4).map(x => [x, -3.6])];
  const FORM_AT = [
    [0, back], [12.24, F.clump.make(n)], [14.05, F.v.make(n)], [22.78, F.rows.make(n)],
    [28.0, solo], [29.84, tri], [41.66, grid], [48.51, F.circle.make(n)], [53.64, F.v.make(n)],
    [55.36, F.clump.make(n)], [56.63, back], [62.23, F.rows.make(n)], [69.06, tri], [72.49, grid],
    [75.88, F.invV.make(n)], [79.34, [...F.clump.make(6, -3.4, 0.5), ...F.clump.make(5, 3.4, 0.5)]],
    [86.22, grid], [93.09, F.clump.make(n, 0, 0.6)], [98.13, tri],
  ];
  let cur = back;
  for (const c of list) {
    const f = FORM_AT.find(([t]) => Math.abs(t - c.time) < 0.01);
    if (f) cur = f[1];
    c.pos = fullPos(cur);
  }
  return list;
}
/* ---------- 데모 2: 걸스 스타일 (GIRLSET "CHAT"), 6명, 전체 2:52 ----------
   약 161 BPM(한 마디 1.5초). 대형은 동선 영상에서 뽑은 31개 (영상 위쪽 = 무대 뒤쪽),
   [이동 시작 시각, 이동 시간(초), 6명 위치] — 영상이 노래보다 0.45초 늦어서 보정함 */
const GIRLS_NAMES = ['성경', '지현', '세현', '수민', '다은', '민희'];
const GIRLS_FORMS = [
  [0, 0, [[-3, 0], [-1.5, 1.5], [0, -0.5], [0, 1], [3, 0], [1.5, 1.5]]],
  [4.42, 1.63, [[-1, -1], [0, 0], [1, -1], [0, 2], [0, 1], [0, 3]]],
  [8.43, 1.12, [[-3, -0.5], [0, 0], [3, -0.5], [-1.5, 1], [1.5, 1], [0.5, 2]]],
  [17.43, 0.62, [[-3.5, 0], [-1.5, -0.5], [3, 0], [-1, 1], [1.5, 0.5], [0, 0]]],
  [20.68, 0.62, [[-3.5, 0.5], [-2, -1], [3, -1], [-1, 1.5], [2, 1.5], [0, 0]]],
  [23.68, 1.37, [[0, 2.5], [-1.5, 1.5], [0, -1], [1.5, 1.5], [2, 0], [-2, 0]]],
  [28.68, 1.12, [[0, -0.5], [-0.5, 1.5], [-1.5, 0.5], [1.5, 0.5], [3.5, -1], [-3.5, -1]]],
  [34.17, 0.63, [[0, -0.5], [-0.5, 1], [-1.5, -1], [1.5, -1], [3, 0], [-3, 0]]],
  [40.17, 2.38, [[3, -1], [0, 2], [-3, -1], [0, 0.5], [1.5, 1], [-1.5, 1]]],
  [47.42, 1.13, [[3, 2], [0.5, 2], [-3, 2], [0, 0.5], [1.5, 1], [-1.5, 1]]],
  [52.42, 0.63, [[2, 2], [-0.5, 2.5], [-3, 3], [0, 0.5], [1.5, 1], [-2, 1]]],
  [55.42, 1.63, [[2, 2], [-0.5, 2.5], [-3, 3], [0, 0.5], [3.5, 0], [-2, 1]]],
  [62.42, 1.63, [[1.5, -0.5], [-1, 0], [-3.5, 0.5], [0.5, 1.5], [3.5, 0], [-1.5, 2]]],
  [65.42, 0.88, [[1.5, -0.5], [-1.5, -0.5], [-2.5, 1.5], [0.5, 1], [2.5, 1.5], [-0.5, 0.5]]],
  [72.67, 0.88, [[1.5, -0.5], [-1.5, -0.5], [-2.5, 1.5], [0.5, 0.5], [2.5, 1.5], [-0.5, 1]]],
  [74.42, 2.63, [[-1, 0.5], [-2.5, -2], [-3.5, -0.5], [0, -1], [6, 1], [6, 2]]],
  [77.67, 1.38, [[2.5, -0.5], [-2.5, 0], [-2.5, 1], [-2.5, -1], [3.5, 1], [1.5, 1]]],
  [82.17, 0.88, [[2, 0], [0, -1], [-3.5, 1.5], [-2, 0], [3.5, 1.5], [0.5, 1]]],
  [88.17, 1.63, [[3.5, -1.5], [0, -1], [-2, 0], [-3.5, -1.5], [0.5, 1], [2, 0]]],
  [95.67, 1.88, [[3, 1], [-1.5, 0], [-0.5, 1], [-3, 1], [1.5, 0], [0, -1]]],
  [106.17, 1.13, [[3.5, 0], [-2.5, 0], [-1, 0], [-4, 0], [2, 0], [0.5, 0]]],
  [110.92, 2.88, [[2, 1], [-2, -1], [-3.5, 1], [0.5, -1], [3, -1], [-0.5, 1]]],
  [119.17, 0.88, [[0, 1], [-2.5, 0], [0, -0.5], [-1, -1.5], [1, -1.5], [2.5, 0]]],
  [125.67, 0.88, [[0, -1], [-1.5, 0], [0, 2], [-1, 1.5], [1, 1.5], [1.5, 0]]],
  [133.18, 1.37, [[-4, -0.5], [-2, 1], [1.5, 0.5], [0.5, 1.5], [-0.5, 0], [3.5, -0.5]]],
  [139.43, 1.12, [[-4, -1], [-3, 0.5], [3.5, 0.5], [2, 1.5], [0, 0], [4.5, -1]]],
  [145.18, 1.62, [[-2.5, 1], [-2.5, 2.5], [0.5, -1], [-1, 1.5], [-1, 0], [0.5, 0.5]]],
  [147.68, 0.62, [[-2.5, 1], [-1.5, 2.5], [0.5, -1], [0, 1.5], [-1, 0], [1.5, 0.5]]],
  [149.43, 1.62, [[-3, -1], [-0.5, 1.5], [0, -0.5], [1.5, 0.5], [-1.5, 0.5], [3, -1]]],
  [157.68, 1.12, [[-2, 0.5], [1, -0.5], [-1, -0.5], [0, -1.5], [0, 1], [2, 0.5]]],
  [164.18, 3.12, [[2, 0], [-1, -1.5], [-2, 0], [-3, -1.5], [3, -1.5], [1, -1.5]]],
];
function makeGirlsCues() {
  const { layer, W, B, mix, C, WHITE, CYAN, PURPLE, PINK, WARM, LAV } = demoKit();
  // 조명 변화 (음악 구간 기준, 마디 시작에 맞춤)
  const list = [
    C(0, '암전', 0, mix(W.off(), B.off()), 0),
    C(1.58, '인트로 - 핑크 페이드 인', 3, mix(W.rows([0], PINK, 30), B.off()), 0),
    C(6.06, '인트로 빌드', 2, mix(layer(W.rows([0], PINK, 60), W.rows([1], PINK, 30)), B.top(PINK, 40)), 50),
    C(10.57, 'A - 핑크', 0, mix(W.all(PINK, 80), B.alt(WHITE))),
    C(18.07, 'A - 보라 + 바닥 빔', 0.3, mix(W.all(PURPLE, 70), B.floor(CYAN))),
    C(24.08, '쉼 - 센터', 0.5, mix(W.pin(WARM, 70), B.off()), 50),
    C(28.58, '후렴 1', 0, mix(W.all(WHITE, 100), B.all2(PINK, 100, true))),
    C(34.57, '후렴 1 - 핑크', 0.2, mix(W.all(PINK, 100), B.top(WHITE))),
    C(40.59, '끊기', 0, mix(W.off(), B.off()), 0),
    C(42.07, 'B - 시안', 0, mix(W.all(CYAN, 70), B.alt(PINK))),
    C(48.07, 'B - 보라 프리즘', 0.2, mix(W.all(PURPLE, 80), B.all2(WHITE, 100, true))),
    C(54.08, '브릿지 - 웜', 1, mix(W.all(WARM, 40), B.off()), 50),
    C(63.07, '벌스 2', 0.3, mix(W.all(PINK, 60), B.floor(PINK))),
    C(70.59, '벌스 2 - 시안', 0.3, mix(W.all(CYAN, 60), B.alt(WHITE))),
    C(78.09, '실루엣', 0.5, mix(W.rows([0], PURPLE, 100), B.off()), 0),
    C(82.57, '빌드업', 1, mix(W.all(WHITE, 30), B.top(WHITE, 70)), 50),
    C(96.08, '후렴 2', 0, mix(W.all(PINK, 100), B.all2(WHITE))),
    C(103.56, '후렴 2 - 핑크 프리즘', 0.2, mix(W.all(PURPLE, 90), B.all2(PINK, 100, true))),
    C(111.08, '댄스 브레이크', 0, mix(W.all(CYAN, 80), B.alt(WHITE), B.floor(PINK))),
    C(118.58, '댄스 - 센터 프리즘', 1, mix(W.all(PURPLE, 30), B.top(LAV, 100, true, true)), 0),
    C(124.58, '댄스 - 핑크', 0.2, mix(W.all(PINK, 90), B.top(WHITE))),
    C(130.57, '브레이크 - 핀', 0.3, mix(W.pin(WHITE, 90), B.off()), 0),
    C(134.95, '마지막 후렴', 0, mix(W.all(WHITE, 100), B.all2(WHITE, 100, true))),
    C(142.38, '마지막 후렴 - 핑크', 0.2, mix(W.all(PINK, 100), B.top(PINK))),
    C(149.88, '마지막 후렴 - 보라', 0.2, mix(W.all(PURPLE, 90), B.alt(CYAN), B.floor(WHITE))),
    C(157.38, '마지막 후렴 - 시안 프리즘', 0.2, mix(W.all(CYAN, 80), B.all2(WHITE, 100, true))),
    C(163.4, '클라이맥스', 0, mix(W.all(WHITE, 100), B.all2(WHITE))),
    C(169.37, '엔딩 암전', 2, mix(W.off(), B.off()), 0),
  ];
  // 대형 이동 시작이 조명 변화와 0.75초 안이면 그 섹션에 합치고, 아니면 '대형 N' 섹션을 새로 만듦
  const lightAt = t => list.filter(c => c.time <= t + 1e-6).pop();
  GIRLS_FORMS.forEach(([start, move, pos], k) => {
    const near = list.find(c => Math.abs(c.time - start) <= 0.75 && !c.form);
    if (near) { near.form = { pos, arrive: start + move }; return; }
    const base = lightAt(start);
    list.push({ ...C(start, `대형 ${k + 1}`, 0.3, cloneLights(base.lights), base.front), form: { pos, arrive: start + move } });
  });
  list.sort((a, b) => a.time - b.time);
  // 섹션마다 위치/이동 시간 정하기 (이동 중에 시작하는 섹션은 남은 시간만큼 이동)
  let cur = { pos: GIRLS_FORMS[0][2], arrive: 0 };
  for (const c of list) {
    if (c.form) cur = c.form;
    c.pos = fullPos(cur.pos);
    if (cur.arrive > c.time) c.move = Math.max(0.3, +(cur.arrive - c.time).toFixed(2));
    delete c.form;
  }
  return list;
}

// 데모 목록 (version이 올라가면 이미 있는 그 데모 공연을 새 내용으로 갱신)
const DEMOS = {
  drill: { title: '힙합 드릴', name: '데모: 힙합 드릴 ~1:40', song: 'BAND4BAND (Central Cee ft. Lil Baby)',
    duration: 100, version: 7, dancers: 11, music: 'Demo music/demo.mp3', make: makeDrillCues },
  girls: { title: '걸스 스타일', name: '데모: 걸스 스타일', song: 'CHAT (GIRLSET)',
    duration: 172.7, version: 1, dancers: 6, names: GIRLS_NAMES, music: 'Demo music/demo2.mp3', make: makeGirlsCues },
};
const demoKey = p => p && p.demo ? (p.demo.id || 'drill') : null;
function newDemoProject(key) {
  const d = DEMOS[key];
  return {
    id: uid(), name: d.name, audioName: '',
    demo: { id: key, duration: d.duration, song: d.song, version: d.version },
    dancerCount: d.dancers, names: d.names ? d.names.slice() : undefined,
    createdAt: Date.now(), updatedAt: Date.now(), cues: d.make(),
  };
}
// 데모 기본 음악: DEMOS[..].music 파일이 있으면 그 데모에서 재생 (없으면 무음)
const demoMusicCache = {};
function loadDemoMusic(url) {
  if (!demoMusicCache[url]) demoMusicCache[url] = fetch(encodeURI(url), { cache: 'no-cache' })
    .then(r => r.ok ? r.arrayBuffer() : null)
    .then(buf => buf && buf.byteLength ? { buf, type: 'audio/mpeg', name: '데모 음악', bundled: true } : null)
    .catch(() => null);
  return demoMusicCache[url].then(rec => rec && { ...rec, buf: rec.buf.slice(0) });
}

// 노래 없는 데모용 무음 WAV (8kHz 8bit 모노)
function silentAudioRec(seconds) {
  const rate = 8000, n = Math.ceil(seconds * rate);
  const buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const str = (o, t) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return { buf, type: 'audio/wav', name: '', silent: true };
}

function normalizeLights(ls) {
  const out = fill('#ffffff', 0);
  if (Array.isArray(ls)) {
    for (let i = 0; i < N; i++) {
      const l = ls[i];
      if (!l) continue;
      if (typeof l.c === 'string' && /^#[0-9a-f]{6}$/i.test(l.c)) out[i].c = l.c.toLowerCase();
      if (typeof l.b === 'number' && isFinite(l.b)) out[i].b = clamp(Math.round(l.b), 0, 100);
      if (isBeam(i)) { out[i].p = !!l.p; out[i].f = !!l.f; }
    }
  }
  return out;
}

// 내 프리셋: 모든 공연에서 공통으로 쓰도록 localStorage에 저장
const CUSTOM_KEY = 'lightcue.customPresets';
function loadCustomPresets() {
  try {
    const arr = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(arr) ? arr.map(p => ({ id: p.id || uid(), name: String(p.name || '프리셋'), lights: normalizeLights(p.lights) })) : [];
  } catch { return []; }
}
function saveCustomPresets() {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(state.customPresets)); } catch { /* 저장 불가 환경 */ }
}

/* =========================================================
   저장소 (IndexedDB): 공연 정보 + 노래 파일
   ========================================================= */
const DB = (() => {
  let dbp;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const req = indexedDB.open('light-cue', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('audio');
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbp;
  }
  async function run(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => res(r ? r.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  return {
    allProjects: () => run('projects', 'readonly', s => s.getAll()),
    putProject: p => run('projects', 'readwrite', s => s.put(p)),
    delProject: id => run('projects', 'readwrite', s => s.delete(id)),
    getAudio: id => run('audio', 'readonly', s => s.get(id)),
    putAudio: (id, rec) => run('audio', 'readwrite', s => s.put(rec, id)),
    delAudio: id => run('audio', 'readwrite', s => s.delete(id)),
  };
})();

/* =========================================================
   상태
   ========================================================= */
const audio = $('#audio');
const state = {
  projects: [],
  project: null,
  audioRec: null,      // { buf, type, name }
  audioUrl: null,
  peaks: null,         // Float32Array (0..1)
  activeCueId: null,
  selected: new Set(),
  customPresets: loadCustomPresets(),
  showMode: false,
};

const cues = () => state.project ? state.project.cues : [];
const activeCue = () => cues().find(c => c.id === state.activeCueId) || null;
function sortCues() { state.project.cues.sort((a, b) => a.time - b.time); }
function cueAt(t) {
  let found = null;
  for (const c of cues()) { if (c.time <= t + 0.001) found = c; else break; }
  return found;
}
// 데모 공연은 정해진 길이(1:40)까지만 쓰고, 더 긴 노래 파일을 올려도 거기서 멈춤
const duration = () => {
  const d = isFinite(audio.duration) ? audio.duration : 0;
  const demo = state.project && state.project.demo;
  return demo ? Math.min(d, demo.duration) : d;
};

function newProjectData(name = DEFAULT_NAME) {
  return {
    id: uid(),
    name,
    audioName: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    dancerCount: DEFAULT_DANCERS,
    cues: [{ id: uid(), time: 0, name: '시작', fade: 0, lights: fill('#ffffff', 50), pos: normalizePos() }],
  };
}

let saveTimer;
function save() {
  if (!state.project) return;
  state.project.updatedAt = Date.now();
  const p = state.project;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    DB.putProject(p).catch(e => toast('저장 실패: ' + e.message));
  }, 250);
}

/* =========================================================
   무대 렌더링
   ========================================================= */
let stage3d = null;

function buildStage() {
  try {
    stage3d = createStage($('#stage'), {
      onToggle: i => toggleSelect(i),
      onRow: r => selectGroup('r' + r),
    });
  } catch (e) {
    console.error(e);
    $('#stage').append(el('div', 'empty', '이 브라우저에서는 3D 무대를 표시할 수 없어요 (WebGL 미지원)'));
  }
}

// 전면등은 섹션마다 0 / 50 / 100 (예전 데이터는 100)
const FRONT_STEPS = [0, 50, 100];
const frontOf = c => c ? (FRONT_STEPS.includes(c.front) ? c.front : 100) : 100;

function renderStage(lights, fade = 0.15) {
  if (stage3d) {
    stage3d.setLights(lights, fade);
    stage3d.setFrontLights(frontOf(activeCue()), fade);
    const c = activeCue();
    stage3d.setDancers(currentPos(), dancerCount(), c && c.move ? c.move : Math.max(0.8, fade));
  }
  renderFormation();
  const f = frontOf(activeCue());
  $$('[data-front]').forEach(b => b.classList.toggle('on', +b.dataset.front === f));
}

// 섹션의 전면등 바꾸기 (val 없으면 0 → 50 → 100 → 0 순서로)
function setCueFront(cue, val) {
  if (!cue) { toast('먼저 섹션을 추가하세요'); return; }
  cue.front = val != null ? val : FRONT_STEPS[(FRONT_STEPS.indexOf(frontOf(cue)) + 1) % FRONT_STEPS.length];
  if (cue.id !== state.activeCueId) { save(); seek(cue.time); renderCueList(); drawTimeline(); return; }
  lightsChanged();
}

const dancerCount = () => state.project ? state.project.dancerCount : 0;
// 섹션 전(첫 섹션 앞)에는 첫 섹션 배치를 씀
function currentPos() {
  const c = activeCue() || cues()[0];
  return c ? c.pos : DEFAULT_POS;
}

function currentLights() {
  const c = activeCue();
  return c ? c.lights : fill('#ffffff', 0);
}

/* =========================================================
   재생 위치 ↔ 섹션 동기화
   ========================================================= */
function syncToPlayhead(fromPlayback = false) {
  const cue = cueAt(audio.currentTime);
  const id = cue ? cue.id : null;
  if (id !== state.activeCueId) {
    state.activeCueId = id;
    renderStage(currentLights(), fromPlayback && cue ? cue.fade : 0.15);
    renderCueList();
    renderEditor();
  }
  renderTime();
}

function seek(t) {
  audio.currentTime = clamp(t, 0, duration() || 0);
  syncToPlayhead(false);
  drawTimeline();
}

function togglePlay() {
  if (!state.audioRec) { toast('먼저 노래 파일을 올려주세요'); return; }
  if (audio.paused) audio.play().catch(e => toast('재생 실패: ' + e.message));
  else audio.pause();
}

function jumpCue(dir) {
  const t = audio.currentTime;
  const list = cues();
  if (dir > 0) {
    const n = list.find(c => c.time > t + 0.05);
    if (n) seek(n.time);
  } else {
    const cur = cueAt(t);
    // 섹션 시작 직후면 이전 섹션으로, 아니면 현재 섹션 처음으로
    const idx = cur ? list.indexOf(cur) : -1;
    if (cur && t - cur.time > 1) seek(cur.time);
    else if (idx > 0) seek(list[idx - 1].time);
    else seek(0);
  }
}

let raf = 0;
function loop() {
  if (!audio.paused && duration() && audio.currentTime >= duration()) {
    audio.pause();
    audio.currentTime = duration();
  }
  syncToPlayhead(true);
  drawTimeline();
  if (!audio.paused) raf = requestAnimationFrame(loop);
}
audio.addEventListener('play', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); renderPlayButtons(); });
audio.addEventListener('pause', () => { renderPlayButtons(); syncToPlayhead(false); drawTimeline(); });
audio.addEventListener('ended', renderPlayButtons);
audio.addEventListener('loadedmetadata', () => { renderTime(); drawTimeline(); });
audio.addEventListener('seeked', () => { if (audio.paused) { syncToPlayhead(false); drawTimeline(); } });

function renderPlayButtons() {
  const sym = audio.paused ? '▶' : '❚❚';
  $('#btnPlay').textContent = sym;
  $('#showPlay').textContent = sym;
}

function renderTime() {
  const t = audio.currentTime, d = duration();
  $('#timeText').textContent = `${fmt(t)} / ${fmt(d)}`;
  $('#showTime').textContent = fmt(t);
  $('#showProgressFill').style.width = d ? (t / d * 100) + '%' : '0';
  renderHud();
}

function renderHud() {
  const cur = activeCue();
  $('#hudNow').textContent = cur ? cur.name || '(이름 없음)' : '섹션 없음';
  const t = audio.currentTime;
  const next = cues().find(c => c.time > t + 0.001);
  $('#hudNext').textContent = next ? `다음: ${next.name || '(이름 없음)'} · ${Math.max(0, next.time - t).toFixed(1)}초 후` : '';
}

/* =========================================================
   타임라인 (파형 + 섹션 표시)
   ========================================================= */
const cv = $('#timeline');
const ctx = cv.getContext('2d');
const BAND_H = 22;

function computePeaks(buf, buckets = 3000, maxSec = Infinity) {
  const ch = buf.numberOfChannels;
  const data = [];
  for (let i = 0; i < ch; i++) data.push(buf.getChannelData(i));
  const len = Math.min(data[0].length, Math.floor(maxSec * buf.sampleRate));
  const size = Math.max(1, Math.floor(len / buckets));
  const step = Math.max(1, Math.floor(size / 64));
  const peaks = new Float32Array(buckets);
  let max = 0;
  for (let b = 0; b < buckets; b++) {
    let m = 0;
    const start = b * size, end = Math.min(len, start + size);
    for (let j = start; j < end; j += step) {
      for (let k = 0; k < ch; k++) {
        const v = Math.abs(data[k][j]);
        if (v > m) m = v;
      }
    }
    peaks[b] = m;
    if (m > max) max = m;
  }
  if (max > 0) for (let b = 0; b < buckets; b++) peaks[b] /= max;
  return peaks;
}

function timeToX(t, W) { const d = duration(); return d ? (t / d) * W : 0; }
function xToTime(x, W) { return clamp((x / W) * duration(), 0, duration()); }

function drawTimeline() {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const d = duration();
  if (!d) return;

  const list = cues();
  // 섹션 색 띠
  list.forEach((c, i) => {
    const x0 = timeToX(c.time, W);
    const x1 = i + 1 < list.length ? timeToX(list[i + 1].time, W) : W;
    const a = avgLight(c.lights.slice(0, N_WASH));
    ctx.fillStyle = '#20232c';
    ctx.fillRect(x0, 0, x1 - x0, BAND_H);
    ctx.globalAlpha = 0.25 + 0.75 * (a.b / 100);
    ctx.fillStyle = a.b ? a.c : '#000';
    ctx.fillRect(x0, 0, x1 - x0, BAND_H);
    ctx.globalAlpha = 1;
    if (c.id === state.activeCueId) {
      ctx.fillStyle = 'rgba(91,124,255,.14)';
      ctx.fillRect(x0, BAND_H, x1 - x0, H - BAND_H);
    }
    // 이름
    ctx.save();
    ctx.beginPath(); ctx.rect(x0 + 4, 0, Math.max(0, x1 - x0 - 8), BAND_H); ctx.clip();
    ctx.font = '600 11px -apple-system, "Apple SD Gothic Neo", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
    ctx.fillText(c.name || '', x0 + 6, 15);
    ctx.restore();
  });

  // 파형
  const top = BAND_H + 4, bottom = H - 14, mid = (top + bottom) / 2, amp = (bottom - top) / 2;
  if (state.peaks) {
    const p = state.peaks, n = p.length;
    const playX = timeToX(audio.currentTime, W);
    for (let x = 0; x < W; x++) {
      const i0 = Math.floor((x / W) * n), i1 = Math.max(i0 + 1, Math.floor(((x + 1) / W) * n));
      let m = 0;
      for (let i = i0; i < i1 && i < n; i++) if (p[i] > m) m = p[i];
      const h = Math.max(1, m * amp);
      ctx.fillStyle = x < playX ? '#7f96ff' : '#474d5e';
      ctx.fillRect(x, mid - h, 1, h * 2);
    }
  } else {
    ctx.fillStyle = '#474d5e';
    ctx.fillRect(0, mid, W, 1);
  }

  // 시간 눈금
  ctx.fillStyle = '#6b7080';
  ctx.font = '10px -apple-system, sans-serif';
  const tick = d > 240 ? 30 : d > 60 ? 15 : 5;
  for (let t = tick; t < d; t += tick) {
    const x = timeToX(t, W);
    ctx.fillRect(x, H - 12, 1, 4);
    ctx.fillText(fmt(t).replace(/\.\d$/, ''), x + 3, H - 3);
  }

  // 섹션 경계선
  list.forEach(c => {
    const x = Math.round(timeToX(c.time, W)) + 0.5;
    ctx.strokeStyle = c.id === state.activeCueId ? '#ffffff' : '#ffb547';
    ctx.lineWidth = c.id === dragCueId ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(x - 5, BAND_H); ctx.lineTo(x + 5, BAND_H); ctx.lineTo(x, BAND_H + 6); ctx.fill();
  });

  // 재생 위치
  const px = timeToX(audio.currentTime, W);
  ctx.fillStyle = '#ff5a5a';
  ctx.fillRect(px - 1, 0, 2, H);
}

// 클릭 = 이동, 섹션 경계선 드래그 = 시간 조절
let dragCueId = null, dragMoved = false, downX = 0, scrubbing = false;
function hitCue(x, W) {
  let best = null, bestD = 8;
  for (const c of cues()) {
    const dx = Math.abs(timeToX(c.time, W) - x);
    if (dx < bestD) { best = c; bestD = dx; }
  }
  return best;
}
cv.addEventListener('pointerdown', e => {
  if (!duration()) return;
  const rect = cv.getBoundingClientRect();
  const x = e.clientX - rect.left;
  cv.setPointerCapture(e.pointerId);
  downX = x; dragMoved = false;
  const c = hitCue(x, rect.width);
  if (c) { dragCueId = c.id; }
  else { scrubbing = true; seek(xToTime(x, rect.width)); }
});
cv.addEventListener('pointermove', e => {
  const rect = cv.getBoundingClientRect();
  const x = e.clientX - rect.left;
  if (dragCueId) {
    if (!dragMoved && Math.abs(x - downX) < 4) return;
    dragMoved = true;
    const c = cues().find(c => c.id === dragCueId);
    if (c) { c.time = Math.round(xToTime(x, rect.width) * 10) / 10; sortCues(); drawTimeline(); renderCueList(); }
  } else if (scrubbing) {
    seek(xToTime(x, rect.width));
  } else {
    cv.style.cursor = hitCue(x, rect.width) ? 'ew-resize' : 'pointer';
  }
});
function endPointer() {
  if (dragCueId) {
    const c = cues().find(c => c.id === dragCueId);
    dragCueId = null;
    if (c) {
      if (dragMoved) save();
      seek(c.time);
    }
  }
  scrubbing = false;
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);

/* =========================================================
   인원 배치 편집 (무대 평면도)
   ========================================================= */
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}
let formDrag = null; // { i, id }
const LIGHT_SPOTS = lightTargets();

// 평면도 바탕 (한 번만 그림): 무대, 1m 격자, 9구역(USR~DSL), 객석 표시
function buildFormationMap() {
  const svg = $('#formMap');
  const g = svgEl('g', { class: 'fm-base' });
  g.append(svgEl('rect', { x: -6.5, y: -4.5, width: 13, height: 9, class: 'fm-stage' }));
  for (let x = -6; x <= 6; x++) g.append(svgEl('line', { x1: x, y1: -4.5, x2: x, y2: 4.5, class: x ? 'fm-grid' : 'fm-center' }));
  for (let z = -4; z <= 4; z++) g.append(svgEl('line', { x1: -6.5, y1: z, x2: 6.5, y2: z, class: 'fm-grid' }));
  for (const x of [-13 / 6, 13 / 6]) g.append(svgEl('line', { x1: x, y1: -4.5, x2: x, y2: 4.5, class: 'fm-zone' }));
  for (const z of [-1.5, 1.5]) g.append(svgEl('line', { x1: -6.5, y1: z, x2: 6.5, y2: z, class: 'fm-zone' }));
  const zones = [['USR', 'USC', 'USL'], ['SR', 'CS', 'SL'], ['DSR', 'DSC', 'DSL']];
  zones.forEach((row, r) => row.forEach((name, c) => g.append(svgEl('text', { x: (c - 1) * 13 / 3, y: (r - 1) * 3 - 1.15, class: 'fm-zlabel' }, name))));
  for (let x = -6; x <= 6; x += 2) g.append(svgEl('text', { x, y: 5.05, class: 'fm-tick' }, x ? `${x < 0 ? 'SR' : 'SL'} ${Math.abs(x)}` : '0'));
  g.append(svgEl('text', { x: 0, y: 5.75, class: 'fm-aud' }, '▼ 객석'));
  svg.append(g, svgEl('g', { id: 'fmLights' }), svgEl('g', { id: 'fmDancers' }));
  svg.addEventListener('pointermove', onFormDrag);
  svg.addEventListener('pointerup', endFormDrag);
  svg.addEventListener('pointercancel', endFormDrag);
}

function svgPoint(e) {
  const svg = $('#formMap');
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
const describePos = (i, [x, z]) => `${(state.project.names && state.project.names[i]) || `${i + 1}번`} · ${x ? `${x < 0 ? 'SR' : 'SL'} ${Math.abs(x)}m` : '센터'} · ${z ? `${z > 0 ? '앞' : '뒤'} ${Math.abs(z)}m` : '가운데 줄'}`;

function renderFormation() {
  const cue = activeCue();
  const n = dancerCount();
  $('#formation').classList.toggle('off', !cue);
  $('#dancerCount').textContent = n;
  $('#formCue').textContent = cue ? `· ${cue.name || '(이름 없음)'}` : '· 섹션을 먼저 추가하세요';
  // 지금 섹션의 빛 자국
  const lg = $('#fmLights');
  lg.textContent = '';
  const lights = currentLights();
  LIGHT_SPOTS.forEach((sp, i) => {
    const l = lights[i];
    if (!sp || !l || !l.b) return;
    // 실제 빛은 서로 겹치므로 평면도에서는 중심 쪽만 작게 표시
    lg.append(svgEl('circle', { cx: sp.x, cy: sp.z, r: isBeam(i) ? sp.r : sp.r * 0.45, fill: l.c, 'fill-opacity': 0.15 + 0.35 * l.b / 100 }));
  });
  // 댄서
  const dg = $('#fmDancers');
  dg.textContent = '';
  const pos = currentPos();
  for (let i = 0; i < n; i++) {
    const [x, z] = pos[i];
    const d = svgEl('g', { class: 'fm-dancer' + (formDrag && formDrag.i === i ? ' drag' : ''), transform: `translate(${x} ${z})` });
    const nm = state.project.names && state.project.names[i];
    d.append(svgEl('circle', { r: 0.32 }), svgEl('text', { y: nm ? 0.1 : 0.12, class: nm ? 'nm' : '' }, nm || i + 1));
    d.append(svgEl('title', {}, describePos(i, [x, z])));
    d.addEventListener('pointerdown', e => {
      if (!activeCue()) return;
      e.preventDefault();
      $('#formMap').setPointerCapture(e.pointerId);
      formDrag = { i };
      $('#formInfo').textContent = describePos(i, pos[i]);
    });
    dg.append(d);
  }
}

function onFormDrag(e) {
  if (!formDrag) return;
  const cue = activeCue();
  if (!cue) return;
  const p = svgPoint(e);
  const np = clampPos([p.x, p.y]);
  const old = cue.pos[formDrag.i];
  if (old[0] === np[0] && old[1] === np[1]) return;
  cue.pos[formDrag.i] = np;
  if (stage3d) stage3d.setDancers(cue.pos, dancerCount(), 0.12);
  $('#formInfo').textContent = describePos(formDrag.i, np);
  renderFormation();
}
function endFormDrag() {
  if (!formDrag) return;
  formDrag = null;
  $('#formInfo').textContent = '';
  renderFormation();
  save();
}

function setDancerCount(n) {
  if (!state.project) return;
  state.project.dancerCount = clamp(n, 0, MAX_DANCERS);
  renderStage(currentLights(), 0.15);
  save();
}
function applyFormation(key) {
  const cue = activeCue();
  if (!cue) { toast('먼저 섹션을 추가하세요'); return; }
  const n = dancerCount();
  if (!n) { toast('인원을 먼저 늘려 주세요'); return; }
  const made = FORMATIONS[key].make(n);
  cue.pos = fullPos([...made, ...cue.pos.slice(n)]);
  renderStage(currentLights(), 0.15);
  save();
}
// 지금 배치를 뒤에 오는 섹션 전부에 복사
function applyFormationToNext() {
  const cue = activeCue();
  if (!cue) return;
  const later = cues().filter(c => c.time > cue.time);
  if (!later.length) { toast('뒤에 오는 섹션이 없어요'); return; }
  for (const c of later) c.pos = cue.pos.map(p => p.slice());
  save();
  toast(`뒤 섹션 ${later.length}개에 같은 배치를 넣었어요`);
}

/* =========================================================
   섹션 목록
   ========================================================= */
// onPick(i)가 있으면 점을 눌러 해당 조명을 고를 수 있음, sel은 선택 표시할 조명 집합
// front/onFront가 있으면 맨 아래에 전면등 막대 (누르면 0 → 50 → 100)
function miniGrid(lights, onPick, sel, front, onFront) {
  const g = el('div', 'mini');
  lights.forEach((l, i) => {
    const d = el('i');
    // 배치: 1줄 빔 상단(8), 2~4줄 워시(가운데 6칸), 5줄 빔 하단(가운데 4칸)
    const r = rowOf(i), k = colOf(i);
    d.style.gridRow = r === 3 ? 1 : r === 4 ? 5 : r + 2;
    d.style.gridColumn = r === 3 ? k + 1 : r === 4 ? k + 3 : k + 2;
    if (isBeam(i)) d.classList.add('beam');
    if (l.p && l.b) d.classList.add('prism');
    if (l.f && l.b) d.classList.add('focus');
    if (l.b) { d.style.background = l.c; d.style.opacity = 0.3 + 0.7 * l.b / 100; }
    else { d.style.background = '#3a3d47'; d.style.opacity = 0.5; }
    if (sel && sel.has(i)) d.classList.add('sel');
    if (onPick) {
      d.title = `${ROW_NAMES[r]} ${k + 1}번 · 밝기 ${l.b}%${l.p ? ' · 프리즘' : ''}${l.f ? ' · 센터 모으기' : ''}`;
      d.addEventListener('click', e => { e.stopPropagation(); onPick(i); });
    }
    g.append(d);
  });
  if (front != null) {
    const f = el('b', 'front f' + front);
    f.title = `전면등 ${front}%` + (onFront ? ' (누르면 0 → 50 → 100%)' : '');
    if (onFront) f.addEventListener('click', e => { e.stopPropagation(); onFront(); });
    g.append(f);
  }
  if (onPick) g.classList.add('pick');
  return g;
}

// 섹션 목록의 점 클릭: 그 섹션으로 이동하고 해당 조명 선택
function pickCueLight(cue, i) {
  if (cue.id === state.activeCueId) { toggleSelect(i); return; }
  state.selected = new Set([i]);
  seek(cue.time);
}

function renderCueList() {
  const ol = $('#cueList');
  ol.textContent = '';
  const list = cues();
  $('#cueCount').textContent = list.length ? `${list.length}개` : '';
  if (!list.length) {
    ol.append(el('li', 'empty-li', '아직 섹션이 없어요'));
    return;
  }
  for (const c of list) {
    const li = el('li');
    if (c.id === state.activeCueId) li.classList.add('active');
    const active = c.id === state.activeCueId;
    li.append(el('span', 't', fmt(c.time)), el('span', 'n', c.name || '(이름 없음)'),
      miniGrid(c.lights, i => pickCueLight(c, i), active ? state.selected : null, frontOf(c), () => setCueFront(c)));
    const del = el('button', 'del', '✕');
    del.title = '섹션 삭제';
    del.addEventListener('click', e => { e.stopPropagation(); deleteCue(c.id); });
    li.append(del);
    li.addEventListener('click', () => seek(c.time));
    ol.append(li);
  }
  // 재생 중엔 지금 섹션이 보이게 목록 안에서만 스크롤 (페이지 전체는 움직이지 않음)
  const act = ol.querySelector('.active');
  if (act && !audio.paused) {
    const top = act.offsetTop, bottom = top + act.offsetHeight; // .cue-list가 position: relative
    if (top < ol.scrollTop) ol.scrollTop = top;
    else if (bottom > ol.scrollTop + ol.clientHeight) ol.scrollTop = bottom - ol.clientHeight;
  }
}

function addCue() {
  if (!state.project) return;
  const t = Math.round(audio.currentTime * 10) / 10;
  const exist = cues().find(c => Math.abs(c.time - t) < 0.15);
  if (exist) { seek(exist.time); toast('이 위치에 이미 섹션이 있어요'); return; }
  const base = cueAt(t);
  const cue = {
    id: uid(),
    time: t,
    name: `섹션 ${cues().length + 1}`,
    fade: DEFAULT_FADE,
    lights: base ? cloneLights(base.lights) : fill('#ffffff', 50),
    front: frontOf(base),
    pos: normalizePos(base && base.pos),
  };
  state.project.cues.push(cue);
  sortCues();
  save();
  state.activeCueId = null; // 강제 갱신
  seek(cue.time);
  const name = $('#cueName');
  name.focus(); name.select();
}

function deleteCue(id) {
  const c = cues().find(c => c.id === id);
  if (!c) return;
  if (!confirm(`"${c.name || '(이름 없음)'}" 섹션을 삭제할까요?`)) return;
  state.project.cues = cues().filter(x => x.id !== id);
  save();
  state.activeCueId = undefined;
  syncToPlayhead(false);
  drawTimeline();
}

/* =========================================================
   섹션 편집기
   ========================================================= */
function renderEditor() {
  const cue = activeCue();
  $('#editorPanel').classList.toggle('no-cue', !cue);
  $('#quickEdit').classList.toggle('off', !cue);
  if (!cue) return;
  const name = $('#cueName');
  if (document.activeElement !== name) name.value = cue.name;
  const time = $('#cueTime');
  if (document.activeElement !== time) time.value = fmt(cue.time);
  const fade = $('#cueFade');
  if (document.activeElement !== fade) fade.value = cue.fade;
  renderSelection();
}

// 조명이 바뀐 뒤 화면 전체 갱신
function lightsChanged() {
  renderStage(currentLights(), 0.15);
  renderCueList();
  renderSelection();
  drawTimeline();
  save();
}

function targets() {
  return state.selected.size ? [...state.selected] : WASH_IDX;
}

function renderSelection() {
  if (stage3d) stage3d.setSelected(state.selected);
  $$('#cueList li.active .mini i').forEach((d, i) => d.classList.toggle('sel', state.selected.has(i)));
  const n = state.selected.size;
  $('#selInfo').textContent = n
    ? `선택한 조명 ${n}개에 적용돼요. (무대 조명이나 섹션 목록의 점을 눌러 선택/해제)`
    : '선택 없음 → 워시 조명 전체에 적용돼요. 빔 조명은 직접 골라야 해요.';
  const cue = activeCue();
  if (!cue) return;
  const pb = prismTargets();
  $('#btnPrism').classList.toggle('on', pb.length > 0 && pb.every(i => cue.lights[i].p));
  $('#btnFocus').classList.toggle('on', pb.length > 0 && pb.every(i => cue.lights[i].f));
  const first = cue.lights[targets()[0]];
  const bri = $('#bri');
  if (document.activeElement !== bri) { bri.value = first.b; }
  $('#briVal').textContent = bri.value;
  $('#colorPick').value = first.c;
}

function toggleSelect(i) {
  if (state.selected.has(i)) state.selected.delete(i);
  else state.selected.add(i);
  renderSelection();
}

const GROUPS = {
  all: () => true,
  none: () => false,
  r0: i => rowOf(i) === 0,
  r1: i => rowOf(i) === 1,
  r2: i => rowOf(i) === 2,
  r3: i => rowOf(i) === 3,
  r4: i => rowOf(i) === 4,
  beam: isBeam,
  left: i => !isBeam(i) && colOf(i) < 2,
  center: i => !isBeam(i) && (colOf(i) === 2 || colOf(i) === 3),
  right: i => !isBeam(i) && colOf(i) > 3,
};
function selectGroup(key) {
  state.selected = new Set([...Array(N).keys()].filter(GROUPS[key]));
  renderSelection();
}

function setColor(hex) {
  const cue = activeCue();
  if (!cue) return;
  for (const i of targets()) {
    cue.lights[i].c = hex.toLowerCase();
    if (!cue.lights[i].b) cue.lights[i].b = 100; // 꺼진 조명에 색을 고르면 켜기
  }
  lightsChanged();
}

// 프리즘/센터 모으기 대상: 선택한 빔, 선택이 없으면 켜진 빔 (켜진 게 없으면 빔 전체)
function prismTargets() {
  if (state.selected.size) return [...state.selected].filter(isBeam);
  const cue = activeCue();
  const lit = cue ? BEAM_IDX.filter(i => cue.lights[i].b) : [];
  return lit.length ? lit : BEAM_IDX;
}
// key: 'p' 프리즘 / 'f' 센터 모으기
function toggleBeamFlag(key, label) {
  const cue = activeCue();
  if (!cue) return;
  const t = prismTargets();
  if (!t.length) { toast(`${label}는 빔 조명에만 쓸 수 있어요`); return; }
  const on = !t.every(i => cue.lights[i][key]);
  for (const i of t) {
    cue.lights[i][key] = on;
    if (on && !cue.lights[i].b) cue.lights[i].b = 100;
  }
  lightsChanged();
}

function setBrightness(b) {
  const cue = activeCue();
  if (!cue) return;
  for (const i of targets()) cue.lights[i].b = b;
  lightsChanged();
}

// only: 'wash' / 'beam'이면 그 조명만 바꿈, 없으면 전체
function applyPreset(lights, only) {
  const cue = activeCue();
  if (!cue) { toast('먼저 섹션을 추가하세요'); return; }
  const next = cloneLights(lights);
  if (only) {
    const keep = only === 'wash' ? isBeam : i => !isBeam(i);
    next.forEach((l, i) => { if (keep(i)) next[i] = cue.lights[i]; });
  }
  cue.lights = next;
  lightsChanged();
}

function presetButton(name, lights, onRemove, only) {
  const b = el('button', 'preset');
  b.append(miniGrid(lights), el('span', null, name));
  b.title = `"${name}" 적용`;
  b.addEventListener('click', () => applyPreset(lights, only));
  if (onRemove) {
    const x = el('span', 'x', '✕');
    x.title = '프리셋 삭제';
    x.addEventListener('click', e => { e.stopPropagation(); onRemove(); });
    b.append(x);
  }
  return b;
}

function buildPresets() {
  const g = $('#presetGrid');
  for (const p of BUILTIN_PRESETS) g.append(presetButton(p.name, p.make(), null, 'wash'));
  for (const p of BEAM_PRESETS) $('#beamPresetGrid').append(presetButton(p.name, p.make(), null, 'beam'));
  const sw = $('#swatches');
  for (const [hex, name] of SWATCHES) {
    const b = el('button', 'swatch');
    b.style.background = hex;
    b.title = name;
    b.setAttribute('aria-label', name);
    b.addEventListener('click', () => setColor(hex));
    sw.append(b);
  }
}

function renderCustomPresets() {
  const g = $('#customPresetGrid');
  g.textContent = '';
  if (!state.customPresets.length) {
    g.append(el('div', 'none', '자주 쓰는 조명을 저장해두면 다른 노래에서도 쓸 수 있어요.'));
    return;
  }
  for (const p of state.customPresets) {
    g.append(presetButton(p.name, p.lights, () => {
      if (!confirm(`"${p.name}" 프리셋을 삭제할까요?`)) return;
      state.customPresets = state.customPresets.filter(x => x.id !== p.id);
      saveCustomPresets();
      renderCustomPresets();
    }));
  }
}

/* =========================================================
   공연(프로젝트) 관리
   ========================================================= */
function renderProjectSelect() {
  const s = $('#projectSelect');
  s.textContent = '';
  const list = state.projects.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  for (const p of list) {
    const o = el('option', null, p.name || DEFAULT_NAME);
    o.value = p.id;
    s.append(o);
  }
  if (state.project) s.value = state.project.id;
}

async function openProject(id) {
  audio.pause();
  const p = state.projects.find(p => p.id === id);
  if (!p) return;
  state.project = p;
  for (const c of p.cues) {
    if (c.lights.length !== N) c.lights = normalizeLights(c.lights);
    if (!Array.isArray(c.pos) || c.pos.length !== MAX_DANCERS) c.pos = normalizePos(c.pos);
  }
  if (!Number.isInteger(p.dancerCount)) p.dancerCount = DEFAULT_DANCERS;
  sortCues();
  try { localStorage.setItem('lightcue.last', id); } catch { /* 무시 */ }
  state.activeCueId = undefined;
  renderProjectSelect();
  let rec = null;
  try { rec = await DB.getAudio(id); } catch (e) { console.warn(e); }
  if (!rec && p.demo) rec = (await loadDemoMusic(DEMOS[demoKey(p)].music)) || silentAudioRec(p.demo.duration);
  await setAudioRec(rec || null);
  audio.currentTime = 0;
  syncToPlayhead(false);
  drawTimeline();
}

async function setAudioRec(rec) {
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioRec = rec;
  state.peaks = null;
  state.audioUrl = null;
  $('#timelineWrap').classList.toggle('no-audio', !rec);
  $('#audioName').textContent = rec ? rec.name : '';
  const demo = state.project && state.project.demo;
  $('#demoNote').hidden = !(demo && rec && rec.silent);
  if (demo) $('#demoSong').textContent = demo.song;
  if (!rec) {
    audio.removeAttribute('src');
    audio.load();
    renderTime();
    return;
  }
  const blob = new Blob([rec.buf], { type: rec.type || 'audio/mpeg' });
  state.audioUrl = URL.createObjectURL(blob);
  audio.src = state.audioUrl;
  // 파형은 백그라운드로 계산
  const projectId = state.project.id;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ac = new Ctx();
    const decoded = await ac.decodeAudioData(rec.buf.slice(0));
    ac.close && ac.close();
    if (state.project && state.project.id === projectId) {
      const demo = state.project.demo;
      state.peaks = computePeaks(decoded, 3000, demo ? demo.duration : Infinity);
      drawTimeline();
    }
  } catch (e) {
    console.warn('파형 분석 실패', e);
  }
}

async function loadAudioFile(file) {
  if (!file || !state.project) return;
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name)) {
    toast('오디오 파일만 올릴 수 있어요');
    return;
  }
  const rec = { buf: await file.arrayBuffer(), type: file.type, name: file.name };
  try {
    await DB.putAudio(state.project.id, rec);
  } catch (e) {
    toast('노래 저장 실패 (재생은 가능): ' + e.message);
  }
  state.project.audioName = file.name;
  if (!state.project.name || state.project.name === DEFAULT_NAME) {
    state.project.name = file.name.replace(/\.[^.]+$/, '');
  }
  save();
  renderProjectSelect();
  await setAudioRec(rec);
  toast('노래를 올렸어요');
}

async function createProject() {
  const p = newProjectData();
  state.projects.push(p);
  await DB.putProject(p);
  await openProject(p.id);
}

function renameProject() {
  if (!state.project) return;
  const name = prompt('공연 이름', state.project.name);
  if (name == null) return;
  state.project.name = name.trim() || DEFAULT_NAME;
  save();
  renderProjectSelect();
}

async function deleteProject() {
  const p = state.project;
  if (!p) return;
  if (!confirm(`"${p.name}" 공연을 삭제할까요?\n노래와 모든 섹션이 이 브라우저에서 지워져요.`)) return;
  clearTimeout(saveTimer);
  await DB.delProject(p.id);
  await DB.delAudio(p.id).catch(() => {});
  state.projects = state.projects.filter(x => x.id !== p.id);
  state.project = null;
  if (state.projects.length) await openProject(state.projects.sort((a, b) => b.updatedAt - a.updatedAt)[0].id);
  else await createProject();
}

/* =========================================================
   내보내기 / 불러오기 (조명감독과 공유)
   ========================================================= */
function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

async function exportProject() {
  const p = state.project;
  if (!p) return;
  let audioOut = null;
  if (state.audioRec && !state.audioRec.silent) {
    const withAudio = confirm(
      '노래 파일도 같이 넣을까요?\n\n' +
      '확인 → 노래 포함 (받는 사람이 파일 하나로 바로 재생 가능, 용량 큼)\n' +
      '취소 → 조명 정보만 (받는 사람이 같은 노래를 따로 올려야 함)'
    );
    if (withAudio) {
      const r = state.audioRec;
      audioOut = { name: r.name, type: r.type, data: await blobToDataUrl(new Blob([r.buf], { type: r.type })) };
    }
  }
  const json = JSON.stringify({ app: 'light-cue', version: 1, project: p, audio: audioOut });
  const a = el('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `${(p.name || 'light-cue').replace(/[\\/:*?"<>|]/g, '_')}.lightcue.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('파일을 저장했어요. 카톡 등으로 공유하세요');
}

async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { toast('파일을 읽을 수 없어요'); return; }
  if (!data || data.app !== 'light-cue' || !data.project) { toast('Light Cue 파일이 아니에요'); return; }

  const src = data.project;
  const p = {
    id: typeof src.id === 'string' ? src.id : uid(),
    name: String(src.name || DEFAULT_NAME),
    audioName: String(src.audioName || ''),
    createdAt: src.createdAt || Date.now(),
    updatedAt: Date.now(),
    cues: (Array.isArray(src.cues) ? src.cues : []).map(c => ({
      id: typeof c.id === 'string' ? c.id : uid(),
      time: clamp(+c.time || 0, 0, 36000),
      name: String(c.name || ''),
      fade: clamp(+c.fade || 0, 0, 10),
      lights: normalizeLights(c.lights),
      front: FRONT_STEPS.includes(c.front) ? c.front : 100,
      pos: normalizePos(c.pos),
    })),
    dancerCount: clamp(Number.isInteger(src.dancerCount) ? src.dancerCount : DEFAULT_DANCERS, 0, MAX_DANCERS),
    names: Array.isArray(src.names) ? src.names.slice(0, MAX_DANCERS).map(n => String(n || '').slice(0, 4)) : undefined,
  };

  const existing = state.projects.find(x => x.id === p.id);
  if (existing) {
    const overwrite = confirm(`"${existing.name}" 공연이 이미 있어요.\n\n확인 → 덮어쓰기 (최신 버전으로 교체)\n취소 → 복사본으로 따로 추가`);
    if (overwrite) state.projects = state.projects.filter(x => x.id !== p.id);
    else { p.id = uid(); p.name += ' (복사본)'; }
  }

  if (data.audio && typeof data.audio.data === 'string' && data.audio.data.startsWith('data:')) {
    try {
      const buf = await (await fetch(data.audio.data)).arrayBuffer();
      await DB.putAudio(p.id, { buf, type: data.audio.type || '', name: data.audio.name || p.audioName });
    } catch (e) {
      toast('노래를 불러오지 못했어요: ' + e.message);
    }
  }

  state.projects.push(p);
  await DB.putProject(p);
  await openProject(p.id);
  toast(state.audioRec ? `"${p.name}" 을(를) 불러왔어요` : `"${p.name}" 을(를) 불러왔어요. 노래 파일을 올려주세요`);
}

/* =========================================================
   공연 모드
   ========================================================= */
function enterShow() {
  document.body.classList.add('show');
  state.showMode = true;
  const wrap = $('#stageWrap');
  if (wrap.requestFullscreen) wrap.requestFullscreen().catch(() => {});
}
function exitShow() {
  document.body.classList.remove('show');
  state.showMode = false;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  requestAnimationFrame(drawTimeline);
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && state.showMode) exitShow();
});

/* =========================================================
   이벤트 연결
   ========================================================= */
function bindEvents() {
  $('#btnPlay').addEventListener('click', togglePlay);
  $('#showPlay').addEventListener('click', togglePlay);
  $('#btnPrev').addEventListener('click', () => jumpCue(-1));
  $('#btnNext').addEventListener('click', () => jumpCue(1));
  $('#btnAddCue').addEventListener('click', addCue);
  $('#btnShow').addEventListener('click', enterShow);
  $('#showExit').addEventListener('click', exitShow);
  $('#showProgress').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * duration());
  });
  $('#btnViewReset').addEventListener('click', () => stage3d && stage3d.resetView());
  // 전면등: 100% / 50% 중 하나, 켜진 버튼을 다시 누르면 끄기
  // 전면등 버튼: 지금 섹션의 전면등을 정함 (켜진 버튼을 다시 누르면 끄기)
  $$('[data-front]').forEach(b => b.addEventListener('click', () => {
    const v = +b.dataset.front;
    setCueFront(activeCue(), frontOf(activeCue()) === v ? 0 : v);
  }));
  $('#btnHouse').addEventListener('click', e => {
    if (stage3d) e.currentTarget.classList.toggle('on', stage3d.toggleHouseLights());
  });

  for (const id of ['#fileAudio', '#fileAudio2']) {
    $(id).addEventListener('change', e => { loadAudioFile(e.target.files[0]); e.target.value = ''; });
  }

  $('#projectSelect').addEventListener('change', e => openProject(e.target.value));
  $('#btnNewProject').addEventListener('click', createProject);
  $('#btnRename').addEventListener('click', renameProject);
  $('#btnDeleteProject').addEventListener('click', deleteProject);
  $('#btnExport').addEventListener('click', exportProject);
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });

  // 섹션 편집
  $('#cueName').addEventListener('input', e => {
    const c = activeCue(); if (!c) return;
    c.name = e.target.value;
    save(); renderCueList(); renderHud(); drawTimeline();
  });
  $('#cueTime').addEventListener('change', e => {
    const c = activeCue(); if (!c) return;
    const t = parseTime(e.target.value);
    if (t == null) { toast('시간 형식: 1:23.4 또는 83.4'); e.target.value = fmt(c.time); return; }
    c.time = clamp(t, 0, duration() || t);
    sortCues(); save();
    e.target.blur();
    seek(c.time);
  });
  $('#btnCueHere').addEventListener('click', () => {
    const c = activeCue(); if (!c) return;
    c.time = Math.round(audio.currentTime * 10) / 10;
    sortCues(); save(); renderCueList(); renderEditor(); drawTimeline();
  });
  $('#cueFade').addEventListener('change', e => {
    const c = activeCue(); if (!c) return;
    c.fade = clamp(parseFloat(e.target.value) || 0, 0, 10);
    e.target.value = c.fade;
    save();
  });
  $('#btnCueDelete').addEventListener('click', () => { const c = activeCue(); if (c) deleteCue(c.id); });

  // 조명 조정
  $$('[data-sel]').forEach(b => b.addEventListener('click', () => selectGroup(b.dataset.sel)));
  $$('[data-bri]').forEach(b => b.addEventListener('click', () => setBrightness(+b.dataset.bri)));
  // 데모 고르기 메뉴
  const menu = $('#demoMenu');
  Object.entries(DEMOS).forEach(([key, d], i) => {
    const b = el('button', 'demo-item');
    b.append(el('b', null, `${i + 1}. ${d.title}`), el('span', 'muted', `${d.song} · ${d.dancers}명 · ${fmt(d.duration).replace(/\.\d$/, '')}`));
    b.addEventListener('click', () => { menu.hidden = true; openDemo(key); });
    menu.append(b);
  });
  $('#btnDemo').addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
  $('#btnPrism').addEventListener('click', () => toggleBeamFlag('p', '프리즘'));
  $('#btnFocus').addEventListener('click', () => toggleBeamFlag('f', '센터 모으기'));
  $('#dancerMinus').addEventListener('click', () => setDancerCount(dancerCount() - 1));
  $('#dancerPlus').addEventListener('click', () => setDancerCount(dancerCount() + 1));
  $('#formApplyNext').addEventListener('click', applyFormationToNext);
  for (const [key, f] of Object.entries(FORMATIONS)) {
    const b = el('button', 'chip', f.name);
    b.addEventListener('click', () => applyFormation(key));
    $('#formPresets').append(b);
  }
  $('#bri').addEventListener('input', e => { $('#briVal').textContent = e.target.value; setBrightness(+e.target.value); });
  $('#colorPick').addEventListener('input', e => setColor(e.target.value));

  $('#btnSavePreset').addEventListener('click', () => {
    const c = activeCue(); if (!c) return;
    const name = prompt('프리셋 이름', c.name || '내 프리셋');
    if (name == null) return;
    state.customPresets.push({ id: uid(), name: name.trim() || '내 프리셋', lights: cloneLights(c.lights) });
    saveCustomPresets();
    renderCustomPresets();
    toast('프리셋을 저장했어요');
  });

  // 키보드
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select') && e.target.type !== 'range') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.target.closest('button')) e.target.blur();
      togglePlay();
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(audio.currentTime - 5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(audio.currentTime + 5); }
    else if (e.key === 'm' || e.key === 'M') { if (!state.showMode) { e.preventDefault(); addCue(); } }
    else if (e.key === 'Escape' && state.showMode) exitShow();
  });

  // 파일 끌어다 놓기
  let dragDepth = 0;
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; dragDepth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (/\.json$/i.test(f.name)) importFile(f);
    else loadAudioFile(f);
  });

  window.addEventListener('resize', drawTimeline);
  new ResizeObserver(drawTimeline).observe($('#timelineWrap'));
}

/* =========================================================
   시작
   ========================================================= */
// 데모 공연 준비: 같은 데모의 가장 최근 공연이 옛 버전이면 새 내용으로 갱신 (올린 노래는 유지),
// 없으면 create일 때만 새로 만듦
async function ensureDemo(key, create) {
  const d = DEMOS[key];
  const old = state.projects.filter(p => demoKey(p) === key).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (old && old.demo.version === d.version) return old;
  if (!old && !create) return null;
  const fresh = newDemoProject(key);
  const p = old ? Object.assign(old, { name: fresh.name, demo: fresh.demo, cues: fresh.cues, dancerCount: fresh.dancerCount,
    names: fresh.names, updatedAt: Date.now(), updatedNow: true }) : fresh;
  if (!old) state.projects.push(p);
  const { updatedNow, ...data } = p;
  await DB.putProject(data).catch(() => {});
  return p;
}
async function openDemo(key) {
  const p = await ensureDemo(key, true);
  delete p.updatedNow;
  await openProject(p.id);
  toast(`${DEMOS[key].title} 데모를 열었어요 · Space로 재생`);
}

async function init() {
  buildStage();
  buildFormationMap();
  buildPresets();
  renderCustomPresets();
  bindEvents();
  try {
    state.projects = await DB.allProjects();
  } catch (e) {
    toast('브라우저 저장소를 쓸 수 없어요 (시크릿 모드?)');
    state.projects = [];
  }
  // 처음 오는 브라우저에는 데모 공연을 넣고 그걸 열어 보여줌.
  // 데모가 새 버전이면 가장 최근 데모 공연의 큐만 바꿔치기 (올려둔 노래는 그대로 유지)
  let last = null;
  try { last = localStorage.getItem('lightcue.last'); } catch { /* 무시 */ }
  for (const key of Object.keys(DEMOS)) {
    const p = await ensureDemo(key, false);
    if (p && p.updatedNow) { last = p.id; delete p.updatedNow; }
  }
  let seen = true;
  try { seen = !!localStorage.getItem('lightcue.demoVersion'); } catch { /* 무시 */ }
  if (!seen || !state.projects.length) {
    last = (await ensureDemo('drill', true)).id;
    try { localStorage.setItem('lightcue.demoVersion', '1'); } catch { /* 무시 */ }
  }
  const pick = state.projects.find(p => p.id === last) || state.projects.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
  await openProject(pick.id);
  renderPlayButtons();
}

init();

// 디버깅/테스트용
window.__lc = { state, audio, seek, addCue, applyPreset, BUILTIN_PRESETS, selectGroup, setColor, setBrightness, cues, activeCue, enterShow, exitShow };
