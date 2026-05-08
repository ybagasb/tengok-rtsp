"use client";

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import L from 'leaflet';
import axios from 'axios';
import { Home, LayoutGrid, MapPin, Search, Loader2, X as CloseIcon, Signal, SignalZero, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CameraPanel from './CameraPanel';
import MarkerClusterGroup from 'react-leaflet-cluster';
import ResourceMonitor from './ResourceMonitor';
import { useCameraStatusSSE } from '@/hooks/useCameraStatusSSE';

// Fix Leaflet blank marker issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Icons based on status
const createIcon = (color: string, isLive: boolean = false) => {
    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="${isLive ? 'marker-pulse' : ''}" style="background-color: ${color}; width: 22px; height: 22px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px rgba(0,0,0,0.3);"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
};

const iconGreen = createIcon('#22c55e', true); // Green + Pulse
const iconRed = createIcon('#ef4444', false); // Red

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
}

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
}

function MapResize({ selectedLocation }: { selectedLocation: any }) {
    const map = useMap();
    useEffect(() => {
        // Wait for CSS transition to complete before invalidating size
        const timeout = setTimeout(() => {
            map.invalidateSize();
        }, 350);
        return () => clearTimeout(timeout);
    }, [selectedLocation, map]);
    return null;
}

export default function MapComponent({ category: propCategory, allowedLocationIds, sharedMode = false }: { category?: string | null; allowedLocationIds?: string[]; sharedMode?: boolean }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const category = propCategory || searchParams.get('category');

    const [locations, setLocations] = useState<LocationData[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [center, setCenter] = useState<[number, number]>([-4.944993, 113.4942317]);
    const [defaultZoom, setDefaultZoom] = useState(6.25);
    const { realtimeStatuses, setRealtimeStatuses, lastCheckedTimes } = useCameraStatusSSE();
    const [showDelayNotice, setShowDelayNotice] = useState(true); // kept for potential future use
    // Individual toast visibility
    const [toast1, setToast1] = useState(true); // Info Streaming (always on mobile)
    const [toast2, setToast2] = useState(true); // Pengecekan Otomatis (sm+)
    const [toast3, setToast3] = useState(true); // Disclaimer (sm+)
    const allToastsClosed = !toast1 && !toast2 && !toast3;

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);

    // Click outside listener
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setToast1(false);
            setToast2(false);
            setToast3(false);
        }, 10000);
        return () => clearTimeout(timer);
    }, []);

    // Fetch category data for custom map defaults
    useEffect(() => {
        if (!category || sharedMode) return;
        axios.get('/api/categories')
            .then(res => {
                const cats = res.data || [];
                const cat = cats.find((c: any) => c.identifier === category);
                if (cat) {
                    if (cat.defaultLat && cat.defaultLng) {
                        setCenter([cat.defaultLat, cat.defaultLng]);
                    }
                    if (cat.defaultZoom) {
                        setDefaultZoom(cat.defaultZoom);
                    }
                }
            })
            .catch(() => {}); // Fail silently, use defaults
    }, [category, sharedMode]);

    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();
        let hasProbed = false;

        if (!category && !sharedMode) {
            router.push('/categories');
            return;
        }

        const fetchLocations = async () => {
            try {
                const apiUrl = category ? `/api/locations?category=${category}` : '/api/locations';
                const res = await axios.get(apiUrl, { signal: controller.signal });
                let rawLocations = res.data.data;
                // Filter locations if allowedLocationIds is provided (shared mode)
                if (allowedLocationIds && allowedLocationIds.length > 0) {
                    rawLocations = rawLocations.filter((loc: any) => allowedLocationIds.includes(loc._id));
                }
                const fetchedLocations = rawLocations.map((loc: any) => {
                    let onlineCount = 0;
                    let offlineCount = 0;
                    if (loc.cameras) {
                        loc.cameras.forEach((cam: any) => {
                            if (cam.status === 'online') onlineCount++;
                            else offlineCount++;
                        });
                    }
                    return { ...loc, onlineCount, offlineCount };
                });

                if (!isMounted) return;
                setLocations(fetchedLocations);

                // On first load: trigger background probe — results flow into DB
                // and are picked up by the 3s polling below
                if (!hasProbed) {
                    hasProbed = true;
                    const allCameraIds = fetchedLocations.flatMap((loc: any) =>
                        (loc.cameras || []).map((cam: any) => cam._id)
                    );
                    if (allCameraIds.length > 0) {
                        axios.post('/api/cameras/probe-now', { cameraIds: allCameraIds })
                            .catch(() => {}); // Fire and forget — 202 returned immediately
                    }
                }
            } catch (error) {
                if (axios.isCancel(error)) return;
                console.error("Failed to fetch locations", error);
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
    }, [category, router, sharedMode, allowedLocationIds]);

    // Polling removed in favor of Server-Sent Events (useCameraStatusSSE)

    // Update online/offline counts for locations whenever realtimeStatuses changes
    useEffect(() => {
        setLocations(prevLocations => {
            return prevLocations.map(loc => {
                let currentOnlineCount = 0;
                let currentOfflineCount = 0;
                loc.cameras.forEach(cam => {
                    const status = realtimeStatuses[cam._id] || cam.status;
                    if (status === 'online') {
                        currentOnlineCount++;
                    } else if (status === 'offline') {
                        currentOfflineCount++;
                    }
                });
                return {
                    ...loc,
                    onlineCount: currentOnlineCount,
                    offlineCount: currentOfflineCount
                };
            });
        });

        // Also update selectedLocation if it's currently open
        setSelectedLocation(prevSelected => {
            if (prevSelected) {
                const updatedSelected = locations.find((l: any) => l._id === prevSelected._id);
                if (updatedSelected) return updatedSelected;
            }
            return prevSelected;
        });

    }, [realtimeStatuses]); // Depend on realtimeStatuses

    // Custom Glassmorphic Scrollbar + hide Leaflet attribution
    const scrollbarStyles = `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(234, 179, 8, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(234, 179, 8, 0.4); }
        .leaflet-control-attribution { display: none !important; }
        .leaflet-tooltip.custom-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
        .leaflet-tooltip-top.custom-tooltip:before { border-top-color: transparent !important; }
        .pulse-emerald { animation: pulse-emerald 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse-emerald { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        .marker-pulse { animation: marker-pulse 1.5s ease-in-out infinite; }
        @keyframes marker-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 70% { box-shadow: 0 0 0 10px rgba(34,197,94,0); } }
    `;

    // Handle Search Logic
    useEffect(() => {
        if (searchQuery.length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            setSelectedIndex(-1);
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            setIsSearching(true);
            setShowSuggestions(true);
            try {
                // Local Filtering - Filter projects only
                const localMatches = locations
                    .filter(loc => loc.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(loc => ({
                        id: loc._id,
                        display_name: loc.name,
                        lat: loc.lat,
                        lon: loc.lng,
                        type: 'local',
                        fullData: loc
                    }));

                setSuggestions(localMatches);
                setSelectedIndex(localMatches.length > 0 ? 0 : -1);
            } catch (error) {
                console.error("Search error:", error);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery, locations]);

    const handleSelectSuggestion = (suggestion: any) => {
        if (!suggestion || !suggestion.fullData) return;
        const coords: [number, number] = [suggestion.lat, suggestion.lon];

        setCenter(coords);
        setSearchQuery(suggestion.display_name);
        setShowSuggestions(false);
        setSelectedIndex(-1);
        setSelectedLocation(suggestion.fullData);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            if (selectedIndex >= 0) {
                handleSelectSuggestion(suggestions[selectedIndex]);
            } else if (suggestions.length > 0) {
                handleSelectSuggestion(suggestions[0]);
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    if (!category && !sharedMode) return null;

    return (
        <div className="flex h-screen w-full bg-slate-950 overflow-hidden relative">
            {/* Header / Nav overlay */}
            <div className="absolute top-4 sm:top-6 left-2 sm:left-6 right-2 sm:right-6 z-[400] flex items-start justify-between pointer-events-none gap-2 sm:gap-3">
                
                {/* Navigation Buttons Group — hidden in shared mode */}
                {!sharedMode && (
                <div className={`flex flex-col gap-2 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] pointer-events-auto ${selectedLocation ? 'opacity-0 -translate-x-6 pointer-events-none' : 'opacity-100 translate-x-0'}`}>
                    <button
                        onClick={() => router.push('/categories')}
                        className="p-3 sm:p-3.5 bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 text-white hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all group shrink-0"
                        title="Kembali ke Kategori"
                    >
                        <Home className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
                    </button>
                    <button
                        onClick={() => router.push('/multiview')}
                        className="p-3 sm:p-3.5 bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 text-yellow-500 hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all group shrink-0"
                        title="Ke Halaman Multi-View"
                    >
                        <LayoutGrid className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>

                </div>
                )}

                {/* Search Bar — hidden in shared mode */}
                {!sharedMode && (
                <div ref={searchRef} className={`flex-1 sm:max-w-xl sm:mx-8 relative pointer-events-auto transition-all duration-700 ${selectedLocation ? 'opacity-0 md:opacity-100 pointer-events-none md:pointer-events-auto' : 'opacity-100'}`}>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-yellow-500 transition-colors">
                            {isSearching ? (
                                <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
                            ) : (
                                <Search className="w-4 h-4" />
                            )}
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => setShowSuggestions(true)}
                            onKeyDown={handleKeyDown}
                            placeholder={`Search ${category || 'location'}...`}
                            className="w-full bg-slate-900/80 backdrop-blur-2xl text-white placeholder:text-slate-400 text-xs sm:text-sm py-3 sm:py-4 pl-9 sm:pl-11 pr-10 sm:pr-12 rounded-2xl border border-white/10 focus:border-yellow-500/50 focus:ring-4 focus:ring-yellow-500/10 transition-all outline-none shadow-2xl"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setSuggestions([]);
                                    setShowSuggestions(false);
                                }}
                                className="absolute inset-y-0 right-2 flex items-center px-2 group/clear transition-all"
                                title="Clear search"
                            >
                                <div className="p-1.5 rounded-full bg-white/5 group-hover/clear:bg-red-500/20 text-slate-400 group-hover/clear:text-red-400 transition-all border border-white/5">
                                    <CloseIcon className="w-3.5 h-3.5" />
                                </div>
                            </button>
                        )}
                    </div>

                    {/* Suggestions Dropdown */}
                    {showSuggestions && (searchQuery.length >= 3) && (
                        <div className="absolute top-full mt-3 left-0 right-0 bg-slate-900/90 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[600]">
                            <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                {suggestions.length > 0 ? (
                                    suggestions.map((item, idx) => (
                                        <button
                                            key={`${item.id}-${idx}`}
                                            onClick={() => handleSelectSuggestion(item)}
                                            onMouseEnter={() => setSelectedIndex(idx)}
                                            className={`w-full px-5 py-3.5 flex items-center gap-4 transition-colors text-left group border-b border-white/5 last:border-0 ${selectedIndex === idx ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                        >
                                            <div className="p-2 rounded-lg shrink-0 bg-yellow-500/10">
                                                <MapPin className="w-4 h-4 text-yellow-500" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-bold text-white truncate flex items-center justify-between gap-2">
                                                    {item.display_name}
                                                    <span className="text-[9px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-1.5 py-0.5 rounded-md uppercase tracking-tight opacity-70">
                                                        View Result
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-slate-500 truncate mt-0.5 font-medium">
                                                    Project Location in {category}
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                ) : !isSearching && searchQuery.length >= 3 ? (
                                    <div className="px-5 py-8 text-center">
                                        <div className="text-slate-500 text-sm mb-1">No results found for</div>
                                        <div className="text-white font-bold text-sm truncate px-4">"{searchQuery}"</div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>
                )}

                {/* Category badge — hidden in shared mode */}
                {!sharedMode && (
                <div className="hidden sm:flex px-4 sm:px-6 py-3.5 bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 text-white font-bold uppercase tracking-wider items-center gap-3 pointer-events-auto text-xs">
                    <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.8)] animate-pulse" />
                    <span className="truncate max-w-[100px] sm:max-w-none">{category}</span>
                </div>
                )}
            </div>

            {/* Map Container - Absolute inset-0 ensures it fills the background regardless of flex flow */}
            <div className={`absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${selectedLocation ? 'md:pr-[520px]' : ''}`}>
                <style>{scrollbarStyles}</style>
                {!loading && (
                    <MapContainer
                        center={center}
                        zoom={defaultZoom}
                        zoomSnap={0.25}
                        style={{ height: '100%', width: '100%', zIndex: 0 }}
                        zoomControl={false}
                        attributionControl={false}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapResize selectedLocation={selectedLocation} />
                        <ChangeView center={center} zoom={selectedLocation ? 14 : defaultZoom} />

                        <MarkerClusterGroup chunkedLoading>
                            {locations.map((loc) => {
                                let dynamicOnlineCount = 0;
                                let dynamicOfflineCount = 0;

                                if (loc.cameras) {
                                    loc.cameras.forEach(cam => {
                                        if ((realtimeStatuses[cam._id] || cam.status) === 'online') {
                                            dynamicOnlineCount++;
                                        } else {
                                            dynamicOfflineCount++;
                                        }
                                    });
                                }

                                const isMajorityOnline = dynamicOnlineCount >= dynamicOfflineCount;

                                return (
                                    <Marker
                                        key={loc._id}
                                        position={[loc.lat, loc.lng]}
                                        icon={isMajorityOnline ? iconGreen : iconRed}
                                        eventHandlers={{
                                            click: () => {
                                                setSelectedLocation(loc);
                                                setCenter([loc.lat, loc.lng]);
                                            }
                                        }}
                                    >
                                        <Tooltip
                                            direction="top"
                                            offset={[0, -15]}
                                            opacity={1}
                                            className="custom-tooltip"
                                            permanent={true}
                                            interactive={true}
                                        >
                                            <div className="flex flex-col min-w-[160px] overflow-hidden rounded-2xl shadow-2xl border border-white/10 bg-slate-950/40 backdrop-blur-md">
                                                {/* Tooltip Header */}
                                                <div className="px-3.5 py-2.5 bg-slate-900/90 border-b border-white/10 flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${isMajorityOnline ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]'} mr-1`} />
                                                    <div className="text-[10px] font-bold text-white/90 uppercase tracking-wider truncate">
                                                        {loc.name}
                                                    </div>
                                                </div>

                                                {/* Tooltip Body */}
                                                <div className="p-3 bg-slate-900/60 flex flex-col gap-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        {/* Online Pill */}
                                                        <div className="flex-1 flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 group/pill">
                                                            <div className="flex items-center gap-2">
                                                                <div className="relative">
                                                                    <Signal className="w-4 h-4 text-emerald-400" />
                                                                    <div className="absolute inset-0 bg-emerald-400 blur-sm opacity-60 pulse-emerald" />
                                                                </div>
                                                                <span className="text-[14px] font-bold text-white leading-none">{dynamicOnlineCount}</span>
                                                            </div>
                                                            <span className="text-[9px] font-bold text-emerald-400/80 uppercase tracking-wider">Online</span>
                                                        </div>

                                                        {/* Offline Pill */}
                                                        <div className="flex-1 flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-xl bg-rose-500/20 border border-rose-500/30">
                                                            <div className="flex items-center gap-2">
                                                                <SignalZero className="w-4 h-4 text-rose-400" />
                                                                <span className="text-[14px] font-bold text-white leading-none">{dynamicOfflineCount}</span>
                                                            </div>
                                                            <span className="text-[9px] font-bold text-rose-400/80 uppercase tracking-wider">Offline</span>
                                                        </div>
                                                    </div>
                                                    {/* Last Checked Timestamp */}
                                                    {(() => {
                                                        // Find most recent lastCheckedAt among this location's cameras
                                                        let latest: string | null = null;
                                                        loc.cameras?.forEach((cam: any) => {
                                                            const t = lastCheckedTimes?.[cam._id] || cam.lastCheckedAt;
                                                            if (t && (!latest || new Date(t) > new Date(latest))) latest = t;
                                                        });
                                                        if (!latest) return null;
                                                        const diff = Math.floor((Date.now() - new Date(latest).getTime()) / 1000);
                                                        let rel = 'Baru saja';
                                                        if (diff >= 86400) rel = `${Math.floor(diff / 86400)}h lalu`;
                                                        else if (diff >= 3600) rel = `${Math.floor(diff / 3600)}j lalu`;
                                                        else if (diff >= 60) rel = `${Math.floor(diff / 60)}m lalu`;
                                                        return (
                                                            <div className="text-center pt-1 border-t border-white/5">
                                                                <span className="text-[8px] font-semibold text-slate-500 tracking-wide">
                                                                    Dicek {rel}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </Tooltip>
                                    </Marker>
                                )
                            })}
                        </MarkerClusterGroup>
                    </MapContainer>
                )}
            </div>

            {/* Delay Notice Toast Stack */}
            <AnimatePresence>
                {(toast1 || toast2 || toast3) && (
                    <motion.div
                        className={`fixed z-[2000] flex flex-col-reverse gap-2.5 pointer-events-none ${selectedLocation ? 'hidden md:flex' : 'flex'} ${
                            sharedMode ? 'bottom-6 left-4' : 'bottom-20 sm:bottom-4 left-4 sm:left-[220px]'
                        }`}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        variants={{
                            hidden: {},
                            visible: { transition: { staggerChildren: 0.2, staggerDirection: -1 } },
                            exit:    { transition: { staggerChildren: 0.08, staggerDirection: 1  } },
                        }}
                    >
                        {/* Toast 3: Disclaimer - hidden on mobile */}
                        <AnimatePresence>
                            {toast3 && (
                                <motion.div
                                    key="toast3"
                                    variants={{
                                        hidden:  { opacity: 0, y: 20, scale: 0.95, filter: 'blur(4px)' },
                                        visible: { opacity: 1, y: 0,  scale: 1,    filter: 'blur(0px)', transition: { type: 'spring', stiffness: 320, damping: 28 } },
                                        exit:    { opacity: 0, y: 12, scale: 0.95, filter: 'blur(4px)', transition: { duration: 0.18 } },
                                    }}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    className="hidden sm:flex w-[min(380px,calc(100vw-2rem))] bg-slate-900/95 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-2xl p-3.5 gap-3.5 items-start pointer-events-auto ring-1 ring-white/5 relative"
                                >
                                    <div className="text-lg shrink-0 pt-0.5 drop-shadow-md">🙏</div>
                                    <div className="flex-1 mt-0.5 pr-6">
                                        <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                                            <strong className="text-slate-200">Perlu diketahui:</strong> Status <span className="text-emerald-400">online</span> / <span className="text-rose-400">offline</span> yang tertera <strong className="text-slate-300">dapat berubah sewaktu-waktu</strong> karena kondisi jaringan. Mohon maaf jika terdapat perbedaan status.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setToast3(false)}
                                        className="absolute top-2.5 right-2.5 text-slate-500 hover:text-white p-1 hover:bg-white/5 rounded-lg transition-colors shrink-0 pointer-events-auto"
                                        title="Tutup"
                                    >
                                        <CloseIcon className="w-3.5 h-3.5" />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Toast 2: Pengecekan Otomatis - hidden on mobile */}
                        <AnimatePresence>
                            {toast2 && (
                                <motion.div
                                    key="toast2"
                                    variants={{
                                        hidden:  { opacity: 0, y: 20, scale: 0.95, filter: 'blur(4px)' },
                                        visible: { opacity: 1, y: 0,  scale: 1,    filter: 'blur(0px)', transition: { type: 'spring', stiffness: 320, damping: 28 } },
                                        exit:    { opacity: 0, y: 12, scale: 0.95, filter: 'blur(4px)', transition: { duration: 0.18 } },
                                    }}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    className="hidden sm:flex w-[min(380px,calc(100vw-2rem))] bg-slate-900/95 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-2xl p-3.5 gap-3.5 items-start pointer-events-auto ring-1 ring-white/5 relative"
                                >
                                    <div className="text-lg shrink-0 pt-0.5 drop-shadow-md">💡</div>
                                    <div className="flex-1 mt-0.5 pr-6">
                                        <p className="text-xs text-slate-400 leading-relaxed font-medium">
                                            <strong className="text-slate-200">Pengecekan Otomatis:</strong> Sistem memeriksa status kamera secara berkala dan bertahap untuk memastikan data selalu terbaru.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setToast2(false)}
                                        className="absolute top-2.5 right-2.5 text-slate-500 hover:text-white p-1 hover:bg-white/5 rounded-lg transition-colors shrink-0 pointer-events-auto"
                                        title="Tutup"
                                    >
                                        <CloseIcon className="w-3.5 h-3.5" />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Toast 1: Info Streaming — always visible */}
                        <AnimatePresence>
                            {toast1 && (
                                <motion.div
                                    key="toast1"
                                    variants={{
                                        hidden:  { opacity: 0, y: 20, scale: 0.95, filter: 'blur(4px)' },
                                        visible: { opacity: 1, y: 0,  scale: 1,    filter: 'blur(0px)', transition: { type: 'spring', stiffness: 320, damping: 28 } },
                                        exit:    { opacity: 0, y: 12, scale: 0.95, filter: 'blur(4px)', transition: { duration: 0.18 } },
                                    }}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    className="w-[min(380px,calc(100vw-2rem))] bg-slate-900/95 backdrop-blur-2xl border border-yellow-500/30 shadow-2xl rounded-2xl p-4 flex gap-3.5 items-start pointer-events-auto ring-1 ring-white/5 relative"
                                >
                                    <div className="p-2 bg-yellow-500/10 rounded-xl shrink-0">
                                        <Info className="w-5 h-5 text-yellow-500" />
                                    </div>
                                    <div className="flex-1 mt-0.5 pr-6">
                                        <h4 className="text-sm font-bold text-white tracking-wide">Informasi Streaming</h4>
                                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                            Proses memuat video CCTV membutuhkan waktu beberapa saat. Kecepatan bergantung pada <span className="text-slate-300 font-bold">stabilitas jaringan</span> di masing-masing lokasi.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setToast1(false)}
                                        className="absolute top-3 right-3 text-slate-500 hover:text-white p-1 hover:bg-white/5 rounded-lg transition-colors shrink-0 pointer-events-auto"
                                        title="Tutup"
                                    >
                                        <CloseIcon className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>


            {/* Info Re-open Button — muncul hanya jika semua toast sudah ditutup */}
            <AnimatePresence>
                {allToastsClosed && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.5, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.5, y: 10 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        onClick={() => { setToast1(true); setToast2(true); setToast3(true); }}
                        className={`fixed z-[1900] ${selectedLocation ? 'hidden md:flex' : 'flex'} items-center justify-center border transition-all group ${
                            sharedMode
                                ? 'bottom-6 left-4 w-[44px] h-[44px] rounded-2xl bg-slate-900/80 backdrop-blur-2xl border-white/10 shadow-2xl hover:bg-slate-800/90 hover:border-yellow-500/50'
                                : 'bottom-4 left-4 sm:left-[150px] px-3 py-2 rounded-2xl border-white/10 shadow-2xl hover:bg-white/5'
                        }`}
                        style={!sharedMode ? { backdropFilter: 'blur(20px)', background: 'rgba(2, 6, 23, 0.85)' } : {}}
                        title="Informasi Delay Streaming"
                    >
                        <Info className="w-4 h-4 text-yellow-500 group-hover:scale-110 transition-transform" />
                    </motion.button>
                )}
            </AnimatePresence>


            {/* Resource Monitor — hidden in shared mode */}
            {!sharedMode && (
                <div className={selectedLocation ? 'hidden md:block' : 'block'}>
                    <ResourceMonitor />
                </div>
            )}

            {/* PT Brantas Abipraya — Brand Identity Watermark (hidden in sharedMode, page.tsx has its own BrandingOverlay) */}
            {!sharedMode && (
            <div className={`fixed bottom-4 right-4 z-[500] pointer-events-none transition-all duration-700 ${selectedLocation ? 'opacity-0' : 'opacity-100'}`}>
                <div className="flex items-center gap-2.5 bg-slate-950/70 backdrop-blur-xl rounded-2xl px-3.5 py-2.5 border border-white/5 shadow-2xl">
                    <img
                        src="/abipraya_original.svg"
                        alt="PT Brantas Abipraya"
                        className="w-7 h-7 object-contain opacity-70"
                        draggable={false}
                    />
                    <div className="hidden sm:block">
                        <p className="text-[9px] font-bold text-white/50 uppercase tracking-[0.15em] leading-none">PT Brantas Abipraya</p>
                        <p className="text-[8px] font-medium text-white/25 uppercase tracking-wider mt-0.5">Smart Monitoring</p>
                    </div>
                </div>
            </div>
            )}

            {/* Side Panel for Camera Details */}
            <div className={`fixed inset-y-0 right-0 z-[1000] w-full md:w-[520px] bg-slate-950/80 backdrop-blur-3xl border-l border-white/5 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] transform transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${selectedLocation ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedLocation && (
                    <div className="h-full flex flex-col custom-scrollbar overflow-y-auto">
                        <CameraPanel
                            location={selectedLocation}
                            onClose={() => setSelectedLocation(null)}
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
