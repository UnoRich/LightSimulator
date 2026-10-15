import { createStage, lightTargets, MAX_DANCERS } from './stage3d.js?v=47';
import { GIRLS_DEMO } from './demo-girls.js?v=47';
import { DRILL_DEMO } from './demo-drill.js?v=47';

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
function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return undefined;
  const out = steps.filter(st => st && isFinite(st.t)).map(st => ({ t: +st.t, move: clamp(+st.move || 0.8, 0.3, 10), pos: normalizePos(st.pos) }));
  return out.length ? out.sort((a, b) => a.t - b.t) : undefined;
}
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
// c: 색, b: 밝기(0~100), p: 프리즘, f: 센터 모으기, m: 무빙 (p/f/m은 빔 조명만 의미 있음)
const L = (c, b, p = false, f = false, m = false) => ({ c, b, p, f, m });
// 워시 조명만 c/b로 채우고 빔은 꺼둠
const fill = (c, b) => Array.from({ length: N }, (_, i) => L(c, isBeam(i) ? 0 : b));
const cloneLights = ls => ls.map(l => L(l.c, l.b, !!l.p, !!l.f, !!l.m));
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
   데모 공연 (노래 파일은 포함하지 않음 → 무음으로 조명만 재생, 파일을 올리면 같이 재생)
   데모 1 '힙합 드릴' (BAND4BAND, 11명, 2:31): 음악 분석으로 짠 큐를 직접 편집해서 demo-drill.js에 담음
   ========================================================= */
// 내보낸 큐 데이터 → 섹션 목록
function cuesFromData(data) {
  return data.map(c => {
    const cue = {
      id: uid(), time: c.time, name: c.name, fade: c.fade, front: c.front,
      lights: c.lights.map(([col, b, p, f, m]) => L(col, b, !!p, !!f, !!m)),
      pos: fullPos(c.pos),
    };
    if (c.move) cue.move = c.move;
    if (c.steps) cue.steps = c.steps.map(st => ({ t: st.t, move: st.move, pos: fullPos(st.pos) }));
    return cue;
  });
}
const makeDrillCues = () => cuesFromData(DRILL_DEMO);

/* ---------- 데모 2: 걸스 스타일 (GIRLSET "CHAT"), 6명, 전체 2:52 ----------
   동선 영상에서 뽑은 대형으로 시작해서 직접 편집한 결과를 demo-girls.js에 그대로 담음 */
const GIRLS_NAMES = ['성경', '지현', '세현', '수민', '다은', '민희'];
const makeGirlsCues = () => cuesFromData(GIRLS_DEMO);

