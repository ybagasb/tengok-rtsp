/**
 * hqModel - memuat gedung Brantas Abipraya (GLB) untuk intro dan menyiapkan
 * versi "pecah"-nya.
 *
 * Efek pecah halus: tiap mesh dipotong per sel ruang (berdasarkan titik tengah
 * segitiga) menjadi kepingan dengan pivot di titik tengahnya. Kepingan hanya
 * bergeser pelan dan sedikit berputar, lalu meluncur ke platform divisi.
 *
 * Struktur hasil:  root (Group)
 *                    └─ holder (sudah di-fit ke ukuran target)
 *                         ├─ whole  : mesh utuh (dipakai saat fase hq)
 *                         └─ shards : kepingan (dipakai saat fase explode)
 *
 * `root.userData.g` menunjuk ke `shards` (children = kepingan yang beranimasi),
 * sama seperti kontrak model prosedural di IntroScene3D.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const GLB_URL = "/models/brantas_abipraya_headquarters.glb";
const HDR_URL = "/models/studio_environment.hdr";

type Role = "building" | "green" | "ground";

const baseName = (n: string) => n.replace(/_\d+$/, "");

function roleOf(name: string): Role {
  const n = baseName(name);
  if (/^(BRANTAS_ABIPRAYA_SIGNAGE|light|gold|white|frame|glass|facade)$/.test(n)) return "building";
  if (/^(green|green2|v4_treewood|v4_leaf[ABC])$/.test(n)) return "green";
  return "ground";
}

export interface HqModel {
  root: THREE.Group;
  whole: THREE.Group;
  shards: THREE.Group;
  /** true = tampilkan kepingan, false = tampilkan model utuh */
  setShattered: (v: boolean) => void;
  /** 0..1: bara oranye di permukaan sebelum meledak */
  heat: (v: number) => void;
  /** Pasang environment map (refleksi kaca) khusus pada material gedung */
  applyEnv: (tex: THREE.Texture) => void;
}

function readComp(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, c: number) {
  return c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i);
}

/** Ukuran sel (satuan model) per jenis mesh: gedung halus, tanah kasar. */
const CELL: Record<Role, number> = { building: 3.2, green: 3.6, ground: 6.5 };

function shatter(mesh: THREE.Mesh, role: Role, cell: number, out: THREE.Group) {
  const geo = mesh.geometry;
  const pos = geo.getAttribute("position");
  const index = geo.index;
  const triCount = Math.floor((index ? index.count : pos.count) / 3);
  const vi = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);

  const cells = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      const v = vi(t, k);
      cx += pos.getX(v);
      cy += pos.getY(v);
      cz += pos.getZ(v);
    }
    const key = `${Math.floor(cx / 3 / cell)},${Math.floor(cy / 3 / cell)},${Math.floor(cz / 3 / cell)}`;
    const list = cells.get(key);
    if (list) list.push(t);
    else cells.set(key, [t]);
  }

  const names = Object.keys(geo.attributes);
  cells.forEach((tris) => {
    const n = tris.length * 3;
    const bufs = names.map((nm) => {
      const a = geo.getAttribute(nm);
      return { nm, a, size: a.itemSize, arr: new Float32Array(n * a.itemSize) };
    });
    let o = 0;
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const v = vi(t, k);
        for (const b of bufs) {
          for (let c = 0; c < b.size; c++) b.arr[o * b.size + c] = readComp(b.a, v, c);
        }
        o++;
      }
    }

    // pivot = titik tengah bounding box kepingan
    const pb = bufs.find((b) => b.nm === "position")!;
    const mn = new THREE.Vector3(Infinity, Infinity, Infinity);
    const mx = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < n; i++) {
      const x = pb.arr[i * 3], y = pb.arr[i * 3 + 1], z = pb.arr[i * 3 + 2];
      mn.set(Math.min(mn.x, x), Math.min(mn.y, y), Math.min(mn.z, z));
      mx.set(Math.max(mx.x, x), Math.max(mx.y, y), Math.max(mx.z, z));
    }
    const pivot = mn.add(mx).multiplyScalar(0.5);
    for (let i = 0; i < n; i++) {
      pb.arr[i * 3] -= pivot.x;
      pb.arr[i * 3 + 1] -= pivot.y;
      pb.arr[i * 3 + 2] -= pivot.z;
    }

    const g = new THREE.BufferGeometry();
    for (const b of bufs) g.setAttribute(b.nm, new THREE.BufferAttribute(b.arr, b.size));
    const shard = new THREE.Mesh(g, mesh.material);
    shard.name = `${mesh.name}_shard`;
    shard.position.copy(pivot);
    shard.castShadow = true;
    shard.receiveShadow = true;
    shard.userData.low = role === "ground";
    shard.raycast = () => {}; // klik/hover cukup lewat model utuh
    out.add(shard);
  });
}

