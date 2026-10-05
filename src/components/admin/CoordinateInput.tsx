"use client";

import { useState } from 'react';
import { Compass, ClipboardPaste, AlertTriangle } from 'lucide-react';

/**
 * Reusable coordinate entry for admin forms.
 *
 * Features:
 * - "Paste coordinate" field: accepts "lat, lng" (also tolerates spaces,
 *   parentheses, and a leading "@") as copied from Google Maps.
 * - Separate lat/lng numeric inputs.
 * - Range validation: lat ∈ [-90,90], lng ∈ [-180,180].
 * - Swapped lat/lng heuristic warning (common data-entry mistake).
 * - Inline error/warning messages (dark + yellow theme).
 *
 * Controlled: parent owns lat/lng; onChange reports parsed numbers (or null
 * when the field is empty/invalid, so the parent can block submit).
 */

export interface CoordinateInputProps {
    lat: number | null;
    lng: number | null;
    onChange: (lat: number | null, lng: number | null) => void;
    // Rough bounds to detect swapped values (default: Indonesia).
    // Not a hard limit — just powers the "sepertinya tertukar" warning.
    plausibleLngRange?: [number, number];
}

function parseNum(v: string): number | null {
    const t = v.trim();
    if (t === '' || t === '-' || t === '.') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

export function isValidLat(lat: number | null): boolean {
    return lat !== null && lat >= -90 && lat <= 90;
}
export function isValidLng(lng: number | null): boolean {
    return lng !== null && lng >= -180 && lng <= 180;
}

export default function CoordinateInput({
    lat, lng, onChange, plausibleLngRange = [94, 142],
}: CoordinateInputProps) {
    // Keep raw strings so a user can type "-" or "-6." without it snapping to 0.
    const [latStr, setLatStr] = useState(lat != null ? String(lat) : '');
    const [lngStr, setLngStr] = useState(lng != null ? String(lng) : '');
    const [pasteStr, setPasteStr] = useState('');

    // Sync down when parent changes lat/lng externally (e.g. map click, geocode).
    // We compare to avoid clobbering the user's in-progress typing.
    if (lat != null && String(lat) !== latStr && Number(latStr) !== lat) {
        setLatStr(String(lat));
    }
    if (lng != null && String(lng) !== lngStr && Number(lngStr) !== lng) {
        setLngStr(String(lng));
    }

    const applyPaste = (raw: string) => {
        // Accept "lat, lng" / "lat lng" / "@lat,lng" / "(lat, lng)".
        const cleaned = raw.replace(/[()@]/g, ' ').replace(/[;]/g, ',').trim();
        const parts = cleaned.split(/[, ]+/).filter(Boolean);
        if (parts.length >= 2) {
            const a = parseNum(parts[0]);
            const b = parseNum(parts[1]);
            if (a != null && b != null) {
                setLatStr(String(a));
                setLngStr(String(b));
                onChange(a, b);
                setPasteStr('');
                return;
            }
        }
        // leave pasteStr as-is so the user sees what they typed; show no crash
        setPasteStr(raw);
    };

    const latNum = parseNum(latStr);
    const lngNum = parseNum(lngStr);

    const latErr = latStr !== '' && !isValidLat(latNum) ? 'Latitude harus antara -90 dan 90' : '';
    const lngErr = lngStr !== '' && !isValidLng(lngNum) ? 'Longitude harus antara -180 dan 180' : '';

    // Swap heuristic: lat looks like a plausible lng (big magnitude) while lng
    // looks like a plausible lat (small). For Indonesia lat≈-11..6, lng≈94..142.
    const [lngLo, lngHi] = plausibleLngRange;
    const swapWarn =
        !latErr && !lngErr && latNum != null && lngNum != null &&
        (Math.abs(latNum) > 11 && lngNum >= -11 && lngNum <= 11 &&
            latNum >= lngLo && latNum <= lngHi)
            ? 'Latitude & Longitude sepertinya tertukar.'
            : '';

    return (
        <div className="bg-black/[0.04] dark:bg-black/40 rounded-2xl p-6 border border-black/10 dark:border-white/10 flex flex-col justify-center space-y-4">
            <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                    <Compass className="w-4 h-4 text-yellow-400" />
                </div>
                <span className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold tracking-wider">Koordinat Titik Pantau</span>
            </div>

            {/* Paste pair */}
            <div className="space-y-1.5">
                <label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1.5">
                    <ClipboardPaste className="w-3 h-3" /> Tempel Koordinat (lat, lng)
                </label>
                <input
                    type="text"
                    value={pasteStr}
                    onChange={e => setPasteStr(e.target.value)}
                    onPaste={e => { const t = e.clipboardData.getData('text'); if (t) { e.preventDefault(); applyPaste(t); } }}
                    onBlur={() => pasteStr && applyPaste(pasteStr)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyPaste(pasteStr); } }}
                    className="w-full bg-white dark:bg-slate-900 border border-white/15 focus:border-yellow-500 rounded-xl px-3 py-2 text-sm font-mono text-slate-900 dark:text-white tracking-wider outline-none"
                    placeholder="-6.200000, 106.816666"
                />
                <p className="text-[9px] text-slate-500">Tempel dari Google Maps, lalu lat &amp; lng terisi otomatis.</p>
            </div>

            {/* Latitude */}
            <div className="space-y-1.5">
                <label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold flex items-center justify-between">
                    <span>Latitude</span>
                    <span className="text-[9px] text-slate-500 font-mono">Contoh: -6.200000</span>
                </label>
                <input
                    type="number" step="any" min={-90} max={90}
                    value={latStr}
                    onChange={e => { setLatStr(e.target.value); onChange(parseNum(e.target.value), lngNum); }}
                    className={`w-full bg-white dark:bg-slate-900 border rounded-xl px-3 py-2 text-sm font-mono text-slate-900 dark:text-white tracking-wider outline-none ${latErr ? 'border-rose-500/60 focus:border-rose-500' : 'border-white/15 focus:border-yellow-500'}`}
                    placeholder="-6.200000"
                />
                {latErr && <p className="text-[10px] text-rose-400 font-medium">{latErr}</p>}
            </div>

            {/* Longitude */}
            <div className="space-y-1.5">
                <label className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold flex items-center justify-between">
                    <span>Longitude</span>
                    <span className="text-[9px] text-slate-500 font-mono">Contoh: 106.816666</span>
                </label>
                <input
                    type="number" step="any" min={-180} max={180}
                    value={lngStr}
                    onChange={e => { setLngStr(e.target.value); onChange(latNum, parseNum(e.target.value)); }}
                    className={`w-full bg-white dark:bg-slate-900 border rounded-xl px-3 py-2 text-sm font-mono text-slate-900 dark:text-white tracking-wider outline-none ${lngErr ? 'border-rose-500/60 focus:border-rose-500' : 'border-white/15 focus:border-yellow-500'}`}
                    placeholder="106.816666"
                />
                {lngErr && <p className="text-[10px] text-rose-400 font-medium">{lngErr}</p>}
            </div>

            {swapWarn && (
                <div className="flex items-start gap-2 text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="text-[10px] leading-relaxed">{swapWarn} Periksa kembali urutannya.</span>
                </div>
            )}

            <p className="text-[10px] text-slate-500 leading-relaxed pt-1">
                * Klik pada peta untuk pinpoint, tempel pasangan koordinat, atau isi manual.
            </p>
        </div>
    );
}
