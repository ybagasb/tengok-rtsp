"use client";

import { useState, useRef, useEffect } from 'react';
import { BookOpen, ChevronDown, Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DIVISION_THEME, type DivisionKey } from '@/lib/divisionTheme';
import { unduhPdfPanduanAdminDivisi } from '@/lib/panduanAdminDivisiPdf';

const DIVISI_KEYS: DivisionKey[] = ['DIVISI 1', 'DIVISI 2', 'DIVISI 3'];

export function PanduanDivisiButton({
    isSuperAdmin,
    appDivisi,
    variant = 'header',
}: {
    isSuperAdmin: boolean;
    appDivisi?: DivisionKey | null;
    variant?: 'sidebar' | 'header' | 'mobile';
}) {
    const [downloading, setDownloading] = useState<DivisionKey | null>(null);
    const [openMenu, setOpenMenu] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!openMenu) return;
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenMenu(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpenMenu(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [openMenu]);

    const handleDownload = async (divisi: DivisionKey) => {
        setOpenMenu(false);
        setDownloading(divisi);
        try {
            await unduhPdfPanduanAdminDivisi(divisi);
            toast.success(`Panduan ${DIVISION_THEME[divisi].short} berhasil diunduh`);
        } catch (err) {
            console.error('[PanduanDivisi] gagal membuat PDF:', err);
            toast.error('Gagal membuat PDF panduan');
        } finally {
            setDownloading(null);
        }
    };

    const targetDivisi = !isSuperAdmin && appDivisi ? appDivisi : null;
    const isBusy = downloading !== null;

    if (!isSuperAdmin && !targetDivisi) return null;

    const label = targetDivisi
        ? `Panduan ${DIVISION_THEME[targetDivisi].short} (PDF)`
        : 'Panduan Divisi (PDF)';

    const btnClass =
        variant === 'sidebar'
            ? 'focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-full flex items-center justify-between gap-2 px-4 py-3 text-slate-600 dark:text-slate-300 hover:text-yellow-700 dark:hover:text-yellow-400 hover:bg-yellow-500/10 rounded-xl transition-all text-xs font-bold border border-black/5 dark:border-white/5'
            : variant === 'mobile'
                ? 'focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-full flex items-center justify-between gap-3 p-4 rounded-2xl text-slate-700 dark:text-slate-200 hover:bg-yellow-500/10 hover:text-yellow-700 dark:hover:text-yellow-400 border border-black/5 dark:border-white/5 transition-all'
                : 'focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 hover:border-yellow-500/30 text-slate-600 dark:text-slate-300 hover:text-yellow-800 dark:hover:text-yellow-400 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-50 min-h-11';

    return (
        <div ref={wrapRef} className={variant === 'header' ? 'relative' : 'relative w-full'}>
            <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                    if (targetDivisi) void handleDownload(targetDivisi);
                    else setOpenMenu(v => !v);
                }}
                aria-expanded={isSuperAdmin ? openMenu : undefined}
                aria-haspopup={isSuperAdmin ? 'menu' : undefined}
                className={btnClass}
            >
                <span className="flex items-center gap-2.5 min-w-0">
                    {isBusy
                        ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin text-yellow-700 dark:text-yellow-500 shrink-0" />
                        : <BookOpen aria-hidden="true" className="w-4 h-4 text-yellow-700 dark:text-yellow-500 shrink-0" />}
                    <span className="truncate">{isBusy ? 'Menyiapkan PDF...' : label}</span>
                </span>
                {isSuperAdmin && (
                    <ChevronDown
                        aria-hidden="true"
                        className={`w-3.5 h-3.5 shrink-0 transition-transform ${openMenu ? 'rotate-180' : ''}`}
                    />
                )}
            </button>

            {isSuperAdmin && openMenu && (
                <div
                    role="menu"
                    aria-label="Pilih divisi untuk unduh PDF panduan"
                    className={`absolute z-50 w-64 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl p-1.5 space-y-1 ${
                        variant === 'sidebar'
                            ? 'bottom-full left-0 mb-2'
                            : variant === 'mobile'
                                ? 'bottom-full left-0 right-0 mb-2 w-full'
                                : 'top-full right-0 mt-2'
                    }`}
                >
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Pilih Panduan Divisi
                    </div>
                    {DIVISI_KEYS.map((d) => {
                        const t = DIVISION_THEME[d];
                        return (
                            <button
                                key={d}
                                type="button"
                                role="menuitem"
                                onClick={() => void handleDownload(d)}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                                <div className="min-w-0">
                                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <span
                                            aria-hidden="true"
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: t.accentHex }}
                                        />
                                        {t.short}
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate pl-4">{t.title}</div>
                                </div>
                                <Download aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
