"use client";

/**
 * IntroScene3D - scene Three.js TERPADU untuk intro /categories.
 *
 * Langkah 2: Setup scene lengkap persis prototipe tengok-intro-prototype.html:
 *   - Background #070d18, FogExp2(0x0a1220, 0.011)
 *   - Grid lantai amber bergerak pelan (GridHelper 260x90)
 *   - ~500 bintang (Points, posisi acak)
 *   - Platform per model: disc transparan + cincin solid + scan ring animasi
 *   - PointLight berwarna per divisi
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

// X positions divisi
const XS = [-19, 0, 19] as const;
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
  /** Warna aksen tiap divisi (hex string, urutan sesuai ORDER) */
  divisionColors: readonly string[];
  /** Status CCTV per divisi (urutan sesuai ORDER) */
  divisionStatus?: Array<{ total: number; online: number }>;
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
  className?: string;
}

export default function IntroScene3D({
  phase,
  selectedDiv,
  hoveredDiv,
  divisionColors,
  divisionStatus,
  reducedMotion = false,
  onBuildingClick,
  onExplodeComplete,
  onDivisionClick,
  onDivisionHover,
  className = "",
}: IntroScene3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Refs untuk props agar loop animasi selalu baca nilai terkini tanpa rebuild scene
  const stateRef = useRef({ phase, selectedDiv, hoveredDiv, reducedMotion, divisionStatus });
  const cbRef = useRef({ onBuildingClick, onExplodeComplete, onDivisionClick, onDivisionHover });

  useEffect(() => {
    stateRef.current = { phase, selectedDiv, hoveredDiv, reducedMotion, divisionStatus };
  }, [phase, selectedDiv, hoveredDiv, reducedMotion, divisionStatus]);

  useEffect(() => {
    cbRef.current = { onBuildingClick, onExplodeComplete, onDivisionClick, onDivisionHover };
  }, [onBuildingClick, onExplodeComplete, onDivisionClick, onDivisionHover]);

  // Effect utama: bangun scene & jalankan loop. Hanya berjalan sekali.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = () => mount.clientWidth || window.innerWidth;
    const H = () => mount.clientHeight || window.innerHeight;

    // ---- Scene & renderer (opaque, background #070d18) --------------------
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a1220, 0.011);

    const cam = new THREE.PerspectiveCamera(40, W() / H(), 0.1, 400);

    const ren = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    ren.setSize(W(), H());
    ren.setClearColor(0x070d18, 1);
    mount.appendChild(ren.domElement);

    // resource tracking untuk dispose saat unmount
    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(o: T): T => {
      disposables.push(o);
      return o;
    };

    // ---- Cahaya (persis prototipe) ----------------------------------------
    scene.add(new THREE.HemisphereLight(0xaec6ff, 0x1a2233, 0.85));
    const sun = new THREE.DirectionalLight(0xffe2b0, 0.9);
    sun.position.set(20, 40, 30);
    scene.add(sun);

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
    function cyl(
      a: THREE.Vector3, c: THREE.Vector3, r: number,
      m: THREE.Material, p: THREE.Object3D, s = 6
    ) {
      const d = new THREE.Vector3().subVectors(c, a);
      const l = d.length();
      const o = new THREE.Mesh(track(new THREE.CylinderGeometry(r, r, l, s)), m);
      o.position.copy(a).addScaledVector(d, 0.5);
      o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
      p.add(o);
      return o;
    }
    function segm(
      a: THREE.Vector3, c: THREE.Vector3,
      w: number, t: number, m: THREE.Material, p: THREE.Object3D
    ) {
      const o = new THREE.Mesh(track(new THREE.BoxGeometry(w, t, a.distanceTo(c) + 0.05)), m);
      o.position.copy(a).add(c).multiplyScalar(0.5);
      o.lookAt(c);
      p.add(o);
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
    function fit(g: THREE.Group, size: number, col: number): THREE.Group {
      glow(g, col, 0.28);
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
    function bendungan(): THREE.Group {
      const g = new THREE.Group();
      const sh = new THREE.Shape();
      sh.moveTo(-2, 0); sh.lineTo(12, 0); sh.lineTo(3, 16); sh.lineTo(-1, 16); sh.closePath();
      const body = new THREE.Mesh(
        track(new THREE.ExtrudeGeometry(sh, { depth: 44, bevelEnabled: false })), C.conc
      );
      body.position.z = -22;
      g.add(body);
      b(22, 12, 40, C.water, -13, 6, 0, g);
      b(3, 1, 44, C.grey, 1, 16.5, 0, g);
      for (let i = -2; i <= 2; i++) b(1.2, 3.5, 3, C.grey, 1, 18, i * 3, g);
      for (let i = -1; i <= 1; i++) b(0.5, 3, 4.6, C.dgrey, -0.6, 16.6, i * 3, g);
      b(3.2, 0.6, 18, C.grey, 1, 19.6, 0, g);
      const ang = Math.atan2(-16, 9), n = V(16, 9, 0).normalize();
      const ch = b(18.4, 0.5, 13, C.grey, 7.5 + n.x * 0.3, 8 + n.y * 0.3, 0, g);
      ch.rotation.z = ang;
      const st = b(18.4, 0.3, 9, C.water, 7.5 + n.x * 0.6, 8 + n.y * 0.6, 0, g);
      st.rotation.z = ang;
      b(10, 1, 14, C.grey, 15, 0.5, 0, g);
      b(11, 6, 14, C.grey, 19, 3, -11, g);
      b(12, 0.8, 15, C.dgrey, 19, 6.4, -11, g);
      [[-14], [-9]].forEach(([z]) =>
        cyl(V(4, 14, z + 0.5), V(14, 3.5, -10 + (z + 14) * 0.4), 0.9, C.dgrey, g, 8)
      );
      b(16, 1, 26, C.water, 31, 0.5, -4, g);
      const rk = (x: number, y: number, z: number, s: number) => {
        const o = new THREE.Mesh(track(new THREE.DodecahedronGeometry(s, 0)), C.rock);
        o.position.set(x, y, z);
        o.scale.y = 0.75;
        g.add(o);
      };
      for (let i = 0; i < 7; i++) {
        const s = 7 + ((i * 5) % 4);
        rk(i * 3 - 8, s * 0.5, -34 - (i % 2) * 3, s);
        rk(i * 3 - 8, s * 0.5, 34 + (i % 2) * 3, s);
      }
      rk(-3, 18, -31, 8); rk(-3, 18, 31, 8); rk(8, 9, -34, 9); rk(8, 9, 34, 9);
      rk(20, 5, -28, 6); rk(20, 5, 28, 6); rk(-18, 5, -37, 8); rk(-18, 5, 37, 8);
      return g;
    }
    function tol(): THREE.Group {
      const g = new THREE.Group();
      const Y = 7;
      b(94, 0.8, 5.4, C.asph, 2, Y, 0, g);
      for (let x = -44; x < 48; x += 4) b(1.6, 0.05, 0.25, C.white, x, Y + 0.43, 0, g);
      [-1, 1].forEach((s) => b(94, 0.6, 0.4, C.orange, 2, Y + 0.7, s * 2.9, g));
      for (let x = -40; x <= 46; x += 12) {
        b(1.4, Y - 0.4, 1.4, C.dgrey, x, (Y - 0.4) / 2, 0, g);
        b(3.2, 0.6, 1.8, C.amber, x, Y - 0.7, 0, g);
      }
      b(4.4, 0.3, 60, C.asph, 0, 0.2, 0, g);
      for (let z = -28; z < 30; z += 4) b(0.25, 0.05, 1.6, C.white, 0, 0.4, z, g);
      (
        [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ] as const
      ).forEach(([sx, sz]) => {
        const P0 = V(sx * 12, Y, sz * 2.6),
          P1 = V(sx * 25, 3.6, sz * 9),
          P2 = V(sx * 2.6, 0.3, sz * 20);
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 14; i++) {
          const t = i / 14, u = 1 - t;
          pts.push(
            V(
              u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x,
              Y + (0.3 - Y) * t,
              u * u * P0.z + 2 * u * t * P1.z + t * t * P2.z
            )
          );
        }
        for (let i = 0; i < 14; i++) segm(pts[i], pts[i + 1], 3.6, 0.7, C.asph, g);
        pts.forEach((p, i) => {
          if (i % 3 === 1 && p.y > 1.6) {
            b(1.1, p.y - 0.5, 1.1, C.dgrey, p.x, (p.y - 0.5) / 2, p.z, g);
            b(2.4, 0.5, 2.4, C.amber, p.x, p.y - 0.55, p.z, g);
          }
        });
        for (let i = 0; i < 14; i++) {
          const a = pts[i].clone(), c = pts[i + 1].clone();
          const nx = c.z - a.z, nz = -(c.x - a.x), l = Math.hypot(nx, nz) || 1;
          const ov = V((nx / l) * 1.9, 0.6, (nz / l) * 1.9);
          segm(a.clone().add(ov), c.clone().add(ov), 0.3, 0.5, C.orange, g);
        }
      });
      [-1, 1].forEach((s) => b(1.3, 24, 1.3, C.conc, 30, 12, s * 3.4, g));
      b(1.3, 1.2, 8.2, C.conc, 30, 17, 0, g);
      b(1.5, 1.2, 8.2, C.conc, 30, 23.2, 0, g);
      [-1, 1].forEach((s) => {
        for (let i = 0; i < 6; i++) {
          const top = V(30, 23 - i * 1.6, s * 3.4);
          [-1, 1].forEach((d) =>
            cyl(top, V(30 + d * (5 + i * 2.6), Y + 0.4, s * 2.9), 0.1, C.amber, g, 4)
          );
        }
      });
      return g;
    }

    const BUILD = { gedung, bendungan, tol };

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

    // ---- Bintang ~500 titik -----------------------------------------------
    {
      const p: number[] = [];
      for (let i = 0; i < 500; i++)
        p.push(
          (Math.random() - 0.5) * 260,
          Math.random() * 90 + 5,
          -Math.random() * 140 - 10
        );
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      scene.add(new THREE.Points(geo, track(new THREE.PointsMaterial({ color: 0xaec6ff, size: 0.5, transparent: true, opacity: 0.6 }))));
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

    // ---- HQ model + platform amber ----------------------------------------
    const hqW = fit(hq(), 19, 0xf59e0b);
    scene.add(hqW);
    const hqP = platform(15, 0xf59e0b);

    // ---- Cinematic explode (gerak normal, ±4.9s) [Bagian A] ----
    const EX = { antic: 0.6, apart: 1.6, hold: 0.6, fly: 1.2 };
    const EX_FLY0 = EX.antic + EX.apart + EX.hold; // 2.8
    const EX_TOTAL = 4.9;
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

    // ---- 3 divisi: model (scale=0) + platform + PointLight ----------------
    const divColors3 = [...divisionColors].slice(0, 3);
    const mods = MODEL_KEYS.map((key, i) => {
      const col = new THREE.Color(divColors3[i] ?? "#f59e0b").getHex();
      const w = fit(BUILD[key](), 14, col);
      w.position.x = XS[i];
      w.scale.setScalar(0.0001); // hampir nol; visible=false saat scale < 0.02
      w.visible = false;
      (w.userData as Record<string, unknown>).i = i;
      (w.userData as Record<string, unknown>).s = 0; // smooth scale state
      scene.add(w);
      const r = 8.8;
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

      const light = new THREE.PointLight(col, 0.6, 34);
      light.position.set(XS[i], 12, 14);
      scene.add(light);
      return { w, p, light };
    });

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

    const onPtrMove = (e: PointerEvent) => {
      updatePt(e);
      const { phase: ph } = stateRef.current;
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
      updatePt(e);
      const { phase: ph } = stateRef.current;
      if (ph === "hq" && pickFrom([hqW])) {
        cbRef.current.onBuildingClick();
      } else if (ph === "split") {
        const i = idxOf(pickFrom(mods.map((m) => m.w)));
        if (i >= 0) cbRef.current.onDivisionClick(i);
      }
    };
    ren.domElement.addEventListener("pointermove", onPtrMove);
    ren.domElement.addEventListener("pointerdown", onPtrDown);

    // ---- Resize -----------------------------------------------------------
    const onResize = () => {
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
    let last = performance.now();
    let raf = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const { phase: ph, selectedDiv: sel, hoveredDiv: hov } = stateRef.current;
      const isRed = Boolean(stateRef.current.reducedMotion);

      // Tangani transisi fase [Bagian B & F]
      if (ph !== lastPhase) {
        if (ph === "explode") {
          t0 = now;
          const g = hqW.userData.g as THREE.Group;
          console.log(
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
              const off = dir.multiplyScalar(12 + Math.random() * 10).add(V(0, (hN - 0.35) * 16, 0));
              const tl = g.worldToLocal(V(XS[idx % 3], 5, 0)); // tujuan = platform divisi
              return {
                c,
                idx,
                p: c.position.clone(),
                s: c.scale.clone(),
                off,
                tl,
                rot: V(
                  (Math.random() - 0.5) * 0.9,
                  (Math.random() - 0.5) * 1.6,
                  (Math.random() - 0.5) * 0.9
                ),
                sd: (1 - hN) * 0.35, // atas lepas duluan
                fd: Math.random() * 0.4,
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
          hqW.visible = false;
          hqP.visible = false;
          mods.forEach((m) => {
            m.w.visible = true;
          });
        } else if (ph === "hq") {
          hqW.position.set(0, 0, 0);
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
      let P: THREE.Vector3, L: THREE.Vector3;
      if (ph === "hq") {
        P = V(0, 9 * f, 34 * f);
        L = V(0, 4, 0);
      } else if (ph === "explode" && !isRed) {
        const fly = exT > EX_FLY0 - 0.2; // dekat saat terurai, mundur saat terbang
        P = fly ? V(0, 11 * f, 40 * f) : V(0, 10 * f, 34 * f);
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
      } else {
        // split / explode (isRed)
        P = V(0, 11 * f, 40 * f);
        L = V(0, 4, 0);
      }
      camP.lerp(P, 0.045);
      lookTgt.lerp(L, 0.05);
      par.lerp(V(mx.x * 2.2, -mx.y * 1.2, 0), 0.05);
      cam.position.copy(camP).add(par);
      cam.lookAt(lookTgt);

      const tt = now / 1000;

      // HQ & Explode progress [Bagian C]
      if (ph === "explode" && !isRed) {
        const t = exT;
        // 1) getar + garis tepi menyala
        const amp = cl(t / EX.antic) * (1 - cl((t - EX.antic) / 0.15)) * 0.18;
        hqW.position.set(Math.sin(t * 70) * amp, 0, Math.cos(t * 63) * amp);
        const eOp = 0.28 + 0.72 * cl(t / (EX.antic + 0.4));
        edges.forEach((l) => ((l.material as THREE.LineBasicMaterial).opacity = eOp));

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
        if (!fxSpawned && t >= EX.antic) {
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
        const dim = ph === "detail" && i !== sel ? 0.55 : 1;
        const prev = m.w.userData.s as number;
        const next = prev + (a * hScale * dim - prev) * Math.min(1, dt * 7);
        (m.w.userData as Record<string, unknown>).s = next;
        m.w.scale.setScalar(Math.max(0.0001, next));
        m.w.visible = next > 0.02 || ph === "explode";
        m.w.rotation.y += dt * (i === hov || i === sel ? 0.9 : 0.3);
        m.w.position.y = isRed ? 0 : Math.sin(tt * 1.2 + i) * 0.35 * a;
        m.p.visible = a > 0.02;
        m.p.scale.setScalar(Math.max(0.01, a));
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
      grid.position.z = (tt * 2) % 2.9;

      ren.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);

    // ---- Cleanup penuh (zero memory leak) --------------------------------
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      ren.domElement.removeEventListener("pointermove", onPtrMove);
      ren.domElement.removeEventListener("pointerdown", onPtrDown);

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
      ren.dispose();
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