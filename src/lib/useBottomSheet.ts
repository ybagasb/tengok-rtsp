/**
 * useBottomSheet - bottom sheet dua titik berhenti (tengah / penuh) yang bisa ditarik atau di-tap.
 *
 * Dipakai panel proyek di /map (phone). Selama tarikan tinggi ditulis LANGSUNG ke DOM
 * (tanpa render React per frame); state `stop` hanya berubah saat lepas. Handle memakai
 * `touch-action: none` (pasang `touch-none` pada tombol handle, bukan pada seluruh sheet).
 *
 * Pemakaian:
 *   const { ref, stop, height, transition, reset, handleProps } = useBottomSheet({...});
 *   <div ref={ref} style={{ height, transition }}>
 *     <button type="button" {...handleProps} className="touch-none" />
 */
import { useCallback, useRef, useState } from "react";
import type { ButtonHTMLAttributes, PointerEvent as ReactPointerEvent } from "react";

export type SheetStop = "mid" | "full";

export interface BottomSheetOptions {
  /** Tinggi titik tengah dan penuh, pecahan dari tinggi layar (mis. 0.5 dan 0.92) */
  midVh: number;
  fullVh: number;
  /** Batas bawah saat ditarik (pecahan tinggi layar) */
  minVh: number;
  /** true = tanpa transisi (prefers-reduced-motion) */
  reduced: boolean;
  /** Gerak minimal (px) agar dianggap tarik, bukan tap */
  dragSlopPx?: number;
  /** px/ms; lebih cepat dari ini = lompat ke titik berikutnya */
  flingVelocity?: number;
  /** Nilai CSS `transition` penuh (boleh memuat properti lain, mis. transform) */
  transition?: string;
  /**
   * false = hook tidak menyentuh DOM sama sekali (mis. desktop, saat elemen ref adalah
   * panel samping biasa). Default true.
   */
  enabled?: boolean;
}

type HandleProps = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onClick" | "aria-expanded"
>;

export function useBottomSheet(o: BottomSheetOptions) {
  const enabled = o.enabled ?? true;
  const slop = o.dragSlopPx ?? 6;
  const fling = o.flingVelocity ?? 0.4;
  const transition = o.reduced ? "none" : o.transition ?? "height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)";
  const css = (s: SheetStop) => `${(s === "full" ? o.fullVh : o.midVh) * 100}dvh`;

  const ref = useRef<HTMLDivElement | null>(null);
  const stopRef = useRef<SheetStop>("mid");
  const [stop, setStopState] = useState<SheetStop>("mid");
  const dragRef = useRef<{ id: number; y0: number; h0: number; t0: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const settle = useCallback(
    (next: SheetStop) => {
      const el = enabled ? ref.current : null;
      if (el) {
        el.style.transition = transition;
        el.style.height = `${(next === "full" ? o.fullVh : o.midVh) * 100}dvh`;
      }
      stopRef.current = next;
      setStopState(next);
    },
    [enabled, transition, o.fullVh, o.midVh]
  );
  const reset = useCallback(() => settle("mid"), [settle]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const el = enabled ? ref.current : null;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: e.pointerId, y0: e.clientY, h0: el.getBoundingClientRect().height, t0: performance.now(), moved: false };
  }, [enabled]);
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      const el = ref.current;
      if (!d || !el || d.id !== e.pointerId) return;
      const dy = e.clientY - d.y0;
      if (!d.moved) {
        if (Math.abs(dy) < slop) return;
        d.moved = true;
        el.style.transition = "none";
      }
      const vh = window.innerHeight;
      el.style.height = `${Math.min(vh * o.fullVh, Math.max(vh * o.minVh, d.h0 - dy))}px`;
    },
    [slop, o.fullVh, o.minVh]
  );
  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      const el = ref.current;
      dragRef.current = null;
      if (!d || !el || d.id !== e.pointerId || !d.moved) return; // tap murni ditangani onClick
      suppressClickRef.current = true; // cegah klik susulan (mouse) menggeser lagi
      const vh = window.innerHeight;
      const velocity = -(e.clientY - d.y0) / Math.max(1, performance.now() - d.t0); // px/ms, + = ke atas
      const mid = vh * o.midVh;
      const full = vh * o.fullVh;
      const h = el.getBoundingClientRect().height;
      settle(velocity > fling ? "full" : velocity < -fling ? "mid" : h > (mid + full) / 2 ? "full" : "mid");
    },
    [settle, fling, o.midVh, o.fullVh]
  );
  const onPointerCancel = useCallback(() => {
    if (dragRef.current?.moved) settle(stopRef.current);
    dragRef.current = null;
  }, [settle]);
  const onClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    settle(stopRef.current === "full" ? "mid" : "full");
  }, [settle]);

  const handleProps: HandleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick,
    "aria-expanded": stop === "full",
  };

  return { ref, stop, height: css(stop), transition, settle, reset, handleProps };
}
