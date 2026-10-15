// 3D 무대 렌더러 (three.js)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const ROWS = 3, COLS = 6, N_WASH = ROWS * COLS;
const N_BEAM_TOP = 8, N_BEAM_FLOOR = 4, N = N_WASH + N_BEAM_TOP + N_BEAM_FLOOR;
const ROW_NAMES = ['뒷줄', '중간줄', '앞줄', '빔 상단', '빔 하단'];
const rowOf = i => i < N_WASH ? Math.floor(i / COLS) : i < N_WASH + N_BEAM_TOP ? 3 : 4;
const colOf = i => i < N_WASH ? i % COLS : i < N_WASH + N_BEAM_TOP ? i - N_WASH : i - N_WASH - N_BEAM_TOP;
const STAGE_W = 13, STAGE_D = 9;
const TRUSS_Y = 6.2;
// fz: 트러스(기구) 위치, tz: 바닥에 떨어지는 위치, span: 좌우 폭
const ROW_DEF = [
  { fz: -4.0, tz: -2.6, span: 8.4 },
  { fz: -1.0, tz: -0.3, span: 9.6 },
  { fz: 3.8, tz: 1.9, span: 10.8 },
];
const SPOT_INTENSITY = 150;
const BEAM_OPACITY = 0.22;
const BEAM_ANGLE = 0.32;      // 조명 퍼지는 각도 (반각, 라디안)
const CAM_HOME = new THREE.Vector3(0, 3.1, 19);
const CAM_TARGET = new THREE.Vector3(0, 2.4, 0);
const STAGE_H = 1.1;          // 무대 단 높이
export const MAX_DANCERS = 20;

// 빔 조명 (무빙 빔): 상단 트러스 8대 + 바닥 4대
// 기본 각도: 상단은 객석 쪽으로 부채꼴, 하단은 위로 V자 부채꼴
const BEAM_TOP = { y: 7.3, z: -3.3, span: 10.5 };
const BEAM_FLOOR_X = [-4.8, -1.6, 1.6, 4.8], BEAM_FLOOR_Z = -3.7;
const BEAM_HALF = 0.03;       // 빔 반각 (아주 좁게)
const BEAM_OP = 0.85;
const PRISM_FACETS = 8, PRISM_SPREAD = 0.12, PRISM_SPEED = 0.9; // 프리즘: 갈래 수, 벌어짐(라디안), 회전 속도
// 센터 모으기: 빔이 무대 가운데로 모임 (상단은 바닥 센터, 하단은 무대 위 공중 한 점)
function beamFocus(i, origin, top) {
  return top ? new THREE.Vector3(origin.x * 0.16, 0, 0.5) : new THREE.Vector3(origin.x * 0.12, 8.2, 0.4);
}
function beamAim(i) {
  if (i < N_WASH + N_BEAM_TOP) {
    const k = i - N_WASH;
    const x = -BEAM_TOP.span / 2 + BEAM_TOP.span * (k + 0.5) / N_BEAM_TOP;
    return { origin: new THREE.Vector3(x, BEAM_TOP.y, BEAM_TOP.z), target: new THREE.Vector3(x * 1.15, 0, 3.0), top: true };
  }
  const x = BEAM_FLOOR_X[i - N_WASH - N_BEAM_TOP];
  return { origin: new THREE.Vector3(x, 0.32, BEAM_FLOOR_Z), target: new THREE.Vector3(x * 1.25, 9.2, 2.0), top: false };
}
const HOUSE = { hemi: 0.9, fill: 1.1 };
const FRONT_INTENSITY = 220;  // 전면등 100%일 때 (좌우 각각)

