"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Map, { Marker, Popup, Source, Layer, type MapRef } from 'react-map-gl/maplibre';
import type { FillExtrusionLayerSpecification, FilterSpecification, GeoJSONSource } from 'maplibre-gl';
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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import CameraPanel, { type IPopulatedCamera } from './CameraPanel';
import ResourceMonitor from './ResourceMonitor';
import CctvNotices from './CctvNotices';
import BrandLoader from './BrandLoader';
import { useCameraStatusSSE } from '@/hooks/useCameraStatusSSE';
import { MAP_STYLES, MAP_STYLE_META, type MapStyleId } from '@/lib/mapStyles';
import { useTheme } from '@/components/ThemeProvider';
import { useIsPhone, isPhoneViewport } from '@/lib/phoneMode';
import { useBottomSheet } from '@/lib/useBottomSheet';
import { getDivisionCssVars, getDivisionTheme } from '@/lib/divisionTheme';

// Bentuk saran pencarian lokasi (dibangun dari data lokasi yang sudah dimuat).
interface SearchSuggestion {
    id: string;
    display_name: string;
    lat: number;
    lon: number;
    fullData: LocationData;
}
// Subset field kategori yang dipakai peta untuk pusat tampilan awal.
interface CategorySummary {
    identifier: string;
    defaultLat?: number;
    defaultLng?: number;
    defaultZoom?: number;
}
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
    cameras: IPopulatedCamera[];
    onlineCount: number;
    offlineCount: number;
    // Footprint bangunan proyek (blok 3D di peta)
    footprint?: { lat: number; lng: number }[];
    footprintHeight?: number;
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

// Lebar panel samping (px) — HARUS sama dengan kelas `md:w-[600px] lg:w-[680px]`
// pada wadah Side Panel dan `md:right-[616px] lg:right-[696px]` pada kontrol peta.
// Di bawah breakpoint md panel menutup layar penuh, jadi tidak ada padding.
const PANEL_WIDTH_MD = 600;
const PANEL_WIDTH_LG = 680;
const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };
// Bottom sheet panel proyek (phone, lihat src/lib/phoneMode.ts). Tinggi = pecahan tinggi layar.
// midVh juga dipakai sebagai padding bawah flyTo agar marker terlihat di atas sheet.
const MOBILE_MAP_SHEET = {
    midVh: 0.5,
    fullVh: 0.92,
    minVh: 0.3,
    transition: 'height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
} as const;
function getPanelWidth(): number {
    if (typeof window === 'undefined') return 0;
    const w = window.innerWidth;
    return w >= 1024 ? PANEL_WIDTH_LG : w >= 768 ? PANEL_WIDTH_MD : 0;
}

const BUILDINGS_3D_KEY = 'tengok_buildings3d_v1';
// ── Bangunan 3D (fill-extrusion) ─────────────────────────────────────────────
// Data bangunan dari tile vektor OpenFreeMap (OpenStreetMap) — tanpa API key,
// dipakai untuk SEMUA mode peta (termasuk Satelit yang hanya punya raster).
// Field: render_height, render_min_height, hide_3d. Tinggi tergantung data OSM,
// jadi bangunan tanpa data tinggi tampil rendah/datar.
const BUILDINGS_SOURCE_URL = 'https://tiles.openfreemap.org/planet';
const BUILDING_MIN_ZOOM = 15;
const BUILDING_FILTER: FilterSpecification = ['!=', ['get', 'hide_3d'], true];

function buildingPaint(style: MapStyleId): FillExtrusionLayerSpecification['paint'] {
    const [c0, c1, c2] =
        style === 'light' ? ['#e2e8f0', '#cbd5e1', '#94a3b8']
        : style === 'dark' ? ['#334155', '#475569', '#64748b']
        : ['#f1f5f9', '#e2e8f0', '#cbd5e1']; // satelit: terang agar kontras dengan citra
    return {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 5], 0, c0, 60, c1, 200, c2],
        // Tumbuh dari 0 di zoom 15 ke tinggi penuh di zoom 16 (muncul halus saat mendekat).
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], BUILDING_MIN_ZOOM, 0, BUILDING_MIN_ZOOM + 1, ['coalesce', ['get', 'render_height'], 5]],
        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], BUILDING_MIN_ZOOM, 0, BUILDING_MIN_ZOOM + 1, ['coalesce', ['get', 'render_min_height'], 0]],
        'fill-extrusion-opacity': style === 'satellite' ? 0.7 : 0.88,
        'fill-extrusion-vertical-gradient': true,
    };
}

// ── Footprint bangunan proyek (poligon gambar PIC) ───────────────────────────
// Berbeda dengan bangunan OSM di atas: ini data milik aplikasi (Location.footprint)
// sehingga muncul di semua area, termasuk yang belum dipetakan di OpenStreetMap.
const FOOTPRINT_MIN_ZOOM = 13;
const FOOTPRINT_DEFAULT_HEIGHT = 12;
const FOOTPRINT_LAYER_IDS = ['tengok-footprint-fill', 'tengok-footprint-3d'];

// Campur warna hex dengan putih (amount 0..1) — dipakai untuk menyorot proyek terpilih.
function lighten(hex: string, amount: number): string {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return hex;
    const mix = (c: string) => Math.round(parseInt(c, 16) + (255 - parseInt(c, 16)) * amount);
    return `rgb(${mix(m[1])}, ${mix(m[2])}, ${mix(m[3])})`;
}

// Tinggi blok: tumbuh dari 0 (zoom 13) ke penuh (zoom 15). Saat 3D dimatikan,
// tinggi 0 -> hanya isian datar + garis tepi yang terlihat.
function footprintExtrusionPaint(show3d: boolean): FillExtrusionLayerSpecification['paint'] {
    return {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': show3d
            ? ['interpolate', ['linear'], ['zoom'], FOOTPRINT_MIN_ZOOM, 0, FOOTPRINT_MIN_ZOOM + 2, ['get', 'height']]
            : 0,
        'fill-extrusion-base': 0,
        // NB: fill-extrusion-opacity TIDAK mendukung ekspresi data per fitur (hanya konstanta/zoom).
        // Penanda proyek terpilih dibuat lewat warna (lebih terang), bukan opasitas.
        'fill-extrusion-opacity': 0.85,
        'fill-extrusion-vertical-gradient': true,
    };
}

