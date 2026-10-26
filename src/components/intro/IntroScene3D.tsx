"use client";

/**
 * IntroScene3D - scene Three.js TERPADU untuk intro /categories.
 *
 * Langkah 2: Setup scene lengkap persis prototipe docs/tengok-intro-prototype.html:
 *   - Background #070d18, FogExp2(0x0a1220, 0.011)
 *   - Grid lantai amber bergerak pelan (GridHelper 260x90)
 *   - ~500 bintang (Points, posisi acak)
 *   - Platform per model: disc transparan + cincin solid + scan ring animasi
 *   - HemisphereLight + DirectionalLight
 *   - HQ model (fit+glow amber) + 3 division models (scale lerp by phase)
 *   - Kamera fov 40, lerp halus 0.045/frame + parallax mengikuti pointer
 *   - Raycasting: klik HQ -> onBuildingClick; klik divisi -> onDivisionClick
 *
 * TIDAK ADA OrbitControls - kamera dikontrol via lerp + parallax saja.
 * Satu renderer untuk semua fase. Cleanup penuh saat unmount.
 *
 * Lazy-loaded (ssr:false) oleh pemanggil.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { DivisionModelKey } from "@/lib/divisionTheme";
import { loadHqModel, loadHqEnv, type HqModel } from "./hqModel";
import { createDivisionModels } from "./divisionModels";
import { isPhoneViewport } from "@/lib/phoneMode";

// X positions divisi
const XS_WIDE = [-18, 0, 18] as const;
// Layar potret: jarak antar divisi dirapatkan supaya ketiganya bisa di-zoom lebih dekat.
const XS_NARROW = [-16.5, 0, 16.5] as const;
/**
 * Tuning MODE FOKUS (phone: lebar < 640 dan aspect < 0.85, lihat src/lib/phoneMode.ts).
 * Hanya berlaku di fase split. Semua angka mobile ada di sini; ubah di sini saja.
 */
export const MOBILE_SPLIT = {
  /** FOV kamera (derajat) saat fase split di phone; fase lain tetap 40 */
  fov: 50,
  /** Jari-jari efektif (satuan dunia) yang harus muat di lebar layar */
  R: 9,
  /** Pengali jarak kamera: dist = R / (tan(fov/2) * aspect) * distMul */
  distMul: 1.1,
  /** Posisi kamera: y = dist * camY, z = dist * camZ (sudut pandang dari atas-depan) */
  camY: 0.55,
  camZ: 0.85,
  /** Titik pandang (y). Lebih rendah dari pusat model (~6) agar model tampil DI ATAS panel bawah */
  targetY: -0.5,
  /** Jarak X antar model */
  spacing: 13,
  /** Skala model tetangga (bukan fokus) */
  neighborScale: 0.7,
  /** Geser horizontal minimal (px) untuk pindah fokus */
  swipePx: 40,
  /** ...atau kecepatan minimal (px/ms) dengan geseran minimal swipeMinPx */
  swipeVelocity: 0.5,
  swipeMinPx: 16,
  /** Toleransi gerak (px) agar sentuhan masih dihitung tap */
  tapSlopPx: 10,
  /** Grid lantai: skala (lebih jarang) dan pengali opasitas (lebih tipis) */
  gridScale: 2.2,
  gridOpacity: 0.4,
} as const;
/**
 * Tuning kamera phone untuk fase hq dan detail (di luar MOBILE_SPLIT). Hanya berlaku saat `phone`.
 */
export const MOBILE_DETAIL = {
  /** Batas pecahan tinggi layar yang dikompensasi untuk sheet bawah (sheet penuh 90% tidak mengejar model sampai hilang) */
  maxLookFrac: 0.5,
  /** Fase hq/explode: pecahan tinggi layar yang dikosongkan untuk judul + tombol Mulai di bawah, agar gedung tidak tertimpa */
  hqLookFrac: 0.1,
} as const;
// Urutan model per divisi (sama dengan ORDER di page)
const MODEL_KEYS: DivisionModelKey[] = ["gedung", "bendungan", "tol"];

const TIER_COLORS = {
  good: new THREE.Color(0x22c55e),
  warn: new THREE.Color(0xf59e0b),
  bad: new THREE.Color(0xef4444),
};

export interface IntroScene3DProps {
  /** Fase saat ini: hq (gedung), explode (animasi pecah), split (3 divisi), detail (1 divisi terpilih) */
  phase: "hq" | "explode" | "split" | "detail";
  /** Indeks divisi terpilih di fase detail (-1 = tidak ada) */
  selectedDiv: number;
  /** Indeks divisi yang di-hover (-1 = tidak ada) */
  hoveredDiv: number;
  /** Divisi yang sedang difokuskan (mode phone fase split); -1 = tidak ada */
  focusDiv?: number;
  /** Pecahan tinggi layar yang ditutup bottom sheet fase detail (phone); 0 = tidak ada. Kamera menggeser model ke area terlihat. */
  sheetFrac?: number;
  /** Dipanggil saat pengguna menggeser/tap tetangga di canvas (mode phone) */
  onFocusChange?: (i: number) => void;
  /** Warna aksen tiap divisi (hex string, urutan sesuai ORDER) */
  divisionColors: readonly string[];
  /** Status CCTV per divisi (urutan sesuai ORDER) */
  divisionStatus?: Array<{ total: number; online: number }>;
  /** Tema UI aktif. Mengubah latar, kabut, cahaya, dan bintang tanpa membangun ulang scene. */
  theme?: "light" | "dark";
  /** Apakah mode reduced-motion aktif (durasi singkat ~0.4s, tanpa rotasi acak) */
  reducedMotion?: boolean;
  /** Dipanggil saat pengguna klik model HQ */
  onBuildingClick: () => void;
  /** Dipanggil saat animasi explode selesai */
  onExplodeComplete?: () => void;
  /** Dipanggil saat pengguna klik model divisi */
  onDivisionClick: (i: number) => void;
  /** Dipanggil saat hover berubah (i=-1 berarti tidak hover) */
  onDivisionHover: (i: number) => void;
  /** Dipanggil SEKALI setelah frame pertama dirender (2c) */
  onReady?: () => void;
  /** Dipanggil bila inisialisasi WebGLRenderer gagal (try/catch) */
  onError?: () => void;
  /** Dipanggil segera saat IntroScene3D ter-mount di DOM */
  onMounted?: () => void;
  className?: string;
}

