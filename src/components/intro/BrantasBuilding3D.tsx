"use client";

/**
 * BrantasBuilding3D - model 3D gedung kantor pusat PT Brantas Abipraya (fase hq).
 *
 * Langkah 1: Port model hq() dari prototipe tengok-intro-prototype.html.
 * Model hq() = gedung() (flat-shaded, material kaca) + cincin Torus amber
 * + disc kaca fasad bulat khas gedung Brantas. Garis tepi amber via glow(),
 * normalisasi bounding-box via fit(). OrbitControls + auto-rotate statis.
 *
 * Lazy-loaded (ssr:false). Cleanup penuh saat unmount.
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

        // Scene transparan
        const scene = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(40, W() / H(), 0.1, 400);
        cam.position.set(0, 9, 34);

        const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        ren.setSize(W(), H());
        ren.setClearColor(0x000000, 0);
        ren.shadowMap.enabled = true;
        mount.appendChild(ren.domElement);

        const ctl = new OrbitControls(cam, ren.domElement);
        ctl.target.set(0, 7, 0);
        ctl.enableDamping = true;
        ctl.autoRotate = true;
        ctl.autoRotateSpeed = 0.8;
        ctl.maxPolarAngle = Math.PI / 2.02;
        ctl.minDistance = 10;
        ctl.maxDistance = 80;

        // resource tracking
        const disposables: Array<{ dispose: () => void }> = [];
        const track = <T extends { dispose: () => void }>(o: T): T => { disposables.push(o); return o; };

        // Cahaya (sama dengan prototipe)
        scene.add(new THREE.HemisphereLight(0xaec6ff, 0x1a2233, 0.85));
        const sun = new THREE.DirectionalLight(0xffe2b0, 0.9);
        sun.position.set(20, 40, 30);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        scene.add(sun);

        // Helper material & tekstur prosedural (persis prototipe)
        const M = (c: number, o: THREE.MeshStandardMaterialParameters = {}) =>
            track(new THREE.MeshStandardMaterial(Object.assign(
                { color: c, roughness: .65, metalness: .1, flatShading: true }, o
            )));

        function cv(w: number, h: number, f: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            f(c.getContext('2d')!, w, h);
            const t = new THREE.CanvasTexture(c);
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            track(t); return t;
        }
        function glass(rx: number, ry: number) {
            const t = cv(64, 64, (g, w, h) => {
                const q = g.createLinearGradient(0, 0, w, h);
                q.addColorStop(0, '#2a63e0'); q.addColorStop(1, '#12379f');
                g.fillStyle = q; g.fillRect(0, 0, w, h);
                g.strokeStyle = 'rgba(190,215,255,.6)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
            });
            t.repeat.set(rx, ry);
            return track(new THREE.MeshStandardMaterial({ map: t, roughness: .15, metalness: .7 }));
        }

        const C = {
            grey:  M(0xc9cbd2),
            dgrey: M(0x6c7079),
            amber: M(0xf2a516),
        };

        function b(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D) {
            const o = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), m);
            o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; p.add(o); return o;
        }

        // gedung() - massa geometri persis prototipe
        function gedung(): THREE.Group {
            const g = new THREE.Group();
            b(30, 3, 20, C.dgrey, 0, 1.5, 0, g);
            b(13, 28, 11, glass(5, 14), -3, 17, -1, g);
            b(9, 20, 9, glass(4, 10), 9.5, 13, -2, g);
            b(14, 12, 10, C.grey, -12, 9, 3, g);
            b(14.2, 2.5, 10.2, glass(6, 1), -12, 9, 3, g);
            for (let i = 1; i <= 4; i++) b(13.6, .5, 11.6, C.grey, -3, 3 + i * 5.4, -1, g);
            b(14, .8, 12, C.dgrey, -3, 31.4, -1, g);
            b(10, .8, 10, C.dgrey, 9.5, 23.4, -2, g);
            b(14.4, .8, 10.4, C.dgrey, -12, 15.4, 3, g);
            b(12, 1, 7, C.grey, 2, 4, 10, g);
            [[-3, 10], [7, 10]].forEach(([x, z]) => b(.9, 3, .9, C.grey, x, 2.5, z, g));
            b(4, 2, 3, C.dgrey, -6, 32.4, -1, g);
            b(3, 1.6, 3, C.dgrey, 0, 32.2, 2, g);
            b(3, 1.5, 3, C.dgrey, 9.5, 24.5, -2, g);
            return g;
        }

        // hq() = gedung() + cincin Torus amber + disc kaca fasad
        function hq(): THREE.Group {
            const g = gedung();
            const r = new THREE.Mesh(track(new THREE.TorusGeometry(4.6, .4, 8, 40)), C.amber);
            r.position.set(-3, 17, 4.7); g.add(r);
            const d = new THREE.Mesh(track(new THREE.CircleGeometry(4.3, 32)), glass(3, 3));
            d.position.set(-3, 17, 4.55); g.add(d);
            return g;
        }

        // glow() - garis tepi EdgesGeometry persis prototipe
        function glow(g: THREE.Group, col: number, op: number) {
            g.traverse(o => {
                if ((o as THREE.Mesh).isMesh) {
                    const mesh = o as THREE.Mesh;
                    mesh.add(new THREE.LineSegments(
                        track(new THREE.EdgesGeometry(mesh.geometry, 30)),
                        track(new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op }))
                    ));
                }
            });
        }

        // fit() - normalisasi ukuran & pusat, alas di y=0 persis prototipe
        function fit(g: THREE.Group, size: number, col: number): THREE.Group {
            glow(g, col, 0.28);
            const bb = new THREE.Box3().setFromObject(g);
            const s = bb.getSize(new THREE.Vector3());
            const k = size / Math.max(s.x, s.y * 1.25, s.z);
            const c = bb.getCenter(new THREE.Vector3());
            g.position.set(-c.x * k, -bb.min.y * k, -c.z * k);
            g.scale.setScalar(k);
            const w = new THREE.Group(); w.add(g);
            (w.userData as Record<string, unknown>).g = g;
            return w;
        }

        // Shadow catcher
        const shadowMesh = new THREE.Mesh(
            track(new THREE.PlaneGeometry(200, 200)),
            track(new THREE.ShadowMaterial({ opacity: 0.22 }))
        );
        shadowMesh.rotation.x = -Math.PI / 2;
        shadowMesh.receiveShadow = true;
        scene.add(shadowMesh);

        // Bangun model HQ
        const hqModel = hq();
        const hqWrapped = fit(hqModel, 19, 0xf59e0b);
        scene.add(hqWrapped);

        // Resize
        const onResize = () => { cam.aspect = W() / H(); cam.updateProjectionMatrix(); ren.setSize(W(), H()); };
        window.addEventListener('resize', onResize);
        const ro = new ResizeObserver(onResize);
        ro.observe(mount);

        // Loop
        let raf = 0;
        const loop = () => { ctl.update(); ren.render(scene, cam); raf = requestAnimationFrame(loop); };
        loop();

        // Cleanup
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