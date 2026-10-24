"use client";

/**
 * RouteTransition — menampilkan BrandLoader sekilas saat berpindah halaman
 * (navigasi antar-rute) pada area setelah login. Memberi efek "load konten
 * bermerek" di tiap perpindahan tanpa mengganggu (durasi singkat).
 *
 * Dipasang sekali di Providers. Hanya aktif di rute terproteksi
 * (/categories, /map, /multiview, /project, /admin) — bukan /login.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import BrandLoader from './BrandLoader';

const SHOW_ON = ['/intro', '/categories', '/map', '/multiview', '/project', '/admin'];
// Durasi "jembatan" transisi antar-rute. Ini hanya menutup jeda singkat antara
// klik navigasi dan munculnya loader konten milik halaman tujuan (yang akan
// tetap tampil sampai datanya benar-benar selesai dimuat). Dibuat agak panjang
// agar tidak terasa berkedip/terlalu cepat.
const MIN_MS = 1100;

function shouldShow(path: string): boolean {
    return SHOW_ON.some(p => path === p || path.startsWith(p + '/'));
}

export default function RouteTransition() {
    const pathname = usePathname();
    const [visible, setVisible] = useState(false);
    const prevPath = useRef<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Lewati render pertama (bukan "perpindahan", tapi load awal halaman —
        // itu sudah ditangani loading.tsx per route).
        if (prevPath.current === null) {
            prevPath.current = pathname;
            return;
        }
        if (prevPath.current === pathname) return;
        prevPath.current = pathname;

        if (!shouldShow(pathname)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- overlay transisi dikendalikan oleh perubahan pathname; tidak bisa diturunkan saat render tanpa mengubah perilaku
            setVisible(false);
            return;
        }

        setVisible(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setVisible(false), MIN_MS);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [pathname]);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    key="route-transition"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[9999]"
                >
                    <BrandLoader label="Memuat Halaman" />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
