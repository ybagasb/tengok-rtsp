"use client";

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import axios from 'axios';
import { Lock, Loader2, ShieldCheck, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, useReducedMotion } from 'framer-motion';

export default function LoginForm() {
    // Hormati preferensi "kurangi gerakan": semua animasi looping dimatikan.
    const reduce = useReducedMotion();
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [ssoLoading, setSsoLoading] = useState(false);

    // 2d. Hangatkan (warm-up) chunk IntroScene3D dari halaman login & reset intro flag
    useEffect(() => {
        try {
            sessionStorage.removeItem("tengok_intro_seen_v1");
        } catch {
            // ignore
        }
        try {
            void import('@/components/intro/IntroScene3D');
        } catch {
            // Abaikan kegagalan prefetch
        }
    }, []);

    const handlePinLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!pin) {
            toast.error('Masukkan PIN akses terlebih dahulu');
            return;
        }

        setLoading(true);

        try {
            const res = await axios.post('/api/auth/verify', { pin });

            if (res.data.success) {
                toast.success('Berhasil masuk');
                // Use full page navigation so middleware sees the new auth_token cookie
                window.location.href = '/categories';
            }
        } catch (error) {
            console.error(error);
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            const hasResponse = axios.isAxiosError(error) && Boolean(error.response);
            if (status === 401) {
                toast.error('PIN salah. Periksa kembali PIN Anda.');
            } else if (status === 429) {
                toast.error('Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.');
            } else if (!hasResponse) {
                toast.error('Tidak dapat terhubung ke server. Periksa koneksi Anda.');
            } else {
                toast.error('Gagal masuk. Silakan coba lagi.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCognitoLogin = async () => {
        setSsoLoading(true);
        try {
            await signIn('cognito', { callbackUrl: '/categories' }, { prompt: 'login' });
        } catch {
            toast.error('Gagal masuk dengan SSO. Silakan coba lagi.');
            setSsoLoading(false);
        }
    };

    return (
        <div className="min-h-dvh flex items-center justify-center bg-slate-100 dark:bg-[#060a14] relative overflow-hidden px-4 py-8">
            {/* ── Latar belakang hidup (murni visual) ─────────────────────── */}

            {/* Aurora blobs bergerak lambat */}
            <motion.div
                aria-hidden
                className="absolute -top-32 left-1/4 w-80 h-80 sm:w-[32rem] sm:h-[32rem] rounded-full bg-yellow-400/10 dark:bg-yellow-500/15 blur-[70px] sm:blur-[130px]"
                animate={reduce ? undefined : { x: [0, 60, -20, 0], y: [0, 40, 10, 0], scale: [1, 1.1, 0.95, 1] }}
                transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                aria-hidden
                className="absolute -bottom-32 right-1/4 w-80 h-80 sm:w-[32rem] sm:h-[32rem] rounded-full bg-blue-400/10 dark:bg-blue-700/20 blur-[70px] sm:blur-[130px]"
                animate={reduce ? undefined : { x: [0, -50, 30, 0], y: [0, -30, 20, 0], scale: [1, 1.08, 0.92, 1] }}
                transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                aria-hidden
                className="hidden sm:block absolute top-1/3 left-1/2 w-[26rem] h-[26rem] rounded-full bg-cyan-400/5 dark:bg-cyan-500/10 blur-[120px]"
                animate={reduce ? undefined : { x: [0, 40, -40, 0], y: [0, 50, -30, 0] }}
                transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Grid HUD (minor) — lebih tegas, aksen kuning brand */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 hidden dark:block opacity-[0.18]"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(234,179,8,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(234,179,8,0.55) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    maskImage: 'radial-gradient(ellipse 75% 70% at 50% 45%, #000 35%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 75% 70% at 50% 45%, #000 35%, transparent 100%)',
                }}
            />

            {/* Grid HUD (major) — garis besar berlapis ala radar */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 hidden dark:block opacity-[0.22]"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(234,179,8,0.7) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(234,179,8,0.7) 1.5px, transparent 1.5px)',
                    backgroundSize: '200px 200px',
                    maskImage: 'radial-gradient(ellipse 80% 75% at 50% 45%, #000 30%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 80% 75% at 50% 45%, #000 30%, transparent 100%)',
                }}
            />

            {/* Vignette gelap di tepi + frame tipis biar berasa panel */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[4] hidden dark:block"
                style={{
                    boxShadow: 'inset 0 0 180px 40px rgba(0,0,0,0.75)',
                }}
            />
            <div aria-hidden className="pointer-events-none absolute inset-3 z-[6] rounded-lg border border-amber-600/10 dark:border-yellow-500/15" />

            {/* Scanline overlay (bahasa visual sama dgn halaman categories) */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[5] hidden dark:block"
                style={{
                    background:
                        'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px)',
                }}
            />

            {/* Beam cahaya menyapu vertikal */}
            <motion.div
                aria-hidden
                className="pointer-events-none hidden dark:sm:block absolute inset-y-0 w-48 z-[5] bg-gradient-to-r from-transparent via-yellow-300/12 to-transparent blur-2xl"
                animate={reduce ? { left: '-10%' } : { left: ['-10%', '110%'] }}
                transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', repeatDelay: 3 }}
            />

            {/* Corner brackets HUD — lebih besar, tebal, bercahaya */}
            {[
                'top-5 left-5 border-t-2 border-l-2',
                'top-5 right-5 border-t-2 border-r-2',
                'bottom-5 left-5 border-b-2 border-l-2',
                'bottom-5 right-5 border-b-2 border-r-2',
            ].map((pos) => (
                <span
                    key={pos}
                    aria-hidden
                    className={`pointer-events-none absolute w-10 h-10 border-amber-600/30 dark:border-yellow-400/80 z-10 dark:[filter:drop-shadow(0_0_6px_rgba(234,179,8,0.5))] ${pos}`}
                />
            ))}

            {/* Label HUD kecil di sudut (dekorasi command-center) */}
            <span aria-hidden className="pointer-events-none absolute top-6 left-16 z-10 text-[10px] font-mono tracking-[0.25em] text-yellow-700 dark:text-yellow-400/50 uppercase">
                SEC-LINK
            </span>
            <span aria-hidden className="pointer-events-none absolute bottom-6 right-16 z-10 text-[10px] font-mono tracking-[0.25em] text-yellow-700 dark:text-yellow-400/50 uppercase">
                v1.0
            </span>

            {/* ── Kartu login ─────────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                className="relative z-10 w-full max-w-md"
            >
                {/* Border gradient animasi (conic sheen) di belakang kartu */}
                {/* Dibungkus overflow-hidden + rounded agar sudut persegi gradien yang
                    berputar tidak keluar dari tepi kartu (jadi terlihat seperti cincin). */}
                <div aria-hidden className="pointer-events-none absolute -inset-[2px] rounded-3xl overflow-hidden opacity-70">
                    <motion.div
                        className="absolute -left-1/2 -top-1/2 w-[200%] h-[200%]"
                        style={{
                            background:
                                'conic-gradient(from 0deg, transparent 0deg, rgba(234,179,8,0.7) 60deg, transparent 130deg, transparent 230deg, rgba(59,130,246,0.6) 300deg, transparent 360deg)',
                        }}
                        animate={reduce ? undefined : { rotate: 360 }}
                        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                    />
                </div>

                <div className="relative p-8 bg-white dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-black/10 dark:border-white/10 shadow-xl shadow-slate-900/10 dark:shadow-[0_30px_60px_rgba(0,0,0,0.5)] overflow-hidden">
                    {/* Shimmer diagonal halus di dalam kartu */}
                    <motion.div
                        aria-hidden
                        className="pointer-events-none absolute -inset-y-10 -left-1/2 w-1/2 rotate-12 bg-gradient-to-r from-transparent via-white/5 to-transparent hidden dark:block"
                        animate={reduce ? { left: '-60%' } : { left: ['-60%', '160%'] }}
                        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 5 }}
                    />

                    {/* Logo & Title */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="relative mb-4">
                            {/* Ring orbit tipis */}
                            <motion.span
                                aria-hidden
                                className="absolute inset-0 -m-3 rounded-full border border-amber-600/20 dark:border-yellow-400/20"
                                animate={reduce ? undefined : { rotate: 360 }}
                                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                            />
                            <motion.img
                                src="/abipraya_blue.svg"
                                alt="PT Brantas Abipraya"
                                className="w-20 h-20 object-contain block dark:hidden"
                                animate={reduce
                                    ? { filter: 'drop-shadow(0 0 14px rgba(37,99,235,0.45))' }
                                    : {
                                        filter: [
                                            'drop-shadow(0 0 10px rgba(37,99,235,0.3))',
                                            'drop-shadow(0 0 22px rgba(37,99,235,0.55))',
                                            'drop-shadow(0 0 10px rgba(37,99,235,0.3))',
                                        ],
                                    }}
                                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <motion.img
                                src="/abipraya_original.svg"
                                alt=""
                                aria-hidden="true"
                                className="w-20 h-20 object-contain hidden dark:block"
                                animate={reduce
                                    ? { filter: 'drop-shadow(0 0 14px rgba(254,213,51,0.45))' }
                                    : {
                                        filter: [
                                            'drop-shadow(0 0 10px rgba(254,213,51,0.3))',
                                            'drop-shadow(0 0 22px rgba(254,213,51,0.55))',
                                            'drop-shadow(0 0 10px rgba(254,213,51,0.3))',
                                        ],
                                    }}
                                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                            />
                        </div>
                        <h1 className="text-3xl font-bold tracking-[0.2em] bg-gradient-to-r from-amber-700 via-amber-500 to-amber-700 dark:from-yellow-400 dark:via-yellow-200 dark:to-yellow-400 bg-clip-text text-transparent">
                            TENGOK
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Sistem Integrasi Pemantauan CCTV</p>
                        <p className="text-slate-600 dark:text-slate-400 text-xs mt-0.5 uppercase tracking-wider">PT Brantas Abipraya</p>
                    </div>

                    {/* SSO Login Button (Primary) */}
                    <motion.button
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleCognitoLogin}
                        disabled={ssoLoading}
                        className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-600/25 dark:shadow-[0_8px_30px_rgba(37,99,235,0.4)] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wider mb-6 min-h-11 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 focus-visible:outline-none"
                    >
                        {ssoLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Mengalihkan...
                            </>
                        ) : (
                            <>
                                <ShieldCheck className="w-5 h-5" />
                                Masuk dengan SSO
                            </>
                        )}
                    </motion.button>

                    <p className="text-xs text-slate-600 dark:text-slate-400 text-center -mt-3 mb-6">
                        SSO untuk pengelola &amp; PIC proyek (bisa mengisi data).
                    </p>

                    {/* Divider */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-black/15 dark:to-white/15" />
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">atau PIN</span>
                        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-black/15 dark:to-white/15" />
                    </div>

                    {/* PIN Login (Fallback) */}
                    <form onSubmit={handlePinLogin} className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="access-pin" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider ml-1">PIN Akses (hanya melihat)</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-amber-600 dark:group-focus-within:text-yellow-400 transition-colors" aria-hidden="true" />
                                <input
                                    id="access-pin"
                                    type="password"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    className="w-full min-h-11 bg-white dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-xl py-3 pl-12 pr-4 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-yellow-500 focus-visible:ring-2 focus-visible:ring-amber-500 transition-all text-center tracking-[0.5em] font-mono text-lg"
                                    placeholder="••••••"
                                    maxLength={6}
                                />
                            </div>
                        </div>

                        <motion.button
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            disabled={loading}
                            className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3.5 rounded-xl transition-all shadow-md shadow-amber-600/20 dark:shadow-[0_0_20px_rgba(234,179,8,0.3)] dark:hover:shadow-[0_0_30px_rgba(234,179,8,0.5)] min-h-11 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 focus-visible:outline-none flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Memeriksa...
                                </>
                            ) : (
                                'Masuk'
                            )}
                        </motion.button>
                    </form>

                    <div className="mt-6 pt-5 border-t border-black/10 dark:border-white/10 text-center">
                        <a
                            href="/Panduan-Input-Detail-Proyek.pdf?v=20261024"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 min-h-11 px-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-amber-700 dark:hover:text-yellow-400 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                        >
                            <BookOpen className="w-4 h-4" aria-hidden="true" /> Buka Panduan Pengguna (PDF)
                        </a>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