export async function loadHqModel(opts: { size: number; lowPower: boolean }): Promise<HqModel> {
  const gltf = await new GLTFLoader().loadAsync(GLB_URL);
  gltf.scene.updateMatrixWorld(true);

  // 1) Ratakan: bake transform dunia ke geometri agar pivot kepingan konsisten.
  const whole = new THREE.Group();
  const flat: Array<{ mesh: THREE.Mesh; role: Role }> = [];
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    const copy = new THREE.Mesh(geo, m.material);
    copy.name = m.name;
    copy.castShadow = true;
    copy.receiveShadow = true;
    whole.add(copy);
    flat.push({ mesh: copy, role: roleOf(m.name) });
    m.geometry.dispose();
  });

  // 2) Material: tuning kaca & warna putih agar tidak silau; catat emissive asli.
  const mats = new Map<THREE.Material, { glass: boolean; role: Role }>();
  flat.forEach(({ mesh, role }) => {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((mat) => {
      const isGlass = /glass/i.test(mesh.name);
      mats.set(mat, { glass: isGlass, role });
      const s = mat as THREE.MeshStandardMaterial;
      if (isGlass && "roughness" in s) {
        s.roughness = 0.08;
        s.metalness = 0.32;
      }
      if (!isGlass && s.color && s.color.r > 0.85 && s.color.g > 0.85 && s.color.b > 0.85) {
        s.color.multiplyScalar(0.96);
      }
    });
  });
  const heatable = [...mats.entries()]
    .filter(([m]) => (m as THREE.MeshStandardMaterial).emissive)
    .map(([m, info]) => {
      const s = m as THREE.MeshStandardMaterial;
      return { s, e0: s.emissive.clone(), f: info.role === "building" ? 1 : 0.5 };
    });

  // 3) Kepingan
  const shards = new THREE.Group();
  const cellScale = opts.lowPower ? 1.35 : 1;
  flat.forEach(({ mesh, role }) => shatter(mesh, role, CELL[role] * cellScale, shards));
  shards.userData.gentle = true;

  // 4) Fit: skala ke ukuran target, alas di y=0, pusat di x/z=0 (sama dengan fit() prosedural)
  const holder = new THREE.Group();
  holder.add(whole, shards);
  const bb = new THREE.Box3().setFromObject(whole);
  const sz = bb.getSize(new THREE.Vector3());
  const k = opts.size / Math.max(sz.x, sz.y * 1.25, sz.z);
  const ctr = bb.getCenter(new THREE.Vector3());
  holder.position.set(-ctr.x * k, -bb.min.y * k, -ctr.z * k);
  holder.scale.setScalar(k);

  const root = new THREE.Group();
  root.add(holder);
  root.userData.g = shards;
  shards.visible = false;

  const AMBER = new THREE.Color(0xff9a1f);
  const tgt = new THREE.Color();
  let lastHeat = 0;

  return {
    root,
    whole,
    shards,
    setShattered(v: boolean) {
      whole.visible = !v;
      shards.visible = v;
    },
    heat(v: number) {
      if (Math.abs(v - lastHeat) < 0.002) return;
      lastHeat = v;
      heatable.forEach(({ s, e0, f }) => {
        tgt.copy(AMBER).multiplyScalar(0.55 * f);
        s.emissive.copy(e0).lerp(tgt, v);
      });
    },
    applyEnv(tex: THREE.Texture) {
      mats.forEach((info, m) => {
        const s = m as THREE.MeshStandardMaterial;
        s.envMap = tex;
        s.envMapIntensity = info.glass ? 0.88 : 0.45;
        s.needsUpdate = true;
      });
    },
  };
}

export async function loadHqEnv(): Promise<THREE.Texture> {
  const tex = await new RGBELoader().loadAsync(HDR_URL);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
