import { createStage } from './stage3d.js?v=5';

/* =========================================================
   상수
   ========================================================= */
const ROWS = 3, COLS = 6, N = ROWS * COLS;
const ROW_NAMES = ['뒷줄', '중간줄', '앞줄'];
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
const rowOf = i => Math.floor(i / COLS);
const colOf = i => i % COLS;

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
const L = (c, b) => ({ c, b });
const fill = (c, b) => Array.from({ length: N }, () => L(c, b));
const cloneLights = ls => ls.map(l => L(l.c, l.b));
function lightsWhere(pred, c = '#ffffff', b = 100) {
  return Array.from({ length: N }, (_, i) => pred(rowOf(i), colOf(i)) ? L(c, b) : L(c, 0));
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

function normalizeLights(ls) {
  const out = fill('#ffffff', 0);
  if (Array.isArray(ls)) {
    for (let i = 0; i < N; i++) {
      const l = ls[i];
      if (!l) continue;
      if (typeof l.c === 'string' && /^#[0-9a-f]{6}$/i.test(l.c)) out[i].c = l.c.toLowerCase();
      if (typeof l.b === 'number' && isFinite(l.b)) out[i].b = clamp(Math.round(l.b), 0, 100);
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
const duration = () => (isFinite(audio.duration) ? audio.duration : 0);

function newProjectData(name = DEFAULT_NAME) {
  return {
    id: uid(),
    name,
    audioName: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cues: [{ id: uid(), time: 0, name: '시작', fade: 0, lights: fill('#ffffff', 50) }],
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

function renderStage(lights, fade = 0.15) {
  if (stage3d) stage3d.setLights(lights, fade);
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

function computePeaks(buf, buckets = 3000) {
  const ch = buf.numberOfChannels;
  const data = [];
  for (let i = 0; i < ch; i++) data.push(buf.getChannelData(i));
  const len = data[0].length;
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
    const a = avgLight(c.lights);
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
   섹션 목록
   ========================================================= */
// onPick(i)가 있으면 점을 눌러 해당 조명을 고를 수 있음, sel은 선택 표시할 조명 집합
function miniGrid(lights, onPick, sel) {
  const g = el('div', 'mini');
  lights.forEach((l, i) => {
    const d = el('i');
    if (l.b) { d.style.background = l.c; d.style.opacity = 0.3 + 0.7 * l.b / 100; }
    else { d.style.background = '#3a3d47'; d.style.opacity = 0.5; }
    if (sel && sel.has(i)) d.classList.add('sel');
    if (onPick) {
      d.title = `${ROW_NAMES[rowOf(i)]} ${colOf(i) + 1}번 · 밝기 ${l.b}%`;
      d.addEventListener('click', e => { e.stopPropagation(); onPick(i); });
    }
    g.append(d);
  });
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
      miniGrid(c.lights, i => pickCueLight(c, i), active ? state.selected : null));
    const del = el('button', 'del', '✕');
    del.title = '섹션 삭제';
    del.addEventListener('click', e => { e.stopPropagation(); deleteCue(c.id); });
    li.append(del);
    li.addEventListener('click', () => seek(c.time));
    ol.append(li);
  }
  const act = ol.querySelector('.active');
  if (act && !audio.paused) act.scrollIntoView({ block: 'nearest' });
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
  return state.selected.size ? [...state.selected] : [...Array(N).keys()];
}

function renderSelection() {
  if (stage3d) stage3d.setSelected(state.selected);
  $$('#cueList li.active .mini i').forEach((d, i) => d.classList.toggle('sel', state.selected.has(i)));
  const n = state.selected.size;
  $('#selInfo').textContent = n
    ? `선택한 조명 ${n}개에 적용돼요. (무대 조명이나 섹션 목록의 점을 눌러 선택/해제)`
    : '선택 없음 → 전체 조명에 적용돼요. 무대 조명이나 섹션 목록의 점을 눌러 일부만 고를 수 있어요.';
  const cue = activeCue();
  if (!cue) return;
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
  left: i => colOf(i) < 2,
  center: i => colOf(i) === 2 || colOf(i) === 3,
  right: i => colOf(i) > 3,
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

function setBrightness(b) {
  const cue = activeCue();
  if (!cue) return;
  for (const i of targets()) cue.lights[i].b = b;
  lightsChanged();
}

function applyPreset(lights) {
  const cue = activeCue();
  if (!cue) { toast('먼저 섹션을 추가하세요'); return; }
  cue.lights = cloneLights(lights);
  lightsChanged();
}

function presetButton(name, lights, onRemove) {
  const b = el('button', 'preset');
  b.append(miniGrid(lights), el('span', null, name));
  b.title = `"${name}" 적용`;
  b.addEventListener('click', () => applyPreset(lights));
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
  for (const p of BUILTIN_PRESETS) g.append(presetButton(p.name, p.make()));
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
  sortCues();
  try { localStorage.setItem('lightcue.last', id); } catch { /* 무시 */ }
  state.activeCueId = undefined;
  renderProjectSelect();
  let rec = null;
  try { rec = await DB.getAudio(id); } catch (e) { console.warn(e); }
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
      state.peaks = computePeaks(decoded);
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
  if (state.audioRec) {
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
    })),
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
  $$('[data-front]').forEach(b => b.addEventListener('click', () => {
    const on = !b.classList.contains('on');
    $$('[data-front]').forEach(x => x.classList.toggle('on', on && x === b));
    if (stage3d) stage3d.setFrontLights(on ? +b.dataset.front : 0);
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
async function init() {
  buildStage();
  buildPresets();
  renderCustomPresets();
  bindEvents();
  try {
    state.projects = await DB.allProjects();
  } catch (e) {
    toast('브라우저 저장소를 쓸 수 없어요 (시크릿 모드?)');
    state.projects = [];
  }
  if (!state.projects.length) {
    const p = newProjectData();
    state.projects.push(p);
    await DB.putProject(p).catch(() => {});
  }
  let last = null;
  try { last = localStorage.getItem('lightcue.last'); } catch { /* 무시 */ }
  const pick = state.projects.find(p => p.id === last) || state.projects.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
  await openProject(pick.id);
  renderPlayButtons();
}

init();

// 디버깅/테스트용
window.__lc = { state, audio, seek, addCue, applyPreset, BUILTIN_PRESETS, selectGroup, setColor, setBrightness, cues, activeCue, enterShow, exitShow };
