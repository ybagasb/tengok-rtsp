"use client";

/**
 * CountUp — animasi angka naik dari 0 ke nilai target saat muncul.
 * Ringan (requestAnimationFrame + ease-out), menghormati prefers-reduced-motion.
 * `format` opsional untuk memformat angka (mis. rupiah ringkas).
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export default function CountUp({
    value,
    duration = 1200,
    format,
    className = '',
    style,
}: {
    value: number;
    duration?: number;
    format?: (n: number) => string;
    className?: string;
    style?: React.CSSProperties;
}) {
    const reduce = useReducedMotion();
    const [display, setDisplay] = useState(reduce ? value : 0);
    const raf = useRef(0);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkronisasi nilai akhir saat reduced-motion; mengubahnya berisiko mengubah perilaku animasi
        if (reduce) { setDisplay(value); return; }
        const start = performance.now();
        const from = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            setDisplay(from + (value - from) * eased);
            if (t < 1) raf.current = requestAnimationFrame(tick);
            else setDisplay(value);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [value, duration, reduce]);

    const text = format ? format(display) : Math.round(display).toLocaleString('id-ID');
    return <span className={className} style={style}>{text}</span>;
}