export default function IntroScene3D({
  phase,
  selectedDiv,
  hoveredDiv,
  focusDiv = -1,
  sheetFrac = 0,
  onFocusChange,
  divisionColors,
  divisionStatus,
  theme = "dark",
  reducedMotion = false,
  onBuildingClick,
  onExplodeComplete,
  onDivisionClick,
  onDivisionHover,
  onReady,
  onError,
  onMounted,
  className = "",
}: IntroScene3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  // Diisi oleh effect utama; dipanggil effect tema agar scene tidak dibangun ulang.
  const applyThemeRef = useRef<((t: "light" | "dark") => void) | null>(null);
  const themeRef = useRef(theme);

  // Refs untuk props agar loop animasi selalu baca nilai terkini tanpa rebuild scene
  const stateRef = useRef({ phase, selectedDiv, hoveredDiv, focusDiv, sheetFrac, reducedMotion, divisionStatus });
  const cbRef = useRef({ onBuildingClick, onExplodeComplete, onDivisionClick, onDivisionHover, onFocusChange, onReady, onError, onMounted });

  useEffect(() => {
    stateRef.current = { phase, selectedDiv, hoveredDiv, focusDiv, sheetFrac, reducedMotion, divisionStatus };
  }, [phase, selectedDiv, hoveredDiv, focusDiv, sheetFrac, reducedMotion, divisionStatus]);

  useEffect(() => {
    cbRef.current = { onBuildingClick, onExplodeComplete, onDivisionClick, onDivisionHover, onFocusChange, onReady, onError, onMounted };
  }, [onBuildingClick, onExplodeComplete, onDivisionClick, onDivisionHover, onFocusChange, onReady, onError, onMounted]);

  useEffect(() => {
    themeRef.current = theme;
    applyThemeRef.current?.(theme);
  }, [theme]);

  // Effect utama: bangun scene & jalankan loop. Hanya berjalan sekali.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Laporkan bahwa IntroScene3D telah ter-mount di DOM
    cbRef.current.onMounted?.();

    const W = () => mount.clientWidth || window.innerWidth;
    const H = () => mount.clientHeight || window.innerHeight;

    // ---- Scene & renderer (opaque, background #070d18) --------------------
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a1220, 0.011);
    // Densitas dasar kabut; diperkecil saat kamera mundur jauh (layar sempit) agar model tidak gelap.
    let fogBase = 0.011;

    const cam = new THREE.PerspectiveCamera(40, W() / H(), 0.1, 400);
    // XS mutable: dihitung ulang oleh applyLayout() (mount + resize/rotasi) tanpa membangun ulang scene.
    // Nilai awal non-phone = logika lama (aspect < 1 -> NARROW, selain itu WIDE).
    const XS: number[] = [...(W() / H() < 1 ? XS_NARROW : XS_WIDE)];
    let phone = isPhoneViewport(window.innerWidth, window.innerHeight);

    // Perangkat sentuh / layar kecil: batasi resolusi render & detail dekorasi.
    const lowPower =
      window.matchMedia("(pointer: coarse)").matches ||
      Math.min(window.innerWidth, window.innerHeight) < 600;
    let currentPr = Math.min(window.devicePixelRatio || 1, 1.5);
    let ren: THREE.WebGLRenderer;
    try {
      // MSAA tidak perlu di layar high-DPI (piksel sudah rapat) & mahal di GPU lemah.
      ren = new THREE.WebGLRenderer({
        antialias: currentPr < 2 && !lowPower,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch (err) {
      console.warn("[Intro3D] Gagal membuat WebGLRenderer:", err);
      cbRef.current.onError?.();
      return;
    }
    ren.setPixelRatio(currentPr);
    ren.setSize(W(), H());
    ren.setClearColor(0x070d18, 0); // transparan: latar & watermark diatur CSS di belakang canvas
    // Bayangan hanya untuk gedung HQ (fase hq/explode); dimatikan di perangkat lemah.
    ren.shadowMap.enabled = !lowPower;
    ren.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(ren.domElement);

    // resource tracking untuk dispose saat unmount
    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(o: T): T => {
      disposables.push(o);
      return o;
    };

    // ---- Cahaya (persis prototipe) ----------------------------------------
    const hemi = new THREE.HemisphereLight(0xaec6ff, 0x1a2233, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe2b0, 0.9);
    sun.position.set(20, 40, 30);
    scene.add(sun);
    // Nilai dasar cahaya global per tema; frame loop meredamnya saat rig siang gedung HQ menyala.
    let baseHemi = 0.85;
    let baseSun = 0.9;

    // Rig "siang" khusus gedung HQ: matahari hangat dengan bayangan + fill dingin.
    // Intensitas 0 di luar fase hq/explode (dikendalikan hqMix di loop).
    const keyLight = new THREE.DirectionalLight(0xffdfbc, 0);
    keyLight.position.set(-38, 42, 14);
    keyLight.castShadow = !lowPower;
    keyLight.shadow.mapSize.set(1024, 1024);
    Object.assign(keyLight.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
    keyLight.shadow.bias = -0.00045;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xb5d5ee, 0);
    fillLight.position.set(34, 18, -26);
    scene.add(fillLight);
    let hqMix = 0;

    // Rig siang untuk tiga divisi: matahari dengan bayangan yang menutupi ketiga platform.
    const divLight = new THREE.DirectionalLight(0xffe3c2, 0);
    divLight.position.set(-26, 52, 34);
    divLight.castShadow = !lowPower;
    divLight.shadow.mapSize.set(1024, 1024);
    Object.assign(divLight.shadow.camera, { left: -40, right: 40, top: 24, bottom: -24, near: 1, far: 150 });
    divLight.shadow.bias = -0.0006;
    divLight.shadow.normalBias = 0.05;
    scene.add(divLight);
    let divMix = 0;

    // ---- Helper material & tekstur prosedural -----------------------------
    const M = (c: number, o: THREE.MeshStandardMaterialParameters = {}) =>
      track(
        new THREE.MeshStandardMaterial(
          Object.assign({ color: c, roughness: 0.65, metalness: 0.1, flatShading: true }, o)
        )
      );

    function cv(
      w: number,
      h: number,
      f: (g: CanvasRenderingContext2D, w: number, h: number) => void
    ) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      f(c.getContext("2d")!, w, h);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      track(t);
      return t;
    }
    function glass(rx: number, ry: number) {
      const t = cv(64, 64, (g, w, h) => {
        const q = g.createLinearGradient(0, 0, w, h);
        q.addColorStop(0, "#2a63e0");
        q.addColorStop(1, "#12379f");
        g.fillStyle = q;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = "rgba(190,215,255,.6)";
        g.lineWidth = 3;
        g.strokeRect(0, 0, w, h);
      });
      t.repeat.set(rx, ry);
      return track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0.35 }));
    }

    const C = {
      grey: M(0xc9cbd2),
      dgrey: M(0x6c7079),
      conc: M(0xbdbab2),
      asph: M(0x35383d),
      amber: M(0xf2a516),
      orange: M(0xe8700c),
      white: M(0xf4f4f4),
      rock: M(0x7b756c),
      water: M(0x1b8f8c, { transparent: true, opacity: 0.6, roughness: 0.2 }),
    };
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    function b(
      w: number, h: number, d: number, m: THREE.Material,
      x: number, y: number, z: number, p: THREE.Object3D
    ) {
      const o = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), m);
      o.position.set(x, y, z);
      p.add(o);
      return o;
    }
    // glow() + fit() persis prototipe
    function glow(g: THREE.Group, col: number, op: number) {
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const mesh = o as THREE.Mesh;
          mesh.add(
            new THREE.LineSegments(
              track(new THREE.EdgesGeometry(mesh.geometry, 30)),
              track(new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op }))
            )
          );
        }
      });
    }
    function fit(g: THREE.Group, size: number, col: number, edgeGlow = true): THREE.Group {
      if (edgeGlow) glow(g, col, 0.28);
      const bb = new THREE.Box3().setFromObject(g);
      const s = bb.getSize(V(0, 0, 0));
      const k = size / Math.max(s.x, s.y * 1.25, s.z);
      const c = bb.getCenter(V(0, 0, 0));
      g.position.set(-c.x * k, -bb.min.y * k, -c.z * k);
      g.scale.setScalar(k);
      const w = new THREE.Group();
      w.add(g);
      (w.userData as Record<string, unknown>).g = g;
      return w;
    }

    /**
     * Fit model divisi berdasarkan jari-jari jejak (footprint) terjauh di bidang XZ, bukan bounding box,
     * sehingga model yang berputar tidak pernah keluar dari lingkaran R dan tak saling menimpa.
     * Tinggi dibatasi hMax agar model jangkung tetap proporsional.
     */
    function fitFootprint(g: THREE.Group, R: number, hMax: number): THREE.Group {
      g.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(g);
      const c = bb.getCenter(V(0, 0, 0));
      const v = V(0, 0, 0);
      let r2 = 1e-6;
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          r2 = Math.max(r2, (v.x - c.x) ** 2 + (v.z - c.z) ** 2);
        }
      });
      const k = Math.min(R / Math.sqrt(r2), hMax / Math.max(1e-3, bb.max.y - bb.min.y));
      g.position.set(-c.x * k, -bb.min.y * k, -c.z * k);
      g.scale.setScalar(k);
      const w = new THREE.Group();
      w.add(g);
      (w.userData as Record<string, unknown>).g = g;
      return w;
    }

    // ---- Model generators (persis prototipe) ------------------------------
    function gedung(): THREE.Group {
      const g = new THREE.Group();
      b(30, 3, 20, C.dgrey, 0, 1.5, 0, g);
      b(13, 28, 11, glass(5, 14), -3, 17, -1, g);
      b(9, 20, 9, glass(4, 10), 9.5, 13, -2, g);
      b(14, 12, 10, C.grey, -12, 9, 3, g);
      b(14.2, 2.5, 10.2, glass(6, 1), -12, 9, 3, g);
      for (let i = 1; i <= 4; i++) b(13.6, 0.5, 11.6, C.grey, -3, 3 + i * 5.4, -1, g);
      b(14, 0.8, 12, C.dgrey, -3, 31.4, -1, g);
      b(10, 0.8, 10, C.dgrey, 9.5, 23.4, -2, g);
      b(14.4, 0.8, 10.4, C.dgrey, -12, 15.4, 3, g);
      b(12, 1, 7, C.grey, 2, 4, 10, g);
      [[-3, 10], [7, 10]].forEach(([x, z]) => b(0.9, 3, 0.9, C.grey, x, 2.5, z, g));
      b(4, 2, 3, C.dgrey, -6, 32.4, -1, g);
      b(3, 1.6, 3, C.dgrey, 0, 32.2, 2, g);
      b(3, 1.5, 3, C.dgrey, 9.5, 24.5, -2, g);
      return g;
    }
    function hq(): THREE.Group {
      const g = gedung();
      const r = new THREE.Mesh(track(new THREE.TorusGeometry(4.6, 0.4, 8, 40)), C.amber);
      r.position.set(-3, 17, 4.7);
      g.add(r);
      const d = new THREE.Mesh(track(new THREE.CircleGeometry(4.3, 32)), glass(3, 3));
      d.position.set(-3, 17, 4.55);
      g.add(d);
      return g;
    }
    // Model divisi HD (material PBR, tekstur, instancing) ada di divisionModels.ts
    const divModels = createDivisionModels(track, lowPower);
    const BUILD = divModels.build;

    // ---- Grid lantai amber bergerak (persis prototipe) --------------------
    const grid = new THREE.GridHelper(260, 90, 0xf59e0b, 0x22304d);
    // GridHelper returns material array [center lines, grid lines]
    const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMats.forEach((m) => {
      m.transparent = true;
      (m as THREE.LineBasicMaterial).opacity = 0.22;
    });
    grid.position.y = -0.02;
    scene.add(grid);
    disposables.push(grid.geometry, ...gridMats);

    let stars: THREE.Points | null = null;
    // ---- Bintang ~500 titik -----------------------------------------------
    {
      const p: number[] = [];
      for (let i = 0; i < (lowPower ? 220 : 500); i++)
        p.push(
          (Math.random() - 0.5) * 260,
          Math.random() * 90 + 5,
          -Math.random() * 140 - 10
        );
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      stars = new THREE.Points(geo, track(new THREE.PointsMaterial({ color: 0xaec6ff, size: 0.5, transparent: true, opacity: 0.6 })));
      scene.add(stars);
    }

    // ---- Platform helper (disc + ring + scan ring) ------------------------
    function platform(r: number, col: number): THREE.Group {
      const g = new THREE.Group();
      const mk = (op: number) =>
        track(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.DoubleSide }));
      const disc = new THREE.Mesh(track(new THREE.CircleGeometry(r, 56)), mk(0.1));
      disc.rotation.x = -Math.PI / 2;
      g.add(disc);
      const ring = new THREE.Mesh(track(new THREE.RingGeometry(r - 0.35, r, 72)), mk(0.9));
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
      const sc = new THREE.Mesh(track(new THREE.RingGeometry(r * 0.98, r, 72)), mk(0.6));
      sc.rotation.x = -Math.PI / 2;
      g.add(sc);
      g.userData = { ring, sc };
      g.position.y = 0.03;
      scene.add(g);
      return g;
    }

    // ---- Tema terang/gelap: ubah lingkungan saja (model & aksen tetap) ----
    // Grid lantai: opasitas dasar per tema x peredam mode fokus (phone, fase split).
    let gridBaseOp = 0.22;
    let gridDamp = 1;
    let gridScaleCur = 1;
    const syncGridOpacity = () => {
      gridMats.forEach((m) => {
        (m as THREE.LineBasicMaterial).opacity = gridBaseOp * gridDamp;
      });
    };
    const applyTheme = (t: "light" | "dark") => {
      const light = t === "light";
      const bg = light ? 0xe9eef5 : 0x070d18;
      ren.setClearColor(bg, 0);
      if (scene.fog) (scene.fog as THREE.FogExp2).color.setHex(light ? 0xe9eef5 : 0x0a1220);
      fogBase = light ? 0.0075 : 0.011;
      (scene.fog as THREE.FogExp2).density = fogBase;
      hemi.color.setHex(light ? 0xffffff : 0xaec6ff);
      hemi.groundColor.setHex(light ? 0xaab4c4 : 0x1a2233);
      // Layar potret: kamera jauh & model kecil, jadi cahaya dinaikkan agar tidak suram.
      const boost = W() / H() < 1 ? 1.7 : 1;
      baseHemi = (light ? 1.0 : 0.85) * boost;
      baseSun = (light ? 1.05 : 0.9) * boost;
      hemi.intensity = baseHemi;
      sun.color.setHex(light ? 0xfff1d6 : 0xffe2b0);
      sun.intensity = baseSun;
      if (stars) stars.visible = !light;
      gridBaseOp = light ? 0.4 : 0.22;
      syncGridOpacity();
    };
    applyThemeRef.current = applyTheme;
    applyTheme(themeRef.current);

    // ---- HQ model + platform amber ----------------------------------------
    const hqW = fit(hq(), 19, 0xf59e0b);
    scene.add(hqW);
    const hqP = platform(15, 0xf59e0b);

    // Penangkap bayangan di alas gedung (kepingan yang terbang ikut menjatuhkan bayangan).
    const catcher = new THREE.Mesh(
      track(new THREE.CircleGeometry(24, 48)),
      track(new THREE.ShadowMaterial({ opacity: 0.32, transparent: true }))
    );
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = 0.04;
    catcher.receiveShadow = true;
    catcher.visible = false;
    scene.add(catcher);

    // Gedung HQ asli (GLB). Model prosedural di atas jadi cadangan sampai GLB siap.
    let hqEnv: THREE.Texture | null = null;
    let hqModel: HqModel | null = null;
    const installHq = (m: HqModel) => {
      const old = hqW.userData.g as THREE.Object3D;
      hqW.remove(old);
      hqW.add(m.root);
      hqW.userData.g = m.shards;
      hqW.userData.model = m;
      hqModel = m;
      if (hqEnv) m.applyEnv(hqEnv);
    };
    loadHqModel({ size: 16, lowPower })
      .then((m) => {
        // Jangan menukar model di tengah animasi pecah.
        if (isDisposed || stateRef.current.phase === "explode") return;
        installHq(m);
      })
      .catch((err) => console.warn("[Intro3D] GLB gedung gagal dimuat, pakai model prosedural:", err));
    loadHqEnv()
      .then((tex) => {
        if (isDisposed) {
          tex.dispose();
          return;
        }
        hqEnv = track(tex);
        hqModel?.applyEnv(tex);
        divModels.applyEnv(tex);
      })
      .catch(() => {
        /* tanpa HDR: refleksi kaca sederhana, tetap tampil */
      });

    // ---- Cinematic explode (gerak normal, ±3.6s) [Bagian A] ----
    const EX = { antic: 0.5, apart: 1.2, hold: 0.35, fly: 1.0 };
    const EX_FLY0 = EX.antic + EX.apart + EX.hold; // 2.05
    const EX_TOTAL = EX_FLY0 + EX.fly + 0.5;
    const cl = (x: number) => Math.min(1, Math.max(0, x));
    const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const eiC = (x: number) => x * x * x;
    const tmp = new THREE.Vector3();

    interface CineShard {
      c: THREE.Object3D;
      p: THREE.Vector3;
      s: THREE.Vector3;
      off: THREE.Vector3;
      tl: THREE.Vector3;
      rot: THREE.Vector3;
      sd: number;
      fd: number;
      idx: number;
    }
    let cine: CineShard[] = [];
    let edges: THREE.LineSegments[] = [];
    let explodeDone = false;
    // Mode pecah halus (model GLB): kepingan bergeser pelan, tanpa percikan & gelombang kejut.
    let gentle = false;
    let fxSpawned = false;
    let fxT0 = 0;

    // shockwave lantai
    const shock = new THREE.Mesh(
      track(new THREE.RingGeometry(0.95, 1, 96)),
      track(
        new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        })
      )
    );
    shock.rotation.x = -Math.PI / 2;
    shock.position.y = 0.05;
    shock.visible = false;
    scene.add(shock);

    // percikan partikel
    const DN = 360;
    const dPos = new Float32Array(DN * 3),
      dVel = new Float32Array(DN * 3);
    const dGeo = track(new THREE.BufferGeometry());
    dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    const dMat = track(
      new THREE.PointsMaterial({
        color: 0xffc23d,
        size: 0.45,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    const debris = new THREE.Points(dGeo, dMat);
    debris.visible = false;
    debris.frustumCulled = false;
    scene.add(debris);

    // ---- 3 divisi: model (scale=0) + platform ----------------
    // Jari-jari jejak per model (platform r=8.8): ketiganya seragam, gedung sedikit lebih kecil karena jangkung.
    const FOOTPRINT: Record<DivisionModelKey, number> = {
      gedung: 7,
      bendungan: 6.3,
      tol: 6.3,
    };
    const divColors3 = [...divisionColors].slice(0, 3);
    const mods = MODEL_KEYS.map((key, i) => {
      const col = new THREE.Color(divColors3[i] ?? "#f59e0b").getHex();
      const w = fitFootprint(BUILD[key](), FOOTPRINT[key], 13);
      w.position.x = XS[i];
      w.scale.setScalar(0.0001); // hampir nol; visible=false saat scale < 0.02
      w.visible = false;
      (w.userData as Record<string, unknown>).i = i;
      (w.userData as Record<string, unknown>).s = 0; // smooth scale state
      scene.add(w);
      const r = 8;
      const p = platform(r, col);
      p.position.x = XS[i];
      p.visible = false;
      // Cincin tipis ekstra penanda status CCTV (r + 0.5 s/d r + 0.75)
      const statusMat = track(
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        })
      );
      const statusRing = new THREE.Mesh(
        track(new THREE.RingGeometry(r + 0.5, r + 0.75, 72)),
        statusMat
      );
      statusRing.rotation.x = -Math.PI / 2;
      statusRing.position.y = 0.04;
      p.add(statusRing);
      p.userData.statusRing = statusRing;

      return { w, p };
    });

    // Susun ulang posisi model + touch-action sesuai viewport (mount & resize), tanpa rebuild scene.
    const applyLayout = () => {
      phone = isPhoneViewport(window.innerWidth, window.innerHeight);
      const src: readonly number[] = phone
        ? [-MOBILE_SPLIT.spacing, 0, MOBILE_SPLIT.spacing]
        : W() / H() < 1
        ? XS_NARROW
        : XS_WIDE;
      for (let i = 0; i < 3; i++) XS[i] = src[i];
      mods.forEach((m, i) => {
        m.w.position.x = XS[i];
        m.p.position.x = XS[i];
      });
      // pan-y: geser horizontal ditangani kita, scroll vertikal halaman tidak diblokir
      ren.domElement.style.touchAction = phone ? "pan-y" : "";
    };
    applyLayout();
    // Putar awal model bendungan agar sisi hilir menghadap kamera (V4)
    if (mods[1]) {
      mods[1].w.rotation.y = Math.PI * 0.75;
    }

    // Inisialisasi awal saat mount jika langsung di fase 'split' atau 'detail' (Langkah 2)
    const initPh = stateRef.current.phase;
    if (initPh !== "hq") {
      hqW.visible = false;
      hqP.visible = false;
      mods.forEach((m) => {
        (m.w.userData as Record<string, unknown>).s = 1;
        m.w.scale.setScalar(1);
        m.w.visible = true;
        m.p.visible = true;
        m.p.scale.setScalar(1);
      });
    }

    // ---- Kamera smooth lerp + parallax (persis prototipe) ----------------
    const camP = V(0, 30, 80); // mulai jauh, lerp masuk
    const lookTgt = V(0, 7, 0);
    const par = V(0, 0, 0);
    const mx = { x: 0, y: 0 };

    // ---- Raycasting -------------------------------------------------------
    const ray = new THREE.Raycaster();
    const pt = new THREE.Vector2();

    function updatePt(e: PointerEvent) {
      const rect = ren.domElement.getBoundingClientRect();
      pt.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      mx.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mx.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    }
    function pickFrom(objs: THREE.Object3D[]): THREE.Object3D | null {
      ray.setFromCamera(pt, cam);
      const h = ray.intersectObjects(objs, true);
      return h.length > 0 ? h[0].object : null;
    }
    function idxOf(o: THREE.Object3D | null): number {
      let cur: THREE.Object3D | null = o;
      while (cur) {
        const ud = cur.userData as Record<string, unknown>;
        if (ud.i !== undefined) return ud.i as number;
        cur = cur.parent;
      }
      return -1;
    }

    // Gestur mode fokus (phone, fase split): geser horizontal / tap diputuskan saat pointerup.
    let gesture: { id: number; x: number; y: number; t: number } | null = null;
    const onPtrMove = (e: PointerEvent) => {
      lastActivity = performance.now();
      updatePt(e);
      const { phase: ph } = stateRef.current;
      if (phone && ph === "split") return; // sentuh: tanpa hover, gestur di pointerup
      if (ph === "hq") {
        ren.domElement.style.cursor = pickFrom([hqW]) ? "pointer" : "default";
      } else if (ph === "split") {
        const hit = pickFrom(mods.map((m) => m.w));
        const i = idxOf(hit);
        cbRef.current.onDivisionHover(i);
        ren.domElement.style.cursor = i >= 0 ? "pointer" : "default";
      } else {
        ren.domElement.style.cursor = "default";
      }
    };
    const onPtrDown = (e: PointerEvent) => {
      lastActivity = performance.now();
      updatePt(e);
      const { phase: ph } = stateRef.current;
      if (phone && ph === "split") {
        gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
        return;
      }
      if (ph === "hq" && pickFrom([hqW])) {
        cbRef.current.onBuildingClick();
      } else if (ph === "split") {
        const i = idxOf(pickFrom(mods.map((m) => m.w)));
        if (i >= 0) cbRef.current.onDivisionClick(i);
      }
    };
    const onPtrUp = (e: PointerEvent) => {
      const g = gesture;
      gesture = null;
      if (!g || g.id !== e.pointerId) return;
      const { phase: ph, focusDiv: foc } = stateRef.current;
      if (!(phone && ph === "split")) return;
      lastActivity = performance.now();
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      const adx = Math.abs(dx);
      const speed = adx / Math.max(1, performance.now() - g.t);
      const cur = foc >= 0 ? foc : 0;
      const swipe =
        adx > Math.abs(dy) &&
        (adx >= MOBILE_SPLIT.swipePx || (adx >= MOBILE_SPLIT.swipeMinPx && speed >= MOBILE_SPLIT.swipeVelocity));
      if (swipe) {
        const next = Math.min(2, Math.max(0, cur + (dx < 0 ? 1 : -1)));
        if (next !== cur) cbRef.current.onFocusChange?.(next);
        return;
      }
      if (Math.hypot(dx, dy) <= MOBILE_SPLIT.tapSlopPx) {
        updatePt(e);
        const i = idxOf(pickFrom(mods.map((m) => m.w)));
        if (i < 0) return;
        // tap model yang sudah fokus = buka detail; tap tetangga = jadikan fokus
        if (i === cur) cbRef.current.onDivisionClick(i);
        else cbRef.current.onFocusChange?.(i);
      }
    };
    const onPtrCancel = () => {
      gesture = null;
    };
    ren.domElement.addEventListener("pointermove", onPtrMove);
    ren.domElement.addEventListener("pointerdown", onPtrDown);
    ren.domElement.addEventListener("pointerup", onPtrUp);
    ren.domElement.addEventListener("pointercancel", onPtrCancel);
    // ---- Resize -----------------------------------------------------------
    const onResize = () => {
      applyLayout();
      cam.aspect = W() / H();
      cam.updateProjectionMatrix();
      ren.setSize(W(), H());
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ---- Loop animasi (persis prototipe) ----------------------------------
    const back2 = (x: number) => {
      const c = 1.7;
      return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
    };

    interface Shard {
      c: THREE.Object3D;
      p: THREE.Vector3;
      s: THREE.Vector3;
      d: THREE.Vector3;
      r: THREE.Vector3;
    }
    let kids: Shard[] = [];
    let t0 = 0;
    let lastPhase = phase;
    // Throttle saat diam: setelah 4 dtk tanpa interaksi/perubahan state, render ~30 fps
    // (grid & cincin scan tetap bergerak, GPU/baterai jauh lebih hemat).
    const IDLE_AFTER_MS = 4000;
    const IDLE_FRAME_MS = 32;
    let lastActivity = performance.now();
    let lastRenderAt = 0;
    let seenPhase = phase;
    let seenSel = selectedDiv;
    let seenHov = hoveredDiv;
    let last = performance.now();
    let raf = 0;
    let isDisposed = false;
    let hiddenAt = 0;

    // Profiling untuk adaptasi pixel ratio (2b): sampel 60 durasi frame
    const frameDurations: number[] = [];
    let slowWindowsCount = 0;
    let lastFrameTime = performance.now();

    // Pelaporan onReady (2c)
    let hasReportedReady = false;
    let renderCount = 0;

    const stopLoop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const startLoop = () => {
      if (raf || isDisposed) return;
      last = performance.now();
      lastFrameTime = performance.now();
      raf = requestAnimationFrame(loop);
    };

    // 2a. Hentikan render saat tab tersembunyi, reset waktu & profiler saat kembali visible
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
        stopLoop();
      } else {
        const now = performance.now();
        if (hiddenAt > 0) {
          const pauseDuration = now - hiddenAt;
          if (t0 > 0) {
            t0 += pauseDuration;
          }
          hiddenAt = 0;
        }
        last = now;
        lastFrameTime = now;
        // Reset akumulator frame agar jeda background tidak mendistorsi pengukuran
        frameDurations.length = 0;
        slowWindowsCount = 0;
        startLoop();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const loop = (now: number) => {
      if (isDisposed || document.hidden) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(loop);

      const stNow = stateRef.current;
      if (stNow.phase !== seenPhase || stNow.selectedDiv !== seenSel || stNow.hoveredDiv !== seenHov) {
        seenPhase = stNow.phase;
        seenSel = stNow.selectedDiv;
        seenHov = stNow.hoveredDiv;
        lastActivity = now;
      }
      if (
        hasReportedReady &&
        stNow.phase !== "explode" &&
        now - lastActivity > IDLE_AFTER_MS &&
        now - lastRenderAt < IDLE_FRAME_MS
      ) {
        return; // lewati frame ini (mode hemat saat diam)
      }
      lastRenderAt = now;

      // 2b. Ukur durasi frame untuk adaptasi pixel ratio
      const frameDuration = now - lastFrameTime;
      lastFrameTime = now;

      // Mulai mengukur hanya setelah scene siap (hasReportedReady === true)
      if (hasReportedReady && now - lastActivity > IDLE_AFTER_MS) {
        // Mode hemat sengaja ~30 fps: jangan dianggap lambat & reset sampel.
        frameDurations.length = 0;
        slowWindowsCount = 0;
      } else if (hasReportedReady) {
        // Buang frame > 100 ms (jangan tambahkan ke hitungan maupun jumlah)
        if (frameDuration <= 100) {
          frameDurations.push(frameDuration);

          if (frameDurations.length >= 60) {
            const sum = frameDurations.reduce((acc, d) => acc + d, 0);
            const avgFrameMs = sum / frameDurations.length;
            const variance =
              frameDurations.reduce((acc, d) => acc + (d - avgFrameMs) ** 2, 0) /
              frameDurations.length;
            const stdDev = Math.sqrt(variance);
            frameDurations.length = 0;

            // Jangan turunkan bila rata-rata stabil di sekitar 33 ms dengan variasi kecil (pembatasan 30 fps OS / hemat baterai: stdDev < 3)
            const isCapped30Fps = avgFrameMs >= 31 && avgFrameMs <= 36 && stdDev < 3;

            if (avgFrameMs > 24 && !isCapped30Fps) {
              slowWindowsCount++;
              // Turunkan pixel ratio hanya bila 3 jendela 60-frame BERTURUT-TURUT rata-ratanya > 24 ms
              if (slowWindowsCount >= 3) {
                slowWindowsCount = 0;
                if (currentPr > 1.5) {
                  currentPr = 1.5;
                  ren.setPixelRatio(currentPr);
                  ren.setSize(W(), H(), false);
                  console.debug(
                    `[Intro3D] Pixel ratio diturunkan ke 1.5 (3 jendela 60-frame berturut-turut avg: ${avgFrameMs.toFixed(1)}ms, stdDev: ${stdDev.toFixed(1)}ms)`
                  );
                } else if (currentPr > 1.0) {
                  currentPr = 1.0;
                  ren.setPixelRatio(currentPr);
                  ren.setSize(W(), H(), false);
                  console.debug(
                    `[Intro3D] Pixel ratio diturunkan ke 1.0 (3 jendela 60-frame berturut-turut avg: ${avgFrameMs.toFixed(1)}ms, stdDev: ${stdDev.toFixed(1)}ms)`
                  );
                }
              }
            } else {
              // Rata-rata normal atau stabil di 30 fps cap -> reset hitungan jendela berturut-turut
              slowWindowsCount = 0;
            }
          }
        }
      }

      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const { phase: ph, selectedDiv: sel, hoveredDiv: hov, focusDiv: foc, sheetFrac: sFrac } = stateRef.current;
      const isRed = Boolean(stateRef.current.reducedMotion);

      // Tangani transisi fase [Bagian B & F]
      if (ph !== lastPhase) {
        if (ph === "explode") {
          t0 = now;
          hqModel?.setShattered(true);
          const g = hqW.userData.g as THREE.Group;
          // Offset ledakan dirancang untuk skala model prosedural (~0.5); sesuaikan ke skala model aktif.
          const offK = THREE.MathUtils.clamp(0.5 / Math.max(1e-3, g.getWorldScale(V(0, 0, 0)).x), 0.4, 1.6);
          gentle = Boolean(g.userData.gentle);
          const ws = Math.max(1e-3, g.getWorldScale(V(0, 0, 0)).x);
          const rotK = gentle ? 0.1 : 1;
          console.debug(
            `[Intro3D] Animasi pecah (explode) dimulai. Jumlah kepingan HQ (children): ${g.children.length} (reducedMotion: ${isRed})`
          );
          explodeDone = false;
          fxSpawned = false;
          if (!isRed) {
            hqW.updateMatrixWorld(true);
            edges = [];
            g.traverse((o) => {
              if ((o as THREE.LineSegments).isLineSegments) edges.push(o as THREE.LineSegments);
            });
            let yMin = Infinity,
              yMax = -Infinity;
            g.children.forEach((c) => {
              yMin = Math.min(yMin, c.position.y);
              yMax = Math.max(yMax, c.position.y);
            });
            const span = Math.max(1e-3, yMax - yMin);
            cine = g.children.map((c, idx) => {
              const dir = c.position.clone();
              dir.y *= 0.6;
              if (dir.lengthSq() < 1e-3) dir.set(0, 1, 0);
              dir.normalize();
              const hN = (c.position.y - yMin) / span; // 0 bawah … 1 atas
              // Pecah halus: bergeser 2,6 s/d 4,2 satuan dunia; model prosedural lama memakai lontaran besar.
              const off = gentle
                ? dir.multiplyScalar((2.6 + Math.random() * 1.6) / ws).add(V(0, ((hN - 0.35) * 2.2) / ws, 0))
                : dir.multiplyScalar((12 + Math.random() * 10) * offK).add(V(0, (hN - 0.35) * 16 * offK, 0));
              // Kepingan alas/tanah tidak boleh tenggelam di bawah lantai: bergeser menyamping & sedikit naik.
              if (c.userData.low) off.y = gentle ? (0.4 + Math.random() * 0.8) / ws : (1 + Math.random() * 3) * offK;
              const tl = g.worldToLocal(V(XS[idx % 3], 5, 0)); // tujuan = platform divisi
              return {
                c,
                idx,
                p: c.position.clone(),
                s: c.scale.clone(),
                off,
                tl,
                rot: V(
                  (Math.random() - 0.5) * 0.9 * rotK,
                  (Math.random() - 0.5) * 1.6 * rotK,
                  (Math.random() - 0.5) * 0.9 * rotK
                ),
                sd: (1 - hN) * (gentle ? 0.25 : 0.35), // atas lepas duluan
                fd: Math.random() * (gentle ? 0.25 : 0.4),
              };
            });
          } else {
            kids = g.children.map((c) => ({
              c,
              p: c.position.clone(),
              s: c.scale.clone(),
              d: c.position.clone().normalize().add(V(0, 0.4, 0)).normalize(),
              r: V(0, 0, 0),
            }));
          }
          mods.forEach((m) => {
            m.w.visible = true;
          });
        } else if (ph === "split" || ph === "detail") {
          explodeDone = true;
          hqW.visible = false;
          hqP.visible = false;
          shock.visible = false;
          debris.visible = false;
          fxSpawned = false;
          mods.forEach((m) => {
            m.w.visible = true;
          });
        } else if (ph === "hq") {
          hqW.position.set(0, 0, 0);
          hqModel?.heat(0);
          edges.forEach((l) => ((l.material as THREE.LineBasicMaterial).opacity = 0.28));
          shock.visible = false;
          debris.visible = false;
          fxSpawned = false;
          explodeDone = false;
          cine.forEach((k) => {
            k.c.position.copy(k.p);
            k.c.rotation.set(0, 0, 0);
            k.c.scale.copy(k.s);
          });
          // Reset kembali posisi kepingan HQ & platform (isRed kids)
          if (kids.length > 0) {
            kids.forEach((k) => {
              k.c.position.copy(k.p);
              k.c.rotation.set(0, 0, 0);
              k.c.scale.copy(k.s);
            });
          }
          hqModel?.setShattered(false);
          hqW.visible = true;
          hqP.visible = true;
          hqP.scale.setScalar(1);
          const ring = hqP.userData.ring as THREE.Mesh;
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.9;
          mods.forEach((m) => {
            (m.w.userData as Record<string, unknown>).s = 0;
            m.w.scale.setScalar(0.0001);
            m.w.visible = false;
            m.p.visible = false;
          });
          if (mods[1]) {
            mods[1].w.rotation.y = Math.PI * 0.75;
          }
          t0 = 0;
        }
        lastPhase = ph;
      }

      const exT = ph === "explode" ? Math.max(0, (now - t0) / 1000) : 0;

      // Kamera target berdasarkan fase (f = faktor layar sempit) [Bagian D]
      const f = Math.max(1, 1.75 / cam.aspect);
      // Gedung HQ: desktop sedikit dimundurkan (tidak terlalu ngezoom); potret sudah ditarik jauh oleh f, jadi didekatkan lagi.
      const hqZoom = cam.aspect >= 1 ? 1.2 : 0.85;
      let P: THREE.Vector3, L: THREE.Vector3;
      if (ph === "hq") {
        P = V(0, 9 * f * hqZoom, 34 * f * hqZoom);
        L = V(0, 4, 0);
      } else if (ph === "explode" && !isRed) {
        const fly = exT > EX_FLY0 - 0.2; // dekat saat terurai, mundur saat terbang
        P = fly ? V(0, 11 * f, 40 * f) : V(0, 10 * f * hqZoom, 34 * f * hqZoom);
        L = fly ? V(0, 4, 0) : V(0, 10, 0);
      } else if (ph === "detail") {
        const X = XS[sel] ?? 0;
        const R = 10;
        const fovV = THREE.MathUtils.degToRad(cam.fov);
        const dist = (R / Math.sin(fovV / 2)) * 1.1 * Math.max(1, 1.2 / cam.aspect); // ≈ 32
        const panelPx = window.innerWidth > 800 ? 440 : 0;
        const visW = 2 * dist * Math.tan(fovV / 2) * cam.aspect;
        const shift = (panelPx / window.innerWidth) * visW * 0.5;
        P = V(X + 2, 8 * f, dist);
        L = V(X + shift, 5, 0);
        if (phone) {
          // Phone: sheet menutup sFrac tinggi layar -> turunkan titik pandang agar model di tengah area terlihat.
          // Pergeseran = frac * (setengah tinggi terlihat di jarak target) = frac * d * tan(fov/2).
          const frac = Math.min(Math.max(sFrac, 0), MOBILE_DETAIL.maxLookFrac);
          L.y -= frac * P.distanceTo(L) * Math.tan(fovV / 2);
        }
      } else {
        // split / explode (isRed)
        if (phone && ph === "split") {
          // MODE FOKUS (phone): kamera mengikuti model fokus, tetangga mengintip di tepi.
          const fovV = THREE.MathUtils.degToRad(MOBILE_SPLIT.fov);
          const dist = (MOBILE_SPLIT.R / (Math.tan(fovV / 2) * cam.aspect)) * MOBILE_SPLIT.distMul;
          const fx = XS[foc >= 0 && foc <= 2 ? foc : 0];
          P = V(fx, dist * MOBILE_SPLIT.camY, dist * MOBILE_SPLIT.camZ);
          L = V(fx, MOBILE_SPLIT.targetY, 0);
        } else {
          // 3 platform (x ±18, r 8.8) harus muat di lebar layar.
          // Jarak kamera dihitung dari lebar horizontal yang terlihat, bukan rasio kasar.
          const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
          const halfNeed = cam.aspect < 1 ? 26 : XS[2] + 8;
          const fitSplit = Math.max(1, halfNeed / (tanHalf * cam.aspect) / Math.hypot(11, 40));
          P = V(0, 11 * fitSplit, 40 * fitSplit);
          L = V(0, 4, 0);
        }
      }
      // Phone, fase hq/explode: naikkan gedung sedikit supaya judul + tombol Mulai di bawah tidak menimpanya.
      if (phone && (ph === "hq" || (ph === "explode" && !isRed))) {
        L.y -= MOBILE_DETAIL.hqLookFrac * P.distanceTo(L) * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
      }
      // FOV: 50 hanya untuk fase split di phone, selain itu 40 (nilai asli). Lerp halus.
      const fovT = phone && ph === "split" ? MOBILE_SPLIT.fov : 40;
      if (cam.fov !== fovT) {
        cam.fov = Math.abs(cam.fov - fovT) < 0.05 ? fovT : cam.fov + (fovT - cam.fov) * Math.min(1, dt * 6);
        cam.updateProjectionMatrix();
      }
      camP.lerp(P, 0.045);
      lookTgt.lerp(L, 0.05);
      par.lerp(V(mx.x * 2.2, -mx.y * 1.2, 0), 0.05);
      cam.position.copy(camP).add(par);
      cam.lookAt(lookTgt);
      (scene.fog as THREE.FogExp2).density = fogBase * Math.min(1, (42 / cam.position.length()) ** 2);

      // Rig siang gedung HQ: menyala di fase hq, memudar saat kepingan terbang ke divisi.
      let hqTarget = 0;
      if (ph === "hq") hqTarget = 1;
      else if (ph === "explode")
        hqTarget = isRed ? 1 - Math.min(1, (now - t0) / 400) : 1 - cl((exT - EX_FLY0) / 1.4);
      hqMix += (hqTarget - hqMix) * Math.min(1, dt * 5);
      let divTarget = 0;
      if (ph === "split" || ph === "detail") divTarget = 1;
      else if (ph === "explode")
        divTarget = isRed ? Math.min(1, (now - t0) / 400) : cl((exT - (EX_FLY0 + 0.4)) / 1.4);
      divMix += (divTarget - divMix) * Math.min(1, dt * 5);
      const dayMix = Math.max(hqMix, divMix);
      keyLight.intensity = 1.0 * hqMix;
      fillLight.intensity = 0.25 * Math.max(hqMix, divMix);
      divLight.intensity = 1.05 * divMix;
      hemi.intensity = baseHemi * (1 - 0.4 * dayMix);
      sun.intensity = baseSun * (1 - 0.7 * dayMix);
      // Hanya lampu yang aktif yang merender peta bayangannya (hemat satu pass tiap frame).
      keyLight.shadow.autoUpdate = hqMix > 0.02;
      divLight.shadow.autoUpdate = divMix > 0.02;
      divModels.animate(dt);
      catcher.visible = !lowPower && hqMix > 0.02;
      (catcher.material as THREE.ShadowMaterial).opacity = 0.32 * hqMix;

      const tt = now / 1000;

      // HQ & Explode progress [Bagian C]
      if (ph === "explode" && !isRed) {
        const t = exT;
        // 1) getar + garis tepi menyala
        const amp = cl(t / EX.antic) * (1 - cl((t - EX.antic) / 0.15)) * (gentle ? 0.05 : 0.18);
        hqW.position.set(Math.sin(t * 70) * amp, 0, Math.cos(t * 63) * amp);
        const eOp = 0.28 + 0.72 * cl(t / (EX.antic + 0.4));
        edges.forEach((l) => ((l.material as THREE.LineBasicMaterial).opacity = eOp));
        // bara oranye memanas saat antisipasi, bertahan sampai kepingan terbang
        hqModel?.heat(cl(t / EX.antic) * (1 - cl((t - EX_FLY0) / 1.0)) * (gentle ? 0.4 : 1));

        // 2-4) kepingan
        cine.forEach((k) => {
          const ua = eio(cl((t - EX.antic - k.sd) / (EX.apart - 0.35)));
          const uf = eiC(cl((t - EX_FLY0 - k.fd) / EX.fly));
          tmp.copy(k.p).addScaledVector(k.off, ua);
          tmp.y += Math.sin(t * 2 + k.idx) * 0.15 * ua * (1 - uf); // mengambang saat jeda
          k.c.position.copy(tmp).lerp(k.tl, uf);
          k.c.rotation.set(k.rot.x * (ua + uf * 2), k.rot.y * (ua + uf * 2), k.rot.z * (ua + uf * 2));
          k.c.scale.copy(k.s).multiplyScalar(1 - 0.96 * uf * uf);
        });

        // shockwave + percikan (sekali, di awal tahap 2)
        if (!gentle && !fxSpawned && t >= EX.antic) {
          fxSpawned = true;
          fxT0 = t;
          for (let i = 0; i < DN; i++) {
            dPos[i * 3] = (Math.random() - 0.5) * 20;
            dPos[i * 3 + 1] = 2 + Math.random() * 16;
            dPos[i * 3 + 2] = (Math.random() - 0.5) * 12;
            dVel[i * 3] = (Math.random() - 0.5) * 14;
            dVel[i * 3 + 1] = 2 + Math.random() * 8;
            dVel[i * 3 + 2] = (Math.random() - 0.5) * 14;
          }
          debris.visible = true;
          shock.visible = true;
        }
        if (fxSpawned) {
          const su = cl((t - fxT0) / 1.4);
          shock.scale.setScalar(1 + su * 45);
          (shock.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - su);
          for (let i = 0; i < DN; i++) {
            dPos[i * 3] += dVel[i * 3] * dt;
            dPos[i * 3 + 1] += dVel[i * 3 + 1] * dt;
            dPos[i * 3 + 2] += dVel[i * 3 + 2] * dt;
            dVel[i * 3 + 1] -= 6 * dt;
          }
          dGeo.attributes.position.needsUpdate = true;
          dMat.opacity = 0.9 * (1 - cl((t - fxT0) / 2.2));
          if (su >= 1) shock.visible = false;
        }

        // platform HQ memudar saat kepingan terbang
        const pf = cl((t - EX_FLY0) / 1.0);
        hqP.scale.setScalar(1 + pf * 0.4);
        ((hqP.userData.ring as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - pf);

        if (t >= EX_TOTAL && !explodeDone) {
          explodeDone = true;
          hqW.visible = false;
          hqP.visible = false;
          hqW.position.set(0, 0, 0);
          debris.visible = false;
          cbRef.current.onExplodeComplete?.();
        }
      } else if (ph === "explode" && isRed) {
        // Cabang reduced-motion lama dengan guard explodeDone
        const duration = 400; // durasi ~0.4s untuk reduced-motion
        const pr = Math.min(1, (now - t0) / duration);
        const e = pr * pr;
        kids.forEach((k) => {
          k.c.position.copy(k.p).addScaledVector(k.d, e * 25);
          k.c.rotation.set(0, 0, 0);
          k.c.scale.copy(k.s).multiplyScalar(Math.max(0, 1 - e * e));
        });
        hqP.scale.setScalar(1 + pr * 0.4);
        const ring = hqP.userData.ring as THREE.Mesh;
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - pr);

        if (pr >= 1 && !explodeDone) {
          explodeDone = true;
          hqW.visible = false;
          hqP.visible = false;
          t0 = 0;
          cbRef.current.onExplodeComplete?.();
        }
      } else if (hqW.visible) {
        hqW.rotation.y += dt * (ph === "hq" ? 0.45 : 0.2);
        const sc = hqP.userData.sc as THREE.Mesh;
        const scMat = sc.material as THREE.MeshBasicMaterial;
        const u = (tt % 2) / 2;
        sc.scale.setScalar(0.5 + u);
        scMat.opacity = 0.7 * (1 - u);
      }

      // Divisi: scale lerp, float, platform animasi [Bagian E]
      mods.forEach((m, i) => {
        let a = 1;
        if (ph === "explode" && !isRed) {
          a = back2(cl((exT - (EX_FLY0 + 0.6 + i * 0.25)) / 0.9));
        } else if (ph === "explode" && isRed) {
          const pr = Math.min(1, (now - t0) / 400);
          a = Math.min(1, pr / 0.8);
        } else if (ph === "hq") {
          a = 0;
        } else {
          a = 1;
        }
        const hScale = i === hov || i === sel ? 1.1 : 1;
        // Mode fokus (phone, split): tetangga mengecil, fokus penuh.
        const fTarget = phone && ph === "split" && foc >= 0 ? (i === foc ? 1 : MOBILE_SPLIT.neighborScale) : 1;
        const fsPrev = (m.w.userData.fs as number | undefined) ?? 1;
        const fs = fsPrev + (fTarget - fsPrev) * Math.min(1, dt * 7);
        (m.w.userData as Record<string, unknown>).fs = fs;
        const dim = ph === "detail" && i !== sel ? 0.55 : 1;
        const prev = m.w.userData.s as number;
        const next = prev + (a * hScale * dim * fTarget - prev) * Math.min(1, dt * 7);
        (m.w.userData as Record<string, unknown>).s = next;
        m.w.scale.setScalar(Math.max(0.0001, next));
        m.w.visible = next > 0.02 || ph === "explode";
        m.w.rotation.y += dt * (i === hov || i === sel ? 0.9 : 0.3);
        m.w.position.y = isRed ? 0 : Math.sin(tt * 1.2 + i) * 0.35 * a;
        m.p.visible = a > 0.02;
        m.p.scale.setScalar(Math.max(0.01, a * fs));
        const sc = m.p.userData.sc as THREE.Mesh;
        const scMat = sc.material as THREE.MeshBasicMaterial;
        const u = (tt * 0.5 + i * 0.3) % 1;
        sc.scale.setScalar(0.45 + u * 0.55);
        scMat.opacity = 0.7 * (1 - u);
        const ringMat = (m.p.userData.ring as THREE.Mesh).material as THREE.MeshBasicMaterial;
        ringMat.opacity = i === hov || i === sel ? 1 : 0.55;

        // Cincin status CCTV hidup
        const statusRing = m.p.userData.statusRing as THREE.Mesh | undefined;
        if (statusRing) {
          const { divisionStatus: divStatus } = stateRef.current;
          const stat = divStatus?.[i];
          const tot = stat?.total ?? 0;
          const on = stat?.online ?? 0;
          let tier: "good" | "warn" | "bad" | "none" = "none";
          if (tot > 0) {
            const ratio = on / tot;
            if (ratio >= 0.8) tier = "good";
            else if (ratio >= 0.3) tier = "warn";
            else tier = "bad";
          }

          if (tier === "none") {
            statusRing.visible = false;
          } else {
            statusRing.visible = m.p.visible;
            const targetColor =
              tier === "good"
                ? TIER_COLORS.good
                : tier === "warn"
                ? TIER_COLORS.warn
                : TIER_COLORS.bad;
            const mat = statusRing.material as THREE.MeshBasicMaterial;
            mat.color.lerp(targetColor, 0.08);
            mat.opacity = 0.85;
          }
        }
      });

      // Grid scroll pelan ke arah z
      // Grid: lebih jarang & tipis di mode fokus (phone, split); lerp halus, tanpa alokasi.
      const gridModeFocus = phone && ph === "split";
      const gDampT = gridModeFocus ? MOBILE_SPLIT.gridOpacity : 1;
      const gScaleT = gridModeFocus ? MOBILE_SPLIT.gridScale : 1;
      if (gridDamp !== gDampT) {
        gridDamp = Math.abs(gridDamp - gDampT) < 0.005 ? gDampT : gridDamp + (gDampT - gridDamp) * Math.min(1, dt * 4);
        syncGridOpacity();
      }
      if (gridScaleCur !== gScaleT) {
        gridScaleCur = Math.abs(gridScaleCur - gScaleT) < 0.005 ? gScaleT : gridScaleCur + (gScaleT - gridScaleCur) * Math.min(1, dt * 4);
        grid.scale.set(gridScaleCur, 1, gridScaleCur);
      }
      grid.position.z = (tt * 2) % (2.9 * gridScaleCur);

      ren.render(scene, cam);
      renderCount++;

      // 2c. Panggil onReady SEKALI setelah frame pertama selesai dirender (frame ke-2 setelah build)
      if (!hasReportedReady && renderCount >= 2) {
        hasReportedReady = true;
        cbRef.current.onReady?.();
      }
    };
    raf = requestAnimationFrame(loop);

    // ---- Cleanup penuh (zero memory leak) --------------------------------
    return () => {
      applyThemeRef.current = null;
      isDisposed = true;
      stopLoop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      ren.domElement.removeEventListener("pointermove", onPtrMove);
      ren.domElement.removeEventListener("pointerdown", onPtrDown);
      ren.domElement.removeEventListener("pointerup", onPtrUp);
      ren.domElement.removeEventListener("pointercancel", onPtrCancel);

      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) {
          try { mesh.geometry.dispose(); } catch { /* ignore */ }
        }
        if (mesh.material) {
          const mat = mesh.material;
          const disposeMat = (m: THREE.Material) => {
            const texture = (m as unknown as { map?: THREE.Texture }).map;
            if (texture) {
              try { texture.dispose(); } catch { /* ignore */ }
            }
            try { m.dispose(); } catch { /* ignore */ }
          };
          if (Array.isArray(mat)) {
            mat.forEach(disposeMat);
          } else {
            disposeMat(mat);
          }
        }
      });

      disposables.forEach((d) => {
        try { d.dispose(); } catch { /* ignore */ }
      });
      try {
        ren.forceContextLoss();
      } catch {
        /* ignore */
      }
      try {
        ren.dispose();
      } catch {
        /* ignore */
      }
      if (ren.domElement.parentNode === mount) mount.removeChild(ren.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}