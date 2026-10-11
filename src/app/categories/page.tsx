"use client";

/**
 * Halaman Kategori (utama) — sekuens intro 3D menggantikan grid card lama:
 *  Fase 'building' : gedung 3D kantor pusat Brantas Abipraya (klik untuk lanjut).
 *  Fase 'split'    : gedung "terpecah" menjadi 3 panel Divisi (objek 3D khas).
 *                    Pilih divisi untuk masuk ke halaman kategorinya.
 *
 * Semua kontrol header (Panduan, Tema, Profil/Logout, Management+PIN) hidup di
 * halaman ini. Objek 3D via Three.js (lazy-load). Menghormati reduced-motion.
 */

import { useRef, useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { signOut, useSession } from 'next-auth/react';
import {
    Loader2, ArrowRight, RotateCcw, LogOut, Settings, X, ShieldAlert,
    User, BookOpen,
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useSWR from 'swr';
import { usePageTracking } from '@/hooks/usePageTracking';
import ThemeToggle from '@/components/ThemeToggle';
import { DIVISION_THEME, type DivisionKey } from '@/lib/divisionTheme';

const BrantasBuilding3D = dynamic(() => import('@/components/intro/BrantasBuilding3D'), {
    ssr: false,
    loading: () => <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-8 h-8 text-yellow-500 animate-spin" /></div>,
});
const DivisionModel3D = dynamic(() => import('@/components/intro/DivisionModel3D'), { ssr: false });

const ORDER: DivisionKey[] = ['DIVISI 1', 'DIVISI 2', 'DIVISI 3'];

export default function CategoriesPage() {
    const router = useRouter();
    const reduce = useReducedMotion();
    const { data: session } = useSession();
    usePageTracking('categories');

    // Gating UI tombol Management: hanya super-admin. Fetch hanya saat ada sesi SSO.
    const accessFetcher = (url: string) => fetch(url).then(r => r.json());
    const { data: accessData } = useSWR(session?.user ? '/api/me/access' : null, accessFetcher);
    const isSuperAdmin = accessData?.isSuperAdmin === true;

    // ── Sekuens 3D ──────────────────────────────────────────────────────────
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

    // ── Profil / Logout / PIN management ──────────────────────────────────────
    const [showProfile, setShowProfile] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pin, setPin] = useState(['', '', '', '', '', '']);
    const [isVerifyingPin, setIsVerifyingPin] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const handleLogout = async () => {
        setShowProfile(false);
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            await signOut({ redirect: false });
            window.location.href = '/api/auth/federated-logout';
        } catch {
            window.location.href = '/login';
        }
    };

    const handlePinChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const newPin = [...pin];
        newPin[index] = value.slice(-1);
        setPin(newPin);
        if (value && index < 5) inputRefs.current[index + 1]?.focus();
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !pin[index] && index > 0) inputRefs.current[index - 1]?.focus();
    };

    useEffect(() => {
        // Verifikasi PIN sepenuhnya di server. Begitu 6 digit terisi, kirim.
        if (!pin.every(digit => digit !== '')) return;
        if (isVerifyingPin) return;
        const enteredPin = pin.join('');
        setIsVerifyingPin(true);
        axios.post('/api/auth/verify', { pin: enteredPin })
            .then(() => { toast.success('Akses Diterima'); router.push('/admin'); })
            .catch(() => {
                toast.error('PIN Salah');
                setPin(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
                setIsVerifyingPin(false);
            });
    }, [pin, router, isVerifyingPin]);

    return (
        <div
            ref={stageRef}
            onMouseMove={onMouseMove}
            className="relative h-screen flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors"
            style={{ perspective: '1400px' }}
        >
            {/* Background: glow + watermark */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none" style={bgParallax}>
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 blur-[120px]" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-yellow-600/10 blur-[120px]" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img src="/abipraya_original.svg" alt="" aria-hidden className="w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] min-w-[250px] min-h-[250px] object-contain opacity-[0.04]" draggable={false} />
            </div>

            {/* Header */}
            <header className="relative z-30 flex items-center justify-between gap-2 px-4 sm:px-10 py-4 sm:py-5 shrink-0">
                {/* Logo + Title */}
                <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                    <img src="/LOGO_ABIPRAYA.png" alt="Brantas Abipraya" className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 block dark:hidden" />
                    <img src="/abipraya_original.svg" alt="Brantas Abipraya" className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 hidden dark:block" />
                    <div className="leading-tight min-w-0">
                        <p className="text-[11px] sm:text-sm font-black uppercase tracking-[0.2em] bg-gradient-to-r from-yellow-500 to-amber-500 dark:from-yellow-300 dark:to-amber-200 bg-clip-text text-transparent truncate">Brantas Abipraya</p>
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 truncate">Project Management Information System</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="relative flex items-center gap-1.5 sm:gap-3 shrink-0">
                    {/* Kembali ke tampilan gedung (hanya saat fase split) */}
                    {phase === 'split' && (
                        <button
                            onClick={() => setPhase('building')}
                            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all"
                            title="Kembali ke tampilan gedung"
                        >
                            <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:block">Gedung</span>
                        </button>
                    )}

                    {/* Toggle tema */}
                    <ThemeToggle />

                    {/* Panduan pengguna (PDF) */}
                    <a
                        href="/Panduan-Input-Detail-Proyek.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-yellow-500 dark:hover:text-yellow-400 transition-all p-2 sm:px-4 sm:py-2.5 rounded-xl bg-white/60 dark:bg-slate-900/50 backdrop-blur border border-black/5 dark:border-white/5 hover:border-yellow-500/30 group"
                        title="Unduh Panduan Pengisian Detail Proyek (PDF)"
                    >
                        <BookOpen className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">Panduan</span>
                    </a>

                    {/* SSO User Profile */}
                    {session?.user && (
                        <div className="relative">
                            <button
                                onClick={() => setShowProfile(p => !p)}
                                className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-xl bg-white/60 dark:bg-slate-900/50 backdrop-blur border border-black/5 dark:border-white/5 hover:border-yellow-500/30 transition-all"
                                title={session.user.name || 'Profil'}
                            >
                                {session.user.image ? (
                                    <img
                                        src={session.user.image}
                                        alt={session.user.name || ''}
                                        className="w-7 h-7 rounded-full object-cover ring-2 ring-yellow-500/30"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ) : (
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-[11px] font-bold text-slate-900 dark:text-white shrink-0">
                                        {session.user.name?.charAt(0)?.toUpperCase() || <User className="w-3.5 h-3.5" />}
                                    </div>
                                )}
                                <div className="hidden sm:block text-left">
                                    <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[120px]">{session.user.name}</p>
                                    <p className="text-[9px] text-slate-500 leading-tight truncate max-w-[120px]">{session.user.email}</p>
                                </div>
                            </button>

                            <AnimatePresence>
                                {showProfile && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
                                        <motion.div
                                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-[260px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden"
                                        >
                                            <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
                                                {session.user.image ? (
                                                    <img src={session.user.image} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-yellow-500/20 shrink-0" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-sm font-bold text-slate-900 dark:text-white shrink-0">
                                                        {session.user.name?.charAt(0)?.toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{session.user.name}</p>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{session.user.email}</p>
                                                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-bold text-blue-400 uppercase tracking-wider">
                                                        <ShieldAlert className="w-2.5 h-2.5" /> SSO
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-2">
                                                <button
                                                    onClick={handleLogout}
                                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors text-sm font-semibold"
                                                >
                                                    <LogOut className="w-4 h-4" />
                                                    Keluar / Logout
                                                </button>
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* Management (super-admin) */}
                    {session?.user && isSuperAdmin && (
                        <button
                            onClick={() => setShowPinModal(true)}
                            className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-yellow-400 transition-all p-2 sm:px-4 sm:py-2.5 rounded-xl bg-white/60 dark:bg-slate-900/50 backdrop-blur border border-black/5 dark:border-white/5 hover:border-yellow-500/30 group"
                            title="Management"
                        >
                            <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
                            <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">Management</span>
                        </button>
                    )}

                    {/* Logout untuk non-SSO (PIN viewer) */}
                    {!session?.user && (
                        <button
                            onClick={handleLogout}
                            className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-red-400 transition-all p-2 sm:px-4 sm:py-2.5 rounded-xl bg-white/60 dark:bg-slate-900/50 backdrop-blur border border-black/5 dark:border-white/5 hover:border-red-500/30 group"
                            title="Logout"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">Logout</span>
                        </button>
                    )}
                </div>
            </header>

            {/* ── Sekuens 3D ── */}
            <AnimatePresence mode="wait">
                {phase === 'building' ? (
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

            {/* Admin PIN Modal */}
            <AnimatePresence>
                {showPinModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10"
                    >
                        <div
                            className="absolute inset-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-2xl"
                            onClick={() => setShowPinModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-3xl border border-black/10 dark:border-white/10 rounded-[3rem] p-8 sm:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]"
                        >
                            <button
                                onClick={() => setShowPinModal(false)}
                                className="absolute top-6 sm:top-10 right-6 sm:right-10 p-3 rounded-2xl bg-black/[0.04] dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>

                            <div className="flex flex-col items-center text-center">
                                <div className="p-6 sm:p-8 rounded-[2.5rem] bg-yellow-500/10 mb-8 sm:mb-10 shadow-2xl shadow-yellow-500/5">
                                    <ShieldAlert className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-500 stroke-[2.5]" />
                                </div>

                                <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight uppercase mb-3 px-4">
                                    Admin Access
                                </h2>
                                <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-bold uppercase tracking-wider opacity-60 mb-10 sm:mb-12">
                                    Masukkan PIN management rahasia
                                </p>

                                <div className="flex gap-2 sm:gap-4 justify-center mb-10 sm:mb-12">
                                    {pin.map((digit, index) => (
                                        <input
                                            key={index}
                                            ref={el => { inputRefs.current[index] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handlePinChange(index, e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(index, e)}
                                            className="w-10 h-14 sm:w-16 sm:h-20 bg-white/70 dark:bg-slate-950/50 border-2 border-black/10 dark:border-white/10 rounded-2xl sm:rounded-3xl text-center text-2xl sm:text-4xl font-bold text-slate-900 dark:text-white focus:border-yellow-500/50 focus:outline-none transition-all shadow-2xl"
                                        />
                                    ))}
                                </div>

                                <p className="text-slate-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                                    Unauthorized access is strictly prohibited
                                </p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