// 데모 목록 (version이 올라가면 이미 있는 그 데모 공연을 새 내용으로 갱신)
const DEMOS = {
  drill: { title: '힙합 드릴', name: '데모: 힙합 드릴', song: 'BAND4BAND (Central Cee ft. Lil Baby)',
    duration: 151.2, version: 11, dancers: 11, music: 'Demo music/Demo1/music', make: makeDrillCues },
  girls: { title: '걸스 스타일', name: '데모: 걸스 스타일', song: 'CHAT (GIRLSET)',
    duration: 172.7, version: 11, dancers: 6, names: GIRLS_NAMES, music: 'Demo music/Demo2/music', make: makeGirlsCues },
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
// 데모 기본 음악: 'Demo music/DemoN/music.mp3' (또는 .m4a)이 있으면 그 데모에서 재생 (없으면 무음)
const demoMusicCache = {};
function loadDemoMusic(base) {
  if (!demoMusicCache[base]) demoMusicCache[base] = (async () => {
    for (const [ext, type] of [['mp3', 'audio/mpeg'], ['m4a', 'audio/mp4']]) {
      try {
        const r = await fetch(encodeURI(`${base}.${ext}`), { cache: 'no-cache' });
        const buf = r.ok ? await r.arrayBuffer() : null;
        if (buf && buf.byteLength) return { buf, type, name: '데모 기본 노래', bundled: true };
      } catch { /* 다음 확장자 */ }
    }
    return null;
  })();
  return demoMusicCache[base].then(rec => rec && { ...rec, buf: rec.buf.slice(0) });
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
      if (isBeam(i)) { out[i].p = !!l.p; out[i].f = !!l.f; out[i].m = !!l.m; }
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
// 데모 공연은 정해진 길이(demo.duration)까지만 쓰고, 더 긴 노래 파일을 올려도 거기서 멈춤
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
/* ---------- 되돌리기 (Ctrl/Cmd+Z, 다시 하기 Ctrl/Cmd+Shift+Z 또는 Ctrl+Y) ----------
   저장할 때마다 바로 전 상태를 쌓아 둠. 0.8초 안에 이어진 저장(이름 입력, 슬라이더 등)은 한 번으로 묶음 */
const UNDO_MAX = 100;
const hist = { undo: [], redo: [], last: null, lastPush: 0 };
const snapshot = p => JSON.stringify({ name: p.name, cues: p.cues, dancerCount: p.dancerCount, names: p.names });
function resetHistory() {
  hist.undo = []; hist.redo = [];
  hist.last = state.project ? snapshot(state.project) : null;
}
function recordHistory() {
  const now = snapshot(state.project);
  if (now === hist.last) return;
  if (Date.now() - hist.lastPush > 800 || !hist.undo.length) {
    hist.undo.push(hist.last);
    if (hist.undo.length > UNDO_MAX) hist.undo.shift();
  }
  hist.lastPush = Date.now();
  hist.redo = [];
  hist.last = now;
}
function restoreSnapshot(json) {
  const p = state.project, d = JSON.parse(json);
  Object.assign(p, { name: d.name, cues: d.cues, dancerCount: d.dancerCount, names: d.names, updatedAt: Date.now() });
  hist.last = json;
  hist.lastPush = 0;
  state.activeCueId = undefined;
  state.danceKey = null;
  formDrag = null;
  clearTimeout(saveTimer);
  DB.putProject(p).catch(e => toast('저장 실패: ' + e.message));
  renderProjectSelect();
  syncToPlayhead(false);
  renderStage(currentLights(), 0.15);
  renderCueList();
  renderEditor();
  drawTimeline();
}
function undo() {
  if (!state.project || !hist.undo.length) { toast('되돌릴 작업이 없어요'); return; }
  hist.redo.push(snapshot(state.project));
  restoreSnapshot(hist.undo.pop());
  toast('되돌렸어요');
}
function redo() {
  if (!state.project || !hist.redo.length) { toast('다시 할 작업이 없어요'); return; }
  hist.undo.push(snapshot(state.project));
  restoreSnapshot(hist.redo.pop());
  toast('다시 했어요');
}

function save() {
  if (!state.project) return;
  recordHistory();
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
      onRow: (r, add) => selectGroup('r' + r, add),
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
    const tg = dancerTarget();
    state.danceKey = tg.key;
    stage3d.setDancers(tg.pos, dancerCount(), tg.dur || Math.max(0.8, fade));
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
// 지금 보여줄 대형: 섹션 기본 배치, 또는 섹션 안의 대형 변화(steps: [{t, move, pos}]) 중 이미 시작된 것
function dancerTarget() {
  const c = activeCue() || cues()[0];
  if (!c) return { pos: DEFAULT_POS, key: 'none', dur: null };
  const now = audio.currentTime;
  let pos = c.pos, start = c.time, move = c.move, key = c.id;
  if (c.steps && activeCue()) c.steps.forEach((st, i) => {
    if (st.t <= now) { pos = st.pos; start = st.t; move = st.move; key = `${c.id}:${i}`; }
  });
  return { pos, key, dur: move ? Math.max(0.3, start + move - now) : null };
}
const currentPos = () => dancerTarget().pos;
// 섹션 안 대형 변화가 시작되면 댄서 이동
function syncDancers() {
  const tg = dancerTarget();
  if (!stage3d || tg.key === state.danceKey) return;
  state.danceKey = tg.key;
  stage3d.setDancers(tg.pos, dancerCount(), tg.dur || 0.8);
  renderFormation();
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
  syncDancers();
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
  if (view.len && !audio.paused) {
    const { start, len } = viewRange(), t = audio.currentTime;
    if (t < start || t > start + len * 0.92) setView(t - len * 0.08, len);
  }
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
const LANE_H = 24;            // 파형 아래 동선 줄
// 동선 줄의 세로 위치 (아래 눈금 14px 위)
const laneTop = H => H - 14 - LANE_H;

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

// 타임라인 보기 범위 (확대/이동). len이 0이면 전체 보기
const view = { start: 0, len: 0 };
const MIN_VIEW = 3;
function viewRange() {
  const d = duration();
  const len = view.len && view.len < d ? view.len : d;
  const start = clamp(view.start, 0, Math.max(0, d - len));
  return { start, len };
}
function setView(start, len) {
  const d = duration();
  if (!d) return;
  len = clamp(len, Math.min(MIN_VIEW, d), d);
  view.len = len >= d ? 0 : len;
  view.start = view.len ? clamp(start, 0, d - len) : 0;
  drawTimeline();
}
function timeToX(t, W) { const { start, len } = viewRange(); return len ? ((t - start) / len) * W : 0; }
function xToTime(x, W) { const { start, len } = viewRange(); return clamp(start + (x / W) * len, 0, duration()); }

// 타임라인 위에 마우스가 있을 때 W/S 확대·축소 (마우스 위치 기준), A/D 왼쪽·오른쪽 이동
const tlHover = { on: false, x: 0 };
function timelineKey(code) {
  const W = cv.clientWidth, { start, len } = viewRange();
  if (!W || !len) return false;
  const mx = clamp(tlHover.x, 0, W), at = start + (mx / W) * len;
  if (code === 'KeyW' || code === 'KeyS') {
    const nl = code === 'KeyW' ? len / 1.5 : len * 1.5;
    setView(at - (mx / W) * nl, nl);
  } else if (code === 'KeyA' || code === 'KeyD') {
    setView(start + (code === 'KeyA' ? -0.25 : 0.25) * len, len);
  } else return false;
  return true;
}

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
    const x1 = i + 1 < list.length ? timeToX(list[i + 1].time, W) : timeToX(d, W);
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
  const top = BAND_H + 4, bottom = laneTop(H) - 3, mid = (top + bottom) / 2, amp = (bottom - top) / 2;
  if (state.peaks) {
    const p = state.peaks, n = p.length;
    const playX = timeToX(audio.currentTime, W);
    for (let x = 0; x < W; x++) {
      const i0 = Math.floor((xToTime(x, W) / d) * n), i1 = Math.max(i0 + 1, Math.floor((xToTime(x + 1, W) / d) * n));
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
  const vr = viewRange();
  const tick = vr.len > 240 ? 30 : vr.len > 60 ? 15 : vr.len > 20 ? 5 : vr.len > 8 ? 2 : 1;
  for (let t = Math.max(tick, Math.ceil(vr.start / tick) * tick); t < Math.min(d, vr.start + vr.len); t += tick) {
    const x = timeToX(t, W);
    ctx.fillRect(x, H - 12, 1, 4);
    ctx.fillText(fmt(t).replace(/\.\d$/, ''), x + 3, H - 3);
  }
  // 확대 중이면 범위 표시
  if (view.len) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(W - 118, BAND_H + 4, 114, 16);
    ctx.fillStyle = '#c9ccd6';
    ctx.fillText(`🔍 ${fmt(vr.start)} – ${fmt(vr.start + vr.len)}`, W - 114, BAND_H + 15);
  }

  // 동선 줄: 섹션 시작 배치(○)와 섹션 안 동선 변화(◆), 이동하는 동안은 막대로
  const ly = laneTop(H), lm = ly + LANE_H / 2;
  ctx.fillStyle = '#13151b';
  ctx.fillRect(0, ly, W, LANE_H);
  ctx.fillStyle = '#6b7080';
  ctx.font = '10px -apple-system, sans-serif';
  if (timeToX(0, W) > -40) ctx.fillText('동선', 4, lm + 3);
  const shown = dancerTarget().key;
  list.forEach(c => {
    const marks = [{ t: c.time, move: c.move, key: c.id, base: true }, ...(c.steps || []).map((st, i) => ({ t: st.t, move: st.move, key: `${c.id}:${i}` }))];
    for (const m of marks) {
      const x = timeToX(m.t, W), on = m.key === shown;
      if (m.move) {
        ctx.fillStyle = on ? 'rgba(255,181,71,.55)' : 'rgba(201,204,214,.25)';
        ctx.fillRect(x, lm - 2, Math.max(2, timeToX(m.t + m.move, W) - x), 4);
      }
      ctx.fillStyle = on ? '#ffb547' : '#c9ccd6';
      ctx.strokeStyle = on ? '#ffb547' : '#c9ccd6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (m.base) { ctx.arc(x, lm, 4, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.moveTo(x, lm - 6); ctx.lineTo(x + 6, lm); ctx.lineTo(x, lm + 6); ctx.lineTo(x - 6, lm); ctx.closePath(); ctx.fill(); }
      if (m.key === dragStepKey) { ctx.strokeStyle = '#fff'; ctx.stroke(); }
    }
  });

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
let dragStepKey = null;
// 동선 줄에서 가까운 표시 찾기 → { cue, idx(-1이면 시작 배치), t }
function hitStep(x, W) {
  let best = null, bestD = 9;
  for (const c of cues()) {
    const marks = [{ cue: c, idx: -1, t: c.time }, ...(c.steps || []).map((st, i) => ({ cue: c, idx: i, t: st.t }))];
    for (const m of marks) {
      const d = Math.abs(timeToX(m.t, W) - x);
      if (d < bestD) { best = m; bestD = d; }
    }
  }
  return best;
}
const inLane = (y, H) => y >= laneTop(H) && y < laneTop(H) + LANE_H;
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
  if (inLane(e.clientY - rect.top, rect.height)) {
    const m = hitStep(x, rect.width);
    if (m && m.idx >= 0) { dragStepKey = `${m.cue.id}:${m.idx}`; seek(m.t + 0.001); drawTimeline(); return; }
    if (m) { seek(m.t); return; }
  }
  const c = hitCue(x, rect.width);
  if (c) { dragCueId = c.id; }
  else { scrubbing = true; seek(xToTime(x, rect.width)); }
});
cv.addEventListener('pointermove', e => {
  const rect = cv.getBoundingClientRect();
  const x = e.clientX - rect.left;
  if (dragStepKey) {
    if (!dragMoved && Math.abs(x - downX) < 4) return;
    dragMoved = true;
    const [cid, si] = dragStepKey.split(':');
    const c = cues().find(c => c.id === cid);
    const st = c && c.steps && c.steps[+si];
    if (st) {
      const next = cues().find(n => n.time > c.time);
      st.t = Math.round(clamp(xToTime(x, rect.width), c.time + 0.1, next ? next.time - 0.1 : duration()) * 10) / 10;
      audio.currentTime = st.t + 0.001;
      state.danceKey = null;
      syncToPlayhead(false);
      drawTimeline();
    }
    return;
  }
  if (dragCueId) {
    if (!dragMoved && Math.abs(x - downX) < 4) return;
    dragMoved = true;
    const c = cues().find(c => c.id === dragCueId);
    if (c) { c.time = Math.round(xToTime(x, rect.width) * 10) / 10; sortCues(); drawTimeline(); renderCueList(); }
  } else if (scrubbing) {
    seek(xToTime(x, rect.width));
  } else {
    const lane = inLane(e.clientY - rect.top, rect.height);
    const m = lane && hitStep(x, rect.width);
    cv.style.cursor = m ? (m.idx >= 0 ? 'ew-resize' : 'pointer') : !lane && hitCue(x, rect.width) ? 'ew-resize' : 'pointer';
  }
});
function endPointer() {
  if (dragStepKey) {
    const [cid] = dragStepKey.split(':');
    const c = cues().find(c => c.id === cid);
    if (c && c.steps) {
      // 순서가 바뀌었으면 정렬하고, 끌던 동선이 계속 선택되게
      const moved = c.steps[+dragStepKey.split(':')[1]];
      c.steps.sort((a, b) => a.t - b.t);
      if (dragMoved) save();
      if (moved) seek(moved.t + 0.001);
    }
    dragStepKey = null;
    drawTimeline();
  }
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

// 인원 배치 패널의 동선 목록: 시작 배치 + 섹션 안 동선 변화
function renderSteps() {
  const box = $('#formSteps');
  box.textContent = '';
  const cue = activeCue();
  if (!cue) return;
  const shown = dancerTarget().key;
  const add = (label, key, t) => {
    const b = el('button', 'chip' + (key === shown ? ' on' : ''), label);
    b.addEventListener('click', () => seek(t));
    box.append(b);
  };
  add('시작 배치', cue.id, cue.time);
  (cue.steps || []).forEach((st, i) => add(`◆ ${fmt(st.t)}`, `${cue.id}:${i}`, st.t + 0.001));
  const isStep = shown.includes(':');
  $('#formStepDel').disabled = !isStep;
  // 지금 보이는 동선의 이동 시간
  const cur = isStep ? cue.steps[+shown.split(':')[1]] : cue;
  const mv = $('#formMove');
  if (document.activeElement !== mv) mv.value = cur && cur.move ? cur.move : '';
}
function addStep() {
  const cue = activeCue();
  if (!cue) { toast('먼저 섹션을 추가하세요'); return; }
  const t = Math.round(audio.currentTime * 10) / 10;
  if (t < cue.time + 0.1) { toast('섹션 시작 지점에는 시작 배치가 있어요. 재생 위치를 조금 뒤로 옮겨 주세요'); return; }
  cue.steps = cue.steps || [];
  if (cue.steps.some(st => Math.abs(st.t - t) < 0.15)) { toast('이 위치에 이미 동선이 있어요'); return; }
  cue.steps.push({ t, move: 1, pos: currentPos().map(p => p.slice()) });
  cue.steps.sort((a, b) => a.t - b.t);
  save();
  seek(t + 0.001);
  toast('지금 배치를 복사해서 동선을 추가했어요. 사람을 끌어서 옮겨 주세요');
}
function deleteStep() {
  const cue = activeCue();
  const key = dancerTarget().key;
  if (!cue || !key.includes(':')) return;
  cue.steps.splice(+key.split(':')[1], 1);
  if (!cue.steps.length) delete cue.steps;
  state.danceKey = null;
  save();
  syncToPlayhead(false);
  drawTimeline();
}
function setMoveTime(v) {
  const cue = activeCue();
  if (!cue) return;
  const key = dancerTarget().key;
  const target = key.includes(':') ? cue.steps[+key.split(':')[1]] : cue;
  const n = parseFloat(v);
  if (isFinite(n) && n > 0) target.move = clamp(n, 0.3, 10); else delete target.move;
  save();
  drawTimeline();
}

// 왼쪽 명단: 인원수만큼 동그라미, 누르면 이름 바꾸기 (평면도의 동그라미는 옮기기만)
let rosterEditing = -1;
function renderRoster() {
  if (rosterEditing >= 0) return;
  const box = $('#roster');
  box.textContent = '';
  const names = (state.project && state.project.names) || [];
  for (let i = 0; i < dancerCount(); i++) {
    const b = el('button', 'roster-item');
    b.append(el('span', 'rc', names[i] || i + 1));
    b.title = `${names[i] || `${i + 1}번`} · 눌러서 이름 바꾸기`;
    b.addEventListener('click', () => editRosterName(i, b));
    box.append(b);
  }
}
function editRosterName(i, btn) {
  const p = state.project;
  if (!p) return;
  rosterEditing = i;
  const input = el('input', 'roster-edit');
  input.value = (p.names && p.names[i]) || '';
  input.maxLength = 4;
  input.placeholder = `${i + 1}번`;
  btn.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    rosterEditing = -1;
    if (ok) {
      const v = input.value.trim().slice(0, 4);
      const names = Array.from({ length: MAX_DANCERS }, (_, k) => (p.names && p.names[k]) || '');
      names[i] = v;
      p.names = names.some(Boolean) ? names : undefined;
      save();
    }
    renderFormation();
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function renderFormation() {
  renderSteps();
  renderRoster();
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
  const target = currentPos();
  const old = target[formDrag.i];
  if (old[0] === np[0] && old[1] === np[1]) return;
  target[formDrag.i] = np;
  if (stage3d) stage3d.setDancers(target, dancerCount(), 0.12);
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
  const target = currentPos();
  target.splice(0, MAX_DANCERS, ...fullPos([...made, ...target.slice(n)]));
  renderStage(currentLights(), 0.15);
  save();
}
// 타임라인 '동선' 줄에서 지금 배치(○ 또는 ◆) 바로 앞에 있는 배치를 복사
function copyPrevFormation() {
  const cue = activeCue();
  if (!cue) { toast('먼저 섹션을 추가하세요'); return; }
  const key = dancerTarget().key;
  const target = currentPos();
  const n = dancerCount();
  // 시간순 전체 배치 목록
  const all = [];
  for (const c of cues()) {
    all.push({ key: c.id, t: c.time, pos: c.pos, label: `'${c.name || '(이름 없음)'}' 시작 배치` });
    (c.steps || []).forEach((st, i) => all.push({ key: `${c.id}:${i}`, t: st.t, pos: st.pos, label: `${fmt(st.t)} 동선` }));
  }
  const idx = all.findIndex(f => f.key === key);
  const same = (a, b) => a.slice(0, n).every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);
  const prev = idx > 0 ? all[idx - 1] : null;
  if (!prev) { toast('앞에 있는 배치가 없어요'); return; }
  const josa = prev.label.endsWith('동선') ? '과' : '와';
  if (same(prev.pos, target)) { toast(`바로 앞 ${prev.label}${josa} 이미 같아요`); return; }
  target.splice(0, MAX_DANCERS, ...prev.pos.map(p => p.slice()));
  state.danceKey = null;
  renderStage(currentLights(), 0.15);
  save();
  toast(`${prev.label}${prev.label.endsWith('동선') ? '을' : '를'} 복사했어요`);
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
    if (l.m && l.b) d.classList.add('moving');
    if (l.b) { d.style.background = l.c; d.style.opacity = 0.3 + 0.7 * l.b / 100; }
    else { d.style.background = '#3a3d47'; d.style.opacity = 0.5; }
    if (sel && sel.has(i)) d.classList.add('sel');
    if (onPick) {
      d.title = `${ROW_NAMES[r]} ${k + 1}번 · 밝기 ${l.b}%${l.p ? ' · 프리즘' : ''}${l.f ? ' · 센터 모으기' : ''}${l.m ? ' · 무빙' : ''}`;
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
    li.dataset.id = c.id;
    if (c.id === state.activeCueId) li.classList.add('active');
    const active = c.id === state.activeCueId;
    const nm = el('span', 'n', c.name || '(이름 없음)');
    nm.title = '이름을 누르면 바로 바꿀 수 있어요';
    nm.addEventListener('click', e => { e.stopPropagation(); renameInList(c, nm); });
    li.append(el('span', 't', fmt(c.time)), nm,
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

// 섹션 목록에서 이름 바로 바꾸기 (Enter/바깥 클릭 = 저장, Esc = 취소)
function renameInList(c, span) {
  if (c.id !== state.activeCueId) seek(c.time);
  const li = [...$$('#cueList li')].find(x => x.dataset.id === c.id);
  const target = li ? li.querySelector('.n') : span;
  const input = el('input', 'n-edit');
  input.value = c.name || '';
  input.maxLength = 40;
  target.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    if (ok) {
      c.name = input.value.trim();
      save(); renderHud(); drawTimeline(); renderEditor();
    }
    renderCueList();
  };
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
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
    pos: normalizePos(base ? currentPos().map(p => p.slice()) : null),
  };
  // 나눠진 섹션의 뒤쪽 ◆ 동선은 새 섹션으로 옮김
  if (base && base.steps) {
    const after = base.steps.filter(st => st.t > t);
    if (after.length) {
      cue.steps = after;
      base.steps = base.steps.filter(st => st.t <= t);
      if (!base.steps.length) delete base.steps;
    }
  }
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
  $('#btnMove').classList.toggle('on', pb.length > 0 && pb.every(i => cue.lights[i].m));
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
// add(Shift)면 지금 선택에 더하기, 그 그룹이 이미 다 선택돼 있으면 그 그룹만 빼기
function selectGroup(key, add = false) {
  const group = [...Array(N).keys()].filter(GROUPS[key]);
  if (!add || key === 'all' || key === 'none') state.selected = new Set(group);
  else if (group.length && group.every(i => state.selected.has(i))) group.forEach(i => state.selected.delete(i));
  else group.forEach(i => state.selected.add(i));
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
// key: 'p' 프리즘 / 'f' 센터 모으기 / 'm' 무빙
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
  // 프리셋에서 켜지는 조명만 선택 상태로 (해당 범위 안에서)
  const scope = only === 'wash' ? i => !isBeam(i) : only === 'beam' ? isBeam : () => true;
  state.selected = new Set(next.map((l, i) => i).filter(i => scope(i) && next[i].b));
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
  $$('.demo-btn').forEach(b => b.classList.toggle('on', demoKey(state.project) === b.dataset.demo));
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
  view.start = 0; view.len = 0;
  for (const c of p.cues) {
    if (c.lights.length !== N) c.lights = normalizeLights(c.lights);
    if (!Array.isArray(c.pos) || c.pos.length !== MAX_DANCERS) c.pos = normalizePos(c.pos);
    if (c.steps) c.steps = normalizeSteps(c.steps);
  }
  if (!Number.isInteger(p.dancerCount)) p.dancerCount = DEFAULT_DANCERS;
  sortCues();
  resetHistory();
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
      steps: c.steps ? normalizeSteps(c.steps) : undefined,
      move: isFinite(c.move) && c.move > 0 ? clamp(+c.move, 0.3, 10) : undefined,
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
  $$('[data-sel]').forEach(b => {
    b.addEventListener('click', e => selectGroup(b.dataset.sel, e.shiftKey));
    if (!['all', 'none'].includes(b.dataset.sel)) b.title = 'Shift를 누르고 누르면 선택에 더하기/빼기';
  });
  $$('[data-bri]').forEach(b => b.addEventListener('click', () => setBrightness(+b.dataset.bri)));
  // 데모 버튼 (데모마다 하나씩)
  Object.entries(DEMOS).forEach(([key, d], i) => {
    const b = el('button', 'demo-btn', `🎬 데모 ${i + 1} ${d.title}`);
    b.dataset.demo = key;
    b.title = `${d.song} · ${d.dancers}명 · ${fmt(d.duration).replace(/\.\d$/, '')}`;
    b.addEventListener('click', () => openDemo(key));
    $('#demoBtns').append(b);
  });
  $('#btnPrism').addEventListener('click', () => toggleBeamFlag('p', '프리즘'));
  $('#btnFocus').addEventListener('click', () => toggleBeamFlag('f', '센터 모으기'));
  $('#btnMove').addEventListener('click', () => toggleBeamFlag('m', '무빙'));
  $('#dancerMinus').addEventListener('click', () => setDancerCount(dancerCount() - 1));
  $('#dancerPlus').addEventListener('click', () => setDancerCount(dancerCount() + 1));
  $('#formCopyPrev').addEventListener('click', copyPrevFormation);
  $('#formStepAdd').addEventListener('click', addStep);
  $('#formStepDel').addEventListener('click', deleteStep);
  $('#formMove').addEventListener('change', e => setMoveTime(e.target.value));
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
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (e.ctrlKey && !e.altKey && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (tlHover.on && !state.showMode && timelineKey(e.code)) { e.preventDefault(); return; }
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.target.closest('button')) e.target.blur();
      togglePlay();
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(audio.currentTime - 5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(audio.currentTime + 5); }
    else if (e.key === 'm' || e.key === 'M') { if (!state.showMode) { e.preventDefault(); addCue(); } }
    else if (e.code === 'KeyQ' && !state.showMode) { e.preventDefault(); if (state.selected.size) { selectGroup('none'); toast('조명 선택을 모두 해제했어요'); } }
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

  const tw = $('#timelineWrap');
  tw.addEventListener('pointerenter', () => { tlHover.on = true; });
  tw.addEventListener('pointerleave', () => { tlHover.on = false; });
  tw.addEventListener('pointermove', e => { tlHover.x = e.clientX - cv.getBoundingClientRect().left; });
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
  // 이 데모에 직접 올린 노래가 있고 데모 기본 노래도 있으면, 바꿀지 물어봄
  let mine = null;
  try { mine = await DB.getAudio(p.id); } catch { /* 무시 */ }
  if (mine && await loadDemoMusic(DEMOS[key].music) &&
      confirm(`이 데모에 직접 올린 노래가 있어요: ${mine.name || '(이름 없음)'}\n\n지우고 데모 기본 노래로 바꿀까요?\n확인 → 데모 기본 노래로 / 취소 → 올린 노래 그대로`)) {
    await DB.delAudio(p.id).catch(() => {});
    p.audioName = '';
    await DB.putProject(p).catch(() => {});
  }
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