// ── Kantor pusat & garis lengkung ke proyek ──────────────────────────────────
// Koordinat kantor pusat PT Brantas Abipraya, Jl. D.I. Panjaitan Kav. 14, Cawang,
// Jakarta Timur. Titik diambil manual dari Google Maps oleh pengguna. Urutan [lng, lat].
const HQ_LNGLAT: [number, number] = [106.874588, -6.2404438];
const ARC_SOURCE_ID = 'tengok-arc';
const ARC_DRAW_MS = 700;
const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as never[] };

// Lengkung kuadratik: titik kontrol digeser tegak lurus dari titik tengah garis lurus.
function arcCoords(a: [number, number], b: [number, number], steps = 48): [number, number][] {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (Math.hypot(dx, dy) < 1e-4) return [a, b];
    const cx = (a[0] + b[0]) / 2 - dy * 0.2;
    const cy = (a[1] + b[1]) / 2 + dx * 0.2;
    const out: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        out.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
    }
    return out;
}

// Jarak garis lurus (haversine), km. Hanya perkiraan, bukan jarak tempuh jalan.
function distanceKm(a: [number, number], b: [number, number]): number {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b[1] - a[1]);
    const dLng = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

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
    // Mode phone (lebar < 640 dan aspect < 0.85): bar atas satu baris + panel proyek sebagai bottom sheet.
    const isPhone = useIsPhone();
    const reducedMotion = useReducedMotion();
    const {
        ref: sheetRef,
        stop: sheetStop,
        height: sheetHeight,
        transition: sheetTransition,
        reset: resetSheet,
        handleProps: sheetHandleProps,
    } = useBottomSheet({
        midVh: MOBILE_MAP_SHEET.midVh,
        fullVh: MOBILE_MAP_SHEET.fullVh,
        minVh: MOBILE_MAP_SHEET.minVh,
        reduced: Boolean(reducedMotion),
        transition: MOBILE_MAP_SHEET.transition,
        enabled: isPhone,
    });
    const scopeMenuRef = useRef<HTMLDivElement>(null);

    const [locations, setLocations] = useState<LocationData[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
    const [hovered, setHovered] = useState<LocationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
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

    // Bangunan 3D: default MATI (lebih ringan, peta lebih bersih). Pengguna menyalakan lewat tombol di kontrol peta.
    // Pilihan pengguna diingat di localStorage; bila belum pernah memilih, tetap mati.
    const [buildings3d, setBuildings3d] = useState(() => {
        try { return typeof window !== 'undefined' && window.localStorage.getItem(BUILDINGS_3D_KEY) === '1'; } catch { return false; }
    });
    const toggleBuildings3d = useCallback(() => {
        const next = !buildings3d;
        setBuildings3d(next);
        try { window.localStorage.setItem(BUILDINGS_3D_KEY, next ? '1' : '0'); } catch { /* abaikan */ }
    }, [buildings3d]);
    const [labelLayerId, setLabelLayerId] = useState<string | undefined>(undefined);


    // Parents (e.g. the shared page) pass allowedLocationIds as a fresh array
    // literal on every render. Derive a STABLE string key so the fetch effect
    // below only re-runs when the actual ids change — not on every parent
    // re-render (which the 1s countdown timer would otherwise trigger, causing
    // an infinite fetch/setState loop).
    const allowedKey = useMemo(
        () => (allowedLocationIds ?? []).join(','),
        [allowedLocationIds]
    );

    // GeoJSON footprint semua proyek yang punya poligon (>= 3 titik). Warna = aksen divisi.
    const footprintGeoJson = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: locations
            .filter((l) => (l.footprint?.length ?? 0) >= 3)
            .map((l) => {
                const ring = l.footprint!.map((pt) => [pt.lng, pt.lat]);
                ring.push(ring[0]); // tutup poligon
                const base = getDivisionTheme(l.division)?.accentHex ?? '#eab308';
                const isSelected = selectedLocation?._id === l._id;
                return {
                    type: 'Feature' as const,
                    properties: {
                        id: l._id,
                        height: l.footprintHeight ?? FOOTPRINT_DEFAULT_HEIGHT,
                        color: isSelected ? lighten(base, 0.4) : base,
                    },
                    geometry: { type: 'Polygon' as const, coordinates: [ring] },
                };
            }),
    }), [locations, selectedLocation?._id]);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);

    // Compute majority-online status for a location (uses realtime overrides).
    const isMajorityOnline = useCallback((loc: LocationData) => {
        let on = 0, off = 0;
        (loc.cameras || []).forEach((cam) => {
            if ((realtimeStatuses[cam._id] || cam.status) === 'online') on++;
            else off++;
        });
        return on >= off;
    }, [realtimeStatuses]);

    // Penanda perubahan status: saat mayoritas CCTV sebuah proyek berpindah
    // online <-> offline (data realtime/SSE), marker-nya memancarkan satu cincin
    // sekali. Pemuatan pertama tidak memicu apa pun (belum ada status sebelumnya).
    const prevOnlineRef = useRef<Record<string, boolean>>({});
    const [pings, setPings] = useState<Record<string, number>>({});
    useEffect(() => {
        const changed: string[] = [];
        const next: Record<string, boolean> = {};
        for (const loc of locations) {
            const now = isMajorityOnline(loc);
            next[loc._id] = now;
            const before = prevOnlineRef.current[loc._id];
            if (before !== undefined && before !== now) changed.push(loc._id);
        }
        prevOnlineRef.current = next;
        if (changed.length > 0) {
            setPings((p) => {
                const out = { ...p };
                for (const id of changed) out[id] = (out[id] ?? 0) + 1;
                return out;
            });
        }
    }, [locations, isMajorityOnline]);

    // Garis lengkung kantor pusat -> proyek yang di-hover (atau yang sedang dibuka).
    // Data penuh dirender lewat <Source>; animasi menggambar langsung memanggil
    // setData pada source (tanpa state React) agar tidak merender ulang tiap frame.
    const arcTarget = hovered ?? selectedLocation;
    const arcPath = useMemo(
        () => (arcTarget ? arcCoords(HQ_LNGLAT, [arcTarget.lng, arcTarget.lat]) : null),
        [arcTarget],
    );
    const arcColor = getDivisionTheme(arcTarget?.division)?.accentHex ?? '#eab308';
    const arcGeoJson = useMemo(
        () => arcPath
            ? { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: { color: arcColor }, geometry: { type: 'LineString' as const, coordinates: arcPath } }] }
            : EMPTY_FC,
        [arcPath, arcColor],
    );
    useEffect(() => {
        if (!arcPath) return;
        const reduced =
            searchParams.get('reduced') === '1' ||
            searchParams.get('motion') === '0' ||
            (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (reduced) return;
        const src = mapRef.current?.getMap().getSource(ARC_SOURCE_ID) as GeoJSONSource | undefined;
        if (!src) return;
        const start = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / ARC_DRAW_MS);
            const eased = 1 - Math.pow(1 - t, 3);
            const n = Math.max(2, Math.ceil(eased * arcPath.length));
            src.setData({
                type: 'FeatureCollection',
                features: [{ type: 'Feature', properties: { color: arcColor }, geometry: { type: 'LineString', coordinates: arcPath.slice(0, n) } }],
            });
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [arcPath, arcColor, searchParams]);

    // ── Fly camera helper ────────────────────────────────────────────────────
    // Peta full-width di belakang panel kaca; `padding.right` menggeser titik
    // tengah kamera ke area yang terlihat (di kiri panel) supaya marker tidak tertutup.
    const flyTo = useCallback((lng: number, lat: number, opts?: { zoom?: number; pitch?: number }) => {
        const map = mapRef.current;
        if (!map) return;
        map.flyTo({
            center: [lng, lat],
            // Phone: panel di bawah -> padding bawah = tinggi sheet tengah; selain itu panel di kanan (desktop/tablet).
            padding: isPhoneViewport(window.innerWidth, window.innerHeight)
                ? { top: 0, bottom: Math.round(window.innerHeight * MOBILE_MAP_SHEET.midVh), left: 0, right: 0 }
                : { top: 0, bottom: 0, left: 0, right: getPanelWidth() },
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
                const cats: CategorySummary[] = res.data || [];
                const cat = cats.find((c) => c.identifier === category);
                const defLat = cat?.defaultLat;
                const defLng = cat?.defaultLng;
                if (cat && defLat && defLng) {
                    setInitialView(v => ({
                        ...v,
                        longitude: defLng,
                        latitude: defLat,
                        zoom: cat.defaultZoom || v.zoom,
                    }));
                    // If the map is already mounted, ease to the new default.
                    mapRef.current?.jumpTo({
                        center: [defLng, defLat],
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
                let rawLocations: LocationData[] = res.data.data;
                if (allowedLocationIds && allowedLocationIds.length > 0) {
                    rawLocations = rawLocations.filter((loc) => allowedLocationIds.includes(loc._id));
                }
                const fetched: LocationData[] = rawLocations.map((loc) => {
                    let onlineCount = 0, offlineCount = 0;
                    (loc.cameras || []).forEach((cam) => {
                        if (cam.status === 'online') onlineCount++;
                        else offlineCount++;
                    });
                    return { ...loc, onlineCount, offlineCount };
                });

                if (!isMounted) return;
                setLocations(fetched);
                setFetchError(false);

                if (!hasProbed) {
                    hasProbed = true;
                    const allCameraIds = fetched.flatMap((loc) => (loc.cameras || []).map((cam) => cam._id));
                    const shouldProbe = scopeMode !== 'division' && scopeMode !== 'all';
                    if (shouldProbe && allCameraIds.length > 0) {
                        axios.post('/api/cameras/probe-now', { cameraIds: allCameraIds }).catch(() => {});
                    }
                    if (!sharedMode) {
                        const onlineIds = fetched
                            .flatMap((loc) => (loc.cameras || []).filter((c) => c.status === 'online').map((c) => c._id))
                            .slice(0, 20);
                        if (onlineIds.length > 0) {
                            axios.post('/api/streams/prewarm', { cameraIds: onlineIds }).catch(() => {});
                        }
                    }
                }
            } catch (error) {
                if (axios.isCancel(error)) return;
                console.error('Failed to fetch locations', error);
                if (isMounted) setFetchError(true);
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

    useEffect(() => {
        if (!isPhone || !scopeMenuOpen) return;
        const onDown = (e: PointerEvent) => {
            if (!scopeMenuRef.current?.contains(e.target as Node)) setScopeMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setScopeMenuOpen(false);
        };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [isPhone, scopeMenuOpen]);
    const openLocation = useCallback((loc: LocationData) => {
        setSelectedLocation(loc);
        setHovered(null);
        resetSheet(); // phone: selalu buka di titik tengah
        flyTo(loc.lng, loc.lat, { zoom: FOCUS_ZOOM, pitch: FOCUS_PITCH });
    }, [flyTo, resetSheet]);

    const handleSelectSuggestion = (s: SearchSuggestion) => {
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
            padding: NO_PADDING,
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

    // ── Tombol kontrol peta: dirangkai berbeda untuk desktop (satu kolom kanan) dan phone
    // (zoom/kompas kanan-bawah, pengaturan tampilan kiri-bawah). JSX tiap tombol sama di keduanya.
    const compassBtn = (
        <button
            onPointerDown={handleCompassPointerDown}
            className="w-11 h-11 flex items-center justify-center text-slate-900 dark:text-white hover:bg-[rgba(var(--div-accent-rgb),0.15)] hover:text-[var(--div-accent)] active:scale-95 transition-all cursor-grab active:cursor-grabbing touch-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            title="Seret untuk memutar/miringkan · klik untuk reset utara"
            aria-label="Kompas: seret untuk memutar atau memiringkan peta, klik untuk reset ke utara"
        >
            <Compass ref={compassRef} className="w-5 h-5 pointer-events-none" />
        </button>
    );
    const zoomInBtn = (
        <button
            onClick={() => mapRef.current?.zoomIn({ duration: 300 })}
            className="w-11 h-11 flex items-center justify-center text-slate-900 dark:text-white hover:bg-[rgba(var(--div-accent-rgb),0.15)] hover:text-[var(--div-accent)] active:scale-95 transition-all"
            title="Perbesar"
            aria-label="Perbesar peta"
        >
            <Plus className="w-5 h-5" aria-hidden="true" />
        </button>
    );
    const zoomOutBtn = (
        <button
            onClick={() => mapRef.current?.zoomOut({ duration: 300 })}
            className="w-11 h-11 flex items-center justify-center text-slate-900 dark:text-white hover:bg-[rgba(var(--div-accent-rgb),0.15)] hover:text-[var(--div-accent)] active:scale-95 transition-all"
            title="Perkecil"
            aria-label="Perkecil peta"
        >
            <Minus className="w-5 h-5" aria-hidden="true" />
        </button>
    );
    const pitchBtn = (
        <button
            onClick={() => mapRef.current?.easeTo({ pitch: (mapRef.current?.getPitch() || 0) > 10 ? 0 : FOCUS_PITCH, duration: 700 })}
            className="w-11 h-11 flex items-center justify-center text-slate-900 dark:text-white hover:bg-[rgba(var(--div-accent-rgb),0.15)] hover:text-[var(--div-accent)] active:scale-95 transition-all"
            title="Tampilan 3D"
            aria-label="Aktifkan atau matikan tampilan 3D"
        >
            <Mountain className="w-5 h-5" aria-hidden="true" />
        </button>
    );
    const buildingsBtn = (
        <button
            onClick={toggleBuildings3d}
            aria-pressed={buildings3d}
            className={`w-11 h-11 flex items-center justify-center hover:bg-[rgba(var(--div-accent-rgb),0.15)] hover:text-[var(--div-accent)] active:scale-95 transition-all ${buildings3d ? 'div-accent-text bg-[rgba(var(--div-accent-rgb),0.12)]' : 'text-slate-900 dark:text-white'}`}
            title={buildings3d ? 'Matikan bangunan 3D' : 'Nyalakan bangunan 3D (zoom dekat)'}
            aria-label={buildings3d ? 'Matikan bangunan 3D' : 'Nyalakan bangunan 3D'}
        >
            <Building2 className="w-5 h-5" aria-hidden="true" />
        </button>
    );
    // Toggle tema UI (panel/kontrol/sidebar) — BUKAN gaya peta. Gaya peta diatur layer toggle terpisah.
    const themeBtn = (
        <button
            onClick={toggle}
            className="w-11 h-11 flex items-center justify-center text-slate-900 dark:text-white hover:bg-[rgba(var(--div-accent-rgb),0.15)] hover:text-[var(--div-accent)] active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
            aria-label={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
        >
            {theme === 'dark' ? <Sun className="w-5 h-5" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
        </button>
    );
    // Pemilih mode peta. Desktop: tombol berbingkai sendiri, menu terbuka ke kiri.
    // Phone: tombol polos di dalam grup kiri-bawah, menu terbuka ke atas.
    const styleSwitcher = (phone: boolean) => (
        <div className="relative">
            <button
                onClick={() => setStyleMenuOpen(o => !o)}
                className={phone
                    ? 'w-11 h-11 flex items-center justify-center div-accent-text hover:bg-[rgba(var(--div-accent-rgb),0.15)] active:scale-95 transition-all'
                    : 'w-11 h-11 flex items-center justify-center bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 div-accent-text hover:bg-slate-200 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all'}
                title="Ganti mode peta"
                aria-label="Ganti mode peta"
                aria-expanded={styleMenuOpen}
            >
                <Layers className="w-5 h-5" aria-hidden="true" />
            </button>
            <AnimatePresence>
                {styleMenuOpen && (
                    <motion.div
                        initial={phone ? { opacity: 0, y: 10, scale: 0.95 } : { opacity: 0, x: 10, scale: 0.95 }}
                        animate={phone ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, x: 0, scale: 1 }}
                        exit={phone ? { opacity: 0, y: 10, scale: 0.95 } : { opacity: 0, x: 10, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className={`absolute ${phone ? 'bottom-full mb-3 left-0' : 'right-full mr-2 top-0'} bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden w-32`}
                    >
                        {MAP_STYLE_META.map(s => (
                            <button
                                key={s.id}
                                onClick={() => { setLabelLayerId(undefined); setMapStyleId(s.id); setStyleMenuOpen(false); }}
                                className={`w-full ${phone ? 'min-h-11 ' : ''}px-4 py-3 text-left text-xs font-bold transition-colors ${mapStyleId === s.id ? 'bg-[rgba(var(--div-accent-rgb),0.15)] div-accent-text' : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'}`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
    const glassGroup = 'bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10';

    return (
        <div ref={rootRef} style={rootStyle} className="flex h-dvh w-full bg-slate-100 dark:bg-slate-950 overflow-hidden relative">
            <style>{customStyles}</style>

            {/* Loader bermerek selama data lokasi belum selesai dimuat. */}
            {loading && <BrandLoader label={sharedMode ? 'Memuat' : 'Memuat Peta'} />}

            {/* ── MAP ─────────────────────────────────────────────────────────── */}
            {/* Peta selalu full-width (tidak pernah di-resize) supaya panel kaca di
                kanan benar-benar memburamkan peta di belakangnya. Marker dijaga
                tetap terlihat lewat `padding.right` pada flyTo. */}
            <div className="absolute inset-0">
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
                        interactiveLayerIds={FOOTPRINT_LAYER_IDS}
                        onClick={(e) => {
                            setStyleMenuOpen(false);
                            // Klik blok footprint -> buka panel proyeknya (seperti klik marker).
                            const id = e.features?.[0]?.properties?.id;
                            if (id) {
                                const loc = locations.find((l) => l._id === id);
                                if (loc) openLocation(loc);
                            }
                        }}
                        onStyleData={(e) => {
                            // Letakkan bangunan 3D di bawah label pertama dari style aktif.
                            try {
                                const layers = e.target.getStyle()?.layers ?? [];
                                const label = layers.find(l => l.type === 'symbol' && (l as { layout?: Record<string, unknown> }).layout?.['text-field']);
                                const id = label?.id;
                                setLabelLayerId(prev => (prev === id ? prev : id));
                            } catch { /* style belum siap */ }
                        }}
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
                        {/* Bangunan 3D — sumber vektor OpenFreeMap, bisa dimatikan lewat kontrol peta */}
                        {buildings3d && (
                            <Source id="tengok-buildings" type="vector" url={BUILDINGS_SOURCE_URL}>
                                <Layer
                                    id="tengok-3d-buildings"
                                    type="fill-extrusion"
                                    source-layer="building"
                                    minzoom={BUILDING_MIN_ZOOM}
                                    filter={BUILDING_FILTER}
                                    beforeId={labelLayerId}
                                    paint={buildingPaint(mapStyleId)}
                                />
                            </Source>
                        )}

                        {/* Footprint bangunan proyek: isian datar + blok 3D + garis tepi */}
                        {footprintGeoJson.features.length > 0 && (
                            <Source id="tengok-footprints" type="geojson" data={footprintGeoJson}>
                                <Layer
                                    id="tengok-footprint-fill"
                                    type="fill"
                                    minzoom={FOOTPRINT_MIN_ZOOM}
                                    beforeId={labelLayerId}
                                    paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 }}
                                />
                                <Layer
                                    id="tengok-footprint-3d"
                                    type="fill-extrusion"
                                    minzoom={FOOTPRINT_MIN_ZOOM}
                                    beforeId={labelLayerId}
                                    paint={footprintExtrusionPaint(buildings3d)}
                                />
                                <Layer
                                    id="tengok-footprint-line"
                                    type="line"
                                    minzoom={FOOTPRINT_MIN_ZOOM}
                                    beforeId={labelLayerId}
                                    paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.95 }}
                                />
                            </Source>
                        )}

                        {/* Garis lengkung kantor pusat -> proyek (hover / terpilih) */}
                        <Source id={ARC_SOURCE_ID} type="geojson" data={arcGeoJson}>
                            <Layer
                                id="tengok-arc-line"
                                type="line"
                                beforeId={labelLayerId}
                                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                                paint={{ 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.9 }}
                            />
                        </Source>
                        {arcTarget && (
                            <Marker longitude={HQ_LNGLAT[0]} latitude={HQ_LNGLAT[1]} anchor="center">
                                <div
                                    className="pointer-events-none flex items-center gap-1.5 rounded-full bg-slate-900/85 border border-white/20 pl-1.5 pr-2.5 py-1 shadow-xl"
                                    title="Kantor Pusat PT Brantas Abipraya"
                                >
                                    <span className="flex w-5 h-5 items-center justify-center rounded-full div-accent-solid">
                                        <Building2 className="w-3 h-3 text-slate-900" aria-hidden="true" />
                                    </span>
                                    <span className="text-[11px] font-bold text-white whitespace-nowrap">Kantor Pusat</span>
                                </div>
                            </Marker>
                        )}

                        {/* Location markers (custom HTML pins) — satu titik per proyek */}
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
                                        className="cursor-pointer group/marker p-1"
                                        onMouseEnter={() => setHovered(loc)}
                                        onMouseLeave={() => setHovered(null)}
                                    >
                                        <MapPin3D online={online} count={(loc.cameras || []).length} category={loc.category} isSelected={selectedLocation?._id === loc._id} progress={loc.progressPercent} pingKey={pings[loc._id]} />
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

            {/* ── DEKORASI HUD (murni visual, pointer-events-none) ─────────────────
                Di atas peta (z-[300]) tapi di bawah semua kontrol (z-[400]+),
                sehingga drag/zoom/klik marker tidak terganggu. */}
            {/* Vignette: tipis di mobile (agar marker/kontrol tepi tidak redup), lebih
                kuat di layar lebar, dan jauh lebih lembut di tema terang. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[300] opacity-30 dark:opacity-100 shadow-[inset_0_0_60px_8px_rgba(2,6,23,0.4)] sm:shadow-[inset_0_0_120px_20px_rgba(2,6,23,0.5)] lg:shadow-[inset_0_0_160px_30px_rgba(2,6,23,0.55)]"
            />
            {/* Bracket hanya di layar lebar (lg+): di mobile tepinya dipakai kontrol. */}
            {[
                'top-1 left-1 border-t-2 border-l-2',
                'top-1 right-1 border-t-2 border-r-2',
                'bottom-1 left-1 border-b-2 border-l-2',
                'bottom-1 right-1 border-b-2 border-r-2',
            ].map((pos) => (
                <span
                    key={pos}
                    aria-hidden
                    className={`pointer-events-none absolute z-[300] hidden lg:block w-5 h-5 ${pos}`}
                    style={{
                        borderColor: 'rgba(var(--div-accent-rgb),0.6)',
                        filter: 'drop-shadow(0 0 5px rgba(var(--div-accent-rgb),0.45))',
                    }}
                />
            ))}

            {/* ── TOP OVERLAY: nav + search + category ─────────────────────────── */}
            <div className="absolute top-4 sm:top-6 max-sm:top-[calc(1rem+env(safe-area-inset-top,0px))] left-2 sm:left-6 max-sm:left-[calc(0.5rem+env(safe-area-inset-left,0px))] right-2 sm:right-6 max-sm:right-[calc(0.5rem+env(safe-area-inset-right,0px))] z-[400] flex items-start justify-between pointer-events-none gap-2 sm:gap-3">
                {!sharedMode && (
                    <div className={isPhone ? 'contents' : `flex flex-col gap-2 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] pointer-events-auto ${selectedLocation ? 'opacity-0 -translate-x-6 pointer-events-none' : 'opacity-100 translate-x-0'}`}>
                        <button
                            onClick={() =>
                                router.push(
                                    division
                                        ? `/categories?div=${encodeURIComponent(division)}`
                                        : '/categories'
                                )
                            }
                            className={`p-3 sm:p-3.5 bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all group shrink-0 ${isPhone ? `order-1 ${selectedLocation ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}` : ''}`}
                            title="Kembali ke Kategori"
                        >
                            <Home className="w-5 h-5 group-hover:-translate-y-1 transition-transform" aria-hidden="true" />
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
                            className={`p-3 sm:p-3.5 bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 div-accent-text hover:bg-slate-200 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all group shrink-0 ${isPhone ? `order-3 ${selectedLocation ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}` : ''}`}
                            title="Ke Halaman Multi-View"
                            aria-label="Ke Halaman Multi-View"
                        >
                            <LayoutGrid className="w-5 h-5 group-hover:scale-110 transition-transform" aria-hidden="true" />
                        </button>

                        {/* Project scope filter: proyek ini / se-divisi / lintas divisi */}
                        <div ref={scopeMenuRef} className={`relative ${isPhone ? `order-4 transition-opacity duration-500 ${selectedLocation ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}` : ''}`}>
                            <button
                                onClick={() => setScopeMenuOpen(o => !o)}
                                className={`relative p-3 sm:p-3.5 bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border transition-all group shrink-0 hover:bg-slate-200 dark:hover:bg-slate-800 hover:scale-105 active:scale-95 ${
                                    scopeMode !== 'context' ? 'border-[rgba(var(--div-accent-rgb),0.4)] div-accent-text' : 'border-black/10 dark:border-white/10 text-slate-900 dark:text-white'
                                }`}
                                title="Filter proyek yang ditampilkan"
                            >
                                <Filter className="w-5 h-5 group-hover:scale-110 transition-transform" aria-hidden="true" />
                                {scopeMode !== 'context' && (
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full div-accent-solid border-2 border-slate-900" />
                                )}
                            </button>
                            <AnimatePresence>
                                {scopeMenuOpen && (
                                    <motion.div
                                        initial={isPhone ? { opacity: 0, y: -8, scale: 0.98 } : { opacity: 0, x: -10, scale: 0.95 }}
                                        animate={isPhone ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, x: 0, scale: 1 }}
                                        exit={isPhone ? { opacity: 0, y: -8, scale: 0.98 } : { opacity: 0, x: -10, scale: 0.95 }}
                                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                        className={isPhone ? 'fixed left-2 right-2 top-[calc(env(safe-area-inset-top,0px)+4.75rem)] z-[600] bg-white/95 dark:bg-slate-900/95 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden' : 'absolute left-full ml-2 top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden w-60'}
                                    >
                                        <div className="px-4 py-2.5 border-b border-black/5 dark:border-white/5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
                                            <FolderTree className="w-4 h-4 shrink-0" aria-hidden="true" />
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold uppercase tracking-wider">Kategori Ini</div>
                                                <div className="text-[11px] text-slate-500 truncate">
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
                                            <Layers className="w-4 h-4 shrink-0" aria-hidden="true" />
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold uppercase tracking-wider">Satu Divisi</div>
                                                <div className="text-[11px] text-slate-500 truncate">
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
                                                    padding: NO_PADDING,
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
                                            <Globe className="w-4 h-4 shrink-0" aria-hidden="true" />
                                            <div className="min-w-0">
                                                <div className="text-xs font-bold uppercase tracking-wider">Semua Proyek</div>
                                                <div className="text-[11px] text-slate-500 truncate">Lintas divisi (Brantas Abipraya)</div>
                                            </div>
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}

                {!sharedMode && (
                    <div ref={searchRef} className={`flex-1 sm:max-w-xl sm:mx-8 relative pointer-events-auto transition-all duration-700 ${isPhone ? 'order-2' : ''} ${selectedLocation ? 'opacity-0 md:opacity-100 pointer-events-none md:pointer-events-auto' : 'opacity-100'}`}>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 dark:text-slate-400 group-focus-within:text-[var(--div-accent)] transition-colors">
                                {isSearching ? <Loader2 className="w-4 h-4 animate-spin div-accent-text" aria-hidden="true" /> : <Search className="w-4 h-4" aria-hidden="true" />}
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => { setShowSuggestions(true); setSearchFocused(true); }}
                                onBlur={() => setSearchFocused(false)}
                                onKeyDown={handleKeyDown}
                                aria-label="Cari lokasi proyek"
                                placeholder={`Cari ${category || (division ? `proyek ${division}` : 'lokasi')}...`}
                                className="w-full min-h-11 bg-white/85 dark:bg-slate-900/80 backdrop-blur-2xl text-slate-900 dark:text-white placeholder:text-slate-400 text-base sm:text-sm py-3 sm:py-4 pl-9 sm:pl-11 pr-10 sm:pr-12 rounded-2xl border border-black/10 dark:border-white/10 focus:border-[rgba(var(--div-accent-rgb),0.5)] focus:ring-4 focus:ring-[rgba(var(--div-accent-rgb),0.1)] transition-all outline-none shadow-2xl"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => { setSearchQuery(''); setSuggestions([]); setShowSuggestions(false); }}
                                    className={`absolute inset-y-0 right-2 flex items-center px-2 group/clear transition-all ${isPhone ? 'min-w-11 justify-center' : ''}`}
                                    title="Hapus pencarian"
                                    aria-label="Hapus pencarian"
                                >
                                    <div className="p-1.5 rounded-full bg-white/5 group-hover/clear:bg-red-500/20 text-slate-500 dark:text-slate-400 group-hover/clear:text-red-400 transition-all border border-black/5 dark:border-white/5">
                                        <CloseIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                    </div>
                                </button>
                            )}
                        </div>

                        {searchFocused && searchQuery.length > 0 && searchQuery.length < 3 && (
                            <div className="absolute top-full mt-3 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl px-5 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 z-[600]" role="status">
                                Ketik minimal 3 huruf untuk mencari proyek.
                            </div>
                        )}

                        {showSuggestions && searchQuery.length >= 3 && (
                            <div className="absolute top-full mt-3 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-2xl border border-black/10 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[600]">
                                <div className={isPhone ? 'max-h-[min(15rem,calc(100dvh-8rem))] overflow-y-auto custom-scrollbar' : 'max-h-60 overflow-y-auto custom-scrollbar'}>
                                    {suggestions.length > 0 ? suggestions.map((item, idx) => (
                                        <button
                                            key={`${item.id}-${idx}`}
                                            onClick={() => handleSelectSuggestion(item)}
                                            onMouseEnter={() => setSelectedIndex(idx)}
                                            className={`w-full px-5 py-3.5 flex items-center gap-4 transition-colors text-left group border-b border-black/5 dark:border-white/5 last:border-0 ${selectedIndex === idx ? 'bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                                        >
                                            <div className="p-2 rounded-lg shrink-0 bg-[rgba(var(--div-accent-rgb),0.1)]">
                                                <MapPin className="w-4 h-4 div-accent-text" aria-hidden="true" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.display_name}</div>
                                                <div className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">{item.fullData?.category ? `Kategori: ${item.fullData.category}` : 'Lokasi proyek'}</div>
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

            {/* ── MAP CONTROLS ───────────────────────────────────────────────────
                Desktop/tablet: satu kolom di kanan. Phone: zoom + kompas di kanan-bawah,
                mode peta / miring / bangunan 3D / tema sebagai baris di kiri-bawah. */}
            {!sharedMode && !isPhone && (
                <div className={`absolute z-[500] flex flex-col gap-2 pointer-events-auto transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] bottom-6 sm:bottom-8 max-sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] ${
                    selectedLocation
                        ? 'opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto right-4 max-sm:right-[calc(1rem+env(safe-area-inset-right,0px))] md:right-[616px] lg:right-[696px]'
                        : 'opacity-100 right-4 max-sm:right-[calc(1rem+env(safe-area-inset-right,0px))]'
                }`}>
                    {styleSwitcher(false)}

                    {/* Compass + Zoom + 3D — one grouped block */}
                    <div className="flex flex-col bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                        {compassBtn}
                        <div className="h-px bg-white/10" />
                        {zoomInBtn}
                        <div className="h-px bg-white/10" />
                        {zoomOutBtn}
                        <div className="h-px bg-white/10" />
                        {pitchBtn}
                        <div className="h-px bg-white/10" />
                        {buildingsBtn}
                        <div className="h-px bg-white/10" />
                        {themeBtn}
                    </div>
                </div>
            )}
            {!sharedMode && isPhone && (
                <>
                    {/* Kanan-bawah: kompas + zoom */}
                    <div className={`absolute z-[500] pointer-events-auto transition-opacity duration-500 bottom-[calc(2.75rem+env(safe-area-inset-bottom,0px))] right-[calc(1rem+env(safe-area-inset-right,0px))] ${selectedLocation ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                        <div className={`flex flex-col overflow-hidden ${glassGroup}`}>
                            {compassBtn}
                            <div className="h-px bg-white/10" />
                            {zoomInBtn}
                            <div className="h-px bg-white/10" />
                            {zoomOutBtn}
                        </div>
                    </div>
                    {/* Kiri-bawah: mode peta, miring, bangunan 3D, tema */}
                    <div className={`absolute z-[500] pointer-events-auto transition-opacity duration-500 bottom-[calc(2.75rem+env(safe-area-inset-bottom,0px))] left-[calc(1rem+env(safe-area-inset-left,0px))] ${selectedLocation ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                        <div className={`flex items-stretch ${glassGroup}`}>
                            <div className="rounded-l-2xl overflow-visible">{styleSwitcher(true)}</div>
                            <div className="w-px bg-white/10" />
                            {pitchBtn}
                            <div className="w-px bg-white/10" />
                            {buildingsBtn}
                            <div className="w-px bg-white/10" />
                            {themeBtn}
                        </div>
                    </div>
                </>
            )}

            {/* Atribusi data peta (OpenStreetMap/OpenFreeMap & Esri) — atribusi bawaan MapLibre disembunyikan */}
            <div className="absolute bottom-1 max-sm:bottom-[calc(0.25rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-[450] pointer-events-none max-w-[90vw] text-center">
                <span className="pointer-events-auto text-[11px] sm:text-[11px] font-medium text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                    Data peta ©{' '}
                    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="inline-block py-4 -my-4 underline hover:text-white">OpenStreetMap</a>
                    {' '}· Citra © Esri · OpenFreeMap
                </span>
            </div>

            {/* Galat muat data lokasi */}
            {fetchError && (
                <div role="alert" className="absolute top-24 left-1/2 -translate-x-1/2 z-[700] max-w-[90vw] flex items-center gap-3 px-4 py-3 rounded-2xl bg-rose-500/90 text-white text-xs sm:text-sm font-semibold shadow-2xl backdrop-blur-xl">
                    <span>Gagal memuat data lokasi. Mencoba lagi otomatis.</span>
                    <button type="button" onClick={() => window.location.reload()} className="shrink-0 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 font-bold transition-colors">Muat ulang</button>
                </div>
            )}

            {/* CCTV notices */}
            <CctvNotices sharedMode={sharedMode} hidden={!!selectedLocation || (isPhone && searchFocused)} />

            {/* Resource Monitor: disembunyikan di mobile (ruang bawah dipakai legenda & atribusi peta) */}
            {!sharedMode && (
                <div className={selectedLocation ? 'hidden md:block' : 'hidden sm:block'}>
                    <ResourceMonitor />
                </div>
            )}

            {/* Watermark */}
            {!sharedMode && (
                <div className={`fixed max-sm:hidden bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-4 z-[450] pointer-events-none transition-all duration-700 ${selectedLocation ? 'opacity-0 right-4' : 'opacity-100 right-20 sm:right-24'}`}>
                    <div className="flex items-center gap-2.5 bg-white/80 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl px-3.5 py-2.5 border border-black/5 dark:border-white/5 shadow-2xl">
                        {/* Logo biru untuk light mode, logo putih/kuning untuk dark mode */}
                        {/* eslint-disable-next-line @next/next/no-img-element -- logo statis lokal, tidak perlu optimasi next/image */}
                        <img src="/abipraya_blue.svg" alt="PT Brantas Abipraya" className="w-7 h-7 object-contain opacity-80 block dark:hidden" draggable={false} />
                        {/* eslint-disable-next-line @next/next/no-img-element -- logo statis lokal (SVG), tidak perlu optimasi next/image */}
                        <img src="/abipraya_original.svg" alt="PT Brantas Abipraya" className="w-7 h-7 object-contain opacity-70 hidden dark:block" draggable={false} />
                        <div className="hidden sm:block">
                            <p className="text-[11px] font-bold text-slate-500 dark:text-white/50 uppercase tracking-[0.15em] leading-none">PT Brantas Abipraya</p>
                            <p className="text-[11px] font-medium text-slate-400 dark:text-white/25 uppercase tracking-wider mt-0.5">Smart Monitoring</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Side Panel */}
            <div
                ref={sheetRef}
                className={isPhone ? `fixed inset-x-0 bottom-0 z-[1000] flex flex-col overscroll-contain rounded-t-3xl border-x border-t border-white/60 dark:border-white/10 bg-white/95 dark:bg-slate-950/95 transform ${selectedLocation ? 'translate-y-0 shadow-[0_-16px_48px_-12px_rgba(15,23,42,0.4)]' : 'translate-y-full shadow-none'}` : `fixed inset-y-0 right-0 z-[1000] w-full md:w-[600px] lg:w-[680px] bg-white/80 dark:bg-slate-950/75 md:bg-white/70 md:dark:bg-slate-950/40 backdrop-blur-2xl backdrop-saturate-150 border-l border-white/40 dark:border-white/10 transform transition-[transform,box-shadow] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${selectedLocation ? 'translate-x-0 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]' : 'translate-x-full shadow-none'}`}
                style={isPhone ? { height: sheetHeight, transition: sheetTransition, paddingBottom: 'env(safe-area-inset-bottom, 0px)' } : undefined}
            >
                {isPhone && selectedLocation && (
                    <button
                        type="button"
                        {...sheetHandleProps}
                        aria-label={sheetStop === 'full' ? 'Perkecil panel proyek' : 'Perluas panel proyek'}
                        className="flex h-11 w-full shrink-0 touch-none items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:ring-[rgba(var(--div-accent-rgb),0.7)] focus-visible:outline-none"
                    >
                        <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-black/25 dark:bg-white/25" />
                    </button>
                )}
                {selectedLocation && (
                    <div className={isPhone ? 'min-h-0 flex-1 flex flex-col' : 'h-full flex flex-col custom-scrollbar overflow-y-auto'}>
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
// Cincin tipis di sekeliling pin = progress fisik proyek (bila ada datanya).
// Online berdenyut hijau, offline berdenyut merah lebih pelan (perhatian).
const PIN_RING_R = 22;
const PIN_RING_C = 2 * Math.PI * PIN_RING_R;
function MapPin3D({ online, count, category, isSelected, progress, pingKey }: { online: boolean; count: number; category?: string; isSelected?: boolean; progress?: number; pingKey?: number }) {
    const color = online ? '#22c55e' : '#ef4444';
    const glow = online ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.55)';
    const Icon = categoryIcon(category);
    const pct = progress != null && Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null;
    return (
        <div className="relative flex flex-col items-center transition-transform duration-200 group-hover/marker:-translate-y-0.5" style={{ filter: `drop-shadow(0 4px 8px ${glow})` }}>
            <div
                className={`relative w-9 h-9 rounded-full border-[3px] border-white flex items-center justify-center transition-transform group-hover/marker:scale-110 ${online ? 'marker-pulse' : 'marker-pulse-off'} ${isSelected ? 'ring-4 ring-[var(--div-accent)] scale-110 shadow-[0_0_15px_var(--div-glow)]' : ''}`}
                style={{ backgroundColor: color }}
            >
                {/* Cincin sekali-jalan saat status berganti; key baru = animasi mulai ulang */}
                {pingKey ? (
                    <span
                        key={pingKey}
                        aria-hidden="true"
                        className="marker-status-ping pointer-events-none absolute inset-0 rounded-full border-2"
                        style={{ borderColor: color }}
                    />
                ) : null}
                {pct != null && (
                    <svg className="absolute -left-[10px] -top-[10px] pointer-events-none -rotate-90" width="50" height="50" viewBox="0 0 50 50" aria-hidden="true">
                        <circle cx="25" cy="25" r={PIN_RING_R} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" />
                        <circle
                            cx="25" cy="25" r={PIN_RING_R} fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"
                            strokeDasharray={PIN_RING_C} strokeDashoffset={PIN_RING_C * (1 - pct / 100)}
                            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                        />
                    </svg>
                )}
                {/* eslint-disable-next-line react-hooks/static-components -- Icon dipilih dari peta komponen lucide statis (CATEGORY_ICON), bukan komponen baru per render */}
                <Icon className="w-[18px] h-[18px] text-slate-900 dark:text-white" strokeWidth={2.5} />
                {/* Badge jumlah kamera */}
                {count > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-slate-900 border border-white/80 flex items-center justify-center text-[11px] font-black text-white leading-none">
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
    (loc.cameras || []).forEach((cam) => {
        if ((realtimeStatuses[cam._id] || cam.status) === 'online') on++;
        else off++;
    });
    const majorityOnline = on >= off;

    let latest: string | null = null;
    (loc.cameras || []).forEach((cam) => {
        const raw = lastCheckedTimes?.[cam._id] || cam.lastCheckedAt;
        const t = raw instanceof Date ? raw.toISOString() : raw;
        if (t && (!latest || new Date(t) > new Date(latest))) latest = t;
    });
    let rel: string | null = null;
    if (latest) {
        // Label waktu relatif sengaja dihitung saat render (mengikuti pembaruan status realtime).
        // eslint-disable-next-line react-hooks/purity
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
                <div className="text-[11px] font-bold text-slate-800 dark:text-white/90 uppercase tracking-wider truncate">{loc.name}</div>
            </div>
            <div className="p-3 bg-white/80 dark:bg-slate-900/70 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
                        <div className="flex items-center gap-2">
                            <Signal className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                            <span className="text-[14px] font-bold text-slate-900 dark:text-white leading-none">{on}</span>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-400/80 uppercase tracking-wider">Online</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-xl bg-rose-500/20 border border-rose-500/30">
                        <div className="flex items-center gap-2">
                            <SignalZero className="w-4 h-4 text-rose-400" aria-hidden="true" />
                            <span className="text-[14px] font-bold text-slate-900 dark:text-white leading-none">{off}</span>
                        </div>
                        <span className="text-[11px] font-bold text-rose-400/80 uppercase tracking-wider">Offline</span>
                    </div>
                </div>
                {rel && (
                    <div className="text-center pt-1 border-t border-black/5 dark:border-white/5">
                        <span className="text-[11px] font-semibold text-slate-500 tracking-wide">Dicek {rel}</span>
                    </div>
                )}
                <div className={`text-center ${rel ? '' : 'pt-1 border-t border-black/5 dark:border-white/5'}`}>
                    <span className="text-[11px] font-semibold text-slate-500 tracking-wide">
                        ±{Math.round(distanceKm(HQ_LNGLAT, [loc.lng, loc.lat])).toLocaleString('id-ID')} km dari Kantor Pusat (garis lurus)
                    </span>
                </div>
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
    /* Offline: denyut merah lebih pelan agar menarik perhatian tanpa mengganggu */
    .marker-pulse-off { animation: marker-pulse-off 2.4s ease-in-out infinite; }
    @keyframes marker-pulse-off { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); } 70% { box-shadow: 0 0 0 14px rgba(239,68,68,0); } }
    /* Perubahan status: satu cincin membesar lalu hilang (3 kali, lalu berhenti) */
    .marker-status-ping { animation: marker-status-ping 1.1s ease-out 3 forwards; }
    @keyframes marker-status-ping { 0% { transform: scale(1); opacity: 0.9; } 100% { transform: scale(3.2); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
        .marker-pulse, .marker-pulse-off, .marker-status-ping { animation: none !important; }
        .marker-status-ping { display: none; }
    }

    /* MapLibre popup — strip default chrome so our card shows cleanly */
    .tengok-popup .maplibregl-popup-content { background: transparent !important; padding: 0 !important; box-shadow: none !important; border-radius: 16px; }
    .tengok-popup .maplibregl-popup-tip { display: none !important; }

    /* Hide MapLibre's default attribution (we use custom controls) */
    .maplibregl-ctrl-attrib { display: none !important; }
`;
