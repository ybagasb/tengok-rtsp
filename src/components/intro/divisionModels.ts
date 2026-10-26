/**
 * divisionModels - model 3D tiga divisi untuk intro (gedung, bendungan, tol).
 *
 * Dibangun prosedural tetapi dengan material PBR, tekstur kanvas (beton, kaca
 * kurtain wall dengan jendela menyala, aspal bergaris, air, batu), terrain
 * berlekuk, instancing untuk vegetasi/pagar/tiang, serta bagian bergerak
 * (air mengalir, kendaraan, derek). Semua material menerima environment map
 * yang sama dengan gedung HQ lewat applyEnv().
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Track = <T extends { dispose: () => void }>(o: T) => T;
type Vec = THREE.Vector3;

export interface DivisionModels {
  build: Record<"gedung" | "bendungan" | "tol", () => THREE.Group>;
  /** Pasang environment map pada seluruh material divisi (refleksi kaca/air/aspal) */
  applyEnv: (tex: THREE.Texture) => void;
  /** Gerakkan air, kendaraan, dan derek */
  animate: (dt: number) => void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDivisionModels(track: Track, lowPower: boolean): DivisionModels {
  const mats: THREE.MeshStandardMaterial[] = [];
  const animTex: Array<{ t: THREE.Texture; vx: number; vy: number }> = [];
  const movers: Array<(dt: number, time: number) => void> = [];
  let time = 0;

  // ---- Tekstur kanvas ------------------------------------------------------
  type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
  function canvasTex(w: number, h: number, draw: Draw, srgb = true) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d")!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return track(t);
  }
  const rep = (t: THREE.Texture, rx: number, ry: number) => {
    const c = t.clone();
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    return track(c);
  };
  function speckle(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, a: number, s0: number, s1: number) {
    for (let i = 0; i < n; i++) {
      const s = s0 + r() * (s1 - s0);
      g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a * r()})` : `rgba(0,0,0,${a * r()})`;
      g.fillRect(r() * w, r() * h, s, s);
    }
  }

  const concT = canvasTex(256, 256, (g, w, h) => {
    const r = rand(11);
    g.fillStyle = "#bdbab2";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 1800, 0.16, 1, 4);
    g.strokeStyle = "rgba(60,60,60,.28)";
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 64) {
      g.beginPath();
      g.moveTo(0, y + 1);
      g.lineTo(w, y + 1);
      g.stroke();
    }
    for (let y = 0; y < h; y += 64)
      for (let x = ((y / 64) % 2) * 64; x < w; x += 128) {
        g.beginPath();
        g.moveTo(x + 1, y);
        g.lineTo(x + 1, y + 64);
        g.stroke();
      }
  });
  const pavingT = canvasTex(256, 256, (g, w, h) => {
    const r = rand(23);
    g.fillStyle = "#c8c6c0";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 1200, 0.12, 1, 3);
    g.strokeStyle = "rgba(70,70,70,.35)";
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, h);
      g.moveTo(0, i * 64);
      g.lineTo(w, i * 64);
      g.stroke();
    }
  });
  const grassT = canvasTex(256, 256, (g, w, h) => {
    const r = rand(31);
    g.fillStyle = "#5d8f52";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 3200, 0.22, 1, 3);
  });
  const rockT = canvasTex(256, 256, (g, w, h) => {
    const r = rand(47);
    g.fillStyle = "#7d776d";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},${0.06 + r() * 0.12})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 6 + r() * 26, 4 + r() * 16, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    speckle(g, w, h, r, 900, 0.2, 1, 3);
  });
  const waterT = canvasTex(256, 256, (g, w, h) => {
    const r = rand(59);
    const q = g.createLinearGradient(0, 0, w, h);
    q.addColorStop(0, "#1f8a9a");
    q.addColorStop(1, "#16627c");
    g.fillStyle = q;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(220,245,255,.28)";
    g.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, l = 14 + r() * 40;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + l / 2, y + 4 - r() * 8, x + l, y);
      g.stroke();
    }
  });
  const flowT = canvasTex(256, 128, (g, w, h) => {
    const r = rand(71);
    g.fillStyle = "#cfeaf2";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "70,150,180"},${0.25 + r() * 0.4})`;
      g.fillRect(r() * w, r() * h, 10 + r() * 36, 2 + r() * 4);
    }
  });
  // lajur memanjang di sumbu u; satu siklus tekstur = 8 satuan panjang
  const roadT = canvasTex(256, 128, (g, w, h) => {
    const r = rand(83);
    g.fillStyle = "#3b3e44";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 1500, 0.14, 1, 3);
    g.fillStyle = "#ecebe4";
    g.fillRect(0, 8, w, 5);
    g.fillRect(0, h - 13, w, 5);
    g.fillStyle = "#e8e4d4";
    g.fillRect(0, h / 2 - 2, w / 2 - 20, 4);
  });
  const winCol = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#23364d";
    g.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++) {
        const x = col * 64, y = row * 64;
        const q = g.createLinearGradient(x, y, x + 64, y + 52);
        q.addColorStop(0, "#5f93c4");
        q.addColorStop(1, "#1e4268");
        g.fillStyle = q;
        g.fillRect(x + 3, y + 3, 58, 46);
        g.fillStyle = "#58616c"; // spandrel / pelat lantai
        g.fillRect(x, y + 51, 64, 13);
      }
    g.strokeStyle = "#a9bacb"; // mullion
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, h);
      g.stroke();
    }
  });
  const winEmi = canvasTex(256, 256, (g, w, h) => {
    const r = rand(97);
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++) {
        if (r() < 0.32) {
          g.fillStyle = r() < 0.7 ? "#ffcf8a" : "#cfe6ff";
          g.fillRect(col * 64 + 3, row * 64 + 3, 58, 46);
        }
      }
  });
  const panelT = canvasTex(256, 256, (g, w, h) => {
    const r = rand(103);
    g.fillStyle = "#dcd9d1";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 900, 0.1, 1, 3);
    g.fillStyle = "#2c4a6b"; // pita jendela
    g.fillRect(0, 70, w, 90);
    g.fillStyle = "rgba(255,255,255,.25)";
    g.fillRect(0, 70, w, 6);
    g.strokeStyle = "rgba(60,60,60,.45)";
    g.lineWidth = 3;
    for (let x = 0; x <= w; x += 64) {
      g.beginPath();
      g.moveTo(x, 70);
      g.lineTo(x, 160);
      g.stroke();
    }
  });
  const signT = canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = "#14683f";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#f4f4f4";
    g.lineWidth = 5;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = "#fff";
    g.font = "bold 54px Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("TOL", w / 2, h / 2 + 3);
  });

  // ---- Material ------------------------------------------------------------
  const M = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => {
    const m = track(
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.5, ...o })
    );
    mats.push(m);
    return m;
  };
  const conc = M(0xffffff, { map: rep(concT, 1, 1), bumpMap: rep(concT, 1, 1), bumpScale: 0.5, roughness: 0.92, side: THREE.DoubleSide });
  const damConc = M(0xffffff, { map: rep(concT, 0.25, 0.25), bumpMap: rep(concT, 0.25, 0.25), bumpScale: 0.5, roughness: 0.92 });
  const concDark = M(0x8d8f94, { map: rep(concT, 1, 1), roughness: 0.9, side: THREE.DoubleSide });
  const rock = M(0xffffff, { map: rep(rockT, 0.2, 0.2), bumpMap: rep(rockT, 0.2, 0.2), bumpScale: 1.0, roughness: 1 });
  const steel = M(0x8a949e, { metalness: 0.75, roughness: 0.38, envMapIntensity: 0.9 });
  const steelDark = M(0x3f464e, { metalness: 0.6, roughness: 0.5 });
  const amber = M(0xf2a516, { metalness: 0.25, roughness: 0.5 });
  const orange = M(0xe8700c, { roughness: 0.55 });
  const white = M(0xf2f2ee, { roughness: 0.6 });
  const glassM = M(0x6f9fcb, { metalness: 0.55, roughness: 0.12, envMapIntensity: 1.1 });
  const lampM = M(0x222222, { emissive: 0xffe2a8, emissiveIntensity: 2.2 });
  const warnM = M(0x222222, { emissive: 0xff3b30, emissiveIntensity: 2.4 });
  const leafM = M(0xffffff, { roughness: 0.95 });
  const trunkM = M(0x6e5438, { roughness: 1 });
  const pavingM = M(0xffffff, { map: rep(pavingT, 5, 4), roughness: 0.85 });
  const grassM = M(0xffffff, { map: rep(grassT, 5, 5), roughness: 1 });
  const asphalt = M(0xffffff, { map: rep(roadT, 1, 1), roughness: 0.82, envMapIntensity: 0.7, side: THREE.DoubleSide });
  const waterM = M(0xffffff, {
    map: rep(waterT, 6, 6),
    transparent: true,
    opacity: 0.9,
    roughness: 0.06,
    metalness: 0.2,
    envMapIntensity: 1.3,
  });
  animTex.push({ t: waterM.map!, vx: 0.012, vy: 0.006 });
  const flowM = M(0xffffff, { map: rep(flowT, 2, 1), transparent: true, opacity: 0.92, roughness: 0.15, envMapIntensity: 1 });
  animTex.push({ t: flowM.map!, vx: -0.9, vy: 0 });

  // ---- Helper geometri -----------------------------------------------------
  const boxG = new THREE.BoxGeometry(1, 1, 1);
  const cylG = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);

  function bx(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D, cast = true) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = cast;
    o.receiveShadow = true;
    p.add(o);
    return o;
  }
  function cy(rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D, seg = 20) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    p.add(o);
    return o;
  }
  /** Balok/silinder tipis dari titik a ke b (untuk rangka & kabel), siap di-merge */
  function beam(a: Vec, b: Vec, t: number, round = false) {
    const d = b.clone().sub(a);
    const len = d.length();
    const m = new THREE.Matrix4().compose(
      a.clone().add(b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()),
      V(t, len, t)
    );
    return (round ? cylG : boxG).clone().applyMatrix4(m);
  }
  function putG(geo: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
    return geo.clone().applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion(), V(sx, sy, sz)));
  }
  function mergedMesh(parts: THREE.BufferGeometry[], m: THREE.Material, p: THREE.Object3D, cast = true) {
    if (parts.length === 0) return null;
    const geo = mergeGeometries(parts, false);
    if (!geo) return null;
    const o = new THREE.Mesh(geo, m);
    o.castShadow = cast;
    o.receiveShadow = true;
    p.add(o);
    return o;
  }
  type Item = { p: [number, number, number]; s?: [number, number, number]; ry?: number; c?: number };
  function inst(geo: THREE.BufferGeometry, m: THREE.Material, items: Item[], p: THREE.Object3D, cast = true) {
    const im = new THREE.InstancedMesh(geo, m, Math.max(1, items.length));
    im.count = items.length;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.rotation.set(0, it.ry ?? 0, 0);
      o.scale.set(...(it.s ?? [1, 1, 1]));
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      if (it.c !== undefined) im.setColorAt(i, col.setHex(it.c));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    im.castShadow = cast;
    im.receiveShadow = true;
    p.add(im);
    return im;
  }
  const treeColors = [0x4f8a4a, 0x5f9b52, 0x3f7a45, 0x6aa357];

  /** Kurtain wall: 6 material (+x,-x,+y,-y,+z,-z) dengan pengulangan tekstur sesuai ukuran sisi */
  function curtain(w: number, h: number, d: number, tint = 0xffffff, lit = 0.55): THREE.Material[] {
    const side = (sw: number) => {
      const m = track(
        new THREE.MeshStandardMaterial({
          color: tint,
          map: rep(winCol, sw / 7.6, h / 12.8),
          emissiveMap: rep(winEmi, sw / 7.6, h / 12.8),
          emissive: 0xffffff,
          emissiveIntensity: lit,
          roughness: 0.28,
          metalness: 0.4,
          envMapIntensity: 1.0,
        })
      );
      mats.push(m);
      return m;
    };
    const roof = M(0x59636e, { roughness: 0.9 });
    return [side(d), side(d), roof, roof, side(w), side(w)];
  }
  function tower(w: number, h: number, d: number, x: number, y0: number, z: number, p: THREE.Object3D, tint = 0xffffff) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), curtain(w, h, d, tint));
    o.position.set(x, y0 + h / 2, z);
    o.castShadow = true;
    o.receiveShadow = true;
    p.add(o);
    // parapet atap
    bx(w + 0.5, 0.9, d + 0.5, concDark, x, y0 + h + 0.45, z, p);
    return o;
  }

  // ==========================================================================
  // DIVISI 1: Gedung & Bangunan
  // ==========================================================================
  function gedung(): THREE.Group {
    const g = new THREE.Group();
    // alas plaza berlapis paving + rumput
    bx(38, 1, 28, pavingM, 0, 0.5, 0, g);
    bx(38.4, 0.5, 28.4, concDark, 0, -0.25, 0, g);
    bx(38, 0.14, 7, grassM, 0, 1.07, -10.5, g, false);

    // podium: plinth batu, pita kaca, pelat atap
    bx(25, 1.6, 16, conc, -1, 1.8, 2, g);
    const band = new THREE.Mesh(new THREE.BoxGeometry(24.2, 3.4, 15.2), curtain(24.2, 3.4, 15.2, 0xdde8f2, 0.4));
    band.position.set(-1, 4.3, 2);
    band.castShadow = true;
    g.add(band);
    bx(25.6, 0.9, 16.6, concDark, -1, 6.45, 2, g);

    // menara utama + sirip vertikal di muka depan
    tower(12, 24, 10, -5, 6.9, -1.5, g);
    for (let i = 0; i < 7; i++) bx(0.3, 24, 0.9, white, -10.4 + i * 1.7, 18.9, 3.8, g);
    // menara kedua lebih rendah, tint lebih netral
    tower(9, 16, 8, 8.5, 6.9, -2.5, g, 0xc9d6e2);
    // pelantar penghubung
    bx(3.6, 1.8, 2.4, glassM, 2, 17, -2, g);
    // sayap rendah dengan panel & pita jendela + sirip pelindung matahari
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(9, 9, 10),
      new Array(6).fill(0).map((_, i) =>
        i === 2 || i === 3
          ? concDark
          : M(0xffffff, { map: rep(panelT, i < 2 ? 10 / 8 : 9 / 8, 9 / 8), roughness: 0.75 })
      )
    );
    wing.position.set(-15, 5.5, 3);
    wing.castShadow = true;
    wing.receiveShadow = true;
    g.add(wing);
    for (let i = 0; i < 3; i++) bx(9.4, 0.25, 1.4, white, -15, 4.3 + i * 2.6, 8.2, g);

    // kanopi masuk + kolom + strip lampu
    bx(10, 0.5, 5.4, white, -5, 5.3, 9.4, g);
    bx(9.4, 0.12, 4.9, lampM, -5, 4.98, 9.4, g, false);
    [-9, -1].forEach((x) => cy(0.3, 0.3, 4.2, white, x, 3.1, 11.6, g, 12));

    // atap: unit mekanikal + mast dengan lampu peringatan
    bx(6, 2.2, 4.6, steelDark, -7, 32.9, -1.5, g);
    bx(3.4, 1.6, 3, steel, -1, 32.6, -0.5, g);
    cy(0.1, 0.16, 5, steel, -3.5, 35.1, -2.5, g, 8);
    bx(0.32, 0.32, 0.32, warnM, -3.5, 37.7, -2.5, g, false);
    bx(3.6, 1.4, 3.4, steelDark, 8.5, 23.6, -2.5, g);

    // pohon (instancing) + lampu taman
    const trees: Item[] = [];
    const trunks: Item[] = [];
    [[-16, 10.8], [-9, 11.6], [2, 11.4], [10, 11.2], [16, 9], [17, 1], [-17.5, -9], [-6, -11.5], [4, -11.5], [13, -10.5]].forEach(
      ([x, z], i) => {
        const s = 0.9 + ((i * 37) % 10) / 20;
        trunks.push({ p: [x, 1 + 0.9 * s, z], s: [0.35 * s, 1.8 * s, 0.35 * s] });
        trees.push({ p: [x, 1 + 2.6 * s, z], s: [2.6 * s, 2.4 * s, 2.6 * s], c: treeColors[i % 4] });
      }
    );
    inst(cylG, trunkM, trunks, g);
    inst(new THREE.IcosahedronGeometry(0.5, 1), leafM, trees, g);
    const poles: Item[] = [];
    const heads: Item[] = [];
    for (let x = -16; x <= 16; x += 8) {
      poles.push({ p: [x, 3, 13], s: [0.14, 4, 0.14] });
      heads.push({ p: [x, 5.1, 13], s: [0.5, 0.2, 0.5] });
    }
    inst(cylG, steelDark, poles, g);
    inst(boxG, lampM, heads, g, false);

    // derek menara (identitas konstruksi): rangka kisi + lengan, berayun pelan
    const crane = new THREE.Group();
    const lat: THREE.BufferGeometry[] = [];
    const H = 30, W = 0.7;
    const corners = [[-W, -W], [W, -W], [W, W], [-W, W]];
    corners.forEach(([x, z]) => lat.push(beam(V(x, 1, z), V(x, H, z), 0.18)));
    for (let y = 1; y < H; y += 2.4) {
      for (let k = 0; k < 4; k++) {
        const a = corners[k], b = corners[(k + 1) % 4];
        lat.push(beam(V(a[0], y, a[1]), V(b[0], y, b[1]), 0.1));
        lat.push(beam(V(a[0], y, a[1]), V(b[0], y + 2.4, b[1]), 0.08));
      }
    }
    mergedMesh(lat, amber, crane);
    const arm: THREE.BufferGeometry[] = [];
    arm.push(beam(V(-0.5, H, -7), V(-0.5, H, 17), 0.16), beam(V(0.5, H, -7), V(0.5, H, 17), 0.16));
    arm.push(beam(V(0, H + 1.4, -7), V(0, H + 1.4, 17), 0.14));
    for (let z = -7; z < 17; z += 1.6) {
      arm.push(beam(V(-0.5, H, z), V(0, H + 1.4, z + 0.8), 0.07), beam(V(0.5, H, z), V(0, H + 1.4, z + 0.8), 0.07));
      arm.push(beam(V(0, H + 1.4, z + 0.8), V(-0.5, H, z + 1.6), 0.07), beam(V(0, H + 1.4, z + 0.8), V(0.5, H, z + 1.6), 0.07));
    }
    arm.push(beam(V(0, H + 5, 0), V(0, H + 1.4, 0), 0.2));
    arm.push(beam(V(0, H + 5, 0), V(0, H + 1.4, 17), 0.05, true), beam(V(0, H + 5, 0), V(0, H + 1.4, -7), 0.05, true));
    arm.push(beam(V(0, H + 1.4, 11), V(0, H - 11, 11), 0.04, true));
    mergedMesh(arm, amber, crane);
    bx(1.8, 1.4, 1.8, concDark, 0, H + 0.2, -5.6, crane);
    bx(1.3, 1.4, 1.5, white, 0, H - 0.6, 1.5, crane);
    bx(0.7, 0.5, 0.7, steelDark, 0, H - 11.2, 11, crane);
    crane.position.set(14.8, 1, 3);
    crane.rotation.y = 0;
    g.add(crane);
    movers.push((_dt, t) => {
      crane.rotation.y = Math.sin(t * 0.25) * 0.5;
    });
    return g;
  }

  // ==========================================================================
  // DIVISI 2: Bendungan
  // ==========================================================================
  const damH = (x: number, z: number) => {
    const az = Math.abs(z);
    let h = Math.min(Math.max(0, az - 11) * 1.15, 17);
    h += Math.max(0, -x - 24) * 1.2; // tebing hulu
    h += Math.max(0, x - 30) * 0.35;
    const amp = 0.25 + 0.9 * sstep(11, 30, az);
    h += amp * (Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.27) + 0.6 * Math.sin(x * 0.13 + z * 0.19 + 2.0));
    return h;
  };

  function damTerrain(parent: THREE.Object3D) {
    const rings = lowPower ? 30 : 44, segs = lowPower ? 80 : 110;
    const rx = 42, rz = 44;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    const grass = new THREE.Color(0x5f9150), grass2 = new THREE.Color(0x7a9a58), rk = new THREE.Color(0x8a847a);
    const bed = new THREE.Color(0x4f5a4d), soil = new THREE.Color(0x3a3128);
    const push = (x: number, y: number, z: number, cc: THREE.Color) => {
      pos.push(x, y, z);
      col.push(cc.r, cc.g, cc.b);
    };
    for (let i = 0; i <= rings + 1; i++) {
      const skirt = i === rings + 1;
      const r = Math.min(i, rings) / rings;
      for (let j = 0; j <= segs; j++) {
        const th = (j / segs) * Math.PI * 2;
        const x = Math.cos(th) * r * rx, z = Math.sin(th) * r * rz;
        const h = damH(x, z);
        if (skirt) {
          push(x, -4, z, soil);
          continue;
        }
        const inBed = x < -1.5 && h < 13 && Math.abs(z) < 23;
        c.copy(grass).lerp(grass2, 0.5 + 0.5 * Math.sin(x * 0.4 + z * 0.3));
        c.lerp(rk, sstep(8, 15, h));
        if (inBed) c.copy(bed);
        push(x, h, z, i === rings ? soil.clone().lerp(c, 0.5) : c);
      }
    }
    const row = segs + 1;
    for (let i = 0; i <= rings; i++)
      for (let j = 0; j < segs; j++) {
        const a = i * row + j, b = a + 1, cc = a + row, d = cc + 1;
        idx.push(a, b, cc, b, d, cc);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, M(0xffffff, { vertexColors: true, roughness: 1, flatShading: false }));
    mesh.receiveShadow = true;
    parent.add(mesh);
  }

  function bendungan(): THREE.Group {
    const g = new THREE.Group();
    damTerrain(g);

    // tubuh bendungan (profil gravitasi), beton bertekstur
    const sh = new THREE.Shape();
    sh.moveTo(-2, 0); sh.lineTo(12, 0); sh.lineTo(3, 16); sh.lineTo(-1, 16); sh.closePath();
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 50, bevelEnabled: false }), damConc);
    body.position.z = -25;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // waduk (hulu) + sungai (hilir)
    const reservoir = new THREE.Mesh(new THREE.PlaneGeometry(34.5, 48).rotateX(-Math.PI / 2), waterM);
    reservoir.position.set(-1.8 - 17.25, 12.5, 0);
    reservoir.receiveShadow = true;
    g.add(reservoir);
    const river = new THREE.Mesh(new THREE.PlaneGeometry(34, 9).rotateX(-Math.PI / 2), waterM);
    river.position.set(25, 0.45, 0);
    g.add(river);

    // jalan puncak + pagar + lampu
    bx(3.4, 0.8, 50, concDark, 1, 16.4, 0, g);
    const posts: Item[] = [];
    const lamps: Item[] = [];
    for (let z = -24; z <= 24; z += 2) {
      posts.push({ p: [-0.45, 17.2, z], s: [0.1, 1.1, 0.1] }, { p: [2.45, 17.2, z], s: [0.1, 1.1, 0.1] });
      if (z % 8 === 0) lamps.push({ p: [-0.45, 19.6, z], s: [0.4, 0.18, 0.4] });
    }
    inst(boxG, white, posts, g);
    bx(0.08, 0.1, 50, white, -0.45, 17.65, 0, g, false);
    bx(0.08, 0.1, 50, white, 2.45, 17.65, 0, g, false);
    inst(boxG, lampM, lamps, g, false);
    const lampPoles = lamps.map((l) => ({ p: [l.p[0], 18.5, l.p[2]] as [number, number, number], s: [0.1, 2.2, 0.1] as [number, number, number] }));
    inst(cylG, steelDark, lampPoles, g);

    // pelimpah: piers + pintu air + jembatan operasi
    for (let i = 0; i < 6; i++) bx(1.5, 4.6, 1.3, conc, 1, 19, -8 + i * 3.2, g);
    for (let i = 0; i < 5; i++) bx(0.35, 3.4, 2.7, steelDark, -0.3, 18.2, -6.4 + i * 3.2, g);
    bx(3.2, 0.6, 18.4, concDark, 1, 21.5, 0, g);

    // saluran pelimpah: air mengalir turun di lereng hilir, dengan gigi peredam
    const ang = Math.atan2(-16, 9);
    const n = V(16, 9, 0).normalize();
    const chute = new THREE.Mesh(new THREE.PlaneGeometry(18.4, 12).rotateX(-Math.PI / 2), flowM);
    chute.position.set(7.5 + n.x * 0.12, 8 + n.y * 0.12, 0);
    chute.rotation.z = ang;
    g.add(chute);
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      const r = bx(0.7, 0.55, 12, concDark, 3 + 9 * t + n.x * 0.3, 16 - 16 * t + n.y * 0.3, 0, g);
      r.rotation.z = ang;
    }
    [-6.3, 6.3].forEach((z) => {
      const wall = bx(18.6, 1.1, 0.6, conc, 7.5 + n.x * 0.5, 8 + n.y * 0.5, z, g);
      wall.rotation.z = ang;
    });
    bx(11, 1, 13, concDark, 14.5, 0.6, 0, g); // peredam energi

    // menara intake + jembatan akses
    cy(2.3, 2.5, 24, conc, -5, 12, -14, g, 28);
    [8, 14, 20].forEach((y) => cy(2.65, 2.65, 0.5, concDark, -5, y, -14, g, 28));
    cy(2.9, 2.9, 2, white, -5, 25, -14, g, 28);
    cy(0.1, 3.4, 1.9, steelDark, -5, 26.9, -14, g, 28);
    bx(4.6, 0.6, 1.6, concDark, -2.7, 16.4, -14, g);
    for (let i = 0; i < 6; i++) bx(0.6, 1.0, 0.1, glassM, -5 + 2.35 * Math.cos(i), 25, -14 + 2.35 * Math.sin(i), g, false);

    // pipa pesat (penstock) dari intake ke rumah pembangkit, dengan cincin sambungan
    const pipes: THREE.BufferGeometry[] = [];
    const rings: THREE.BufferGeometry[] = [];
    [-11.5, -8.5].forEach((z) => {
      const a = V(6.1, 10.5, z), b = V(16, 2.6, z);
      pipes.push(beam(a, b, 1.8, true));
      const dir = b.clone().sub(a).normalize().multiplyScalar(0.18);
      for (let k = 0; k < 6; k++) {
        const c = a.clone().lerp(b, (k + 0.5) / 6);
        rings.push(beam(c.clone().sub(dir), c.clone().add(dir), 2.15, true));
      }
    });
    mergedMesh(pipes, steel, g);
    mergedMesh(rings, steelDark, g);

    // rumah pembangkit + gardu + tower transmisi
    bx(11, 6.4, 7.4, conc, 21, 3.2, -9.5, g);
    bx(11.2, 1.6, 7.6, glassM, 21, 4.4, -9.5, g, false);
    bx(12.2, 0.7, 8.4, concDark, 21, 6.75, -9.5, g);
    bx(2.4, 0.6, 2.4, glassM, 18, 7.3, -9.5, g, false);
    bx(2.4, 0.6, 2.4, glassM, 24, 7.3, -9.5, g, false);
    for (let i = 0; i < 3; i++) {
      bx(2, 2.2, 2, steelDark, 31, 1.1, -10.5 + i * 3, g);
      cy(0.12, 0.12, 1.2, white, 31, 2.8, -10.5 + i * 3, g, 8);
    }
    const pyl: THREE.BufferGeometry[] = [];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) =>
      pyl.push(beam(V(36 + sx * 1.3, 0, -10 + sz * 1.3), V(36 + sx * 0.35, 13, -10 + sz * 0.35), 0.14))
    );
    for (let y = 0; y < 12; y += 3) {
      const k0 = 1.3 - 0.07 * y, k1 = 1.3 - 0.07 * (y + 3);
      pyl.push(beam(V(36 - k0, y, -10 - k0), V(36 + k1, y + 3, -10 - k1), 0.07));
      pyl.push(beam(V(36 + k0, y, -10 + k0), V(36 - k1, y + 3, -10 + k1), 0.07));
    }
    [8.2, 11.2].forEach((y) => pyl.push(beam(V(36, y, -14), V(36, y, -6), 0.14)));
    mergedMesh(pyl, steel, g);

    // vegetasi (pohon konifer) & batu (instancing), mengikuti tinggi terrain
    const r = rand(5);
    const tr: Item[] = [], tk: Item[] = [], bo: Item[] = [];
    const nTree = lowPower ? 24 : 50;
    for (let tries = 0; tr.length < nTree && tries < 900; tries++) {
      const th = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.93;
      const x = Math.cos(th) * rr * 42, z = Math.sin(th) * rr * 44;
      const h = damH(x, z);
      if (x > -5 && x < 15 && Math.abs(z) < 28) continue; // badan bendungan
      if (x >= 15 && x <= 40 && Math.abs(z) < 14) continue; // sungai, pembangkit, gardu
      if (x < -1.5 && h < 13.5) continue; // di bawah muka air
      if (h > 22) continue;
      const s = 0.8 + r() * 0.9;
      tk.push({ p: [x, h + 0.5 * s, z], s: [0.3 * s, 1.0 * s, 0.3 * s] });
      tr.push({ p: [x, h + 2.2 * s, z], s: [2.2 * s, 3.8 * s, 2.2 * s], ry: r() * 3, c: treeColors[tr.length % 4] });
    }
    inst(cylG, trunkM, tk, g);
    inst(new THREE.ConeGeometry(0.5, 1, 7), leafM, tr, g);
    for (let tries = 0; bo.length < (lowPower ? 8 : 16) && tries < 900; tries++) {
      const th = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.9;
      const x = Math.cos(th) * rr * 42, z = Math.sin(th) * rr * 44;
      const h = damH(x, z);
      if (x > -5 && x < 15 && Math.abs(z) < 28) continue;
      if (x >= 15 && x <= 40 && Math.abs(z) < 14) continue;
      if (x < -1.5 && h < 13.2) continue;
      const s = 0.7 + r() * 1.5;
      bo.push({ p: [x, h + 0.2 * s, z], s: [s * 1.2, s * 0.8, s], ry: r() * 3, c: r() < 0.5 ? 0x8b857b : 0x6f6a62 });
    }
    inst(new THREE.DodecahedronGeometry(1, 0), rock, bo, g);
    return g;
  }

  // ==========================================================================
  // DIVISI 3: Jalan, Tol & Infrastruktur
  // ==========================================================================
  /** Pita jalan 3D: permukaan beraspal (uv memanjang) + badan beton. */
  function ribbon(pts: Vec[], half: number, thick: number, topM: THREE.Material, bodyM: THREE.Material, p: THREE.Object3D) {
    const n = pts.length;
    const L: Vec[] = [], R: Vec[] = [];
    pts.forEach((pt, i) => {
      const t = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).setY(0).normalize();
      const side = UP.clone().cross(t).multiplyScalar(half);
      L.push(pt.clone().add(side));
      R.push(pt.clone().sub(side));
    });
    const top: number[] = [], uvs: number[] = [], body: number[] = [];
    let len = 0;
    const tri = (arr: number[], a: Vec, b: Vec, c: Vec) => arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const dn = V(0, -thick, 0);
    for (let i = 0; i < n - 1; i++) {
      const seg = pts[i + 1].distanceTo(pts[i]);
      const u0 = len / 8, u1 = (len + seg) / 8;
      len += seg;
      tri(top, L[i], R[i], L[i + 1]);
      tri(top, R[i], R[i + 1], L[i + 1]);
      uvs.push(u0, 0, u0, 1, u1, 0, u0, 1, u1, 1, u1, 0);
      const bl = (v: Vec) => v.clone().add(dn);
      // sisi kiri, kanan, bawah
      tri(body, L[i], bl(L[i]), L[i + 1]); tri(body, bl(L[i]), bl(L[i + 1]), L[i + 1]);
      tri(body, R[i], R[i + 1], bl(R[i])); tri(body, bl(R[i]), R[i + 1], bl(R[i + 1]));
      tri(body, bl(L[i]), bl(R[i]), bl(L[i + 1])); tri(body, bl(R[i]), bl(R[i + 1]), bl(L[i + 1]));
    }
    const mk = (arr: number[], uv?: number[]) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      if (uv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      return geo;
    };
    const mt = new THREE.Mesh(mk(top, uvs), topM);
    const mb = new THREE.Mesh(mk(body), bodyM);
    [mt, mb].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      p.add(m);
    });
  }
  const offsetPts = (pts: Vec[], d: number, dy: number) =>
    pts.map((pt, i) => {
      const t = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).setY(0).normalize();
      return pt.clone().add(UP.clone().cross(t).multiplyScalar(d)).add(V(0, dy, 0));
    });

  function tol(): THREE.Group {
    const g = new THREE.Group();
    const Y = 7;
    const sideM = M(0x4a3d30, { roughness: 1 });

    // alas: piringan berumput dengan sisi tanah
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(42, 43.5, 2.4, lowPower ? 64 : 96), [sideM, grassM, sideM]);
    disc.position.y = -1.2;
    disc.receiveShadow = true;
    g.add(disc);

    // jalan di darat (sumbu z) + median
    const ground: Vec[] = [];
    for (let z = -40; z <= 40; z += 8) ground.push(V(0, 0.08, z));
    ribbon(ground, 4.1, 0.16, asphalt, concDark, g);
    bx(0.5, 0.35, 70, conc, 0, 0.25, 0, g);

    // dek layang lurus (sumbu x)
    const deck: Vec[] = [];
    for (let x = -38; x <= 38; x += 8) deck.push(V(x, Y, 0));
    ribbon(deck, 3.2, 0.9, asphalt, conc, g);
    // girder bawah + barrier beton kiri/kanan
    bx(76, 1.1, 3.4, concDark, 0, Y - 1.4, 0, g);
    [-1, 1].forEach((s) => bx(76, 0.95, 0.5, conc, 0, Y + 0.48, s * 3.0, g));

    // pilar T-cap (merge)
    const cols: THREE.BufferGeometry[] = [];
    for (let x = -36; x <= 36; x += 12) {
      cols.push(putG(boxG, x, (Y - 1.9) / 2, 0, 1.6, Y - 1.9, 1.6));
      cols.push(putG(boxG, x, Y - 2.3, 0, 1.9, 0.9, 6.2));
    }
    // jalan layang lengkung (ramp) dari dek ke jalan darat, empat arah
    const rampPiers: THREE.BufferGeometry[] = [];
    ([[1, 1], [1, -1], [-1, 1], [-1, -1]] as const).forEach(([sx, sz]) => {
      const P0 = V(sx * 13, Y - 0.1, sz * 1.8), P1 = V(sx * 26, Y * 0.55, sz * 8), P2 = V(sx * 2.6, 0.12, sz * 30);
      const pts: Vec[] = [];
      for (let i = 0; i <= 26; i++) {
        const t = i / 26, u = 1 - t;
        pts.push(
          V(
            u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x,
            Y + (0.12 - Y) * (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)) * 0.9 + (0.12 - Y) * 0.1 * t,
            u * u * P0.z + 2 * u * t * P1.z + t * t * P2.z
          )
        );
      }
      ribbon(pts, 1.8, 0.7, asphalt, conc, g);
      [-1, 1].forEach((s) => {
        const o = offsetPts(pts, s * 1.65, 0.4);
        const bar: THREE.BufferGeometry[] = [];
        for (let i = 0; i < o.length - 1; i++) bar.push(beam(o[i], o[i + 1], 0.42));
        mergedMesh(bar, orange, g);
      });
      pts.forEach((pt, i) => {
        if (i % 3 === 1 && pt.y > 1.8) {
          rampPiers.push(putG(boxG, pt.x, (pt.y - 0.9) / 2, pt.z, 1.1, pt.y - 0.9, 1.1));
          rampPiers.push(putG(boxG, pt.x, pt.y - 1.0, pt.z, 3.4, 0.4, 1.4));
        }
      });
    });
    mergedMesh(cols, conc, g);
    mergedMesh(rampPiers, conc, g);

    // jembatan kabel: pylon bentuk A + kipas kabel + balok silang
    const PX = 22;
    const py: THREE.BufferGeometry[] = [];
    const cab: THREE.BufferGeometry[] = [];
    [-1, 1].forEach((s) => {
      py.push(beam(V(PX, 0, s * 4.6), V(PX, 26, s * 0.8), 1.5));
      for (let i = 0; i < 9; i++) {
        const yy = 24 - i * 1.5;
        const zz = s * (4.6 - 3.8 * (yy / 26));
        [-1, 1].forEach((d) => cab.push(beam(V(PX, yy, zz), V(PX + d * (3 + i * 1.25), Y + 0.5, s * 2.7), 0.09, true)));
      }
    });
    py.push(putG(boxG, PX, 11, 0, 1.4, 1.2, 8.2), putG(boxG, PX, 22, 0, 1.3, 1.1, 3.2));
    mergedMesh(py, conc, g);
    mergedMesh(cab, steel, g);
    bx(0.5, 0.5, 0.5, warnM, PX, 26.6, -0.8, g, false);
    bx(0.5, 0.5, 0.5, warnM, PX, 26.6, 0.8, g, false);

    // portal rambu "TOL" di atas dek
    [-1, 1].forEach((s) => cy(0.2, 0.2, 5.4, steel, -18, Y + 2.7, s * 3.9, g, 10));
    bx(0.35, 0.35, 8.2, steel, -18, Y + 5.5, 0, g);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 2.2, 5.6),
      [0, 1, 2, 3, 4, 5].map((i) => (i === 1 ? M(0xffffff, { map: signT, emissiveMap: signT, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.5 }) : steelDark))
    );
    sign.rotation.y = 0;
    sign.position.set(-18, Y + 4.6, 0);
    sign.castShadow = true;
    g.add(sign);

    // gerbang tol di jalan darat
    bx(13, 0.7, 7, white, 0, 5.4, -34, g);
    bx(13.2, 0.22, 7.2, M(0x222222, { emissive: 0xf5b81c, emissiveIntensity: 1.6 }), 0, 5.0, -34, g, false);
    [-6, 6].forEach((x) => bx(0.9, 5.2, 0.9, conc, x, 2.6, -34, g));
    [-2.6, 0, 2.6].forEach((x) => {
      bx(1.2, 2.3, 3.4, steel, x, 1.2, -34, g);
      bx(1.3, 0.12, 3.5, glassM, x, 1.9, -34, g, false);
    });

    // tiang lampu dua lengan sepanjang dek (instancing)
    const lp: Item[] = [], lh: Item[] = [];
    for (let x = -30; x <= 30; x += 10) {
      [-1, 1].forEach((s) => {
        lp.push({ p: [x, Y + 2.8, s * 3.0], s: [0.14, 5.6, 0.14] });
        lh.push({ p: [x, Y + 5.6, s * 2.3], s: [0.2, 0.15, 1.5] });
      });
    }
    inst(cylG, steelDark, lp, g);
    inst(boxG, lampM, lh, g, false);

    // semak sepanjang jalan darat
    const bush: Item[] = [];
    for (let z = -28; z <= 28; z += 5) [-1, 1].forEach((s) => bush.push({ p: [s * 6.2, 0.7, z], s: [1.6, 1.3, 1.6], c: treeColors[(z + 28) % 4 | 0] }));
    inst(new THREE.IcosahedronGeometry(0.5, 1), leafM, bush, g);

    // kendaraan bergerak
    const carBody = [0xc23b3b, 0x2f6db5, 0xe8e8e8, 0x2d2d33, 0xe6a91a, 0x3d8a5a];
    function car(color: number, long = 2.2): THREE.Group {
      const c = new THREE.Group();
      const body = M(color, { metalness: 0.5, roughness: 0.35, envMapIntensity: 1 });
      bx(long, 0.55, 1.05, body, 0, 0.45, 0, c);
      bx(long * 0.5, 0.42, 0.9, glassM, -long * 0.05, 0.93, 0, c, false);
      bx(0.08, 0.14, 0.9, warnM, -long / 2, 0.5, 0, c, false);
      bx(0.08, 0.14, 0.9, lampM, long / 2, 0.5, 0, c, false);
      return c;
    }
    const run = (list: Array<{ c: THREE.Object3D; v: number }>, axis: "x" | "z", min: number, max: number) =>
      movers.push((dt) =>
        list.forEach((it) => {
          it.c.position[axis] += it.v * dt;
          if (it.v > 0 && it.c.position[axis] > max) it.c.position[axis] = min;
          if (it.v < 0 && it.c.position[axis] < min) it.c.position[axis] = max;
        })
      );
    const deckCars: Array<{ c: THREE.Object3D; v: number }> = [];
    for (let i = 0; i < 8; i++) {
      const dir = i % 2 ? 1 : -1;
      const c = car(carBody[i % carBody.length], i % 4 === 3 ? 3.4 : 2.2);
      c.position.set(-36 + i * 9.5, Y + 0.02, dir * 1.35);
      c.rotation.y = dir > 0 ? 0 : Math.PI;
      g.add(c);
      deckCars.push({ c, v: dir * (4 + (i % 3)) });
    }
    run(deckCars, "x", -38, 38);
    const roadCars: Array<{ c: THREE.Object3D; v: number }> = [];
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 ? 1 : -1;
      const c = car(carBody[(i + 2) % carBody.length]);
      c.position.set(dir * 1.9, 0.18, -26 + i * 9);
      c.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(c);
      roadCars.push({ c, v: dir * (3 + (i % 3)) });
    }
    run(roadCars, "z", -28, 28);
    return g;
  }

  return {
    build: { gedung, bendungan, tol },
    applyEnv(tex) {
      mats.forEach((m) => {
        m.envMap = tex;
        m.needsUpdate = true;
      });
    },
    animate(dt) {
      time += dt;
      animTex.forEach((a) => {
        a.t.offset.x += a.vx * dt;
        a.t.offset.y += a.vy * dt;
      });
      movers.forEach((m) => m(dt, time));
    },
  };
}
