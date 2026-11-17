"use client";

/**
 * LoginForm — dua jalur masuk: SSO (Cognito, akses penuh) dan PIN (viewer).
 *
 * Perhatian saat mengubah:
 * - Halaman ini PUBLIK (pra-autentikasi). Jangan memanggil endpoint
 *   ber-`requireAuth` di sini (mis. /api/divisions) — tidak akan pernah 200.
 * - Jangan menampilkan data operasional (status kamera per lokasi, jumlah
 *   proyek, PII) di panel dekoratif: halaman ini bisa dibuka siapa saja yang
 *   punya jaringan.
 * - Pengguna PIN mayoritas memakai layar sentuh/TV lobi → keypad numerik besar.
 *   Input teks tetap tersedia untuk keyboard fisik lewat <input> tersembunyi.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { signIn } from 'next-auth/react';
import axios from 'axios';
import { Lock, Loader2, ShieldCheck, BookOpen, HelpCircle, Delete, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { hexToRgb } from '@/lib/divisionTheme';

const PIN_LENGTH = 6;

const PIN_MAX = (() => {
    const raw = Number(process.env.NEXT_PUBLIC_PIN_LENGTH);
    return Number.isFinite(raw) && raw >= 4 && raw <= 12 ? Math.floor(raw) : PIN_LENGTH;
})();

const PIN_AUTOSUBMIT = process.env.NEXT_PUBLIC_PIN_AUTOSUBMIT === '1';

const SSO_ERRORS: Record<string, string> = {
    AccessDenied: 'Akses ditolak. Akun Anda belum terdaftar atau tidak diizinkan masuk.',
    OAuthAccountNotLinked: 'Email ini sudah terhubung dengan cara masuk lain. Hubungi admin.',
    OAuthCallback: 'Gagal menyelesaikan proses masuk SSO. Coba lagi, atau hubungi admin.',
    OAuthSignin: 'Tidak dapat memulai proses masuk SSO. Periksa koneksi lalu coba lagi.',
    Callback: 'Server tidak dapat menyelesaikan proses masuk. Hubungi admin bila berulang.',
    Configuration: 'Konfigurasi SSO di server belum lengkap. Hubungi admin.',
    Verification: 'Tautan verifikasi sudah kedaluwarsa atau sudah dipakai.',
    SessionRequired: 'Sesi Anda berakhir. Silakan masuk kembali.',
    Default: 'Gagal masuk dengan SSO. Silakan coba lagi.',
};

const HELP_CONTACT = process.env.NEXT_PUBLIC_HELP_CONTACT ?? '';

/** Keypad numerik — target sentuh 60px untuk TV/lobi. */
function KeypadPin({
    value,
    onDigit,
    onBackspace,
    disabled,
}: {
    value: string;
    onDigit: (d: string) => void;
    onBackspace: () => void;
    disabled: boolean;
}) {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const atHardLimit = value.length >= 12;

    const cellBase =
        'h-14 rounded-2xl font-bold font-mono text-xl transition-all duration-150 ' +
        'disabled:opacity-30 disabled:cursor-not-allowed ' +
        'focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none ' +
        'active:scale-95 select-none ';

    const cellStyle =
        cellBase +
        'bg-white/10 hover:bg-white/20 active:bg-white/25 ' +
        'border border-white/15 hover:border-white/30 ' +
        'text-white backdrop-blur-sm shadow-sm';

    return (
        <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Keypad PIN">
            {keys.map((k) => (
                <motion.button
                    key={k}
                    type="button"
                    disabled={disabled || atHardLimit}
                    onClick={() => onDigit(k)}
                    aria-label={`Angka ${k}`}
                    className={cellStyle}
                    whileTap={{ scale: 0.93 }}
                >
                    {k}
                </motion.button>
            ))}
            <span aria-hidden="true" />
            <motion.button
                type="button"
                disabled={disabled || atHardLimit}
                onClick={() => onDigit('0')}
                aria-label="Angka 0"
                className={cellStyle}
                whileTap={{ scale: 0.93 }}
            >
                0
            </motion.button>
            <motion.button
                type="button"
                disabled={disabled || value.length === 0}
                onClick={onBackspace}
                aria-label="Hapus angka terakhir"
                className={`${cellStyle} flex items-center justify-center`}
                whileTap={{ scale: 0.93 }}
            >
                <Delete className="w-5 h-5" aria-hidden="true" />
            </motion.button>
        </div>
    );
}

