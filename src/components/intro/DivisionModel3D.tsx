"use client";

/**
 * DivisionModel3D — objek 3D prosedural khas tiap divisi (gedung / bendungan /
 * tol). Diport dari generator Three.js. Transparan (menyatu latar), orbit +
 * auto-rotate, cleanup penuh saat unmount.
 *
 * Lazy-load (ssr:false) di tempat pemakaian.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DivisionModelKey } from '@/lib/divisionTheme';

export default function DivisionModel3D({
    model,
    className = '',
    interactive = true,
}: {
    model: DivisionModelKey;
    className?: string;
    interactive?: boolean;
}) {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;
        const W = () => mount.clientWidth || 1;
        const H = () => mount.clientHeight || 1;

        const scene = new THREE.Scene();
        const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        ren.setSize(W(), H());
        ren.setClearColor(0x000000, 0);
        mount.appendChild(ren.domElement);

        // Kamera ortografis (tampilan isometrik stabil).
        const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
        const ctl = new OrbitControls(cam, ren.domElement);
        ctl.enableDamping = true;
        ctl.autoRotate = true;
        ctl.autoRotateSpeed = 1;
        ctl.minZoom = 0.5;
        ctl.maxZoom = 4;
        ctl.maxPolarAngle = Math.PI / 2;
        ctl.enablePan = false;
        ctl.enabled = interactive;

        scene.add(new THREE.HemisphereLight(0xdfeaff, 0x8890a0, 0.9));
        const sun = new THREE.DirectionalLight(0xfff4e0, 0.9);
        sun.position.set(40, 70, 30);
        scene.add(sun);

        // ── resource tracking ──
        const disposables: Array<{ dispose: () => void }> = [];
        const track = <T extends { dispose: () => void }>(o: T): T => { disposables.push(o); return o; };
        const geo = (g: THREE.BufferGeometry) => track(g);
        const M = (c: number, o: THREE.MeshStandardMaterialParameters = {}) =>
            track(new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .65, metalness: .1, flatShading: true }, o)));

        function cv(w: number, h: number, f: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            f(c.getContext('2d')!, w, h);
            const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; track(t); return t;
        }
        function glass(rx: number, ry: number) {
            const t = cv(64, 64, (g, w, h) => {
                const q = g.createLinearGradient(0, 0, w, h); q.addColorStop(0, '#2a63e0'); q.addColorStop(1, '#12379f');
                g.fillStyle = q; g.fillRect(0, 0, w, h);
                g.strokeStyle = 'rgba(190,215,255,.6)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
            });
            t.repeat.set(rx, ry);
            return track(new THREE.MeshStandardMaterial({ map: t, roughness: .15, metalness: .7 }));
        }
        const C = {
            grey: M(0xc9cbd2), dgrey: M(0x6c7079), conc: M(0xbdbab2), asph: M(0x35383d),
            amber: M(0xf2a516), orange: M(0xe8700c), white: M(0xf4f4f4), rock: M(0x7b756c),
            water: M(0x2bb5b0, { transparent: true, opacity: .88, roughness: .2 }),
        };
        const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
        function b(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D) {
            const o = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), m); o.position.set(x, y, z); p.add(o); return o;
        }
        function cyl(a: THREE.Vector3, c: THREE.Vector3, r: number, m: THREE.Material, p: THREE.Object3D, s = 6) {
            const d = new THREE.Vector3().subVectors(c, a), l = d.length();
            const o = new THREE.Mesh(geo(new THREE.CylinderGeometry(r, r, l, s)), m);
            o.position.copy(a).addScaledVector(d, .5);
            o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); p.add(o); return o;
        }
        function segm(a: THREE.Vector3, c: THREE.Vector3, w: number, t: number, m: THREE.Material, p: THREE.Object3D) {
            const l = a.distanceTo(c);
            const o = new THREE.Mesh(geo(new THREE.BoxGeometry(w, t, l + .05)), m);
            o.position.copy(a).add(c).multiplyScalar(.5); o.lookAt(c); p.add(o);
        }

        // ── Divisi 1: Gedung ──
        function gedung() {
            const g = new THREE.Group();
            b(30, 3, 20, C.dgrey, 0, 1.5, 0, g);
            b(13, 28, 11, glass(5, 14), -3, 17, -1, g);
            b(9, 20, 9, glass(4, 10), 9.5, 13, -2, g);
            b(14, 12, 10, C.grey, -12, 9, 3, g);
            b(14.2, 2.5, 10.2, glass(6, 1), -12, 9, 3, g);
            for (let i = 1; i <= 4; i++) b(13.6, .5, 11.6, C.grey, -3, 3 + i * 5.4, -1, g);
            b(14, .8, 12, C.dgrey, -3, 31.4, -1, g); b(10, .8, 10, C.dgrey, 9.5, 23.4, -2, g); b(14.4, .8, 10.4, C.dgrey, -12, 15.4, 3, g);
            b(12, 1, 7, C.grey, 2, 4, 10, g);
            [[-3, 10], [7, 10]].forEach(([x, z]) => b(.9, 3, .9, C.grey, x, 2.5, z, g));
            b(4, 2, 3, C.dgrey, -6, 32.4, -1, g); b(3, 1.6, 3, C.dgrey, 0, 32.2, 2, g);
            cyl(V(-1, 31.8, -4), V(-1, 34.2, -4), .9, C.grey, g, 8);
            b(3, 1.5, 3, C.dgrey, 9.5, 24.5, -2, g);
            b(3, 1.5, 3, C.dgrey, -12, 16.2, 3, g);
            return g;
        }

        // ── Divisi 2: Bendungan ──
        function bendungan() {
            const g = new THREE.Group();
            const sh = new THREE.Shape(); sh.moveTo(-2, 0); sh.lineTo(12, 0); sh.lineTo(3, 16); sh.lineTo(-1, 16); sh.closePath();
            const body = new THREE.Mesh(geo(new THREE.ExtrudeGeometry(sh, { depth: 44, bevelEnabled: false })), C.conc); body.position.z = -22; g.add(body);
            b(34, 14.5, 60, C.water, -18, 7.25, 0, g);
            b(3, 1, 44, C.grey, 1, 16.5, 0, g);
            for (let i = -2; i <= 2; i++) b(1.2, 3.5, 3, C.grey, 1, 18, i * 3, g);
            for (let i = -1; i <= 1; i += 1) b(.5, 3, 4.6, C.dgrey, -.6, 16.6, i * 3, g);
            b(3.2, .6, 18, C.grey, 1, 19.6, 0, g);
            const ang = Math.atan2(-16, 9), n = V(16, 9, 0).normalize();
            const ch = b(18.4, .5, 13, C.grey, 7.5 + n.x * .3, 8 + n.y * .3, 0, g); ch.rotation.z = ang;
            const st = b(18.4, .3, 9, C.water, 7.5 + n.x * .6, 8 + n.y * .6, 0, g); st.rotation.z = ang;
            b(10, 1, 14, C.grey, 15, .5, 0, g);
            b(11, 6, 14, C.grey, 19, 3, -11, g); b(12, .8, 15, C.dgrey, 19, 6.4, -11, g);
            [[-14], [-9]].forEach(([z]) => cyl(V(4, 14, z + .5), V(14, 3.5, -10 + (z + 14) * .4), .9, C.dgrey, g, 8));
            b(16, 1, 26, C.water, 31, .5, -4, g);
            const rk = (x: number, y: number, z: number, s: number) => { const o = new THREE.Mesh(geo(new THREE.DodecahedronGeometry(s, 0)), C.rock); o.position.set(x, y, z); o.scale.y = .75; g.add(o); };
            for (let i = 0; i < 7; i++) { const s = 7 + ((i * 5) % 4); rk(i * 3 - 8, s * .5, -30 - (i % 2) * 3, s); rk(i * 3 - 8, s * .5, 30 + (i % 2) * 3, s); }
            rk(-3, 18, -27, 8); rk(-3, 18, 27, 8); rk(8, 9, -30, 9); rk(8, 9, 30, 9); rk(20, 5, -24, 6); rk(20, 5, 24, 6); rk(-18, 5, -33, 8); rk(-18, 5, 33, 8);
            return g;
        }

        // ── Divisi 3: Jalan, Tol & Jembatan ──
        function tol() {
            const g = new THREE.Group();
            const Y = 7;
            b(94, .8, 5.4, C.asph, 2, Y, 0, g);
            for (let x = -44; x < 48; x += 4) b(1.6, .05, .25, C.white, x, Y + .43, 0, g);
            [-1, 1].forEach(s => b(94, .6, .4, C.orange, 2, Y + .7, s * 2.9, g));
            for (let x = -40; x <= 46; x += 12) { b(1.4, Y - .4, 1.4, C.dgrey, x, (Y - .4) / 2, 0, g); b(3.2, .6, 1.8, C.amber, x, Y - .7, 0, g); }
            b(4.4, .3, 60, C.asph, 0, .2, 0, g);
            for (let z = -28; z < 30; z += 4) b(.25, .05, 1.6, C.white, 0, .4, z, g);
            ([[1, 1], [1, -1], [-1, 1], [-1, -1]] as const).forEach(([sx, sz]) => {
                const P0 = V(sx * 12, Y, sz * 2.6), P1 = V(sx * 25, 3.6, sz * 9), P2 = V(sx * 2.6, .3, sz * 20);
                const pts: THREE.Vector3[] = [];
                for (let i = 0; i <= 14; i++) { const t = i / 14, u = 1 - t; pts.push(V(u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x, Y + (.3 - Y) * t, u * u * P0.z + 2 * u * t * P1.z + t * t * P2.z)); }
                for (let i = 0; i < 14; i++) segm(pts[i], pts[i + 1], 3.6, .7, C.asph, g);
                pts.forEach((p, i) => { if (i % 3 === 1 && p.y > 1.6) { b(1.1, p.y - .5, 1.1, C.dgrey, p.x, (p.y - .5) / 2, p.z, g); b(2.4, .5, 2.4, C.amber, p.x, p.y - .55, p.z, g); } });
                for (let i = 0; i < 14; i++) { const a = pts[i].clone(), c = pts[i + 1].clone(); const nx = (c.z - a.z), nz = -(c.x - a.x), l = Math.hypot(nx, nz) || 1; const o = V(nx / l * 1.9, .6, nz / l * 1.9); segm(a.clone().add(o), c.clone().add(o), .3, .5, C.orange, g); }
            });
            [-1, 1].forEach(s => { b(1.3, 24, 1.3, C.conc, 30, 12, s * 3.4, g); });
            b(1.3, 1.2, 8.2, C.conc, 30, 17, 0, g); b(1.5, 1.2, 8.2, C.conc, 30, 23.2, 0, g);
            [-1, 1].forEach(s => { for (let i = 0; i < 6; i++) { const top = V(30, 23 - i * 1.6, s * 3.4); [-1, 1].forEach(d => cyl(top, V(30 + d * (5 + i * 2.6), Y + .4, s * 2.9), .1, C.amber, g, 4)); } });
            return g;
        }

        const BUILD = { gedung, bendungan, tol } as const;
        const VIEW = { gedung: { s: 34, cy: 15 }, bendungan: { s: 38, cy: 8 }, tol: { s: 44, cy: 8 } } as const;

        const obj = BUILD[model]();
        scene.add(obj);
        const v = VIEW[model];
        const size = v.s;
        ctl.target.set(0, v.cy, 0);
        cam.position.set(80, v.cy + 68, 80);
        cam.zoom = 1;

        const fit = () => {
            const a = W() / H();
            cam.left = -size * a; cam.right = size * a; cam.top = size; cam.bottom = -size;
            cam.updateProjectionMatrix(); ren.setSize(W(), H());
        };
        fit();

        const onResize = () => fit();
        window.addEventListener('resize', onResize);
        const ro = new ResizeObserver(fit); ro.observe(mount);

        let raf = 0;
        const loop = () => { ctl.update(); ren.render(scene, cam); raf = requestAnimationFrame(loop); };
        loop();

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', onResize);
            ro.disconnect();
            ctl.dispose();
            disposables.forEach(d => { try { d.dispose(); } catch { /* ignore */ } });
            ren.dispose();
            if (ren.domElement.parentNode === mount) mount.removeChild(ren.domElement);
        };
    }, [model, interactive]);

    return <div ref={mountRef} className={className} style={{ width: '100%', height: '100%' }} />;
}
