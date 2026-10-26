"use client";

/**
 * FootprintEditor — gambar poligon bangunan proyek di atas citra satelit.
 *
 * Poligon disimpan di Location.footprint dan ditampilkan sebagai blok 3D di
 * peta publik (/map, /shared). Dipakai di tab Lokasi halaman proyek.
 *
 * - Mode lihat : peta + poligon tersimpan (read-only).
 * - Mode edit  : klik peta untuk menambah titik sudut, klik titik untuk
 *                menghapusnya. Minimal 3 titik. Menyimpan 0 titik = hapus footprint.
 *
 * Leaflet (bukan MapLibre) dipakai di sini karena sudah menjadi pola halaman
 * pemilih koordinat admin. Koordinat Leaflet = [lat, lng] (kebalikan MapLibre).
 * Wajib dimuat dengan next/dynamic { ssr: false } oleh pemakainya.
 */

import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, Check, X, Undo2, Trash2, Pencil, Box } from 'lucide-react';

export interface FootprintPoint { lat: number; lng: number; }

interface Props {
    /** Titik lokasi proyek (pusat peta & penanda hijau). */
    lat: number;
    lng: number;
    footprint: FootprintPoint[];
    height?: number;
    canEdit: boolean;
    /** Simpan ke server. Harus melempar error bila gagal (editor tetap terbuka). */
    onSave: (points: FootprintPoint[], height: number | null) => Promise<void>;
}

const DEFAULT_HEIGHT = 12; // meter (± 3 lantai)
const MIN_POINTS = 3;
const ESRI_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

function ClickToAdd({ enabled, onAdd }: { enabled: boolean; onAdd: (p: FootprintPoint) => void }) {
    useMapEvents({
        click(e) {
            if (enabled) onAdd({ lat: e.latlng.lat, lng: e.latlng.lng });
        },
    });
    return null;
}

