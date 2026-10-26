"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Lightbulb, AlertTriangle, X as CloseIcon, Bell } from 'lucide-react';
import { useIsPhone } from '@/lib/phoneMode';

interface Notice {
    id: string;
    type: 'info' | 'tip' | 'warning';
    title: string;
    message: string;
    enabled: boolean;
}

interface NoticeConfig {
    enabled: boolean;
    autoDismissSec: number;
    notices: Notice[];
}

interface CctvNoticesProps {
    sharedMode?: boolean;
    // When a location panel is open, we hide notices on small screens (matches
    // the previous behavior of the inline map toasts).
    hidden?: boolean;
}

// Per-type visual treatment.
const TYPE_STYLES: Record<Notice['type'], { icon: typeof Info; accent: string; iconBg: string; iconColor: string; ring: string }> = {
    info: {
        icon: Info,
        accent: 'from-yellow-500 to-orange-500',
        iconBg: 'bg-yellow-500/10',
        iconColor: 'text-yellow-500',
        ring: 'border-yellow-500/30',
    },
    tip: {
        icon: Lightbulb,
        accent: 'from-sky-500 to-cyan-400',
        iconBg: 'bg-sky-500/10',
        iconColor: 'text-sky-400',
        ring: 'border-sky-500/25',
    },
    warning: {
        icon: AlertTriangle,
        accent: 'from-rose-500 to-orange-500',
        iconBg: 'bg-rose-500/10',
        iconColor: 'text-rose-400',
        ring: 'border-rose-500/25',
    },
};

// Key sessionStorage untuk menyimpan id notice yang sudah ditutup user (per sesi).
const DISMISSED_KEY = 'cctv-notices-dismissed';
// Key sessionStorage untuk menyimpan id notice yang sudah pernah ditampilkan/dilihat (per sesi).
const SEEN_KEY = 'cctv-notices-seen';

