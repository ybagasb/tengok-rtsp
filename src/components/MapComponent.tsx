"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Map, { Marker, Popup, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import axios from 'axios';
import { Home, LayoutGrid, MapPin, Search, Loader2, X as CloseIcon, Signal, SignalZero, Layers, Mountain, Compass, Plus, Minus, Filter, Globe, FolderTree, Sun, Moon,
    School, Construction, TrafficCone, Waves, Droplets, Droplet, Zap, Flame, AlertTriangle, BusFront, Building2, type LucideIcon } from 'lucide-react';

// Ikon marker peta per kategori proyek. Kunci = Category.identifier.
const CATEGORY_ICON: Record<string, LucideIcon> = {
    'sekolah-rakyat': School,
    'jembatan': Construction,
    'jalan-tol': TrafficCone,
    'bendungan': Waves,
    'sungai-pantai': Waves,
    'irigasi': Droplets,
    'jiat': Droplets,
    'pipa-air': Droplets,
    'embung': Droplet,
    'pltm': Zap,
    'pipa-gas': Flame,
    'bencana': AlertTriangle,
    'brt': BusFront,
    'sewerage': Droplets,
    'lainnya': Building2,
};
function categoryIcon(category?: string): LucideIcon {
    return (category && CATEGORY_ICON[category]) || MapPin;
}
import { AnimatePresence, motion } from 'framer-motion';
import CameraPanel from './CameraPanel';
import ResourceMonitor from './ResourceMonitor';
import CctvNotices from './CctvNotices';
import BrandLoader from './BrandLoader';
import { useCameraStatusSSE } from '@/hooks/useCameraStatusSSE';
import { MAP_STYLES, MAP_STYLE_META, type MapStyleId } from '@/lib/mapStyles';
import { useTheme } from '@/components/ThemeProvider';
import { getDivisionCssVars } from '@/lib/divisionTheme';

interface LocationData {
    _id: string;
    name: string;
    category: string;
    description: string;
    image: string;
    lat: number;
    lng: number;
    pmName: string;
    pmPhone: string;
    cameras: any[];
    onlineCount: number;
    offlineCount: number;
    // Hierarki organisasi
    division?: 'DIVISI 1' | 'DIVISI 2' | 'DIVISI 3';
    projectType?: 'JO' | 'NON_JO';
    // Ikhtiar
    cpi?: number;
    spi?: number;
    // Finansial (ringkas)
    tagihanBruto?: number;
    cashIn?: number;
    cashOut?: number;
    saldoKas?: number;
    saldoHutang?: number;
    bad?: number;
    piutang?: number;
    ccc?: number;
    bebanKonstruksi?: number;
    hasilUsaha?: { pendapatan: number; biaya: number; laba: number };
    // Operasi (ringkas)
    pu?: number;
    bk?: number;
    lk?: number;
    // Identitas proyek
    penggunaJasa?: string;
    pengawas?: string;
    penyediaJasa?: string;
    contractor?: string;
    status?: string;
    // Kontrak
    contractNumber?: string;
    contractValue?: number;
    startDate?: string;
    endDate?: string;
    // Progress
    progressPercent?: number;
    progressRencana?: number;
    progressDeviasi?: number;
    // Operasional
    lingkupPekerjaan?: string[];
    sumberDaya?: { namaAlat: string; jumlah: number; kategori?: string; satuan?: string }[];
    milestones?: { title: string; done: boolean; date?: string; progress?: number }[];
    isuStrategis?: { isu: string; usulan: string }[];
    kendala?: { masalah: string; status: string }[];
    monitoringPengadaan?: { nama: string; persentase: number }[];
    changeManagement?: { judul: string; jenis?: 'PERUBAHAN_HARGA' | 'PERUBAHAN_LINGKUP' | 'KLAIM' | 'LEGAL_ISSUE' | 'LAINNYA'; deskripsi?: string; dampak?: string; mitigasi?: string; nilai?: number; tanggal?: string; target?: string; pic?: string; status: 'USULAN' | 'DISETUJUI' | 'DITOLAK'; dariKendala?: boolean }[];
    updatedAt?: string;
}

// Indonesia overview default (lng, lat) — note MapLibre uses [lng, lat].
const DEFAULT_CENTER: [number, number] = [113.4942317, -4.944993];
const DEFAULT_ZOOM = 4.5;
const FOCUS_ZOOM = 15;
const FOCUS_PITCH = 45; // 3D tilt when focusing a location
const OVERVIEW_PITCH = 0;