export default function FootprintEditor({ lat, lng, footprint, height, canEdit, onSave }: Props) {
    const [editing, setEditing] = useState(false);
    const [points, setPoints] = useState<FootprintPoint[]>(footprint);
    const [heightText, setHeightText] = useState(String(height ?? DEFAULT_HEIGHT));
    const [saving, setSaving] = useState(false);

    const positions = useMemo(() => points.map((p) => [p.lat, p.lng] as [number, number]), [points]);

    // Pusat peta: titik tengah footprint tersimpan, atau titik proyek bila kosong.
    const center = useMemo<[number, number]>(() => {
        if (footprint.length > 0) {
            const la = footprint.reduce((a, p) => a + p.lat, 0) / footprint.length;
            const ln = footprint.reduce((a, p) => a + p.lng, 0) / footprint.length;
            return [la, ln];
        }
        return [lat, lng];
    }, [footprint, lat, lng]);

    const heightValue = Number(heightText);
    const heightValid = Number.isFinite(heightValue) && heightValue >= 1 && heightValue <= 300;
    // 0 titik = hapus footprint; selain itu minimal 3 titik.
    const pointsValid = points.length === 0 || points.length >= MIN_POINTS;
    const canSave = pointsValid && (points.length === 0 || heightValid);

    const startEdit = () => {
        setPoints(footprint);
        setHeightText(String(height ?? DEFAULT_HEIGHT));
        setEditing(true);
    };
    const cancel = () => {
        setPoints(footprint);
        setHeightText(String(height ?? DEFAULT_HEIGHT));
        setEditing(false);
    };
    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            await onSave(points, points.length === 0 ? null : heightValue);
            setEditing(false);
        } catch {
            /* pesan error ditampilkan oleh pemanggil; editor tetap terbuka */
        } finally {
            setSaving(false);
        }
    };

    const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 min-h-11 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none';
    const btnGhost = `${btn} bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300`;

    return (
        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5" aria-hidden="true" /> Footprint Bangunan (3D di Peta)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1">
                        Gambar bentuk bangunan proyek. Di peta, bentuk ini tampil sebagai blok 3D berwarna divisi.
                    </p>
                </div>
                {canEdit && !editing && (
                    <button type="button" onClick={startEdit} className={btnGhost}>
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        {footprint.length > 0 ? 'Edit' : 'Gambar'}
                    </button>
                )}
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 h-[360px] sm:h-[420px] bg-slate-900">
                <MapContainer
                    center={center}
                    zoom={18}
                    maxZoom={21}
                    scrollWheelZoom
                    className={`w-full h-full ${editing ? 'cursor-crosshair' : ''}`}
                    attributionControl={false}
                >
                    <TileLayer url={ESRI_SAT} maxNativeZoom={17} maxZoom={21} attribution="Tiles © Esri" />
                    <ClickToAdd enabled={editing} onAdd={(p) => setPoints((prev) => [...prev, p])} />

                    {positions.length >= MIN_POINTS && (
                        <Polygon positions={positions} pathOptions={{ color: '#f59e0b', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.3 }} />
                    )}
                    {positions.length === 2 && <Polyline positions={positions} pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '4 4' }} />}

                    {/* Titik lokasi proyek (referensi) */}
                    <CircleMarker center={[lat, lng]} radius={6} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }} interactive={false} />

                    {/* Titik sudut: saat edit, klik untuk menghapus */}
                    {editing && points.map((p, i) => (
                        <CircleMarker
                            key={`${i}-${p.lat}-${p.lng}`}
                            center={[p.lat, p.lng]}
                            radius={7}
                            bubblingMouseEvents={false}
                            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }}
                            eventHandlers={{ click: () => setPoints((prev) => prev.filter((_, j) => j !== i)) }}
                        />
                    ))}
                </MapContainer>
                {editing && (
                    <div className="absolute left-3 bottom-3 right-3 z-[500] pointer-events-none">
                        <div className="inline-block px-3 py-1.5 rounded-xl bg-black/70 text-white text-[11px] font-semibold backdrop-blur">
                            {points.length} titik · klik peta untuk menambah titik, klik titik untuk menghapus
                        </div>
                    </div>
                )}
            </div>

            {!editing && (
                <p className="text-xs text-slate-500">
                    {footprint.length > 0
                        ? `Tersimpan: ${footprint.length} titik, tinggi ${height ?? DEFAULT_HEIGHT} m.`
                        : 'Belum ada footprint. Titik hijau = lokasi proyek di peta.'}
                </p>
            )}

            {editing && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="block">
                            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Tinggi blok (meter)</span>
                            <input
                                type="number"
                                min={1}
                                max={300}
                                step="0.5"
                                value={heightText}
                                onChange={(e) => setHeightText(e.target.value)}
                                className="w-32 px-3 py-2 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:border-[rgba(var(--div-accent-rgb),0.5)] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                                aria-invalid={points.length > 0 && !heightValid}
                            />
                        </label>
                        <button type="button" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={points.length === 0} className={btnGhost}>
                            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> Urungkan titik
                        </button>
                        <button type="button" onClick={() => setPoints([])} disabled={points.length === 0} className={`${btn} bg-rose-500/10 hover:bg-rose-500/20 text-rose-500`}>
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Hapus semua
                        </button>
                    </div>

                    {!pointsValid && (
                        <p className="text-xs text-amber-500" role="status">Minimal {MIN_POINTS} titik untuk membentuk bangunan.</p>
                    )}
                    {points.length > 0 && !heightValid && (
                        <p className="text-xs text-amber-500" role="status">Tinggi harus antara 1 dan 300 meter.</p>
                    )}
                    {points.length === 0 && footprint.length > 0 && (
                        <p className="text-xs text-slate-500" role="status">Semua titik dihapus: menyimpan akan menghapus footprint dari peta.</p>
                    )}

                    <div className="flex gap-2">
                        <button type="button" onClick={cancel} disabled={saving} className={btnGhost}>
                            <X className="w-3.5 h-3.5" aria-hidden="true" /> Batal
                        </button>
                        <button type="button" onClick={save} disabled={saving || !canSave} className={`${btn} div-accent-solid hover:brightness-110 text-slate-950`}>
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />} Simpan
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
