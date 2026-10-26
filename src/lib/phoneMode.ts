/**
 * Ambang "mode phone" (mode fokus satu divisi) SATU-SATUNYA.
 *
 * Dipakai oleh: kamera 3D fase split (IntroScene3D), layout kartu divisi, dan
 * judul /categories. Tablet dan landscape (lebar >= 640 atau aspect >= 0.85)
 * tetap memakai tampilan 3 model seperti sebelumnya.
 *
 * `isPhoneViewport` murni (dipakai di dalam loop Three.js / handler resize),
 * `useIsPhone` untuk komponen React (SSR aman: server selalu false).
 */
import { useSyncExternalStore } from "react";

export const PHONE_MAX_WIDTH = 640;
export const PHONE_MAX_ASPECT = 0.85;

export function isPhoneViewport(width: number, height: number): boolean {
  return height > 0 && width < PHONE_MAX_WIDTH && width / height < PHONE_MAX_ASPECT;
}

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}
const getSnapshot = () => isPhoneViewport(window.innerWidth, window.innerHeight);
const getServerSnapshot = () => false;

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