export default function MapComponent({
    category: propCategory,
    division: propDivision,
    allowedLocationIds,
    sharedMode = false,
}: {
    category?: string | null;
    division?: string | null;
    allowedLocationIds?: string[];
    sharedMode?: boolean;
}) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const category = propCategory || searchParams.get('category');
    const division = propDivision || searchParams.get('division');
    const mapRef = useRef<MapRef | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null); // kontainer terluar peta (untuk cegah zoom halaman)

    // Project scope on the map:
    // - 'context' (DEFAULT): only the opened division + category (from the URL).
    // - 'division': every category within the opened division (lintas kategori).
    // - 'all': every Brantas Abipraya project, lintas divisi (no filter).
    // Shared pages always stay scoped to their allowedLocationIds, so this
    // toggle is only shown/used in normal mode.
    const hasCategory = Boolean(category);
    const hasDivision = Boolean(division);
    const hasContext = hasCategory || hasDivision;
    const [scopeMode, setScopeMode] = useState<'context' | 'division' | 'all'>(category ? 'context' : 'division');
    const [scopeMenuOpen, setScopeMenuOpen] = useState(false);

    // The scope actually used when fetching:
    // - 'all'      → clear both filters (lintas divisi).
    // - 'division' → keep division, drop category (lintas kategori).
    // - 'context'  → keep both.
    const effectiveCategory = scopeMode === 'context' ? category : null;
    const effectiveDivision = scopeMode === 'all' ? null : division;

    // Tema UI (panel/kontrol/sidebar) — dipakai tombol toggle di blok kontrol peta.
    const { theme, toggle } = useTheme();

    const [locations, setLocations] = useState<LocationData[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
    const [hovered, setHovered] = useState<LocationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [mapStyleId, setMapStyleId] = useState<MapStyleId>('satellite');
    const [styleMenuOpen, setStyleMenuOpen] = useState(false);
    const compassRef = useRef<SVGSVGElement | null>(null); // compass needle, rotated via DOM (no re-render)

    const [initialView, setInitialView] = useState({
        longitude: DEFAULT_CENTER[0],
        latitude: DEFAULT_CENTER[1],
        zoom: DEFAULT_ZOOM,
        pitch: OVERVIEW_PITCH,
        bearing: 0,
    });

    const { realtimeStatuses, setRealtimeStatuses, lastCheckedTimes } = useCameraStatusSSE();

    // Parents (e.g. the shared page) pass allowedLocationIds as a fresh array
    // literal on every render. Derive a STABLE string key so the fetch effect
    // below only re-runs when the actual ids change — not on every parent
    // re-render (which the 1s countdown timer would otherwise trigger, causing
    // an infinite fetch/setState loop).
    const allowedKey = useMemo(
        () => (allowedLocationIds ?? []).join(','),
        [allowedLocationIds]
    );

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);

    // Compute majority-online status for a location (uses realtime overrides).
    const isMajorityOnline = useCallback((loc: LocationData) => {
        let on = 0, off = 0;
        (loc.cameras || []).forEach((cam: any) => {
            if ((realtimeStatuses[cam._id] || cam.status) === 'online') on++;
            else off++;
        });
        return on >= off;
    }, [realtimeStatuses]);

    // ── Fly camera helper ────────────────────────────────────────────────────
    const flyTo = useCallback((lng: number, lat: number, opts?: { zoom?: number; pitch?: number }) => {
        const map = mapRef.current;
        if (!map) return;
        map.flyTo({
            center: [lng, lat],
            zoom: opts?.zoom ?? FOCUS_ZOOM,
            pitch: opts?.pitch ?? FOCUS_PITCH,
            duration: 1600,
            essential: true,
        });
    }, []);

    // Click outside to close search suggestions.
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Cegah ZOOM HALAMAN BROWSER (Ctrl+roda mouse / pinch trackpad) saat kursor
    // berada di komponen SEKITAR peta (panel samping & kontrol), bukan di kanvas
    // peta. Gestur zoom halaman tiba sebagai `wheel` dengan ctrlKey=true (termasuk
    // pinch trackpad) plus `gesturestart`/`gesturechange` di Safari. Zoom MapLibre
    // memakai roda polos (tanpa Ctrl), jadi memblok hanya ctrlKey tidak mengganggu
    // scroll-zoom peta; kanvas peta juga sengaja dikecualikan agar perilakunya
    // eksplisit. Listener WAJIB non-pasif ({ passive: false }) agar preventDefault
    // tidak diabaikan. Scroll biasa tidak diblok (hanya saat ctrlKey).
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const isOverMapCanvas = (target: EventTarget | null) =>
            target instanceof HTMLElement &&
            target.closest('.maplibregl-canvas, .maplibregl-canvas-container, .maplibregl-map') !== null;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey && !isOverMapCanvas(e.target)) {
                e.preventDefault();
            }
        };
        const handleGesture = (e: Event) => {
            if (!isOverMapCanvas(e.target)) {
                e.preventDefault();
            }
        };

        root.addEventListener('wheel', handleWheel, { passive: false });
        root.addEventListener('gesturestart', handleGesture as EventListener, { passive: false });
        root.addEventListener('gesturechange', handleGesture as EventListener, { passive: false });
        return () => {
            root.removeEventListener('wheel', handleWheel);
            root.removeEventListener('gesturestart', handleGesture as EventListener);
            root.removeEventListener('gesturechange', handleGesture as EventListener);
        };
    }, []);

    // Fetch category defaults for initial map center/zoom.
    useEffect(() => {
        if (!category || sharedMode) return;
        axios.get('/api/categories')
            .then(res => {
                const cats = res.data || [];
                const cat = cats.find((c: any) => c.identifier === category);
                if (cat?.defaultLat && cat?.defaultLng) {
                    setInitialView(v => ({
                        ...v,
                        longitude: cat.defaultLng,
                        latitude: cat.defaultLat,
                        zoom: cat.defaultZoom || v.zoom,
                    }));
                    // If the map is already mounted, ease to the new default.
                    mapRef.current?.jumpTo({
                        center: [cat.defaultLng, cat.defaultLat],
                        zoom: cat.defaultZoom || DEFAULT_ZOOM,
                    });
                }
            })
            .catch(() => {});
    }, [category, sharedMode]);

    // Fetch locations + on first load trigger probe + prewarm.
    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();
        let hasProbed = false;

        if (!category && !division && !sharedMode) {
            router.push('/categories');
            return;
        }

        const fetchLocations = async () => {
            try {
                const params = new URLSearchParams();
                if (effectiveCategory) params.set('category', effectiveCategory);
                if (effectiveDivision) params.set('division', effectiveDivision);
                const qs = params.toString();
                const apiUrl = qs ? `/api/locations?${qs}` : '/api/locations';
                const res = await axios.get(apiUrl, { signal: controller.signal });
                let rawLocations = res.data.data;
                if (allowedLocationIds && allowedLocationIds.length > 0) {
                    rawLocations = rawLocations.filter((loc: any) => allowedLocationIds.includes(loc._id));
                }
                const fetched = rawLocations.map((loc: any) => {
                    let onlineCount = 0, offlineCount = 0;
                    (loc.cameras || []).forEach((cam: any) => {
                        if (cam.status === 'online') onlineCount++;
                        else offlineCount++;
                    });
                    return { ...loc, onlineCount, offlineCount };
                });

                if (!isMounted) return;
                setLocations(fetched);

                if (!hasProbed) {
                    hasProbed = true;
                    const allCameraIds = fetched.flatMap((loc: any) => (loc.cameras || []).map((cam: any) => cam._id));
                    const shouldProbe = scopeMode !== 'division' && scopeMode !== 'all';
                    if (shouldProbe && allCameraIds.length > 0) {
                        axios.post('/api/cameras/probe-now', { cameraIds: allCameraIds }).catch(() => {});
                    }
                    if (!sharedMode) {
                        const onlineIds = fetched
                            .flatMap((loc: any) => (loc.cameras || []).filter((c: any) => c.status === 'online').map((c: any) => c._id))
                            .slice(0, 20);
                        if (onlineIds.length > 0) {
                            axios.post('/api/streams/prewarm', { cameraIds: onlineIds }).catch(() => {});
                        }
                    }
                }
            } catch (error) {
                if (axios.isCancel(error)) return;
                console.error('Failed to fetch locations', error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchLocations();
        const intervalId = setInterval(fetchLocations, 30000);
        return () => {
            isMounted = false;
            controller.abort();
            clearInterval(intervalId);
        };
    // allowedKey (stable string) instead of allowedLocationIds (unstable array).
    // scopeMode (string primitive) is safe in deps; effectiveCategory/Division
    // are derived from it so they don't need to be listed separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, division, router, sharedMode, allowedKey, scopeMode]);

    // Keep the selectedLocation object fresh when the locations list is
    // replaced (e.g. after a poll). Realtime status is read live elsewhere
    // (isMajorityOnline / LocationTooltip), so this must NOT depend on
    // realtimeStatuses — doing so re-ran on every SSE tick and caused churn.
    useEffect(() => {
        setSelectedLocation(prev => {
            if (!prev) return prev;
            return locations.find(l => l._id === prev._id) || prev;
        });
    }, [locations]);

    // When the side panel opens/closes the map container width changes. Tell
    // MapLibre to resize once (next frame) so it adjusts cleanly instead of
    // jittering while flyTo animates.
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const id = requestAnimationFrame(() => map.resize());
        return () => cancelAnimationFrame(id);
    }, [selectedLocation]);

    // ── Search (local project filtering) ───────────────────────────────────────
    useEffect(() => {
        if (searchQuery.length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            setSelectedIndex(-1);
            return;
        }
        const t = setTimeout(() => {
            setIsSearching(true);
            setShowSuggestions(true);
            const matches = locations
                .filter(loc => loc.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(loc => ({ id: loc._id, display_name: loc.name, lat: loc.lat, lon: loc.lng, fullData: loc }));
            setSuggestions(matches);
            setSelectedIndex(matches.length > 0 ? 0 : -1);
            setIsSearching(false);
        }, 250);
        return () => clearTimeout(t);
    }, [searchQuery, locations]);

    const openLocation = useCallback((loc: LocationData) => {
        setSelectedLocation(loc);
        setHovered(null);
        flyTo(loc.lng, loc.lat, { zoom: FOCUS_ZOOM, pitch: FOCUS_PITCH });
    }, [flyTo]);

    const handleSelectSuggestion = (s: any) => {
        if (!s?.fullData) return;
        setSearchQuery(s.display_name);
        setShowSuggestions(false);
        setSelectedIndex(-1);
        openLocation(s.fullData);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(p => (p < suggestions.length - 1 ? p + 1 : p)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(p => (p > 0 ? p - 1 : p)); }
        else if (e.key === 'Enter') {
            if (selectedIndex >= 0) handleSelectSuggestion(suggestions[selectedIndex]);
            else if (suggestions.length > 0) handleSelectSuggestion(suggestions[0]);
        } else if (e.key === 'Escape') setShowSuggestions(false);
    };

    const closePanel = useCallback(() => {
        setSelectedLocation(null);
        // Zoom-out kembali ke tampilan awal (pusat & zoom default kategori/overview)
        // agar SEMUA marker kembali terlihat, bukan sekadar menutup panel.
        mapRef.current?.flyTo({
            center: [initialView.longitude, initialView.latitude],
            zoom: initialView.zoom,
            pitch: OVERVIEW_PITCH,
            bearing: 0,
            duration: 1000,
            essential: true,
        });
    }, [initialView]);



    // Compass drag: drag left/right to rotate (bearing), up/down to tilt (pitch).
    // A short click (no drag) resets north + level.
    const handleCompassPointerDown = useCallback((e: React.PointerEvent) => {
        const map = mapRef.current;
        if (!map) return;
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

        const startX = e.clientX;
        const startY = e.clientY;
        const startBearing = map.getBearing();
        const startPitch = map.getPitch();
        let moved = false;

        const onMoveDrag = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
            // dx → bearing (deg per px), dy → pitch (clamped 0..70)
            const nextBearing = startBearing + dx * 0.5;
            const nextPitch = Math.max(0, Math.min(70, startPitch - dy * 0.4));
            map.jumpTo({ bearing: nextBearing, pitch: nextPitch });
        };
        const onUp = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', onMoveDrag);
            window.removeEventListener('pointerup', onUp);
            // Treat as a click (reset north) if the pointer barely moved.
            if (!moved) {
                map.easeTo({ bearing: 0, pitch: OVERVIEW_PITCH, duration: 600 });
            }
            void ev;
        };
        window.addEventListener('pointermove', onMoveDrag);
        window.addEventListener('pointerup', onUp);
    }, []);

    if (!category && !division && !sharedMode) return null;

    const effectiveDiv = scopeMode === 'all' ? null : division;
    const rootStyle = getDivisionCssVars(effectiveDiv) as React.CSSProperties;

    return (
        <div ref={rootRef} style={rootStyle} className="flex h-screen w-full bg-slate-100 dark:bg-slate-950 overflow-hidden relative">
            <style>{customStyles}</style>

            {/* Loader bermerek selama data lokasi belum selesai dimuat. */}
            {loading && <BrandLoader label={sharedMode ? 'Memuat' : 'Memuat Peta'} />}

            {/* ── MAP ─────────────────────────────────────────────────────────── */}
            {/* No width transition here: animating the map container's width while
                flyTo runs made MapLibre jitter/jump. The side panel animates on
                its own; the map just resizes once (see effect below). */}
            <div className={`absolute inset-0 ${selectedLocation ? 'md:pr-[520px]' : ''}`}>
                {!loading && (
                    <Map
                        ref={mapRef}
                        initialViewState={initialView}
                        mapStyle={MAP_STYLES[mapStyleId]}
                        attributionControl={false}
                        // Satellite tiles are capped at source z17 (see mapStyles.ts)
                        // and MapLibre overzooms from there, so no missing-tile text
                        // appears. Pitch/rotate/zoom all work normally now.
                        maxPitch={70}
                        maxZoom={22}
                        dragRotate
                        style={{ width: '100%', height: '100%' }}
                        onClick={() => { setStyleMenuOpen(false); }}
                        onLoad={(e) => {
                            // Rotate the compass needle via DOM (ref) on every map
                            // rotate — NOT via React state. Using state here re-rendered
                            // the whole component on every animation frame of flyTo,
                            // which fought the camera animation and caused jitter/jumps.
                            const map = e.target;
                            const sync = () => {
                                if (compassRef.current) {
                                    compassRef.current.style.transform = `rotate(${-map.getBearing()}deg)`;
                                }
                            };
                            map.on('rotate', sync);
                            sync();
                        }}
                    >
                        {/* Location markers (custom HTML pins) */}
                        {locations.map((loc) => {
                            const online = isMajorityOnline(loc);
                            return (
                                <Marker
                                    key={loc._id}
                                    longitude={loc.lng}
                                    latitude={loc.lat}
                                    anchor="bottom"
                                    onClick={(e) => {
                                        e.originalEvent.stopPropagation();
                                        openLocation(loc);
                                    }}
                                >
                                    <div
                                        className="cursor-pointer group/marker"
                                        onMouseEnter={() => setHovered(loc)}
                                        onMouseLeave={() => setHovered(null)}
                                    >
                                        <MapPin3D online={online} count={(loc.cameras || []).length} category={loc.category} isSelected={selectedLocation?._id === loc._id} />
                                    </div>
                                </Marker>
                            );
                        })}

                        {/* Hover tooltip popup */}
                        {hovered && (
                            <Popup
                                longitude={hovered.lng}
                                latitude={hovered.lat}
                                anchor="bottom"
                                offset={38}
                                closeButton={false}
                                closeOnClick={false}
                                className="tengok-popup"
                            >
                                <LocationTooltip loc={hovered} realtimeStatuses={realtimeStatuses} lastCheckedTimes={lastCheckedTimes} />
                            </Popup>
                        )}

                    </Map>
                )}
            </div>

            {/* ── TOP OVERLAY: nav + search + category ─────────────────────────── */}
            <div className="absolute top-4 sm:top-6 left-2 sm:left-6 right-2 sm:right-6 z-[400] flex items-start justify-between pointer-events-none gap-2 sm:gap-3">
                {!sharedMode && (
                    <div className={`flex flex-col gap-2 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] pointer-events-auto ${selectedLocation ? 'opacity-0 -translate-x-6 pointer-events-none' : 'opacity-100 translate-x-0'}`}>
                        <button
                            onClick={() =>
                                router.push(
                                    division
                                        ? `/categories?div=${encodeURIComponent(division)}`
                                        : '/categories'
                                )
                            }
                            className="p-3 sm:p-3.5 bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all group shrink-0"
                            title="Kembali ke Kategori"
                        >
                            <Home className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
                        </button>
                        <button
                            onClick={() => {
                                // Forward the current project scope so multiview
                                // defaults the same way.
                                const p = new URLSearchParams();
                                if (scopeMode !== 'all') {
                                    if (division) p.set('division', division);
                                    if (scopeMode === 'context' && category) p.set('category', category);
                                }
                                const qs = p.toString();
                                router.push(qs ? `/multiview?${qs}` : '/multiview');
                            }}
                            className="p-3 sm:p-3.5 bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 div-accent-text hover:bg-slate-200 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all group shrink-0"
                            title="Ke Halaman Multi-View"
                        >
                            <LayoutGrid className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </button>

                        {/* Project scope filter: proyek ini / se-divisi / lintas divisi */}
                        <div className="relative">
                            <button
                                onClick={() => setScopeMenuOpen(o => !o)}
                                className={`relative p-3 sm:p-3.5 bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border transition-all group shrink-0 hover:bg-slate-200 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 ${
                                    scopeMode !== 'context' ? 'border-[rgba(var(--div-accent-rgb),0.4)] div-accent-text' : 'border-black/10 dark:border-white/10 text-slate-900 dark:text-white'
                                }`}
                                title="Filter proyek yang ditampilkan"
                            >
                                <Filter className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                {scopeMode !== 'context' && (
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full div-accent-solid border-2 border-slate-900" />
                                )}
                            </button>
                            <AnimatePresence>
                                {scopeMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10, scale: 0.95 }}
                                        animate={{ opacity: 1, x: 0, scale: 1 }}
                                        exit={{ opacity: 0, x: -10, scale: 0.95 }}
                                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                        className="absolute left-full ml-2 top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden w-60"
                                    >
                                        <div className="px-4 py-2.5 border-b border-black/5 dark:border-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            Tampilkan Proyek
                                        </div>
                                        {/* 1. Proyek ini (divisi + kategori yang dibuka) */}
                                        <button
                                            onClick={() => {
                                                setScopeMode('context');
                                                setScopeMenuOpen(false);
                                            }}
                                            disabled={!hasCategory}
                                            className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                                                scopeMode === 'context' ? 'bg-[rgba(var(--div-accent-rgb),0.15)] div-accent-text' : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'
                                            } ${!hasCategory ? 'opacity-40 cursor-not-allowed' : ''}`}
                                        >
                                            <FolderTree className="w-4 h-4 shrink-0" />
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold uppercase tracking-wider">Kategori Ini</div>
                                                <div className="text-[10px] text-slate-500 truncate">
                                                    {[division, category].filter(Boolean).join(' • ') || 'Konteks saat ini'}
                                                </div>
                                            </div>
                                        </button>
                                        {/* 2. Se-divisi (semua kategori dalam divisi yang dibuka) */}
                                        <button
                                            onClick={() => {
                                                setScopeMode('division');
                                                setScopeMenuOpen(false);
                                                setSelectedLocation(null);
                                            }}
                                            disabled={!hasDivision}
                                            className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                                                scopeMode === 'division' ? 'bg-[rgba(var(--div-accent-rgb),0.15)] div-accent-text' : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'
                                            } ${!hasDivision ? 'opacity-40 cursor-not-allowed' : ''}`}
                                        >
                                            <Layers className="w-4 h-4 shrink-0" />
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold uppercase tracking-wider">Satu Divisi</div>
                                                <div className="text-[10px] text-slate-500 truncate">
                                                    Semua kategori di {division || 'divisi ini'}
                                                </div>
                                            </div>
                                        </button>
                                        {/* 3. Lintas divisi (semua proyek Brantas Abipraya) */}
                                        <button
                                            onClick={() => {
                                                setScopeMode('all');
                                                setScopeMenuOpen(false);
                                                setSelectedLocation(null);
                                                // Zoom back out so every marker is visible.
                                                mapRef.current?.flyTo({
                                                    center: DEFAULT_CENTER,
                                                    zoom: DEFAULT_ZOOM,
                                                    pitch: OVERVIEW_PITCH,
                                                    duration: 1200,
                                                    essential: true,
                                                });
                                            }}
                                            className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                                                scopeMode === 'all' ? 'bg-[rgba(var(--div-accent-rgb),0.15)] div-accent-text' : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'
                                            }`}
                                        >
                                            <Globe className="w-4 h-4 shrink-0" />
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold uppercase tracking-wider">Semua Proyek</div>
                                                <div className="text-[10px] text-slate-500 truncate">Lintas divisi (Brantas Abipraya)</div>
                                            </div>
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}

                {!sharedMode && (
                    <div ref={searchRef} className={`flex-1 sm:max-w-xl sm:mx-8 relative pointer-events-auto transition-all duration-700 ${selectedLocation ? 'opacity-0 md:opacity-100 pointer-events-none md:pointer-events-auto' : 'opacity-100'}`}>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 dark:text-slate-400 group-focus-within:text-[var(--div-accent)] transition-colors">
                                {isSearching ? <Loader2 className="w-4 h-4 animate-spin div-accent-text" /> : <Search className="w-4 h-4" />}
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => setShowSuggestions(true)}
                                onKeyDown={handleKeyDown}
                                placeholder={`Cari ${category || (division ? `proyek ${division}` : 'lokasi')}...`}
                                className="w-full bg-white/85 dark:bg-slate-900/80 backdrop-blur-2xl text-slate-900 dark:text-white placeholder:text-slate-400 text-xs sm:text-sm py-3 sm:py-4 pl-9 sm:pl-11 pr-10 sm:pr-12 rounded-2xl border border-black/10 dark:border-white/10 focus:border-[rgba(var(--div-accent-rgb),0.5)] focus:ring-4 focus:ring-[rgba(var(--div-accent-rgb),0.1)] transition-all outline-none shadow-2xl"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => { setSearchQuery(''); setSuggestions([]); setShowSuggestions(false); }}
                                    className="absolute inset-y-0 right-2 flex items-center px-2 group/clear transition-all"
                                    title="Hapus pencarian"
                                >
                                    <div className="p-1.5 rounded-full bg-white/5 group-hover/clear:bg-red-500/20 text-slate-500 dark:text-slate-400 group-hover/clear:text-red-400 transition-all border border-black/5 dark:border-white/5">
                                        <CloseIcon className="w-3.5 h-3.5" />
                                    </div>
                                </button>
                            )}
                        </div>

                        {showSuggestions && searchQuery.length >= 3 && (
                            <div className="absolute top-full mt-3 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-2xl border border-black/10 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[600]">
                                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                    {suggestions.length > 0 ? suggestions.map((item, idx) => (
                                        <button
                                            key={`${item.id}-${idx}`}
                                            onClick={() => handleSelectSuggestion(item)}
                                            onMouseEnter={() => setSelectedIndex(idx)}
                                            className={`w-full px-5 py-3.5 flex items-center gap-4 transition-colors text-left group border-b border-black/5 dark:border-white/5 last:border-0 ${selectedIndex === idx ? 'bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                                        >
                                            <div className="p-2 rounded-lg shrink-0 bg-[rgba(var(--div-accent-rgb),0.1)]">
                                                <MapPin className="w-4 h-4 div-accent-text" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.display_name}</div>
                                                <div className="text-[10px] text-slate-500 truncate mt-0.5 font-medium">{item.fullData?.category ? `Kategori: ${item.fullData.category}` : 'Lokasi proyek'}</div>
                                            </div>
                                        </button>
                                    )) : !isSearching ? (
                                        <div className="px-5 py-8 text-center">
                                            <div className="text-slate-500 text-sm mb-1">Tidak ada hasil untuk</div>
                                            <div className="text-slate-900 dark:text-white font-bold text-sm truncate px-4">&quot;{searchQuery}&quot;</div>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {!sharedMode && (
                    <div className="hidden sm:flex px-4 sm:px-6 py-3.5 bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 text-slate-900 dark:text-white font-bold uppercase tracking-wider items-center gap-3 pointer-events-auto text-xs">
                        <div className="w-2 h-2 rounded-full div-accent-solid shadow-[0_0_12px_var(--div-glow)] animate-pulse" />
                        <span className="truncate max-w-[100px] sm:max-w-none">{
                            scopeMode === 'all' ? 'Semua Proyek'
                                : scopeMode === 'division' ? (division || 'Satu Divisi')
                                : (category || division || 'Semua Proyek')
                        }</span>
                    </div>
                )}
            </div>

            {/* ── MAP CONTROLS (right side, single column) ─────────────────────── */}
            {!sharedMode && (
                <div className={`absolute z-[500] flex flex-col gap-2 pointer-events-auto transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] bottom-6 sm:bottom-8 ${
                    selectedLocation
                        ? 'opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto right-4 md:right-[536px]'
                        : 'opacity-100 right-4'
                }`}>
                    {/* Style switcher */}
                    <div className="relative">
                        <button
                            onClick={() => setStyleMenuOpen(o => !o)}
                            className="w-11 h-11 flex items-center justify-center bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 div-accent-text hover:bg-slate-200 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all"
                            title="Ganti mode peta"
                        >
                            <Layers className="w-5 h-5" />
                        </button>
                        <AnimatePresence>
                            {styleMenuOpen && (
                                <motion.div
                                    initial={{ opacity: 0, x: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                    exit={{ opacity: 0, x: 10, scale: 0.95 }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                    className="absolute right-full mr-2 top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden w-32"
                                >
                                    {MAP_STYLE_META.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => { setMapStyleId(s.id); setStyleMenuOpen(false); }}
                                            className={`w-full px-4 py-3 text-left text-xs font-bold transition-colors ${mapStyleId === s.id ? 'bg-[rgba(var(--div-accent-rgb),0.15)] div-accent-text' : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Compass + Zoom + 3D — one grouped block */}
                    <div className="flex flex-col bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                        {/* Compass: drag to rotate/tilt (POV); click resets north + level */}
                        <button
                            onPointerDown={handleCompassPointerDown}
                            className="w-11 h-11 flex items-center justify-center text-slate-900 dark:text-white hover:bg-[rgba(var(--div-accent-rgb),0.15)] hover:text-[var(--div-accent)] active:scale-95 transition-all cursor-grab active:cursor-grabbing touch-none"
                            title="Seret untuk memutar/miringkan · klik untuk reset utara"
                        >
                            <Compass ref={compassRef} className="w-5 h-5 pointer-events-none" />
                        </button>
                        <div className="h-px bg-white/10" />
                        <button
                            onClick={() => mapRef.current?.zoomIn({ duration: 300 })}
                            className="w-11 h-11 flex items-center justify-center text-slate-900 dark:text-white hover:bg-[rgba(var(--div-accent-rgb),0.15)] hover:text-[var(--div-accent)] active:scale-95 transition-all"
                            title="Perbesar"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                        <div className="h-px bg-white/10" />
                        <button
                            onClick={() => mapRef.current?.zoomOut({ duration: 300 })}
                            className="w-11 h-11 flex items-center justify-center text-slate-900 dark:text-white hover:bg-[rgba(var(--div-accent-rgb),0.15)] hover:text-[var(--div-accent)] active:scale-95 transition-all"
                            title="Perkecil"
                        >
                            <Minus className="w-5 h-5" />
                        </button>
                        <div className="h-px bg-white/10" />
                        {/* Toggle 3D pitch */}
                        <button
                            onClick={() => mapRef.current?.easeTo({ pitch: (mapRef.current?.getPitch() || 0) > 10 ? 0 : FOCUS_PITCH, duration: 700 })}
                            className="w-11 h-11 flex items-center justify-center text-slate-900 dark:text-white hover:bg-[rgba(var(--div-accent-rgb),0.15)] hover:text-[var(--div-accent)] active:scale-95 transition-all"
                            title="Tampilan 3D"
                        >
                            <Mountain className="w-5 h-5" />
                        </button>
                        <div className="h-px bg-white/10" />
                        {/* Toggle tema UI (panel/kontrol/sidebar) — BUKAN gaya peta.
                            Gaya peta (satelit/streets) diatur layer toggle terpisah. */}
                        <button
                            onClick={toggle}
                            className="w-11 h-11 flex items-center justify-center text-slate-900 dark:text-white hover:bg-[rgba(var(--div-accent-rgb),0.15)] hover:text-[var(--div-accent)] active:scale-95 transition-all"
                            title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
                            aria-label={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
                        >
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            )}

            {/* CCTV notices */}
            <CctvNotices sharedMode={sharedMode} hidden={!!selectedLocation} />

            {/* Resource Monitor */}
            {!sharedMode && (
                <div className={selectedLocation ? 'hidden md:block' : 'block'}>
                    <ResourceMonitor />
                </div>
            )}

            {/* Watermark */}
            {!sharedMode && (
                <div className={`fixed bottom-4 z-[450] pointer-events-none transition-all duration-700 ${selectedLocation ? 'opacity-0 right-4' : 'opacity-100 right-20 sm:right-24'}`}>
                    <div className="flex items-center gap-2.5 bg-white/80 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl px-3.5 py-2.5 border border-black/5 dark:border-white/5 shadow-2xl">
                        {/* Logo biru untuk light mode, logo putih/kuning untuk dark mode */}
                        <img src="/LOGO_ABIPRAYA.png" alt="PT Brantas Abipraya" className="w-7 h-7 object-contain opacity-80 block dark:hidden" draggable={false} />
                        <img src="/abipraya_original.svg" alt="PT Brantas Abipraya" className="w-7 h-7 object-contain opacity-70 hidden dark:block" draggable={false} />
                        <div className="hidden sm:block">
                            <p className="text-[9px] font-bold text-slate-500 dark:text-white/50 uppercase tracking-[0.15em] leading-none">PT Brantas Abipraya</p>
                            <p className="text-[8px] font-medium text-slate-400 dark:text-white/25 uppercase tracking-wider mt-0.5">Smart Monitoring</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Side Panel */}
            <div className={`fixed inset-y-0 right-0 z-[1000] w-full md:w-[520px] bg-slate-100/90 dark:bg-slate-950/80 backdrop-blur-3xl border-l border-black/10 dark:border-white/5 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] transform transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${selectedLocation ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedLocation && (
                    <div className="h-full flex flex-col custom-scrollbar overflow-y-auto">
                        <CameraPanel
                            location={selectedLocation}
                            onClose={closePanel}
                            onStatusChange={(id: string, status: 'online' | 'offline') => setRealtimeStatuses(prev => ({ ...prev, [id]: status }))}
                            realtimeStatuses={realtimeStatuses}
                            lastCheckedTimes={lastCheckedTimes}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Custom pin marker: ikon jenis proyek + warna status + badge jumlah kamera ──
function MapPin3D({ online, count, category, isSelected }: { online: boolean; count: number; category?: string; isSelected?: boolean }) {
    const color = online ? '#22c55e' : '#ef4444';
    const glow = online ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.55)';
    const Icon = categoryIcon(category);
    return (
        <div className="relative flex flex-col items-center" style={{ filter: `drop-shadow(0 4px 8px ${glow})` }}>
            <div
                className={`relative w-9 h-9 rounded-full border-[3px] border-white flex items-center justify-center transition-transform group-hover/marker:scale-110 ${online ? 'marker-pulse' : ''} ${isSelected ? 'ring-4 ring-[var(--div-accent)] scale-110 shadow-[0_0_15px_var(--div-glow)]' : ''}`}
                style={{ backgroundColor: color }}
            >
                <Icon className="w-[18px] h-[18px] text-slate-900 dark:text-white" strokeWidth={2.5} />
                {/* Badge jumlah kamera */}
                {count > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-slate-900 border border-white/80 flex items-center justify-center text-[8px] font-black text-white leading-none">
                        {count}
                    </span>
                )}
            </div>
            {/* pointer tail */}
            <div
                className="w-0 h-0 -mt-0.5"
                style={{ borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `8px solid ${color}` }}
            />
        </div>
    );
}

// ── Hover tooltip content ──────────────────────────────────────────────────────
function LocationTooltip({
    loc, realtimeStatuses, lastCheckedTimes,
}: {
    loc: LocationData;
    realtimeStatuses: Record<string, 'online' | 'offline'>;
    lastCheckedTimes?: Record<string, string>;
}) {
    let on = 0, off = 0;
    (loc.cameras || []).forEach((cam: any) => {
        if ((realtimeStatuses[cam._id] || cam.status) === 'online') on++;
        else off++;
    });
    const majorityOnline = on >= off;

    let latest: string | null = null;
    (loc.cameras || []).forEach((cam: any) => {
        const t = lastCheckedTimes?.[cam._id] || cam.lastCheckedAt;
        if (t && (!latest || new Date(t) > new Date(latest))) latest = t;
    });
    let rel: string | null = null;
    if (latest) {
        const diff = Math.floor((Date.now() - new Date(latest).getTime()) / 1000);
        if (diff >= 86400) rel = `${Math.floor(diff / 86400)}h lalu`;
        else if (diff >= 3600) rel = `${Math.floor(diff / 3600)}j lalu`;
        else if (diff >= 60) rel = `${Math.floor(diff / 60)}m lalu`;
        else rel = 'Baru saja';
    }

    return (
        <div className="flex flex-col min-w-[160px] overflow-hidden rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 bg-white/75 dark:bg-slate-950/60 backdrop-blur-md">
            <div className="px-3.5 py-2.5 bg-white/90 dark:bg-slate-900/90 border-b border-black/10 dark:border-white/10 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${majorityOnline ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]'}`} />
                <div className="text-[10px] font-bold text-slate-800 dark:text-white/90 uppercase tracking-wider truncate">{loc.name}</div>
            </div>
            <div className="p-3 bg-white/80 dark:bg-slate-900/70 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
                        <div className="flex items-center gap-2">
                            <Signal className="w-4 h-4 text-emerald-400" />
                            <span className="text-[14px] font-bold text-slate-900 dark:text-white leading-none">{on}</span>
                        </div>
                        <span className="text-[9px] font-bold text-emerald-400/80 uppercase tracking-wider">Online</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-xl bg-rose-500/20 border border-rose-500/30">
                        <div className="flex items-center gap-2">
                            <SignalZero className="w-4 h-4 text-rose-400" />
                            <span className="text-[14px] font-bold text-slate-900 dark:text-white leading-none">{off}</span>
                        </div>
                        <span className="text-[9px] font-bold text-rose-400/80 uppercase tracking-wider">Offline</span>
                    </div>
                </div>
                {rel && (
                    <div className="text-center pt-1 border-t border-black/5 dark:border-white/5">
                        <span className="text-[8px] font-semibold text-slate-500 tracking-wide">Dicek {rel}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Global styles: scrollbar, marker pulse, MapLibre control theming ───────────
const customStyles = `
    .custom-scrollbar::-webkit-scrollbar { width: 5px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.1); }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--div-accent-rgb), 0.2); border-radius: 10px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(var(--div-accent-rgb), 0.4); }

    .marker-pulse { animation: marker-pulse 1.5s ease-in-out infinite; }
    @keyframes marker-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 70% { box-shadow: 0 0 0 12px rgba(34,197,94,0); } }

    /* MapLibre popup — strip default chrome so our card shows cleanly */
    .tengok-popup .maplibregl-popup-content { background: transparent !important; padding: 0 !important; box-shadow: none !important; border-radius: 16px; }
    .tengok-popup .maplibregl-popup-tip { display: none !important; }

    /* Hide MapLibre's default attribution (we use custom controls) */
    .maplibregl-ctrl-attrib { display: none !important; }
`;
