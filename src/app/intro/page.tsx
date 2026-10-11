"use client";

/**
 * Halaman Intro — sekuens sinematik:
 *  Fase 'building' : gedung 3D kantor pusat Brantas Abipraya (klik untuk lanjut).
 *  Fase 'split'    : gedung "terpecah" menjadi 3 panel Divisi (masing-masing
 *                    dengan objek 3D khas), melayang di ruang 3D. Pilih divisi
 *                    untuk masuk ke halaman kategorinya.
 *
 * Fake-3D: CSS perspective + preserve-3d + Framer Motion. Objek 3D via Three.js
 * (lazy-load). Menghormati prefers-reduced-motion.
 */

import { useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Loader2, ArrowRight, RotateCcw } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';
import { DIVISION_THEME, type DivisionKey } from '@/lib/divisionTheme';

const BrantasBuilding3D = dynamic(() => import('@/components/intro/BrantasBuilding3D'), {
    ssr: false,
    loading: () => <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-8 h-8 text-yellow-500 animate-spin" /></div>,
});
const DivisionModel3D = dynamic(() => import('@/components/intro/DivisionModel3D'), { ssr: false });

const ORDER: DivisionKey[] = ['DIVISI 1', 'DIVISI 2', 'DIVISI 3'];

export default function IntroPage() {
    const router = useRouter();
    const reduce = useReducedMotion();
    usePageTracking('intro');

    const [phase, setPhase] = useState<'building' | 'split'>('building');
    const [par, setPar] = useState({ x: 0, y: 0 });
    const stageRef = useRef<HTMLDivElement>(null);

    // Klik-vs-drag pada gedung: klik (nyaris tanpa gerak) = pecah ke 3 divisi.
    const down = useRef<{ x: number; y: number } | null>(null);
    const onPointerDown = (e: React.PointerEvent) => { down.current = { x: e.clientX, y: e.clientY }; };
    const onPointerUp = (e: React.PointerEvent) => {
        const d = down.current; down.current = null;
        if (!d) return;
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) setPhase('split');
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (reduce || phase !== 'split') return;
        const el = stageRef.current; if (!el) return;
        const r = el.getBoundingClientRect();
        setPar({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 });
    };

    const enterDivision = (div: string) => router.push(`/categories/${encodeURIComponent(div)}`);

    const bgParallax = useMemo(() => ({ transform: `translate3d(${par.x * -12}px, ${par.y * -12}px, 0)` }), [par]);

    return (
        <div
            ref={stageRef}
            onMouseMove={onMouseMove}
            className="relative h-screen flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors"
            style={{ perspective: '1400px' }}
        >
            {/* Background: glow + watermark (selaras halaman kategori) */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none" style={bgParallax}>
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 blur-[120px]" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-yellow-600/10 blur-[120px]" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img src="/abipraya_original.svg" alt="" aria-hidden className="w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] min-w-[250px] min-h-[250px] object-contain opacity-[0.04]" draggable={false} />
            </div>

            {/* Header */}
            <header className="relative z-20 flex items-center justify-between px-5 sm:px-10 py-5 shrink-0">
                <div className="flex items-center gap-3">
                    <img src="/LOGO_ABIPRAYA.png" alt="Brantas Abipraya" className="w-9 h-9 block dark:hidden" />
                    <img src="/abipraya_original.svg" alt="Brantas Abipraya" className="w-9 h-9 hidden dark:block" />
                    <div className="leading-tight">
                        <p className="text-[11px] sm:text-sm font-black uppercase tracking-[0.2em] bg-gradient-to-r from-yellow-500 to-amber-500 dark:from-yellow-300 dark:to-amber-200 bg-clip-text text-transparent">Brantas Abipraya</p>
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Project Management Information System</p>
                    </div>
                </div>
                {phase === 'split' && (
                    <button
                        onClick={() => setPhase('building')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider transition-all"
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> Gedung
                    </button>
                )}
            </header>

            <AnimatePresence mode="wait">
                {phase === 'building' ? (
                    /* ── FASE 1: Gedung kantor pusat ── */
                    <motion.div
                        key="building"
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 1.15, filter: 'blur(6px)', transition: { duration: 0.6 } }}
                        className="relative z-10 flex-1 min-h-0 flex flex-col"
                    >
                        <div className="text-center px-4 shrink-0">
                            <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Kantor Pusat PT Brantas Abipraya</p>
                            <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 font-medium">Seret untuk memutar · scroll / cubit untuk zoom</p>
                        </div>
                        <div className="relative flex-1 min-h-0 cursor-pointer" onPointerDown={onPointerDown} onPointerUp={onPointerUp} role="button" aria-label="Masuk">
                            <BrantasBuilding3D className="absolute inset-0" />
                        </div>
                        <div className="flex flex-col items-center gap-1.5 py-6 shrink-0 pointer-events-none">
                            <motion.p
                                animate={reduce ? undefined : { opacity: [0.4, 1, 0.4] }}
                                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                                className="text-xs sm:text-sm font-black uppercase tracking-[0.25em] text-yellow-600 dark:text-yellow-400"
                            >
                                Klik gedung untuk memilih divisi
                            </motion.p>
                        </div>
                    </motion.div>
                ) : (
                    /* ── FASE 2: Terpecah menjadi 3 Divisi ── */
                    <motion.div
                        key="split"
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6 }}
                        className="relative z-10 flex-1 min-h-0 flex flex-col"
                        style={{ transformStyle: 'preserve-3d' }}
                    >
                        <motion.div
                            initial={reduce ? false : { opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3, duration: 0.6 }}
                            className="text-center px-4 shrink-0 mb-2"
                        >
                            <h1 className="text-xl sm:text-3xl font-black tracking-tight uppercase">
                                Tiga <span className="bg-gradient-to-r from-yellow-500 to-amber-400 bg-clip-text text-transparent">Divisi Utama</span>
                            </h1>
                            <p className="mt-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">Pilih divisi untuk melihat proyeknya</p>
                        </motion.div>

                        <div className="flex-1 min-h-0 flex flex-col lg:flex-row items-stretch justify-center gap-4 sm:gap-6 px-4 sm:px-8 pb-6 overflow-y-auto" style={{ transformStyle: 'preserve-3d' }}>
                            {ORDER.map((div, i) => {
                                const t = DIVISION_THEME[div];
                                const depth = i - 1; // -1, 0, 1
                                const tx = par.x * depth * 16;
                                const ry = par.x * 7;
                                const rx = -par.y * 5;
                                return (
                                    <motion.button
                                        key={div}
                                        onClick={() => enterDivision(div)}
                                        initial={reduce ? false : { opacity: 0, y: 70, rotateY: depth * 35, scale: 0.85 }}
                                        animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
                                        transition={{ delay: 0.35 + i * 0.18, duration: 1, ease: [0.16, 1, 0.3, 1] }}
                                        whileHover={reduce ? undefined : { y: -10, scale: 1.03 }}
                                        whileTap={{ scale: 0.98 }}
                                        style={{
                                            transform: reduce ? undefined : `translate3d(${tx}px, 0, 0) rotateX(${rx}deg) rotateY(${ry}deg)`,
                                            transformStyle: 'preserve-3d',
                                        }}
                                        className="group relative flex-1 min-h-[260px] lg:min-h-0 rounded-[2rem] overflow-hidden text-left"
                                    >
                                        {/* glow aksen */}
                                        <div className="absolute -inset-1 rounded-[2.2rem] blur-2xl opacity-40 group-hover:opacity-80 transition-opacity" style={{ background: t.glow }} />
                                        <div className="relative h-full rounded-[2rem] bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl border border-black/10 dark:border-white/10 group-hover:border-yellow-500/40 shadow-2xl overflow-hidden flex flex-col transition-colors">
                                            {/* Objek 3D divisi */}
                                            <div className="relative flex-1 min-h-[150px]">
                                                <DivisionModel3D model={t.model} interactive={false} className="absolute inset-0" />
                                            </div>
                                            {/* Teks */}
                                            <div className="relative p-5">
                                                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${t.chipClass}`}>{t.short}</span>
                                                <h2 className={`mt-2 text-lg sm:text-xl font-black uppercase tracking-tight bg-gradient-to-r ${t.gradient} bg-clip-text text-transparent`}>{t.title}</h2>
                                                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">{t.tagline}</p>
                                                <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-yellow-600 dark:text-yellow-400 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all">
                                                    Masuk <ArrowRight className="w-4 h-4" />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
