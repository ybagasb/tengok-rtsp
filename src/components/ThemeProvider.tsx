"use client";

/**
 * ThemeProvider — tema adaptif seluruh aplikasi.
 * Default MENGIKUTI tema OS/browser pengguna (prefers-color-scheme) saat
 * pertama kali. Setelah itu pengguna bisa membalik tema (light <-> dark),
 * pilihannya disimpan di localStorage.
 *
 * Tidak ada mode "auto" terpisah — hanya 'light' atau 'dark'.
 *
 * Catatan: tema peta (MapLibre dark/light/satelit) terpisah, tidak diatur di sini.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tengok-theme';

interface ThemeCtx {
    theme: Theme;
    setTheme: (t: Theme) => void;
    toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function systemPrefersDark(): boolean {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyClass(theme: Theme) {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    el.classList.remove('light', 'dark');
    el.classList.add(theme);
    el.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Awal = dark agar konsisten dengan SSR; dikoreksi di useEffect sesuai
    // pilihan tersimpan / preferensi OS.
    const [theme, setThemeState] = useState<Theme>('dark');

    useEffect(() => {
        let initial: Theme;
        try {
            const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
            // Belum pernah memilih → IKUTI tema OS pengguna.
            initial = saved === 'light' || saved === 'dark'
                ? saved
                : (systemPrefersDark() ? 'dark' : 'light');
        } catch {
            initial = systemPrefersDark() ? 'dark' : 'light';
        }
        setThemeState(initial);
        applyClass(initial);
    }, []);

    const setTheme = useCallback((t: Theme) => {
        setThemeState(t);
        applyClass(t);
        try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
    }, []);

    const toggle = useCallback(() => {
        setThemeState(prev => {
            const next: Theme = prev === 'dark' ? 'light' : 'dark';
            applyClass(next);
            try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
            return next;
        });
    }, []);

    return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
    const ctx = useContext(Ctx);
    if (!ctx) {
        return { theme: 'dark', setTheme: () => {}, toggle: () => {} };
    }
    return ctx;
}
