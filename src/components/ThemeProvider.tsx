"use client";
/**
 * ThemeProvider — tema adaptif seluruh aplikasi.
 *
 * Preferensi pengguna: 'system' (default, mengikuti OS/browser), 'light', atau 'dark'.
 * `theme` adalah hasil akhir (light/dark) yang dipakai UI. Preferensi disimpan
 * di localStorage. Memakai useSyncExternalStore sehingga nilai awal di klien
 * langsung benar (tanpa kedipan ikon/label) dan ikut berubah saat tema OS berubah.
 *
 * Catatan: tema peta (MapLibre dark/light/satelit) terpisah, tidak diatur di sini.
 */
import { createContext, useContext, useEffect, useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'tengok-theme';
const MEDIA = '(prefers-color-scheme: dark)';

interface ThemeCtx {
    /** Tema yang sedang aktif (hasil akhir). */
    theme: Theme;
    /** Pilihan pengguna, termasuk 'system'. */
    preference: ThemePreference;
    setTheme: (t: Theme) => void;
    setPreference: (p: ThemePreference) => void;
    /** Balik tema aktif secara eksplisit (light <-> dark). */
    toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }

function subscribe(cb: () => void) {
    listeners.add(cb);
    const mq = window.matchMedia(MEDIA);
    mq.addEventListener('change', cb);
    window.addEventListener('storage', cb);
    return () => {
        listeners.delete(cb);
        mq.removeEventListener('change', cb);
        window.removeEventListener('storage', cb);
    };
}

function readPreference(): ThemePreference {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* ignore */ }
    return 'system';
}
const readSystemDark = () => window.matchMedia(MEDIA).matches;

function applyClass(theme: Theme) {
    const el = document.documentElement;
    if (el.classList.contains(theme) && !el.classList.contains(theme === 'dark' ? 'light' : 'dark')) return;
    el.classList.remove('light', 'dark');
    el.classList.add(theme);
    el.style.colorScheme = theme;
    // Samakan warna bar browser mobile dengan tema aktif.
    const color = theme === 'dark' ? '#0f172a' : '#f1f5f9';
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', color));
}

function writePreference(p: ThemePreference) {
    try {
        if (p === 'system') localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, p);
    } catch { /* ignore */ }
    emit();
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const preference = useSyncExternalStore(subscribe, readPreference, () => 'system' as ThemePreference);
    const systemDark = useSyncExternalStore(subscribe, readSystemDark, () => true);
    const theme: Theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

    useEffect(() => { applyClass(theme); }, [theme]);

    const setPreference = useCallback((p: ThemePreference) => writePreference(p), []);
    const setTheme = useCallback((t: Theme) => writePreference(t), []);
    const toggle = useCallback(() => {
        writePreference(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
    }, []);

    return <Ctx.Provider value={{ theme, preference, setTheme, setPreference, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
    const ctx = useContext(Ctx);
    if (!ctx) {
        return { theme: 'dark', preference: 'system', setTheme: () => {}, setPreference: () => {}, toggle: () => {} };
    }
    return ctx;
}
