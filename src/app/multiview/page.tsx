"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowLeft,
    LayoutGrid,
    Search,
    CheckSquare,
    Square,
    PanelLeftOpen,
    PanelLeftClose,
    Filter,
    Globe,
    FolderTree,
    Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import OptimizedVideoPlayer from '@/components/OptimizedVideoPlayer';
import { useStreamManager } from '@/lib/StreamManager';
import { useCameraStatusSSE } from '@/hooks/useCameraStatusSSE';
import BrandLoader from '@/components/BrandLoader';
import { getDivisionCssVars } from '@/lib/divisionTheme';
import ThemeToggle from '@/components/ThemeToggle';

const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none';

interface MultiViewCamera {
    _id: string;
    name: string;
    status: string;
}

interface Location {
    _id: string;
    name: string;
    category: string;
    division?: string;
    cameras: MultiViewCamera[];
}

// Scope of locations shown in the sidebar:
// - 'context':  only the division + category of the project the user came from (DEFAULT)
// - 'division': every category within the opened division (lintas kategori)
// - 'all':      every Brantas Abipraya project, lintas divisi
type FilterMode = 'context' | 'division' | 'all';

function MultiViewContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const streamManager = useStreamManager();

    // Context passed from the map ("the project the user has open").
    const contextDivision = searchParams.get('division') || '';
    const contextCategory = searchParams.get('category') || '';
    const hasCategory = Boolean(contextCategory);
    const hasDivision = Boolean(contextDivision);
    const hasContext = hasCategory || hasDivision;

    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    // Default follows the opened project's context: category if present,
    // else the division, else everything (page opened without any context).
    const [filterMode, setFilterMode] = useState<FilterMode>(
        hasCategory ? 'context' : hasDivision ? 'division' : 'all'
    );
    const { realtimeStatuses: realtimeStatus, setRealtimeStatuses: setRealtimeStatus } = useCameraStatusSSE();

    // Guards so we only auto-select the context locations ONCE (on first load),
    // and don't clobber the user's manual selection on the 30s refetch.
    const didAutoSelect = useRef(false);

    // Build the locations query from the active filter mode. In 'context' mode
    // we scope the fetch to the opened division/category; in 'all' mode we fetch
    // everything. The query string is also used as an effect dependency so the
    // refetch interval and mode switches re-run cleanly.
    const query = useMemo(() => {
        const p = new URLSearchParams();
        if (filterMode === 'context') {
            if (contextDivision) p.set('division', contextDivision);
            if (contextCategory) p.set('category', contextCategory);
        } else if (filterMode === 'division') {
            // Semua kategori dalam divisi yang dibuka (lintas kategori).
            if (contextDivision) p.set('division', contextDivision);
        }
        // 'all' → no filter (lintas divisi).
        return p.toString();
    }, [filterMode, contextDivision, contextCategory]);

    useEffect(() => {
        let cancelled = false;
        const fetchLocations = async () => {
            try {
                const res = await axios.get(`/api/locations${query ? `?${query}` : ''}`);
                if (!cancelled && res.data.success) {
                    setLocations(res.data.data);
                    setFetchError(false);
                }
            } catch (error) {
                console.error("Failed to fetch locations", error);
                if (!cancelled) setFetchError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchLocations();

        const intervalId = setInterval(fetchLocations, 30000);
        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [query]);

    // Di layar kecil panel pilihan menutupi seluruh grid: mulai dalam keadaan tertutup
    // (user bisa membukanya lewat tombol). Hanya dijalankan sekali saat mount.
    useEffect(() => {
        if (window.matchMedia("(max-width: 639px)").matches) setIsSidebarOpen(false);
    }, []);

    // Esc menutup panel pilihan lokasi (berguna di mobile saat panel menutupi grid).
    useEffect(() => {
        if (!isSidebarOpen) return;
        const onKey = (e: KeyboardEvent) => {
            const el = document.activeElement;
            if (e.key === "Escape" && !(el instanceof HTMLInputElement)) setIsSidebarOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [isSidebarOpen]);

    // Cegah ZOOM HALAMAN BROWSER (Ctrl+roda mouse / pinch trackpad) di halaman
    // multiview. Halaman ini tidak punya kanvas peta, jadi blok Ctrl+wheel
    // menyeluruh aman; scroll biasa tidak diblok (hanya saat ctrlKey). Listener
    // WAJIB non-pasif ({ passive: false }) agar preventDefault tidak diabaikan.
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) e.preventDefault();
        };
        const handleGesture = (e: Event) => {
            e.preventDefault();
        };
        window.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('gesturestart', handleGesture as EventListener, { passive: false });
        window.addEventListener('gesturechange', handleGesture as EventListener, { passive: false });
        return () => {
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('gesturestart', handleGesture as EventListener);
            window.removeEventListener('gesturechange', handleGesture as EventListener);
        };
    }, []);

    const MAX_CAMERAS = 12; // Batas beban server; selaras dengan StreamManager (12 stream serentak)

    // Auto-select locations once they load, so opening multiview from a project
    // immediately shows cameras (capped at the limit). Runs on first load in the
    // context-derived scopes ('context'/'division'); 'all' never auto-selects.
    useEffect(() => {
        if (didAutoSelect.current) return;
        if (loading || locations.length === 0) return;
        if (filterMode !== 'all') {
            const ids: string[] = [];
            let camCount = 0;
            for (const loc of locations) {
                const n = loc.cameras?.length || 0;
                if (n === 0) continue;
                if (camCount + n > MAX_CAMERAS) break;
                ids.push(loc._id);
                camCount += n;
            }
            setSelectedLocationIds(ids);
        }
        didAutoSelect.current = true;
    }, [loading, locations, filterMode]);

    const switchFilterMode = (mode: FilterMode) => {
        if (mode === filterMode) return;
        setFilterMode(mode);
        // Switching scope resets the selection; allow the auto-select to run
        // again for the context-derived scopes.
        setSelectedLocationIds([]);
        setSearchQuery('');
        didAutoSelect.current = mode === 'all'; // 'all' never auto-selects
    };

    const filteredLocations = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return locations.filter(loc =>
            loc.name?.toLowerCase().includes(q) ||
            loc.category?.toLowerCase().includes(q)
        );
    }, [locations, searchQuery]);

    const toggleLocation = (id: string) => {
        setSelectedLocationIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(item => item !== id);
            }
            return [...prev, id];
        });
    };

    const selectedCameras = useMemo(() => {
        const cameras: Array<{
            _id: string;
            name: string;
            status: string;
            locationName: string;
        }> = [];
        locations.forEach(loc => {
            if (selectedLocationIds.includes(loc._id)) {
                loc.cameras.forEach((cam: { _id: string; name: string; status: string }) => {
                    cameras.push({
                        ...cam,
                        locationName: loc.name
                    });
                });
            }
        });
        // Cap at MAX_CAMERAS to prevent server overload
        return cameras.slice(0, MAX_CAMERAS);
    }, [locations, selectedLocationIds]);

    // Display order: online cameras first, offline pushed to the bottom.
    // Combined with a STABLE key ({cam._id}), React moves the existing DOM node
    // instead of remounting — so re-sorting does NOT restart any live stream.
    const orderedCameras = useMemo(() => {
        return [...selectedCameras].sort((a, b) => {
            const aOnline = (realtimeStatus[a._id] || a.status) === 'online' ? 0 : 1;
            const bOnline = (realtimeStatus[b._id] || b.status) === 'online' ? 0 : 1;
            return aOnline - bOnline;
        });
    }, [selectedCameras, realtimeStatus]);

    const totalSelectedCameras = useMemo(() => {
        return locations.reduce((acc, loc) => {
            if (selectedLocationIds.includes(loc._id)) {
                return acc + (loc.cameras?.length || 0);
            }
            return acc;
        }, 0);
    }, [locations, selectedLocationIds]);

    // Stable key of the selected camera id set — used so the prewarm effect
    // fires when the selection changes, not on every SSE status tick.
    const selectedCameraKey = useMemo(
        () => selectedCameras.map(c => c._id).join(','),
        [selectedCameras]
    );

    // Pre-warm the online cameras that are about to be rendered so their HLS
    // segments are ready as the grid mounts. The players start streams on
    // render anyway; prewarm just gives ffmpeg a small head-start. Dedup-safe
    // (ffmpegManager reuses in-flight starts), so overlap is harmless.
    useEffect(() => {
        const onlineIds = selectedCameras
            .filter(cam => (realtimeStatus[cam._id] || cam.status) === 'online')
            .map(cam => cam._id);
        if (onlineIds.length === 0) return;
        axios.post('/api/streams/prewarm', { cameraIds: onlineIds }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCameraKey]);

    // Calculate grid columns
    const gridCols = useMemo(() => {
        const count = selectedCameras.length;
        if (count <= 1) return 'grid-cols-1';
        if (count <= 4) return 'grid-cols-2';
        // Mobile priority: fewer columns on small screens
        if (count <= 12) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';
        if (count <= 24) return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4';
        return 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6';
    }, [selectedCameras.length]);

    const activeStreamCount = useMemo(() => {
        return selectedCameras.filter(cam => (realtimeStatus[cam._id] || cam.status) === 'online').length;
    }, [selectedCameras, realtimeStatus]);

    // Human-readable label for the current scope.
    const scopeLabel = useMemo(() => {
        if (filterMode === 'all') return 'Semua Proyek';
        if (filterMode === 'division') return contextDivision || 'Satu Divisi';
        const parts: string[] = [];
        if (contextDivision) parts.push(contextDivision);
        if (contextCategory) parts.push(contextCategory);
        return parts.length ? parts.join(' • ') : 'Semua Proyek';
    }, [filterMode, contextDivision, contextCategory]);

    // Effective division for page theming:
    // URL param "division" (contextDivision) prioritized;
    // fallback to common division among all selected locations if single division;
    // otherwise brand default.
    const effectiveDivision = useMemo(() => {
        if (contextDivision) return contextDivision;
        if (selectedLocationIds.length === 0) return null;
        const selectedDivisions = new Set<string>();
        for (const id of selectedLocationIds) {
            const loc = locations.find(l => l._id === id);
            if (loc?.division) selectedDivisions.add(loc.division);
        }
        if (selectedDivisions.size === 1) {
            return Array.from(selectedDivisions)[0];
        }
        return null;
    }, [contextDivision, selectedLocationIds, locations]);

    const pageStyle = useMemo(() => getDivisionCssVars(effectiveDivision) as React.CSSProperties, [effectiveDivision]);

    if (loading) {
        return <BrandLoader label="Memuat Multi-View" />;
    }

    return (
        <div style={pageStyle} className="h-dvh bg-slate-100 dark:bg-slate-950 flex overflow-hidden">
            {/* Sidebar selection */}
            <AnimatePresence mode="wait">
                {isSidebarOpen && (
                    <>
                        {/* Mobile backdrop — tap to close */}
                        <motion.div
                            key="sidebar-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[99] bg-black/60 backdrop-blur-sm sm:hidden"
                            onClick={() => setIsSidebarOpen(false)}
                        />
                        <motion.aside
                            aria-label="Pilih lokasi kamera"
                            initial={{ x: -400, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -400, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="fixed inset-y-0 left-0 w-[85%] sm:w-80 bg-white/95 dark:bg-slate-900/95 shadow-xl dark:shadow-none backdrop-blur-3xl border-r border-black/10 dark:border-white/5 flex flex-col z-[100] sm:relative sm:z-50 shrink-0 overflow-hidden"
                        >
                            <div className="w-full sm:w-80 h-full flex flex-col">
                                {/* Sidebar Header */}
                                <div className="p-6 border-b border-black/10 dark:border-white/5 bg-slate-50 dark:bg-slate-900/40">
                                    <div className="flex items-center justify-between gap-1 mb-6">
                                        <button
                                            onClick={() => router.back()}
                                            className={`min-h-10 min-w-10 flex items-center justify-center p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-slate-600 dark:text-slate-400 transition-colors ${FOCUS_RING}`}
                                            aria-label="Kembali"
                                        >
                                            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                                        </button>
                                        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight uppercase truncate">Pilih Lokasi</h2>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <ThemeToggle className="!px-2" />
                                            <button
                                                onClick={() => setIsSidebarOpen(false)}
                                                className={`min-h-10 min-w-10 flex items-center justify-center p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-slate-600 dark:text-slate-400 transition-colors group ${FOCUS_RING}`}
                                                title="Tutup panel pilihan"
                                                aria-label="Tutup panel pilihan lokasi"
                                            >
                                                <PanelLeftClose className="w-5 h-5 group-hover:scale-110 transition-transform" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Scope filter: ikuti proyek yang dibuka vs semua proyek */}
                                    <div className="mb-4">
                                        <div className="flex items-center gap-2 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-500">
                                            <Filter className="w-3.5 h-3.5" />
                                            Tampilkan
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {/* 1. Kategori ini (divisi + kategori yang dibuka) */}
                                            <button
                                                onClick={() => switchFilterMode('context')}
                                                disabled={!hasCategory}
                                                className={`${FOCUS_RING} min-h-10 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all border text-left ${
                                                    filterMode === 'context'
                                                        ? 'bg-[rgba(var(--div-accent-rgb),0.15)] border-[rgba(var(--div-accent-rgb),0.4)] div-accent-text'
                                                        : 'bg-black/[0.03] dark:bg-white/5 border-black/10 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/10'
                                                } ${!hasCategory ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                title={hasCategory ? 'Hanya kategori yang dibuka' : 'Tidak ada kategori konteks'}
                                            >
                                                <FolderTree className="w-3.5 h-3.5 shrink-0" />
                                                <span className="truncate">Kategori Ini</span>
                                            </button>
                                            {/* 2. Satu divisi (semua kategori dalam divisi) */}
                                            <button
                                                onClick={() => switchFilterMode('division')}
                                                disabled={!hasDivision}
                                                className={`${FOCUS_RING} min-h-10 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all border text-left ${
                                                    filterMode === 'division'
                                                        ? 'bg-[rgba(var(--div-accent-rgb),0.15)] border-[rgba(var(--div-accent-rgb),0.4)] div-accent-text'
                                                        : 'bg-black/[0.03] dark:bg-white/5 border-black/10 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/10'
                                                } ${!hasDivision ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                title={hasDivision ? `Semua kategori di ${contextDivision}` : 'Tidak ada divisi konteks'}
                                            >
                                                <Layers className="w-3.5 h-3.5 shrink-0" />
                                                <span className="truncate">Satu Divisi</span>
                                            </button>
                                            {/* 3. Semua proyek (lintas divisi) */}
                                            <button
                                                onClick={() => switchFilterMode('all')}
                                                className={`${FOCUS_RING} min-h-10 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all border text-left ${
                                                    filterMode === 'all'
                                                        ? 'bg-[rgba(var(--div-accent-rgb),0.15)] border-[rgba(var(--div-accent-rgb),0.4)] div-accent-text'
                                                        : 'bg-black/[0.03] dark:bg-white/5 border-black/10 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/10'
                                                }`}
                                                title="Semua proyek Brantas Abipraya (lintas divisi)"
                                            >
                                                <Globe className="w-3.5 h-3.5 shrink-0" />
                                                <span className="truncate">Semua Proyek</span>
                                            </button>
                                        </div>
                                        {filterMode !== 'all' && hasContext && (
                                            <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-500 font-medium truncate">
                                                {scopeLabel}
                                            </p>
                                        )}
                                    </div>

                                    <div className="relative group">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[var(--div-accent)] transition-colors" aria-hidden="true" />
                                        <input
                                            type="text"
                                            aria-label="Cari lokasi"
                                            placeholder="Cari lokasi..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full min-h-10 bg-white dark:bg-slate-950/50 border border-black/10 dark:border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)] transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Location List */}
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                                    {filteredLocations.length === 0 ? (
                                        <div className={`py-12 px-2 text-center text-xs font-bold tracking-wider ${fetchError ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400 uppercase'}`} role={fetchError ? 'alert' : undefined}>
                                            {fetchError ? 'Gagal memuat daftar lokasi. Mencoba lagi otomatis.' : 'Tidak ada lokasi'}
                                        </div>
                                    ) : filteredLocations.map(loc => {
                                        const isSelected = selectedLocationIds.includes(loc._id);
                                        return (
                                            <button
                                                key={loc._id}
                                                onClick={() => toggleLocation(loc._id)}
                                                aria-pressed={isSelected}
                                                className={`${FOCUS_RING} w-full min-h-10 flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 border hover:shadow-lg hover:-translate-y-0.5 active:scale-95 ${isSelected
                                                    ? 'bg-[rgba(var(--div-accent-rgb),0.1)] border-[rgba(var(--div-accent-rgb),0.3)] shadow-[rgba(var(--div-accent-rgb),0.05)]'
                                                    : 'bg-black/[0.03] dark:bg-white/5 border-transparent hover:bg-black/5 dark:hover:bg-white/10'
                                                    }`}
                                            >
                                                <div className={`shrink-0 ${isSelected ? 'div-accent-text' : 'text-slate-500 dark:text-slate-600'}`}>
                                                    {isSelected ? <CheckSquare className="w-5 h-5" aria-hidden="true" /> : <Square className="w-5 h-5" aria-hidden="true" />}
                                                </div>
                                                <div className="text-left min-w-0 flex-1">
                                                    <div className={`text-sm font-bold tracking-tight uppercase truncate ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                                        {loc.name}
                                                    </div>
                                                    <div className="text-[11px] text-slate-600 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                                                        {loc.cameras.length} KAMERA • {loc.category}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Sidebar Footer */}
                                <div className="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] bg-slate-50 dark:bg-slate-900/60 border-t border-black/10 dark:border-white/5">
                                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                                        <span className="text-slate-600 dark:text-slate-500">Dipilih</span>
                                        <span className="div-accent-text">{selectedLocationIds.length} Lokasi</span>
                                    </div>
                                </div>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>


            {/* Main Content Area */}
            <main className="flex-1 min-w-0 flex flex-col relative overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,1)_0%,rgba(226,232,240,1)_100%)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(15,23,42,1)_0%,rgba(2,6,23,1)_100%)]">
                {/* ── Dekorasi HUD command-center (murni visual, mengikuti tema divisi) ── */}
                {/* Grid radar halus beraksen divisi */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-0 opacity-[0.1]"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(var(--div-accent-rgb),0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--div-accent-rgb),0.5) 1px, transparent 1px)',
                        backgroundSize: '48px 48px',
                        maskImage: 'radial-gradient(ellipse 90% 80% at 50% 45%, #000 30%, transparent 100%)',
                        WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 45%, #000 30%, transparent 100%)',
                    }}
                />
                {/* Scanline tipis */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-0 hidden dark:block"
                    style={{
                        background:
                            'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 3px)',
                    }}
                />
                {/* Corner brackets HUD beraksen divisi */}
                {[
                    'top-1 left-1 border-t-2 border-l-2',
                    'top-1 right-1 border-t-2 border-r-2',
                    'bottom-1 left-1 border-b-2 border-l-2',
                    'bottom-1 right-1 border-b-2 border-r-2',
                ].map((pos) => (
                    <span
                        key={pos}
                        aria-hidden
                        // Hanya di layar lebar: di mobile header & kartu kamera memenuhi tepi,
                        // bracket jadi terlihat seperti border ganda.
                        className={`pointer-events-none absolute hidden lg:block w-5 h-5 z-[1] ${pos}`}
                        style={{ borderColor: 'rgba(var(--div-accent-rgb),0.55)' }}
                    />
                ))}

                {/* Overlay Header */}
                <header className="absolute top-0 left-0 right-0 z-40 p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between pointer-events-none gap-4">
                    <div className="flex items-center gap-3 sm:gap-4 pointer-events-auto w-full sm:w-auto">
                        {!isSidebarOpen && (
                            <button
                                onClick={() => setIsSidebarOpen(true)}
                                className={`${FOCUS_RING} min-h-10 min-w-10 flex items-center justify-center p-2.5 sm:p-3 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-lg dark:shadow-2xl group`}
                                title="Buka Sidebar"
                                aria-label="Buka sidebar pemilihan lokasi"
                            >
                                <PanelLeftOpen className="w-5 h-5 group-hover:scale-110 transition-transform" aria-hidden="true" />
                            </button>
                        )}
                        <div className="p-2.5 sm:p-3.5 min-w-0 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl shadow-lg dark:shadow-2xl flex items-center gap-3 sm:gap-4 flex-1 sm:flex-initial">
                            <div className="p-1.5 sm:p-2 bg-[rgba(var(--div-accent-rgb),0.1)] rounded-xl shrink-0">
                                <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5 div-accent-text" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight uppercase leading-none">Multi-View</h2>
                                <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                    <span className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">{activeStreamCount} Aktif</span>
                                    <span className="text-[11px] sm:text-xs text-slate-500" aria-hidden="true">•</span>
                                    <span className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-500 font-bold uppercase tracking-wider truncate max-w-[120px] sm:max-w-[200px]">{scopeLabel}</span>
                                </div>
                            </div>
                        </div>
                        <ThemeToggle className="sm:hidden shrink-0 bg-white/90 dark:bg-slate-900/80" />
                    </div>

                    <div className="flex items-center gap-3 pointer-events-auto hidden sm:flex">
                        <ThemeToggle className="bg-white/90 dark:bg-slate-900/80 !py-3.5" />
                        <div className="px-5 py-3.5 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl shadow-lg dark:shadow-2xl">
                            {/* eslint-disable-next-line @next/next/no-img-element -- logo statis lokal (SVG), tidak perlu optimasi next/image */}
                            <img src="/abipraya_blue.svg" alt="" aria-hidden="true" className="h-4 sm:h-6 block dark:hidden" />
                            {/* eslint-disable-next-line @next/next/no-img-element -- logo statis lokal (SVG), tidak perlu optimasi next/image */}
                            <img src="/abipraya_original.svg" alt="" aria-hidden="true" className="h-4 sm:h-6 hidden dark:block" />
                        </div>
                    </div>
                </header>

                {/* Grid Content */}
                <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 pt-28 sm:pt-24 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
                    <AnimatePresence mode="popLayout">
                        {selectedCameras.length > 0 ? (
                            <>
                                {fetchError && (
                                    <div role="alert" className="mb-4 px-5 py-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-between gap-3 text-sm">
                                        <span className="text-rose-700 dark:text-rose-300 font-semibold">Gagal memperbarui daftar lokasi. Mencoba lagi otomatis.</span>
                                    </div>
                                )}
                                {/* Warning if cameras were capped */}
                                {totalSelectedCameras > MAX_CAMERAS && (
                                    <div className="mb-4 px-5 py-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-3 text-sm">
                                        <svg aria-hidden="true" className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                        </svg>
                                        <span className="text-amber-800 dark:text-amber-300 font-semibold">
                                            Menampilkan {MAX_CAMERAS} dari {totalSelectedCameras} kamera.
                                            <span className="text-amber-700 dark:text-amber-400/80 font-normal ml-1">Kamera di urutan akhir tidak ditampilkan. Kurangi pilihan lokasi untuk melihat semuanya.</span>
                                        </span>
                                    </div>
                                )}
                                <motion.div
                                layout
                                className={`grid ${gridCols} ${selectedCameras.length > 9 ? 'gap-3' : 'gap-5'} auto-rows-fr`}
                            >
                                {orderedCameras.map((cam) => {
                                    const isOnline = (realtimeStatus[cam._id] || cam.status) === 'online';
                                    return (
                                    <motion.div
                                        // STABLE key (no index) so re-sorting/adding locations moves the
                                        // node instead of remounting the player (which would restart the stream).
                                        key={cam._id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.96 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.96 }}
                                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                        className={`relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl group ring-1 transition-all duration-500 hover:-translate-y-1 ${
                                            isOnline
                                                ? 'ring-emerald-500/20 border border-emerald-500/20 hover:ring-emerald-500/40'
                                                : 'ring-rose-500/20 border border-rose-500/20'
                                        }`}
                                    >
                                        {/* Persistent bottom label bar (always readable) */}
                                        <div className="absolute bottom-0 left-0 right-0 z-10 px-3 py-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-end justify-between gap-2 pointer-events-none">
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[11px] font-bold text-white uppercase tracking-tight truncate leading-tight drop-shadow-md">
                                                    {cam.name}
                                                </span>
                                                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider truncate">
                                                    {cam.locationName}
                                                </span>
                                            </div>
                                            <div className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg backdrop-blur-md border ${
                                                isOnline ? 'bg-emerald-900/50 border-emerald-500/40' : 'bg-rose-900/50 border-rose-500/40'
                                            }`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                                                <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                                                    {isOnline ? 'Live' : 'Offline'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* cameraId only — no RTSP URL exposed to client */}
                                        <OptimizedVideoPlayer
                                            cameraId={cam._id}
                                            manager={streamManager}
                                            onStatusChange={(status) => setRealtimeStatus(prev => ({ ...prev, [cam._id]: status }))}
                                        />
                                    </motion.div>
                                    );
                                })}
                            </motion.div>
                            </>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="h-full flex flex-col items-center justify-center text-center px-6 sm:px-12"
                            >
                                <div className="w-24 h-24 rounded-[2.5rem] bg-white/80 dark:bg-slate-900/50 border border-black/10 dark:border-white/5 flex items-center justify-center mb-8 shadow-lg dark:shadow-2xl">
                                    <LayoutGrid className="w-10 h-10 text-slate-500 dark:text-slate-600 opacity-50" aria-hidden="true" />
                                </div>
                                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight uppercase mb-4">Belum Ada Kamera Dipilih</h2>
                                <p className="text-slate-600 dark:text-slate-500 text-sm max-w-md font-medium dark:opacity-70 leading-relaxed">
                                    Pilih lokasi dari panel sebelah kiri untuk mulai memantau beberapa aliran kamera secara bersamaan.
                                </p>
                                {!isSidebarOpen && (
                                    <button
                                        onClick={() => setIsSidebarOpen(true)}
                                        className={`${FOCUS_RING} mt-10 min-h-10 px-8 py-4 div-accent-solid hover:brightness-110 text-slate-950 font-bold uppercase tracking-wider rounded-2xl transition-all shadow-xl shadow-[rgba(var(--div-accent-rgb),0.2)] active:scale-95 flex items-center gap-3`}
                                    >
                                        <PanelLeftOpen className="w-5 h-5" aria-hidden="true" />
                                        Buka Filter Lokasi
                                    </button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}

export default function MultiViewPage() {
    return (
        <Suspense fallback={<BrandLoader label="Memuat Multi-View" />}>
            <MultiViewContent />
        </Suspense>
    );
}
