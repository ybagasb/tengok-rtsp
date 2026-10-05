"use client";

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2, Clock, AlertTriangle, Link2Off, ShieldX, Timer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const MapComponent = dynamic(() => import('@/components/MapComponent'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-screen flex items-center justify-center bg-slate-950">
            <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
            <span className="ml-3 text-slate-400">Loading Map...</span>
        </div>
    ),
});

type Status = 'loading' | 'valid' | 'expired' | 'revoked' | 'invalid';

interface ShareData {
    label: string;
    locations: any[];
    expiresAt: string;
    duration: number;
}

function CountdownTimer({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
    const [timeLeft, setTimeLeft] = useState('');
    const [isUrgent, setIsUrgent] = useState(false);

    useEffect(() => {
        const update = () => {
            const diff = new Date(expiresAt).getTime() - Date.now();
            if (diff <= 0) {
                onExpire();
                return;
            }

            setIsUrgent(diff < 5 * 60 * 1000); // <5 min = urgent

            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);

            if (h > 0) {
                setTimeLeft(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
            } else {
                setTimeLeft(`${m}:${String(s).padStart(2, '0')}`);
            }
        };

        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [expiresAt, onExpire]);

    return (
        <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`fixed top-4 right-4 z-[500] flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 rounded-2xl shadow-2xl backdrop-blur-2xl border transition-all duration-500 ${
                isUrgent
                    ? 'bg-red-950/80 border-red-500/30 shadow-red-500/20'
                    : 'bg-slate-900/80 border-white/10'
            }`}
        >
            <Timer className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isUrgent ? 'text-red-400 animate-pulse' : 'text-yellow-500'}`} />
            <span className={`text-xs sm:text-sm font-bold tabular-nums tracking-wider ${isUrgent ? 'text-red-300' : 'text-white'}`}>
                {timeLeft}
            </span>
            <span className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-wider ${isUrgent ? 'text-red-400/60' : 'text-slate-500'}`}>
                tersisa
            </span>
        </motion.div>
    );
}

function BrandingOverlay({ label }: { label: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="fixed top-4 left-4 z-[500] flex items-center gap-2.5 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3.5 rounded-2xl bg-slate-900/80 backdrop-blur-2xl border border-white/10 shadow-2xl max-w-[calc(100vw-7rem)]"
        >
            <img src="/abipraya_original.svg" alt="Logo" className="h-5 sm:h-6 shrink-0" />
            <div className="h-5 w-px bg-white/10 shrink-0" />
            <div className="min-w-0">
                <div className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-wider leading-none">Shared View</div>
                <div className="text-[11px] sm:text-xs font-bold text-white tracking-tight truncate mt-0.5">{label}</div>
            </div>
        </motion.div>
    );
}

// ── Error / Expired Page ──────────────────────────────────────────────────────
function ErrorPage({ type }: { type: 'expired' | 'revoked' | 'invalid' }) {
    const config = {
        expired: {
            icon: Clock,
            title: 'Link Sudah Kedaluwarsa',
            subtitle: 'Sesi akses CCTV ini telah berakhir.',
            description: 'Silakan hubungi admin untuk mendapatkan link baru.',
            color: 'yellow',
        },
        revoked: {
            icon: ShieldX,
            title: 'Link Telah Dicabut',
            subtitle: 'Admin telah mencabut akses link ini.',
            description: 'Link ini tidak lagi aktif. Hubungi admin jika membutuhkan akses.',
            color: 'orange',
        },
        invalid: {
            icon: Link2Off,
            title: 'Link Tidak Valid',
            subtitle: 'Link yang Anda akses tidak ditemukan.',
            description: 'Pastikan Anda menggunakan link yang benar dari admin.',
            color: 'red',
        },
    };

    const c = config[type];
    const Icon = c.icon;

    const colorClasses: Record<string, { bg: string; text: string; border: string; glow: string }> = {
        yellow: {
            bg: 'bg-yellow-500/10',
            text: 'text-yellow-500',
            border: 'border-yellow-500/20',
            glow: 'bg-yellow-600/10',
        },
        orange: {
            bg: 'bg-orange-500/10',
            text: 'text-orange-500',
            border: 'border-orange-500/20',
            glow: 'bg-orange-600/10',
        },
        red: {
            bg: 'bg-red-500/10',
            text: 'text-red-500',
            border: 'border-red-500/20',
            glow: 'bg-red-600/10',
        },
    };

    const cls = colorClasses[c.color];

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] ${cls.glow} rounded-full blur-[150px]`} />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6 }}
                className="relative text-center max-w-md"
            >
                {/* Icon */}
                <div className={`w-28 h-28 mx-auto mb-10 rounded-[2.5rem] ${cls.bg} border ${cls.border} flex items-center justify-center shadow-2xl`}>
                    <Icon className={`w-12 h-12 ${cls.text}`} strokeWidth={1.5} />
                </div>

                <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
                    {c.title}
                </h1>
                <p className={`text-lg font-semibold ${cls.text} mb-3`}>
                    {c.subtitle}
                </p>
                <p className="text-slate-400 text-sm leading-relaxed mb-10">
                    {c.description}
                </p>

                {/* Logo */}
                <div className="flex items-center justify-center gap-3 opacity-40">
                    <img src="/abipraya_original.svg" alt="Logo" className="h-5" />
                    <div className="h-4 w-px bg-white/20" />
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        Tengok Monitoring
                    </span>
                </div>
            </motion.div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SharedViewPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    const router = useRouter();
    const [status, setStatus] = useState<Status>('loading');
    const [shareData, setShareData] = useState<ShareData | null>(null);

    useEffect(() => {
        const verify = async () => {
            try {
                const res = await axios.post('/api/share-links/verify', { token });
                if (res.data.valid) {
                    setShareData(res.data.data);
                    setStatus('valid');
                }
            } catch (error: any) {
                const errorType = error?.response?.data?.error;
                if (errorType === 'expired') setStatus('expired');
                else if (errorType === 'revoked') setStatus('revoked');
                else setStatus('invalid');
            }
        };
        verify();
    }, [token]);

    // Analytics Tracker (Zero-delay fire-and-forget)
    useEffect(() => {
        if (status === 'valid') {
            const timer = setTimeout(() => {
                fetch('/api/stats/track', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                    keepalive: true
                }).catch(() => {});
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [status, token]);

    const handleExpire = useCallback(() => {
        setStatus('expired');
    }, []);

    // Loading
    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <Loader2 className="w-12 h-12 text-yellow-500 animate-spin" />
                        <div className="absolute inset-0 bg-yellow-500/20 blur-2xl rounded-full" />
                    </div>
                    <p className="text-slate-400 font-bold uppercase tracking-wider text-sm">
                        Memverifikasi akses...
                    </p>
                </div>
            </div>
        );
    }

    // Error States
    if (status === 'expired' || status === 'revoked' || status === 'invalid') {
        return <ErrorPage type={status} />;
    }

    // Valid — show map
    if (status === 'valid' && shareData) {
        const locationIds = shareData.locations.map((loc: any) => loc._id);

        return (
            <div className="h-screen w-full relative">
                {/* Countdown Timer */}
                <CountdownTimer expiresAt={shareData.expiresAt} onExpire={handleExpire} />

                {/* Branding */}
                <BrandingOverlay label={shareData.label} />

                {/* Map */}
                <MapComponent
                    sharedMode={true}
                    allowedLocationIds={locationIds}
                />
            </div>
        );
    }

    return null;
}
