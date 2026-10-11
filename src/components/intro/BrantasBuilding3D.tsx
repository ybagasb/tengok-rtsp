"use client";

/**
 * BrantasBuilding3D — model 3D gedung kantor pusat PT Brantas Abipraya
 * (prosedural, Three.js). Dapat diputar (drag) & zoom (scroll/pinch),
 * auto-rotate. Dipakai di intro halaman kategori.
 *
 * Lazy-loaded (ssr:false) agar Three.js tak membebani halaman lain & tak
 * bentrok dengan MapLibre. Cleanup penuh saat unmount (dispose geometri/
 * material/texture + renderer) agar tidak ada memory leak WebGL.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default function BrantasBuilding3D({
    className = '',
}: {
    className?: string;
}) {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        const W = () => mount.clientWidth || window.innerWidth;
        const H = () => mount.clientHeight || window.innerHeight;

        // ── Scene (transparan — background halaman tembus) ──────────────────
        const scene = new THREE.Scene();

        const cam = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 500);
        cam.position.set(34, 10, 48);

        // alpha:true + clearColor transparan agar menyatu dengan latar halaman.
        const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        ren.setSize(W(), H());
        ren.setClearColor(0x000000, 0);
        ren.shadowMap.enabled = true;
        mount.appendChild(ren.domElement);

        const ctl = new OrbitControls(cam, ren.domElement);
        ctl.target.set(0, 12, 0);
        ctl.enableDamping = true;
        ctl.autoRotate = true;
        ctl.autoRotateSpeed = 0.6;
        ctl.maxPolarAngle = Math.PI / 2.02;
        ctl.minDistance = 15;
        ctl.maxDistance = 130;

        // Lacak resource untuk dispose.
        const disposables: Array<{ dispose: () => void }> = [];
        const track = <T extends { dispose: () => void }>(o: T): T => { disposables.push(o); return o; };

        // ── Cahaya ─────────────────────────────────────────────────────────
        scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x556644, 0.85));
        const sun = new THREE.DirectionalLight(0xfff2dd, 1.1);
        sun.position.set(40, 60, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 200 });
        scene.add(sun);

        // ── Util tekstur prosedural ──────────────────────────────────────────
        function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, rx = 1, ry = 1) {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            draw(c.getContext('2d')!, w, h);
            const t = new THREE.CanvasTexture(c);
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(rx, ry);
            t.anisotropy = 8;
            track(t);
            return t;
        }
        const glassTex = (rx: number, ry: number) => tex(128, 128, (g, w, h) => {
            const gr = g.createLinearGradient(0, 0, w, h);
            gr.addColorStop(0, '#1c4fd0'); gr.addColorStop(.5, '#1237a8'); gr.addColorStop(1, '#2a63e0');
            g.fillStyle = gr; g.fillRect(0, 0, w, h);
            g.strokeStyle = 'rgba(180,210,255,.55)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
            g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.lineWidth = 1.5; g.stroke();
        }, rx, ry);
        const acpTex = (rx: number, ry: number) => tex(128, 128, (g, w, h) => {
            g.fillStyle = '#b9b9c4'; g.fillRect(0, 0, w, h);
            g.strokeStyle = '#8c8c99'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
        }, rx, ry);
        const stoneTex = tex(256, 128, (g, w, h) => {
            g.fillStyle = '#4a4742'; g.fillRect(0, 0, w, h);
            for (let i = 0; i < 70; i++) { const s = 70 + Math.random() * 30 | 0; g.fillStyle = `rgb(${s},${s - 4},${s - 10})`; g.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 30, 14 + Math.random() * 10); }
        }, 8, 1);

        const M = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => track(new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .6, metalness: .1 }, o)));
        const glassMat = (rx: number, ry: number) => track(new THREE.MeshStandardMaterial({ map: glassTex(rx, ry), roughness: .12, metalness: .75 }));
        const grey = M(0xc8c8d0), dgrey = M(0x6e6e78);
        const stone = track(new THREE.MeshStandardMaterial({ map: stoneTex, roughness: .9 }));

        function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
            const geo = track(new THREE.BoxGeometry(w, h, d));
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m);
            return m;
        }

        const bldg = new THREE.Group(); scene.add(bldg);
        const FH = 3.4, G = 4.6;

        // Shadow catcher transparan — menangkap bayangan gedung tanpa tanah/rumput.
        // Gedung tetap "berpijak" tapi latar halaman tetap tembus.
        const shadowGeo = track(new THREE.PlaneGeometry(400, 400));
        const shadowMat = track(new THREE.ShadowMaterial({ opacity: 0.28 }));
        const shadowCatcher = new THREE.Mesh(shadowGeo, shadowMat);
        shadowCatcher.rotation.x = -Math.PI / 2;
        shadowCatcher.receiveShadow = true;
        scene.add(shadowCatcher);

        // Lobi & pilotis
        box(22, G, 10, M(0x20303f, { metalness: .6, roughness: .2 }), -1, G / 2, -3, bldg);
        ([[-12, 6], [-5, 6], [2, 6], [9, 6], [13, 6], [-12, -7], [13, -7]] as const).forEach(([x, z]) => box(1.3, G, 1.3, grey, x, G / 2, z, bldg));
        ([[-10, 10], [-5, 10]] as const).forEach(([x, z]) => box(1, G - .3, 1, grey, x, (G - .3) / 2, z, bldg));
        box(10, .5, 6, grey, -8, G - .05, 9, bldg);

        // Massa utama (ACP)
        const mainH = 7 * FH;
        box(15, mainH, 15, track(new THREE.MeshStandardMaterial({ map: acpTex(5, 8), roughness: .55, metalness: .2 })), -4.5, G + mainH / 2, 0, bldg);
        // Lingkaran kaca depan
        const cy = G + mainH * 0.46, cx = -5.2;
        const circGeo = track(new THREE.CircleGeometry(5.4, 64));
        const circ = new THREE.Mesh(circGeo, glassMat(3, 3));
        circ.position.set(cx, cy, 3.05 + 4.5); bldg.add(circ);
        const ringGeo = track(new THREE.TorusGeometry(5.5, .28, 12, 64));
        const ring = new THREE.Mesh(ringGeo, dgrey); ring.position.set(cx, cy, 3.1 + 4.5); bldg.add(ring);
        box(8, .9, .3, M(0x2a2a32), -6, G + mainH - 3, 7.55, bldg);
        ([[-2.4], [0.4]] as const).forEach(([x]) => box(.9, 1.6, .2, M(0x223a5c, { metalness: .7, roughness: .15 }), x - 2, G + 3.2, 7.55, bldg));

        // Sayap kaca
        const gw = glassMat(4, 9);
        box(9, mainH + 3, 13, gw, 8.5, G + (mainH + 3) / 2, -.5, bldg);
        box(5, mainH + FH * 1.5, 10, glassMat(3, 9), 14.2, G + (mainH + FH * 1.5) / 2, -1.5, bldg);
        box(3.2, mainH + 2.2, 9, glassMat(2, 9), -13.2, G + (mainH + 2.2) / 2, -1.5, bldg);
        box(.5, mainH + 3, .5, dgrey, 4.1, G + (mainH + 3) / 2, 7.2, bldg);
        box(16, .6, 16, dgrey, -4.5, G + mainH + .3, 0, bldg);
        box(9.6, .6, 13.6, dgrey, 8.5, G + mainH + 3.3, -.5, bldg);
        box(4, 2, 4, grey, -5, G + mainH + 1.6, -3, bldg);
        // Logo emas
        const logoGeo = track(new THREE.CircleGeometry(.7, 24));
        const logo = new THREE.Mesh(logoGeo, track(new THREE.MeshBasicMaterial({ color: 0xf2b705 })));
        logo.position.set(9, G + mainH - 1.2, 6.02); bldg.add(logo);

        // Kanopi melengkung
        const sh = new THREE.Shape();
        sh.moveTo(-12, 0); sh.lineTo(16, 0); sh.lineTo(16, -2);
        sh.bezierCurveTo(10, -6.5, 4, -1.5, -2, -4.8);
        sh.bezierCurveTo(-6, -7.2, -10, -5, -12, -3.2); sh.closePath();
        const canGeo = track(new THREE.ExtrudeGeometry(sh, { depth: .6, bevelEnabled: false }));
        const can = new THREE.Mesh(canGeo, grey);
        can.rotation.x = -Math.PI / 2; can.position.set(0, G + 3.1, 7.5); can.castShadow = can.receiveShadow = true; bldg.add(can);

        // Pagar batu + papan nama
        box(46, 1.4, 1.8, stone, 0, .7, 19, scene);
        box(24, 3, .9, M(0x3a3935, { roughness: .8 }), -2, 1.4 + 1.5, 19, scene);
        const nameTex = tex(1024, 128, (g, w, h) => {
            g.fillStyle = '#3a3935'; g.fillRect(0, 0, w, h);
            g.fillStyle = '#e8b64a'; g.font = 'bold 78px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('BRANTAS ABIPRAYA', w / 2, h / 2 + 4);
        });
        const labelGeo = track(new THREE.PlaneGeometry(23, 2.9));
        const label = new THREE.Mesh(labelGeo, track(new THREE.MeshBasicMaterial({ map: nameTex })));
        label.position.set(-2, 2.9, 19.47); scene.add(label);
        const label2 = label.clone(); label2.rotation.y = Math.PI; label2.position.z = 18.53; scene.add(label2);

        // Tiang bendera
        const poleGeo = track(new THREE.CylinderGeometry(.06, .08, 9, 8));
        const pole = new THREE.Mesh(poleGeo, M(0xdddddd)); pole.position.set(2, 4.5, 12); scene.add(pole);
        const fgGeo = track(new THREE.PlaneGeometry(2.4, 1.6, 10, 1));
        const flag = new THREE.Mesh(fgGeo, track(new THREE.MeshBasicMaterial({
            map: tex(64, 64, (g, w, h) => { g.fillStyle = '#d8142a'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#fff'; g.fillRect(0, h / 2, w, h / 2); }),
            side: THREE.DoubleSide,
        })));
        flag.position.set(3.2, 8.1, 12); scene.add(flag);

        // (Tanpa tanah/jalan/rumput/pohon/kendaraan — hanya gedung & plaza.)

        // ── Resize ─────────────────────────────────────────────────────────
        const onResize = () => { cam.aspect = W() / H(); cam.updateProjectionMatrix(); ren.setSize(W(), H()); };
        window.addEventListener('resize', onResize);
        const ro = new ResizeObserver(onResize);
        ro.observe(mount);

        // ── Loop ───────────────────────────────────────────────────────────
        const clk = new THREE.Clock();
        let raf = 0;
        const flagPos = fgGeo.attributes.position as THREE.BufferAttribute;
        const loop = () => {
            const t = clk.getElapsedTime();
            for (let i = 0; i < flagPos.count; i++) {
                const x = flagPos.getX(i);
                flagPos.setZ(i, Math.sin(x * 2.2 - t * 3) * .12 * (x + 1.2) / 2.4);
            }
            flagPos.needsUpdate = true;
            ctl.update();
            ren.render(scene, cam);
            raf = requestAnimationFrame(loop);
        };
        loop();

        // ── Cleanup (hindari leak WebGL) ─────────────────────────────────────
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', onResize);
            ro.disconnect();
            ctl.dispose();
            disposables.forEach(d => { try { d.dispose(); } catch { /* ignore */ } });
            ren.dispose();
            if (ren.domElement.parentNode === mount) mount.removeChild(ren.domElement);
        };
    }, []);

    return <div ref={mountRef} className={className} style={{ width: '100%', height: '100%' }} />;
}
