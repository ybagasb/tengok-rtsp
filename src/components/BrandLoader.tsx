"use client";"use client";

/**
 * BrandLoader — layar/overlay loading bermerek PT Brantas Abipraya.
 * Logo di tengah dengan ring berputar + pulse + progress bar indeterminate.
 * Dipakai sebagai:
 *  - fullscreen loader (loading.tsx per route segment)
 *  - overlay transisi antar-rute (RouteTransition)
 *
 * SVG/CSS murni + framer-motion (sudah ada di proyek). Nol dependency baru.
 */

import { motion } from 'framer-motion';
import { useTheme } from './ThemeProvider';

export default function BrandLoader({
    label = 'Memuat',
    fullscreen = true,
}: {
    label?: string;
    fullscreen?: boolean;
}) {
    const { theme } = useTheme();
    const logoSrc = theme === 'dark' ? '/abipraya_original.svg' : '/abipraya_blue.svg';
    return (
        <div
            className={`${fullscreen ? 'fixed inset-0' : 'absolute inset-0'} z-[9999] flex flex-col items-center justify-center bg-slate-100/95 dark:bg-slate-950/95 backdrop-blur-xl`}
        >
            {/* Ambient glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-yellow-500/10 blur-[100px] rounded-full pointer-events-none" />

            <div className="relative flex flex-col items-center">
                {/* Logo + ring berputar */}
                <div className="relative w-28 h-28 flex items-center justify-center">
                    {/* Ring luar berputar */}
                    <motion.span
                        className="absolute inset-0 rounded-full border-2 border-transparent border-t-yellow-400 border-r-yellow-400/40"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                    />
                    {/* Ring dalam berputar berlawanan */}
                    <motion.span
                        className="absolute inset-2 rounded-full border-2 border-transparent border-b-amber-500/60"
                        animate={{ rotate: -360 }}
                        transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
                    />
                    {/* Logo dengan pulse halus — biru di light, putih/kuning di dark */}
                    <motion.img
                        src={logoSrc}
                        alt="PT Brantas Abipraya"
                        className="w-16 h-16 object-contain select-none drop-shadow-[0_0_12px_rgba(234,179,8,0.35)]"
                        draggable={false}
                        animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
                        transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                    />
                </div>

                {/* Nama perusahaan */}
                <div className="mt-7 text-center">
                    <p className="text-sm font-black tracking-[0.2em] uppercase bg-gradient-to-r from-yellow-300 to-amber-200 bg-clip-text text-transparent">
                        PT Brantas Abipraya
                    </p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
                        {label}
                    </p>
                </div>

                {/* Progress bar indeterminate */}
                <div className="mt-5 w-44 h-1 rounded-full bg-white/10 overflow-hidden">
                    <motion.span
                        className="block h-full w-1/3 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500"
                        animate={{ x: ['-120%', '320%'] }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                    />
                </div>
            </div>
        </div>
    );
}