export default function CctvNotices({ sharedMode = false, hidden = false }: CctvNoticesProps) {
    // Phone: bar atas peta cuma satu baris, jadi notice naik ke bawahnya (bukan di y=184px).
    const isPhone = useIsPhone();
    const [config, setConfig] = useState<NoticeConfig | null>(null);
    // Antrean notice yang boleh tampil. HANYA SATU yang ditampilkan sekali waktu:
    // yang berikutnya muncul setelah yang sekarang ditutup (manual / auto-dismiss).
    const [visibleIds, setVisibleIds] = useState<string[]>([]);
    const visibleIdsRef = useRef<string[]>([]);
    useEffect(() => {
        visibleIdsRef.current = visibleIds;
    }, [visibleIds]);

    // Notice yang sudah ditutup user — persisten per sesi browser (sessionStorage)
    const [dismissed, setDismissed] = useState<Set<string>>(() => {
        if (typeof window === 'undefined') return new Set();
        try {
            const raw = sessionStorage.getItem(DISMISSED_KEY);
            return new Set<string>(raw ? JSON.parse(raw) : []);
        } catch { return new Set(); }
    });

    // Notice yang sudah pernah ditampilkan — persisten per sesi browser (sessionStorage)
    const [seen, setSeen] = useState<Set<string>>(() => {
        if (typeof window === 'undefined') return new Set();
        try {
            const raw = sessionStorage.getItem(SEEN_KEY);
            return new Set<string>(raw ? JSON.parse(raw) : []);
        } catch { return new Set(); }
    });

    const timersRef = useRef<NodeJS.Timeout[]>([]);

    // Fetch config once on mount.
    useEffect(() => {
        let active = true;
        fetch('/api/settings/notifications')
            .then(res => res.json())
            .then(json => {
                if (!active || !json?.success) return;
                setConfig(json.data);
            })
            .catch(() => { /* silent — notices are non-critical */ });
        return () => { active = false; };
    }, []);

    const activeNotices = useMemo(() => {
        return (config?.enabled ? config.notices : []).filter(n => n.enabled);
    }, [config]);

    const markSeen = useCallback((id: string) => {
        setSeen(prev => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
        });
        try {
            const raw = sessionStorage.getItem(SEEN_KEY);
            const stored = new Set<string>(raw ? JSON.parse(raw) : []);
            stored.add(id);
            sessionStorage.setItem(SEEN_KEY, JSON.stringify([...stored]));
        } catch { /* ignore */ }
    }, []);

    const dismiss = useCallback((id: string) => {
        setDismissed(prev => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
        });
        try {
            const raw = sessionStorage.getItem(DISMISSED_KEY);
            const stored = new Set<string>(raw ? JSON.parse(raw) : []);
            stored.add(id);
            sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...stored]));
        } catch { /* ignore */ }
    }, []);

    // Reveal notices one-by-one with a stagger once config is loaded & not hidden.
    useEffect(() => {
        // Clear any pending timers on re-run
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];

        if (hidden) {
            // Saat hidden jadi true (panel kamera terbuka):
            // Notice yang SEDANG tampil (yang pertama di antrean) dianggap selesai
            // dan tidak muncul lagi setelah panel ditutup. Sisa antrean (belum pernah
            // tampil) tidak ikut dibuang.
            let storedDismissed = new Set<string>();
            try {
                const raw = sessionStorage.getItem(DISMISSED_KEY);
                storedDismissed = new Set<string>(raw ? JSON.parse(raw) : []);
            } catch { /* ignore */ }
            const currentId = visibleIdsRef.current.find(id => !storedDismissed.has(id));
            if (currentId) {
                setDismissed(prev => {
                    const next = new Set(prev);
                    next.add(currentId);
                    return next;
                });
                try {
                    storedDismissed.add(currentId);
                    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...storedDismissed]));
                } catch { /* ignore */ }
            }
            setVisibleIds([]);
            visibleIdsRef.current = [];
            return;
        }

        if (activeNotices.length === 0) return;

        // Ambil data dismissed & seen terkini dari sessionStorage
        let currentDismissed = dismissed;
        let currentSeen = seen;
        try {
            const rawD = sessionStorage.getItem(DISMISSED_KEY);
            if (rawD) currentDismissed = new Set(JSON.parse(rawD));
            const rawS = sessionStorage.getItem(SEEN_KEY);
            if (rawS) currentSeen = new Set(JSON.parse(rawS));
        } catch { /* ignore */ }

        // Notice yang belum sempat tampil (tidak di dismissed dan tidak di seen) boleh muncul seperti biasa
        const eligible = activeNotices.filter(
            notice => !currentDismissed.has(notice.id) && !currentSeen.has(notice.id)
        );

        // Masukkan semua yang layak ke antrean sekaligus; tampilannya dibatasi satu per satu.
        setVisibleIds(prev => {
            const next = [...prev];
            for (const n of eligible) if (!next.includes(n.id)) next.push(n.id);
            return next.length === prev.length ? prev : next;
        });

        return () => {
            timersRef.current.forEach(clearTimeout);
            timersRef.current = [];
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismissed/seen sengaja tidak jadi dependensi (dibaca ulang dari sessionStorage); menambahkannya memicu ulang antrean
    }, [config, hidden, activeNotices]);

    const reopenAll = useCallback(() => {
        setDismissed(new Set());
        setSeen(new Set());
        try {
            sessionStorage.removeItem(DISMISSED_KEY);
            sessionStorage.removeItem(SEEN_KEY);
        } catch { /* ignore */ }

        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
        // Antrean diisi ulang dari awal; yang tampil tetap satu per satu.
        setVisibleIds(activeNotices.map(n => n.id));
    }, [activeNotices]);

    // Notice yang sedang tampil = yang pertama di antrean dan belum ditutup.
    const currentId = activeNotices.find(n => visibleIds.includes(n.id) && !dismissed.has(n.id))?.id;
    // Tandai "sudah dilihat" hanya saat benar-benar ditampilkan (bukan saat masuk antrean).
    useEffect(() => {
        if (currentId && !hidden) markSeen(currentId);
    }, [currentId, hidden, markSeen]);

    if (activeNotices.length === 0) return null;
    // Saat panel kamera (sidebar) terbuka, sembunyikan total — kartu & bell —
    // agar tidak menimpa panel di semua ukuran layar.
    if (hidden) return null;

    const shown = activeNotices.filter(n => n.id === currentId);
    const allHandled = activeNotices.every(n => dismissed.has(n.id) || seen.has(n.id));
    const autoDismissSec = config?.autoDismissSec ?? 0;

    return (
        <>
            <div
                className={`fixed z-[2000] gap-2.5 pointer-events-none flex ${
                    sharedMode ? 'bottom-6 left-4 flex-col-reverse' : isPhone ? 'top-[calc(env(safe-area-inset-top,0px)+4.75rem)] left-2 flex-col' : 'top-[184px] sm:top-[204px] left-2 sm:left-6 flex-col'
                }`}
            >
                <AnimatePresence mode="wait">
                    {shown.map((notice) => (
                        <NoticeCard
                            key={notice.id}
                            notice={notice}
                            autoDismissSec={autoDismissSec}
                            onDismiss={() => dismiss(notice.id)}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {/* Re-open button when everything has been handled / closed and nothing currently shown */}
            <AnimatePresence>
                {allHandled && shown.length === 0 && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.5, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.5, y: 10 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        onClick={reopenAll}
                        className={`fixed z-[1900] flex items-center justify-center p-3 sm:p-3.5 rounded-2xl bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl text-yellow-500 hover:bg-white dark:hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all group ${
                            sharedMode ? 'bottom-6 left-4' : isPhone ? 'top-[calc(env(safe-area-inset-top,0px)+4.75rem)] left-2' : 'top-[184px] sm:top-[204px] left-2 sm:left-6'
                        }`}
                        title="Tampilkan informasi"
                    >
                        <Bell className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </motion.button>
                )}
            </AnimatePresence>
        </>
    );
}

function NoticeCard({
    notice,
    autoDismissSec,
    onDismiss,
}: {
    notice: Notice;
    autoDismissSec: number;
    onDismiss: () => void;
}) {
    const style = TYPE_STYLES[notice.type] || TYPE_STYLES.info;
    const Icon = style.icon;
    const [paused, setPaused] = useState(false);

    // Keep the latest onDismiss in a ref so the auto-dismiss timer does NOT
    // reset every time the parent re-renders (which passes a new inline
    // onDismiss). On the busy map page re-renders were resetting the timer
    // before it could fire, so notices never auto-closed.
    const onDismissRef = useRef(onDismiss);
    useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

    // Auto-dismiss timer (pauses on hover so users can finish reading).
    useEffect(() => {
        if (!autoDismissSec || autoDismissSec <= 0 || paused) return;
        const t = setTimeout(() => onDismissRef.current(), autoDismissSec * 1000);
        return () => clearTimeout(t);
    }, [autoDismissSec, paused]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -24, scale: 0.95, filter: 'blur(4px)', transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className={`relative w-[min(380px,calc(100vw-2rem))] overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border ${style.ring} shadow-2xl rounded-2xl pointer-events-auto ring-1 ring-black/5 dark:ring-white/5`}
        >
            {/* Accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${style.accent}`} />

            <div className="flex gap-3.5 items-start p-4 pl-5">
                <div className={`p-2 ${style.iconBg} rounded-xl shrink-0`}>
                    <Icon className={`w-5 h-5 ${style.iconColor}`} />
                </div>
                <div className="flex-1 mt-0.5 pr-6">
                    {notice.title && (
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">{notice.title}</h4>
                    )}
                    <p className={`text-xs text-slate-600 dark:text-slate-400 leading-relaxed ${notice.title ? 'mt-1' : ''}`}>
                        {notice.message}
                    </p>
                </div>
                <button
                    onClick={onDismiss}
                    className="absolute top-1 right-1 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors shrink-0 pointer-events-auto min-w-11 min-h-11 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                    title="Tutup"
                    aria-label="Tutup pemberitahuan"
                >
                    <CloseIcon className="w-4 h-4" aria-hidden="true" />
                </button>
            </div>

            {/* Auto-dismiss progress bar */}
            {autoDismissSec > 0 && (
                <motion.div
                    className={`h-0.5 bg-gradient-to-r ${style.accent} origin-left`}
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: paused ? 1 : 0 }}
                    transition={{ duration: paused ? 0 : autoDismissSec, ease: 'linear' }}
                />
            )}
        </motion.div>
    );
}