/** Tab selector antara SSO dan PIN. */
function TabBar({
    active,
    onChange,
}: {
    active: 'sso' | 'pin';
    onChange: (t: 'sso' | 'pin') => void;
}) {
    return (
        <div className="relative flex rounded-2xl bg-white/8 border border-white/12 p-1 mb-6">
            {/* sliding indicator */}
            <motion.div
                layout
                className="absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-xl bg-white/15 backdrop-blur-sm border border-white/20"
                animate={{ x: active === 'sso' ? 0 : 'calc(100% + 0.5rem)' }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
            {(['sso', 'pin'] as const).map((tab) => (
                <button
                    key={tab}
                    type="button"
                    onClick={() => onChange(tab)}
                    className={`relative z-10 flex-1 py-2.5 text-sm font-semibold tracking-wide rounded-xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                        active === tab ? 'text-white' : 'text-white/50 hover:text-white/75'
                    }`}
                >
                    {tab === 'sso' ? 'SSO' : 'PIN Viewer'}
                </button>
            ))}
        </div>
    );
}

export default function LoginForm({ errorCode }: { errorCode?: string | null }) {
    const reduce = useReducedMotion() ?? false;
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [ssoLoading, setSsoLoading] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [activeTab, setActiveTab] = useState<'sso' | 'pin'>('sso');
    const pinInputRef = useRef<HTMLInputElement>(null);

    const ssoError = useMemo(() => {
        if (!errorCode) return null;
        return SSO_ERRORS[errorCode] ?? SSO_ERRORS.Default;
    }, [errorCode]);

    // Switch ke tab PIN jika ada error SSO
    useEffect(() => {
        if (ssoError) setActiveTab('sso');
    }, [ssoError]);

    useEffect(() => {
        try {
            sessionStorage.removeItem('tengok_intro_seen_v1');
        } catch {
            // ignore
        }
        import('@/components/intro/IntroScene3D').catch(() => {
            // Prefetch best-effort
        });
    }, []);

    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const submitPin = useCallback(async (value: string) => {
        setLoading(true);
        try {
            const res = await axios.post('/api/auth/verify', { pin: value });
            if (res.data.success) {
                toast.success('Berhasil masuk');
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.href = '/categories';
            }
        } catch (error) {
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            const hasResponse = axios.isAxiosError(error) && Boolean(error.response);
            if (status === 401) {
                toast.error('PIN salah. Periksa kembali PIN Anda.');
                setPin('');
                pinInputRef.current?.focus();
            } else if (status === 429) {
                const retryAfter = axios.isAxiosError(error)
                    ? Number(error.response?.headers?.['retry-after'])
                    : NaN;
                const secs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;
                setCooldown(secs);
                toast.error(`Terlalu banyak percobaan. Tunggu ${secs} detik lalu coba lagi.`);
            } else if (!hasResponse) {
                toast.error('Tidak dapat terhubung ke server. Periksa koneksi Anda.');
            } else {
                toast.error('Gagal masuk. Silakan coba lagi.');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const inputLocked = loading || cooldown > 0;

    const handlePinLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin) {
            toast.error('Masukkan PIN akses terlebih dahulu');
            return;
        }
        if (inputLocked) return;
        void submitPin(pin);
    };

    const onDigit = (d: string) => {
        if (inputLocked) return;
        const next = (pin + d).slice(0, 12);
        setPin(next);
        if (PIN_AUTOSUBMIT && next.length === PIN_MAX) void submitPin(next);
    };

    const onBackspace = () => setPin((p) => p.slice(0, -1));

    const handleCognitoLogin = async () => {
        setSsoLoading(true);
        try {
            await signIn('cognito', { callbackUrl: '/categories' }, { prompt: 'login' });
        } catch {
            toast.error('Gagal masuk dengan SSO. Silakan coba lagi.');
            setSsoLoading(false);
        }
    };

    // Warna orb background (biru, teal, amber — sesuai identitas divisi)
    const divColors = ['#3b82f6', '#14b8a6', '#f59e0b'];

    return (
        <div className="min-h-dvh bg-[#060a14] relative overflow-hidden flex items-center justify-center">
            {/* ── Background decorative orbs ── */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                {/* Orb atas kiri — biru (Divisi 1) */}
                <motion.div
                    className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-[120px]"
                    style={{ backgroundColor: `rgba(${hexToRgb(divColors[0])}, 0.18)` }}
                    animate={reduce ? undefined : { opacity: [0.6, 1, 0.6], scale: [1, 1.08, 1] }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                />
                {/* Orb kanan bawah — teal (Divisi 2) */}
                <motion.div
                    className="absolute -bottom-40 -right-32 w-[480px] h-[480px] rounded-full blur-[130px]"
                    style={{ backgroundColor: `rgba(${hexToRgb(divColors[1])}, 0.15)` }}
                    animate={reduce ? undefined : { opacity: [0.5, 0.9, 0.5], scale: [1, 1.06, 1] }}
                    transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
                />
                {/* Orb tengah kanan — amber brand */}
                <motion.div
                    className="absolute top-1/2 right-1/4 w-[300px] h-[300px] rounded-full blur-[100px]"
                    style={{ backgroundColor: `rgba(${hexToRgb(divColors[2])}, 0.10)` }}
                    animate={reduce ? undefined : { opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut', delay: 7 }}
                />

                {/* Grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.055]"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
                        backgroundSize: '64px 64px',
                    }}
                />

                {/* Radial vignette */}
                <div
                    className="absolute inset-0"
                    style={{
                        background:
                            'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(6,10,20,0.85) 100%)',
                    }}
                />
            </div>

            {/* ── Theme toggle ── */}
            {/* ── Main card ── */}
            <motion.div
                initial={{ opacity: 0, y: 28, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 28 }}
                className="relative z-10 w-full max-w-sm mx-4 my-6"
            >
                {/* Glow behind card */}
                <div
                    aria-hidden="true"
                    className="absolute -inset-px rounded-[2rem] blur-2xl opacity-25"
                    style={{
                        background: 'linear-gradient(135deg, rgba(234,179,8,0.6) 0%, rgba(37,99,235,0.4) 100%)',
                    }}
                />

                <div className="relative rounded-[1.75rem] border border-white/12 bg-white/[0.06] backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden">
                    {/* Inner top highlight */}
                    <div
                        aria-hidden="true"
                        className="absolute top-0 inset-x-0 h-px"
                        style={{
                            background:
                                'linear-gradient(90deg, transparent, rgba(255,255,255,0.35) 40%, rgba(255,255,255,0.35) 60%, transparent)',
                        }}
                    />

                    <div className="p-7 max-sm:p-5">
                        {/* ── Logo & branding ── */}
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={reduce ? { duration: 0 } : { delay: 0.1, duration: 0.5 }}
                            className="flex flex-col items-center mb-7"
                        >
                            <div className="relative mb-4">
                                {/* Halo di belakang logo */}
                                <div
                                    aria-hidden="true"
                                    className="absolute inset-0 rounded-full blur-xl opacity-50"
                                    style={{ background: 'rgba(234,179,8,0.4)', transform: 'scale(1.6)' }}
                                />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src="/abipraya_original.svg"
                                    alt="PT Brantas Abipraya"
                                    width={72}
                                    height={72}
                                    className="relative w-[72px] h-[72px] object-contain drop-shadow-lg"
                                />
                            </div>

                            <h1 className="text-3xl font-black tracking-[0.22em] text-transparent bg-clip-text"
                                style={{
                                    backgroundImage: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 40%, #fde68a 70%, #f59e0b 100%)',
                                }}
                            >
                                TENGOK
                            </h1>
                            <p className="text-white/55 text-xs mt-1.5 tracking-wider text-center">
                                Sistem Integrasi Pemantauan CCTV
                            </p>
                            <p className="text-white/35 text-[11px] mt-0.5 uppercase tracking-widest">
                                PT Brantas Abipraya
                            </p>
                        </motion.div>

                        {/* ── SSO Error banner ── */}
                        <AnimatePresence>
                            {ssoError && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className="overflow-hidden mb-5"
                                >
                                    <div
                                        role="alert"
                                        className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 text-xs text-rose-300"
                                    >
                                        <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                                        <span>{ssoError}</span>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Tab bar ── */}
                        <TabBar active={activeTab} onChange={setActiveTab} />

                        {/* ── Tab content ── */}
                        <AnimatePresence mode="wait" initial={false}>
                            {activeTab === 'sso' ? (
                                <motion.div
                                    key="sso"
                                    initial={{ opacity: 0, x: -16 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -16 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {/* SSO button */}
                                    <button
                                        type="button"
                                        onClick={handleCognitoLogin}
                                        disabled={ssoLoading}
                                        className="w-full relative overflow-hidden group flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-sm uppercase tracking-wider transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[3.5rem] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:outline-none"
                                        style={{
                                            background: 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)',
                                            boxShadow: '0 8px 32px rgba(37,99,235,0.45), inset 0 1px 0 rgba(255,255,255,0.15)',
                                        }}
                                    >
                                        {/* Hover shimmer */}
                                        <span
                                            aria-hidden="true"
                                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                            style={{
                                                background: 'linear-gradient(135deg, #3b82f6 0%, #38bdf8 100%)',
                                            }}
                                        />
                                        <span className="relative flex items-center gap-3 text-white">
                                            {ssoLoading ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                                                    Mengalihkan...
                                                </>
                                            ) : (
                                                <>
                                                    <ShieldCheck className="w-5 h-5" aria-hidden="true" />
                                                    Masuk dengan SSO
                                                </>
                                            )}
                                        </span>
                                    </button>

                                    <p className="text-white/40 text-[11px] text-center mt-3 leading-relaxed">
                                        Untuk pengelola &amp; PIC proyek — dapat mengisi data.
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="pin"
                                    initial={{ opacity: 0, x: 16 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 16 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <form onSubmit={handlePinLogin}>
                                        {/* Label */}
                                        <div className="flex items-center justify-between mb-3">
                                            <label
                                                htmlFor="access-pin"
                                                className="flex items-center gap-1.5 text-[11px] font-semibold text-white/60 uppercase tracking-wider"
                                            >
                                                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                                                PIN Akses
                                            </label>
                                            <span className="flex items-center gap-1 text-[11px] text-white/40">
                                                <Eye className="w-3 h-3" aria-hidden="true" />
                                                hanya melihat
                                            </span>
                                        </div>

                                        {/* PIN dots indicator */}
                                        <div
                                            className="relative flex items-center justify-center gap-3 mb-4 h-14 rounded-2xl border bg-black/30 px-3 focus-within:border-amber-400/50 transition-colors"
                                            style={{ borderColor: 'rgba(255,255,255,0.12)' }}
                                            aria-hidden="true"
                                        >
                                            {Array.from({ length: Math.max(PIN_MAX, pin.length) }).map((_, i) => (
                                                <motion.span
                                                    key={i}
                                                    animate={
                                                        i < pin.length
                                                            ? { scale: 1, opacity: 1 }
                                                            : { scale: 0.85, opacity: 0.4 }
                                                    }
                                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                                    className={`rounded-full ${
                                                        i < pin.length
                                                            ? 'w-3.5 h-3.5 bg-amber-400'
                                                            : 'w-2.5 h-2.5 border border-white/35 bg-transparent'
                                                    }`}
                                                />
                                            ))}
                                        </div>

                                        {/* Hidden real input untuk keyboard fisik */}
                                        <input
                                            ref={pinInputRef}
                                            id="access-pin"
                                            type="password"
                                            inputMode="numeric"
                                            autoComplete="off"
                                            pattern="[0-9]*"
                                            enterKeyHint="go"
                                            value={pin}
                                            onChange={(e) => {
                                                const digits = e.target.value
                                                    .replace(/\D/g, '')
                                                    .slice(0, 12);
                                                setPin(digits);
                                                if (
                                                    PIN_AUTOSUBMIT &&
                                                    digits.length === PIN_MAX &&
                                                    !inputLocked
                                                ) {
                                                    void submitPin(digits);
                                                }
                                            }}
                                            disabled={inputLocked}
                                            maxLength={12}
                                            aria-label={`PIN akses, ${PIN_MAX} angka`}
                                            className="sr-only"
                                        />

                                        {/* Keypad */}
                                        <KeypadPin
                                            value={pin}
                                            onDigit={onDigit}
                                            onBackspace={onBackspace}
                                            disabled={inputLocked}
                                        />

                                        {/* Submit */}
                                        <button
                                            type="submit"
                                            disabled={inputLocked || pin.length === 0}
                                            aria-describedby={pin.length === 0 ? 'pin-hint' : undefined}
                                            className="mt-3.5 w-full relative overflow-hidden group flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all duration-200 disabled:cursor-not-allowed min-h-[3.25rem] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:outline-none"
                                            style={
                                                inputLocked || pin.length === 0
                                                    ? {
                                                          background: 'rgba(255,255,255,0.05)',
                                                          border: '1px solid rgba(255,255,255,0.1)',
                                                          color: 'rgba(255,255,255,0.3)',
                                                      }
                                                    : {
                                                          background:
                                                              'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                                                          boxShadow:
                                                              '0 8px 24px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                                                          color: '#0f172a',
                                                      }
                                            }
                                        >
                                            {!(inputLocked || pin.length === 0) && (
                                                <span
                                                    aria-hidden="true"
                                                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                                    style={{
                                                        background:
                                                            'linear-gradient(135deg, #fbbf24 0%, #fde68a 100%)',
                                                    }}
                                                />
                                            )}
                                            <span className="relative">
                                                {loading ? (
                                                    <span className="flex items-center gap-2">
                                                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                                                        Memeriksa...
                                                    </span>
                                                ) : cooldown > 0 ? (
                                                    `Tunggu ${cooldown} dtk`
                                                ) : (
                                                    'Masuk sebagai Viewer'
                                                )}
                                            </span>
                                        </button>

                                        <p
                                            id="pin-hint"
                                            className="mt-2 text-center text-[11px] text-white/35"
                                        >
                                            {pin.length === 0
                                                ? `Masukkan ${PIN_MAX} angka PIN untuk melanjutkan.`
                                                : `${pin.length}/${PIN_MAX} angka`}
                                        </p>
                                    </form>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Footer ── */}
                        <div className="mt-5 pt-4 border-t border-white/8 flex flex-col items-center gap-1">
                            <a
                                href="/Panduan-Input-Detail-Proyek.pdf?v=20261117"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 min-h-10 px-2 rounded-lg text-[11px] font-medium text-white/40 hover:text-amber-400 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
                            >
                                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                                Panduan Pengguna (PDF)
                            </a>
                            <p className="text-[11px] text-white/35 text-center">
                                Lupa PIN atau belum punya akses?{' '}
                                {HELP_CONTACT ? (
                                    <a
                                        href={`mailto:${HELP_CONTACT}`}
                                        className="font-semibold text-amber-400 hover:underline"
                                    >
                                        Hubungi admin
                                    </a>
                                ) : (
                                    <span className="font-semibold text-white/50">Hubungi admin proyek</span>
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Copyright */}
                <p className="text-center text-[10px] text-white/25 mt-4">
                    © {new Date().getFullYear()} PT Brantas Abipraya
                </p>
            </motion.div>
        </div>
    );
}
