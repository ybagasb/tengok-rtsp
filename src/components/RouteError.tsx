'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

interface RouteErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
    /** Judul singkat, mis. "Peta gagal dimuat". */
    title: string;
    /** Tautan alternatif agar user tidak terjebak. */
    backHref?: string;
    backLabel?: string;
}

/**
 * Tampilan error per-rute. Detail error hanya masuk console (server/browser),
 * TIDAK ditampilkan ke user. Dipakai oleh error.tsx tiap segmen.
 */
export default function RouteError({ error, reset, title, backHref = '/categories', backLabel = 'Kembali ke Beranda' }: RouteErrorProps) {
    useEffect(() => {
        console.error(`[RouteError] ${title}:`, error);
    }, [error, title]);

    return (
        <div role="alert" className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center p-8 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-black/5 dark:border-white/10">
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-rose-500" aria-hidden="true" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{title}</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    Terjadi gangguan saat menampilkan halaman ini. Coba muat ulang. Jika masih berulang, hubungi tim teknis.
                </p>
                <div className="flex items-center justify-center gap-2">
                    <a
                        href={backHref}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {backLabel}
                    </a>
                    <button
                        onClick={() => reset()}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl div-accent-solid hover:brightness-110 text-slate-950 text-sm font-bold transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" aria-hidden="true" /> Coba Lagi
                    </button>
                </div>
            </div>
        </div>
    );
}
