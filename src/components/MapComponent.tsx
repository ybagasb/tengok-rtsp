"use client";

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import L from 'leaflet';
import axios from 'axios';
import { ArrowLeft, Video, WifiIcon, WifiOff, MapPin, Search, Loader2, X as CloseIcon, Signal, SignalZero } from 'lucide-react';
import CameraPanel from './CameraPanel';
import MarkerClusterGroup from 'react-leaflet-cluster';

// Fix Leaflet blank marker issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/leaflet/marker-icon-2x.png',
    iconUrl: '/leaflet/marker-icon.png',
    shadowUrl: '/leaflet/marker-shadow.png',
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

export default function MapComponent({ category: propCategory }: { category?: string | null }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const category = propCategory || searchParams.get('category');

    const [locations, setLocations] = useState<LocationData[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [center, setCenter] = useState<[number, number]>([-4.4943173, 113.2007588]); // Specific default position
    const [realtimeStatuses, setRealtimeStatuses] = useState<Record<string, 'online' | 'offline'>>({});

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
        let isMounted = true;
        const controller = new AbortController();

        if (!category) {
            router.push('/categories');
            return;
        }

        const fetchLocations = async () => {
            try {
                const res = await axios.get(`/api/locations?category=${category}`, { signal: controller.signal });
                const fetchedLocations = res.data.data.map((loc: any) => {
                    let onlineCount = 0;
                    let offlineCount = 0;
                    if (loc.cameras) {
                        loc.cameras.forEach((cam: any) => {
                            if (cam.status === 'online') onlineCount++;
                            else offlineCount++;
                        });
                    }
                    return {
                        ...loc,
                        onlineCount,
                        offlineCount
                    };
                });

                if (!isMounted) return;

                setLocations(fetchedLocations);
                if (fetchedLocations.length > 0) {
                    setCenter([fetchedLocations[0].lat, fetchedLocations[0].lng]);
                }

            } catch (error) {
                if (axios.isCancel(error)) return;
                console.error("Failed to fetch locations", error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchLocations();

        const getProxiedUrl = (url: string) => {
            if (!url) return '';
            if (url.includes('10.10.56.90')) return url.replace('http://10.10.56.90:8080', '/shinobi-proxy-90');
            if (url.includes('10.10.56.94')) return url.replace('http://10.10.56.94:8080', '/shinobi-proxy-94');
            if (url.includes('10.10.56.89')) return url.replace('http://10.10.56.89:8080', '/shinobi-proxy');
            return url;
        };

        const checkCameraStatuses = async (currentLocations: LocationData[]) => {
            if (!isMounted) return;
            const updates: Record<string, 'online' | 'offline'> = {};

            // Collect all stream URLs and check them
            const checks = currentLocations.flatMap(loc => loc.cameras || []).map(async (cam) => {
                const proxyUrl = getProxiedUrl(cam.streamUrl);
                if (!proxyUrl) return;

                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

                    const res = await fetch(proxyUrl, {
                        method: 'GET',
                        signal: controller.signal,
                        // We only need headers or a fast fail, but we'll fetch a bit of the manifest
                    });
                    clearTimeout(timeoutId);

                    if (res.ok) {
                        const text = await res.text();
                        if (text.includes('#EXTM3U') || text.includes('.ts') || text.includes('ftyp')) {
                            updates[cam._id] = 'online';
                            return;
                        }
                    }
                    updates[cam._id] = 'offline';
                } catch (error) {
                    updates[cam._id] = 'offline';
                }
            });

            await Promise.allSettled(checks);

            if (isMounted) {
                setRealtimeStatuses(prev => {
                    // Only update if changed
                    let changed = false;
                    for (const id in updates) {
                        if (prev[id] !== updates[id]) {
                            changed = true;
                            break;
                        }
                    }
                    return changed ? { ...prev, ...updates } : prev;
                });
            }
        };

        // Status Polling Interval (every 15 seconds)
        let pollInterval: NodeJS.Timeout;

        // Initial check after fetching
        const initialCheckTimeout = setTimeout(() => {
            setLocations(prevLocs => {
                checkCameraStatuses(prevLocs);
                return prevLocs;
            });
            pollInterval = setInterval(() => {
                setLocations(prevLocs => {
                    checkCameraStatuses(prevLocs);
                    return prevLocs;
                });
            }, 15000);
        }, 1000);

        return () => {
            isMounted = false;
            clearTimeout(initialCheckTimeout);
            if (pollInterval) clearInterval(pollInterval);
            controller.abort();
        };
    }, [category, router]);

    // Update online/offline counts for locations whenever realtimeStatuses changes
    useEffect(() => {
        setLocations(prevLocations => {
            return prevLocations.map(loc => {
                let currentOnlineCount = 0;
                let currentOfflineCount = 0;
                loc.cameras.forEach(cam => {
                    if (realtimeStatuses[cam._id] === 'online') {
                        currentOnlineCount++;
                    } else if (realtimeStatuses[cam._id] === 'offline') {
                        currentOfflineCount++;
                    }
                    // If status is not yet determined, it doesn't count as online or offline
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

    // Custom Glassmorphic Scrollbar Styles
    const scrollbarStyles = `
        .custom-scrollbar::-webkit-scrollbar {
            width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: rgba(15, 23, 42, 0.1);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(234, 179, 8, 0.2);
            border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(234, 179, 8, 0.4);
        }

        .pulse-emerald {
            animation: pulse-emerald 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes pulse-emerald {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
        }

        .leaflet-tooltip.custom-tooltip {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
        }
        .leaflet-tooltip-top.custom-tooltip:before {
            border-top-color: transparent !important;
        }
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

    if (!category) return null;

    return (
        <div className="flex h-screen w-full bg-slate-950 overflow-hidden relative">
            {/* Header / Nav overlay */}
            <div className="absolute top-4 sm:top-6 left-2 sm:left-6 right-2 sm:right-6 z-[400] flex items-center justify-between pointer-events-none gap-2 sm:gap-3">
                <button
                    onClick={() => router.push('/categories')}
                    className="p-3 sm:p-3.5 bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 text-white hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all pointer-events-auto group shrink-0"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                </button>

                {/* Search Bar */}
                <div ref={searchRef} className="flex-1 max-w-[55vw] sm:max-w-xl sm:mx-8 relative pointer-events-auto">
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
                                        <div className="text-slate-500 text-sm mb-1 italic">No results found for</div>
                                        <div className="text-white font-bold text-sm truncate px-4">"{searchQuery}"</div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>

                <div className="hidden sm:flex px-4 sm:px-6 py-3.5 bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 text-white font-black uppercase tracking-[0.2em] items-center gap-3 pointer-events-auto italic text-xs">
                    <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.8)] animate-pulse" />
                    <span className="truncate max-w-[100px] sm:max-w-none">{category}</span>
                </div>
            </div>

            {/* Map Container - Absolute inset-0 ensures it fills the background regardless of flex flow */}
            <div className={`absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${selectedLocation ? 'md:pr-[520px]' : ''}`}>
                <style>{scrollbarStyles}</style>
                {!loading && (
                    <MapContainer
                        center={center}
                        zoom={6.5}
                        style={{ height: '100%', width: '100%', zIndex: 0 }}
                        zoomControl={false}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapResize selectedLocation={selectedLocation} />
                        <ChangeView center={center} zoom={selectedLocation ? 14 : 6.5} />

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
                                                    <div className="text-[10px] font-black text-white/90 uppercase tracking-[0.15em] truncate italic">
                                                        {loc.name}
                                                    </div>
                                                </div>

                                                {/* Tooltip Body */}
                                                <div className="p-3 bg-slate-900/60 flex items-center justify-between gap-3">
                                                    {/* Online Pill */}
                                                    <div className="flex-1 flex items-center justify-center gap-2 px-2.5 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 group/pill">
                                                        <div className="relative">
                                                            <Signal className="w-4 h-4 text-emerald-400" />
                                                            <div className="absolute inset-0 bg-emerald-400 blur-sm opacity-60 pulse-emerald" />
                                                        </div>
                                                        <span className="text-[14px] font-black text-white leading-none">{dynamicOnlineCount}</span>
                                                    </div>

                                                    {/* Offline Pill */}
                                                    <div className="flex-1 flex items-center justify-center gap-2 px-2.5 py-2 rounded-xl bg-rose-500/20 border border-rose-500/30">
                                                        <SignalZero className="w-4 h-4 text-rose-400" />
                                                        <span className="text-[14px] font-black text-white leading-none">{dynamicOfflineCount}</span>
                                                    </div>
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

            {/* Side Panel for Camera Details */}
            <div className={`fixed inset-y-0 right-0 z-[1000] w-full md:w-[520px] bg-slate-950/80 backdrop-blur-3xl border-l border-white/5 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] transform transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${selectedLocation ? 'translate-x-0' : 'translate-x-full'}`}>
                {selectedLocation && (
                    <div className="h-full flex flex-col custom-scrollbar overflow-y-auto">
                        <CameraPanel
                            location={selectedLocation}
                            onClose={() => setSelectedLocation(null)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
