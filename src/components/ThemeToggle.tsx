"use client";

/**
 * ThemeToggle — tombol balik tema. Menampilkan tema LAWAN dari yang aktif
 * (tujuan klik): saat gelap → tombol "Terang", saat terang → tombol "Gelap".
 */

import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle({ className = '' }: { className?: string }) {
    const { theme, toggle } = useTheme();
    // Tampilkan tujuan (lawan tema aktif).
    const toLight = theme === 'dark';
    const Icon = toLight ? Sun : Moon;
    const label = toLight ? 'Terang' : 'Gelap';
    return (
        <button
            onClick={toggle}
            title={`Ganti ke tema ${label.toLowerCase()}`}
            aria-label={`Ganti ke tema ${label.toLowerCase()}`}
            className={`flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-2.5 rounded-xl bg-black/[0.04] dark:bg-slate-900/50 backdrop-blur border border-black/10 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:text-yellow-500 dark:hover:text-yellow-400 hover:border-yellow-500/30 transition-all group ${className}`}
        >
            <Icon className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">{label}</span>
        </button>
    );
}
