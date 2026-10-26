"use client";
/**
 * ThemeToggle — tombol balik tema (hanya Terang/Gelap). Tema awal mengikuti OS;
 * tombol menyesuaikan tema aktif dan menampilkan tema TUJUAN klik:
 * saat gelap → tombol "Terang", saat terang → tombol "Gelap".
 */
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle({ className = '' }: { className?: string }) {
    const { theme, toggle } = useTheme();
    const toLight = theme === 'dark';
    const Icon = toLight ? Sun : Moon;
    const label = toLight ? 'Terang' : 'Gelap';

    return (
        <button
            type="button"
            onClick={toggle}
            title={`Ganti ke tema ${label.toLowerCase()}`}
            aria-label={`Ganti ke tema ${label.toLowerCase()}`}
            className={`flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-2.5 min-h-11 min-w-11 rounded-xl bg-black/[0.04] dark:bg-slate-900/50 backdrop-blur border border-black/10 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-yellow-400 hover:border-yellow-500/30 transition-all group ${className}`}
        >
            <Icon className="w-4 h-4 group-hover:scale-110 transition-transform" aria-hidden="true" />
            <span className="text-[11px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">{label}</span>
        </button>
    );
}