const beamVert = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const beamFrag = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec3 uOrigin;
  uniform float uLength;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    float d = clamp(distance(vWorldPos, uOrigin) / uLength, 0.0, 1.0);
    float att = pow(1.0 - d, 1.2) * smoothstep(0.0, 0.08, d);
    float edge = pow(clamp(abs(vNormal.z), 0.0, 1.0), 2.2);
    // 스모크가 흐르는 느낌
    float haze = 0.78 + 0.22 * sin(vWorldPos.y * 2.3 + uTime * 0.7 + vWorldPos.x * 1.4)
                            * sin(vWorldPos.x * 1.9 - uTime * 0.45 + vWorldPos.z);
    gl_FragColor = vec4(uColor, att * edge * haze * uOpacity);
  }`;

// 무대 위 조명 위치 (평면도에 빛 자국 그리기용): 워시 18개 + 상단 빔 8개 (+바닥 빔은 위로 쏘므로 null)
export function lightTargets() {
  const out = [];
  for (let i = 0; i < N_WASH; i++) {
    const row = ROW_DEF[Math.floor(i / COLS)], c = i % COLS;
    out.push({ x: -row.span / 2 + row.span * (c + 0.5) / COLS, z: row.tz, r: Math.tan(BEAM_ANGLE) * Math.hypot(TRUSS_Y, row.fz - row.tz) });
  }
  for (let i = N_WASH; i < N; i++) {
    const { origin, target, top } = beamAim(i);
    out.push(top ? { x: target.x, z: target.z, r: Math.tan(BEAM_HALF) * origin.distanceTo(target) * 2.2 } : null);
  }
  return out;
}

export function createStage(container, { onToggle, onRow }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.className = 'stage-canvas';
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0908);

  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
  camera.position.copy(CAM_HOME);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(CAM_TARGET);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 26;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.5;
  controls.minAzimuthAngle = -1.1;
  controls.maxAzimuthAngle = 1.1;
  controls.update();

  // 객석등: 무대가 너무 어둡지 않게 비추는 따뜻한 기본 조명 (끄고 켤 수 있음)
  const houseHemi = new THREE.HemisphereLight(0xffe6c8, 0x2a1410, HOUSE.hemi);
  const houseFill = new THREE.DirectionalLight(0xffe2bc, HOUSE.fill);
  houseFill.position.set(0, 9, 16);
  scene.add(houseHemi, houseFill, houseFill.target);

  // 전면등: 객석 쪽 위에서 무대 앞쪽을 비추는 따뜻한 흰색 워시 (좌우 2대)
  const frontLights = [-4.5, 4.5].map(x => {
    const s = new THREE.SpotLight(0xfff1dc, 0, 0, 0.36, 0.8, 2);
    s.position.set(x, 8.5, 13);
    s.target.position.set(x * 0.3, 0, 3.6);
    scene.add(s, s.target);
    return s;
  });

  buildVenue(scene);
  const metal = new THREE.MeshStandardMaterial({ color: 0x55575e, roughness: 0.45, metalness: 0.8 });
  const fixtureMat = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.6, metalness: 0.4 });
  for (const row of ROW_DEF) {
    const truss = new THREE.Mesh(new THREE.BoxGeometry(row.span + 1.6, 0.18, 0.18), metal);
    truss.position.set(0, TRUSS_Y + 0.35, row.fz);
    scene.add(truss);
  }

  // 댄서 (최대 MAX_DANCERS명, 섹션이 바뀌면 새 위치로 걸어감)
  const dancerMat = new THREE.MeshStandardMaterial({ color: 0x8a8d96, roughness: 0.7 });
  const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.85, 4, 12);
  const headGeo = new THREE.SphereGeometry(0.13, 16, 12);
  const dancers = [];
  for (let i = 0; i < MAX_DANCERS; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, dancerMat);
    body.position.y = 0.65;
    const head = new THREE.Mesh(headGeo, dancerMat);
    head.position.y = 1.47;
    g.add(body, head);
    g.visible = false;
    scene.add(g);
    dancers.push({ g, from: new THREE.Vector2(), to: new THREE.Vector2(), t0: 0, dur: 0 });
  }

  /* ---------- 조명 ---------- */
  const lights = [];
  const down = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < N_WASH; i++) {
    const r = Math.floor(i / COLS), c = i % COLS, row = ROW_DEF[r];
    const x = -row.span / 2 + row.span * (c + 0.5) / COLS;
    const origin = new THREE.Vector3(x, TRUSS_Y, row.fz);
    const target = new THREE.Vector3(x, 0, row.tz);
    const dir = target.clone().sub(origin).normalize();
    const len = origin.distanceTo(target);
    const angle = BEAM_ANGLE;

    const spot = new THREE.SpotLight(0xffffff, 0, 0, angle, 0.55, 2);
    spot.position.copy(origin);
    spot.target.position.copy(target);
    scene.add(spot, spot.target);

    const radius = Math.tan(angle) * len * 1.05;
    const beamGeo = new THREE.CylinderGeometry(0.1, radius, len, 48, 1, true);
    beamGeo.translate(0, -len / 2, 0);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0 },
        uOrigin: { value: origin },
        uLength: { value: len * 1.15 },
        uTime: { value: 0 },
      },
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.copy(origin);
    beam.quaternion.setFromUnitVectors(down, dir);
    beam.visible = false;
    scene.add(beam);

    // 기구 몸체 + 렌즈 (블룸으로 빛남)
    const body = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.42, 20), fixtureMat);
    can.position.y = 0.12;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.095;
    body.add(can, lens);
    body.position.copy(origin);
    body.quaternion.setFromUnitVectors(down, dir);
    scene.add(body);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), metal);
    hook.position.set(x, TRUSS_Y + 0.2, row.fz);
    scene.add(hook);

    lights.push({
      spot, beam, lens, target, origin,
      cur: { r: 0, g: 0, b: 0, o: 0, p: 0 },
      from: { r: 0, g: 0, b: 0, o: 0, p: 0 },
      to: { r: 0, g: 0, b: 0, o: 0, p: 0 },
      t0: 0, dur: 0,
    });
  }

  /* ---------- 빔 조명 ---------- */
  const sparkGeo = new THREE.CircleGeometry(0.3, 16);
  const tmpV = new THREE.Vector3(), tmpDir = new THREE.Vector3();
  const poolTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const beamTruss = new THREE.Mesh(new THREE.BoxGeometry(BEAM_TOP.span + 1.2, 0.18, 0.18), metal);
  beamTruss.position.set(0, BEAM_TOP.y + 0.42, BEAM_TOP.z);
  scene.add(beamTruss);
  const makeBeamMat = origin => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uOpacity: { value: 0 },
      uOrigin: { value: origin },
      uLength: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: beamVert,
    fragmentShader: beamFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  for (let i = N_WASH; i < N; i++) {
    const { origin, target, top } = beamAim(i);
    const dir = target.clone().sub(origin).normalize();
    const len = origin.distanceTo(target);
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.05 + Math.tan(BEAM_HALF) * len, len, 24, 1, true);
    beamGeo.translate(0, -len / 2, 0);

    // 축 방향 정렬용 그룹 (로컬 -Y가 빔 방향)
    const aim = new THREE.Group();
    aim.position.copy(origin);
    aim.quaternion.setFromUnitVectors(down, dir);
    scene.add(aim);

    const mat = makeBeamMat(origin);
    mat.uniforms.uLength.value = len * 1.05;
    const beam = new THREE.Mesh(beamGeo, mat);
    beam.visible = false;
    aim.add(beam);

    // 프리즘: 축 둘레로 여러 갈래, 천천히 회전
    const spin = new THREE.Group();
    aim.add(spin);
    const pmat = makeBeamMat(origin);
    pmat.uniforms.uLength.value = len * 1.05;
    for (let k = 0; k < PRISM_FACETS; k++) {
      const holder = new THREE.Group();
      holder.rotation.y = k * Math.PI * 2 / PRISM_FACETS;
      const facet = new THREE.Mesh(beamGeo, pmat);
      facet.rotation.x = PRISM_SPREAD;
      holder.add(facet);
      spin.add(holder);
    }
    spin.visible = false;
    const facets = spin.children.map(h => h.children[0]);

    // 프리즘 바닥 무늬: 갈래마다 바닥에 닿는 작은 빛점 (상단 빔만)
    const sparks = [];
    if (top) {
      for (let k = 0; k < PRISM_FACETS; k++) {
        const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({
          map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
        }));
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        scene.add(m);
        sparks.push(m);
      }
    }

    // 바닥에 떨어지는 빛 자국 (상단 빔만, 실제 조명 대신 가벼운 가산 원판)
    let pool = null;
    if (top) {
      const pr = Math.tan(BEAM_HALF) * len * 2.2;
      pool = new THREE.Mesh(new THREE.CircleGeometry(pr, 32), new THREE.MeshBasicMaterial({
        map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
      }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(target.x, 0.012, target.z);
      scene.add(pool);
    }

    // 무빙 헤드 기구: 받침 + 머리
    const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.34), fixtureMat);
    baseMesh.position.set(origin.x, origin.y + (top ? 0.3 : -0.24), origin.z);
    scene.add(baseMesh);
    const head = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.4, 20), fixtureMat);
    can.position.y = 0.12;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.085;
    head.add(can, lens);
    aim.add(head);

    lights.push({
      spot: null, pool, beam, lens, target, origin, spin, pmat, isBeam: true,
      aim, facets, sparks, top, baseLen: len, mat,
      home: target.clone(), focus: beamFocus(i, origin, top), aimAt: target.clone(),
      cur: { r: 0, g: 0, b: 0, o: 0, p: 0, f: 0 },
      from: { r: 0, g: 0, b: 0, o: 0, p: 0, f: 0 },
      to: { r: 0, g: 0, b: 0, o: 0, p: 0, f: 0 },
      t0: 0, dur: 0,
    });
  }

  /* ---------- 선택용 마커 (DOM 오버레이) ---------- */
  const marksLayer = container.querySelector('#marks');
  const marks = [];
  for (let i = 0; i < N; i++) {
    const mark = document.createElement('button');
    mark.className = 'mark';
    mark.setAttribute('aria-label', `${ROW_NAMES[rowOf(i)]} ${colOf(i) + 1}번 조명`);
    mark.addEventListener('click', () => onToggle(i));
    marksLayer.append(mark);
    marks.push({ mark });
  }
  const rowLabels = ROW_NAMES.map((name, r) => {
    const b = document.createElement('button');
    b.className = 'row-label';
    b.textContent = name;
    b.title = `${name} 전체 선택`;
    b.addEventListener('click', () => onRow(r));
    marksLayer.append(b);
    const pos = r === 3 ? new THREE.Vector3(-BEAM_TOP.span / 2 - 0.8, BEAM_TOP.y + 0.42, BEAM_TOP.z)
      : r === 4 ? new THREE.Vector3(BEAM_FLOOR_X[0] - 0.6, 0.3, BEAM_FLOOR_Z)
      : new THREE.Vector3(-ROW_DEF[r].span / 2 - 1.0, TRUSS_Y + 0.35, ROW_DEF[r].fz);
    return { el: b, pos };
  });

  /* ---------- 후처리 (블룸) ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let W = 1, H = 1;
  function resize() {
    W = Math.max(1, container.clientWidth);
    H = Math.max(1, container.clientHeight);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const v = new THREE.Vector3();
  function placeMarks() {
    const widths = rowLabels.map(rl => rl.el.offsetWidth); // 스타일 쓰기 전에 먼저 읽기
    for (let i = 0; i < N; i++) {
      v.copy(lights[i].origin).project(camera);
      const m = marks[i].mark.style;
      m.left = ((v.x + 1) / 2 * W) + 'px';
      m.top = ((1 - v.y) / 2 * H) + 'px';
    }
    // 트러스 왼쪽 끝에 라벨 오른쪽을 맞춤 (화면 밖으로 나가지 않게)
    rowLabels.forEach((rl, r) => {
      v.copy(rl.pos).project(camera);
      rl.el.style.left = Math.max(4 + widths[r], (v.x + 1) / 2 * W) + 'px';
      rl.el.style.top = ((1 - v.y) / 2 * H) + 'px';
    });
  }

  /* ---------- 애니메이션 ---------- */
  const tmp = new THREE.Color();
  const clock = new THREE.Clock();
  const ease = k => k * k * (3 - 2 * k);

  function tick() {
    const now = performance.now();
    const t = clock.getElapsedTime();
    for (const L of lights) {
      const k = L.dur > 0 ? ease(Math.min(1, (now - L.t0) / (L.dur * 1000))) : 1;
      const { from, to, cur } = L;
      cur.r = from.r + (to.r - from.r) * k;
      cur.g = from.g + (to.g - from.g) * k;
      cur.b = from.b + (to.b - from.b) * k;
      cur.o = from.o + (to.o - from.o) * k;
      cur.p = from.p + (to.p - from.p) * k;
      if (L.spot) {
        L.spot.color.setRGB(cur.r, cur.g, cur.b);
        L.spot.intensity = cur.o * SPOT_INTENSITY;
      }
      if (L.pool) {
        L.pool.material.color.setRGB(cur.r, cur.g, cur.b);
        L.pool.material.opacity = cur.o * (1 - cur.p);
        L.pool.visible = L.pool.material.opacity > 0.002;
      }
      const u = L.beam.material.uniforms;
      u.uColor.value.setRGB(cur.r, cur.g, cur.b);
      u.uOpacity.value = cur.o * (L.isBeam ? BEAM_OP * (1 - cur.p) : BEAM_OPACITY);
      u.uTime.value = t;
      L.beam.visible = u.uOpacity.value > 0.002;
      if (L.isBeam) {
        cur.f = from.f + (to.f - from.f) * k;
        // 조준점: 기본 위치 ↔ 센터 모으기
        L.aimAt.lerpVectors(L.home, L.focus, cur.f);
        tmpDir.subVectors(L.aimAt, L.origin);
        const len = tmpDir.length();
        L.aim.quaternion.setFromUnitVectors(down, tmpDir.normalize());
        const sy = len / L.baseLen;
        L.beam.scale.y = sy;
        for (const f of L.facets) f.scale.y = sy;
        L.mat.uniforms.uLength.value = L.pmat.uniforms.uLength.value = len * 1.05;
        if (L.pool) L.pool.position.set(L.aimAt.x, 0.012, L.aimAt.z);

        const pu = L.pmat.uniforms;
        pu.uColor.value.setRGB(cur.r, cur.g, cur.b);
        pu.uOpacity.value = cur.o * BEAM_OP * 0.32 * cur.p;
        pu.uTime.value = t;
        L.spin.visible = pu.uOpacity.value > 0.002;
        L.spin.rotation.y = t * PRISM_SPEED;

        // 프리즘 바닥 무늬: 각 갈래가 바닥(y=0)에 닿는 곳에 빛점
        const so = cur.o * cur.p;
        for (let j = 0; j < L.sparks.length; j++) {
          const sp = L.sparks[j];
          sp.visible = so > 0.01;
          if (!sp.visible) continue;
          if (j === 0) L.aim.updateMatrixWorld(true);
          tmpV.set(0, -1, 0).transformDirection(L.facets[j].matrixWorld);
          if (tmpV.y > -0.05) { sp.visible = false; continue; }
          const d = L.origin.y / -tmpV.y;
          sp.position.set(L.origin.x + tmpV.x * d, 0.014, L.origin.z + tmpV.z * d);
          sp.material.color.setRGB(cur.r, cur.g, cur.b);
          sp.material.opacity = so * 0.9;
        }
      }
      L.lens.material.color.setRGB(cur.r, cur.g, cur.b).multiplyScalar(0.05 + cur.o * 4);
    }
    {
      const k = front.dur > 0 ? ease(Math.min(1, (now - front.t0) / (front.dur * 1000))) : 1;
      front.cur = front.from + (front.to - front.from) * k;
      for (const s of frontLights) s.intensity = FRONT_INTENSITY * front.cur;
    }
    for (const d of dancers) {
      if (!d.g.visible) continue;
      const k = d.dur > 0 ? ease(Math.min(1, (now - d.t0) / (d.dur * 1000))) : 1;
      d.g.position.set(d.from.x + (d.to.x - d.from.x) * k, 0, d.from.y + (d.to.y - d.from.y) * k);
    }
    controls.update();
    placeMarks();
    composer.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- 공개 API ---------- */
  function setLights(list, fade = 0.15) {
    const now = performance.now();
    list.forEach((l, i) => {
      const L = lights[i];
      Object.assign(L.from, L.cur);
      tmp.set(l.c); // sRGB hex → 선형 색공간
      const o = l.b <= 0 ? 0 : Math.pow(l.b / 100, 1.4);
      Object.assign(L.to, { r: tmp.r, g: tmp.g, b: tmp.b, o, p: l.p ? 1 : 0, f: l.f ? 1 : 0 });
      L.t0 = now;
      L.dur = fade;

      const { mark } = marks[i];
      mark.title = `${ROW_NAMES[rowOf(i)]} ${colOf(i) + 1}번 · 밝기 ${l.b}%${l.p ? ' · 프리즘' : ''}${l.f ? ' · 센터 모으기' : ''}`;
    });
  }

  function setSelected(set) {
    marks.forEach(({ mark }, i) => mark.classList.toggle('sel', set.has(i)));
  }

  function resetView() {
    camera.position.copy(CAM_HOME);
    controls.target.copy(CAM_TARGET);
    controls.update();
  }
  renderer.domElement.addEventListener('dblclick', resetView);

  let houseOn = false;
  function setHouseLights(on) {
    houseOn = on;
    houseHemi.intensity = on ? HOUSE.hemi : 0.03;
    houseFill.intensity = on ? HOUSE.fill : 0;
    return houseOn;
  }
  const toggleHouseLights = () => setHouseLights(!houseOn);
  setHouseLights(false);

  // 전면등 밝기 (0~100%), fade초 동안 부드럽게
  const front = { cur: 0, from: 0, to: 0, t0: 0, dur: 0 };
  function setFrontLights(pct, fade = 0.15) {
    if (pct / 100 === front.to) return;
    front.from = front.cur;
    front.to = pct / 100;
    front.t0 = performance.now();
    front.dur = fade;
  }

  // 댄서 배치: pos = [[x, z], ...] (앞쪽 count명만 보임), dur초 동안 이동
  function setDancers(pos, count, dur = 0.8) {
    const now = performance.now();
    dancers.forEach((d, i) => {
      const show = i < count && pos[i];
      if (!show) { d.g.visible = false; return; }
      const [x, z] = pos[i];
      if (!d.g.visible) { d.g.position.set(x, 0, z); d.from.set(x, z); d.to.set(x, z); d.dur = 0; d.g.visible = true; return; }
      if (d.to.x === x && d.to.y === z) return;
      d.from.set(d.g.position.x, d.g.position.z);
      d.to.set(x, z);
      d.t0 = now;
      d.dur = dur;
    });
  }

  return { setLights, setSelected, resetView, setHouseLights, toggleHouseLights, setFrontLights, setDancers };
}

/* =========================================================
   공연장 세트 (나무 바닥 무대, 벨벳 막, 객석)
   ========================================================= */
function woodTexture(base, planks, seed = 1) {
  let r = seed;
  const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const g = cv.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 1024, 1024);
  const ph = 1024 / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    const shade = rand() - 0.5;
    g.fillStyle = shade > 0 ? `rgba(255,245,225,${shade * 0.12})` : `rgba(70,40,15,${-shade * 0.14})`;
    g.fillRect(0, y0, 1024, ph);
    for (let k = 0; k < 30; k++) {
      g.strokeStyle = `rgba(110,70,35,${rand() * 0.07})`;
      g.lineWidth = 1 + rand() * 2;
      const y = y0 + rand() * ph;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(340, y + rand() * 6 - 3, 680, y + rand() * 6 - 3, 1024, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(70,45,20,.35)';
    g.fillRect(0, y0, 1024, 1.5);
    for (let x = rand() * 500; x < 1024; x += 280 + rand() * 420) g.fillRect(x, y0, 1.5, ph);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// 주름진 막
function curtainGeometry(w, h, folds, depth) {
  const g = new THREE.PlaneGeometry(w, h, Math.max(64, folds * 10), 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.sin((x / w) * folds * Math.PI * 2) * depth);
  }
  g.computeVertexNormals();
  return g;
}

function buildVenue(scene) {
  const halfW = STAGE_W / 2, front = STAGE_D / 2;

  // 무대 단 (윗면 나무 바닥, 앞면 나무 패널)
  const floorTex = woodTexture('#f0dfc2', 18, 7);
  floorTex.repeat.set(2, 1.4);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.05 });
  const faceTex = woodTexture('#f2e3c8', 10, 3);
  faceTex.repeat.set(3, 0.4);
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9 });
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(STAGE_W, STAGE_H, STAGE_D),
    [darkMat, darkMat, floorMat, darkMat, faceMat, darkMat],
  );
  platform.position.y = -STAGE_H / 2;
  scene.add(platform);

  // 앞면 스피커 그릴
  const grillMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9 });
  for (const x of [-4.2, -1.4, 1.4, 4.2]) {
    const grill = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.03), grillMat);
    grill.position.set(x, -STAGE_H * 0.5, front + 0.015);
    scene.add(grill);
  }
  // 무대 앞 모서리 몰딩
  const lip = new THREE.Mesh(new THREE.BoxGeometry(STAGE_W + 0.1, 0.06, 0.12), faceMat);
  lip.position.set(0, -0.03, front + 0.02);
  scene.add(lip);

  // 객석 바닥 (붉은 카펫)
  const hall = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 30),
    new THREE.MeshStandardMaterial({ color: 0x5a1c20, roughness: 1 }),
  );
  hall.rotation.x = -Math.PI / 2;
  hall.position.set(0, -STAGE_H, front + 14);
  scene.add(hall);

  // 벨벳 막
  const velvet = new THREE.MeshPhysicalMaterial({
    color: 0x7a1828, roughness: 0.78,
    sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xff7080),
    side: THREE.DoubleSide,
  });
  const back = new THREE.Mesh(curtainGeometry(STAGE_W + 2, 9.5, 46, 0.12), velvet);
  back.position.set(0, 4.75, -front + 0.15);
  scene.add(back);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(curtainGeometry(1.8, 8.6, 5, 0.1), velvet);
    leg.position.set(s * (halfW - 0.6), 4.3, front - 0.4);
    scene.add(leg);
  }
  const border = new THREE.Mesh(curtainGeometry(STAGE_W + 2, 1.8, 40, 0.08), velvet);
  border.position.set(0, 7.9, front - 0.25);
  scene.add(border);

  // 무대를 감싸는 나무 벽 (프로시니엄)
  const wallTex = woodTexture('#cfa67c', 8, 11);
  wallTex.rotation = Math.PI / 2;
  wallTex.repeat.set(1.5, 1.5);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7 });
  const H = 13, bottom = -STAGE_H, outer = 17;
  for (const s of [-1, 1]) {
    const w = outer - halfW;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(w, H, 0.4), wallMat);
    pillar.position.set(s * (halfW + w / 2), bottom + H / 2, front + 0.3);
    scene.add(pillar);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, 24), wallMat);
    side.position.set(s * outer, bottom + H / 2, front + 12);
    scene.add(side);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(outer * 2, H - 8.8 - STAGE_H, 0.4), wallMat);
  header.position.set(0, 8.8 + (H - 8.8 - STAGE_H) / 2, front + 0.3);
  scene.add(header);
  // 무대 안쪽 벽 (막 뒤 어둠)
  const inner = new THREE.MeshStandardMaterial({ color: 0x0d0b0b, roughness: 1, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(STAGE_D, 10), inner);
    w.rotation.y = Math.PI / 2;
    w.position.set(s * (halfW + 0.05), 5, 0);
    scene.add(w);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(STAGE_W, STAGE_D), inner);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, 9.6, 0);
  scene.add(ceil);

  // 양쪽 계단
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const h = STAGE_H * (4 - k) / 4;
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 0.34), faceMat);
      step.position.set(s * (halfW - 1.0), -STAGE_H + h / 2, front + 0.17 + k * 0.34);
      scene.add(step);
    }
  }

  // 객석 의자
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x8a1e2a, roughness: 0.9 });
  const xs = [];
  for (let x = -9; x <= 9.01; x += 0.62) if (Math.abs(x) > 0.9) xs.push(x);
  const rowsZ = [9.2, 10.3, 11.4];
  const count = xs.length * rowsZ.length;
  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.72, 0.12), seatMat, count);
  const cushions = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.14, 0.46), seatMat, count);
  const m = new THREE.Matrix4();
  let n = 0;
  rowsZ.forEach((z, ri) => {
    const y0 = -STAGE_H + ri * 0.18; // 뒷줄일수록 조금씩 높게
    for (const x of xs) {
      m.makeTranslation(x, y0 + 0.82, z + 0.2);
      backs.setMatrixAt(n, m);
      m.makeTranslation(x, y0 + 0.45, z);
      cushions.setMatrixAt(n, m);
      n++;
    }
  });
  scene.add(backs, cushions);
}
