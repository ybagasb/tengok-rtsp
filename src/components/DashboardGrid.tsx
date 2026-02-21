"use client";

import { useState, useMemo, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import VideoPlayer from '@/components/VideoPlayer';
import { ICameraData } from '@/models/Camera';
import { Phone, MessageCircle, User, Settings, MapPin, LayoutGrid, SortAsc, SortDesc, Layers, RefreshCcw, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type GridSize = '2x2' | '3x3' | '4x4';
type SortOrder = 'asc' | 'desc';
type SortField = 'name' | 'location' | 'status';
type StreamStatus = 'live' | 'offline' | 'loading';

const GRID_COLS: Record<GridSize, string> = {
    '2x2': 'grid-cols-1 sm:grid-cols-2',
    '3x3': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    '4x4': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
};

// Transform Shinobi HTTP URLs → /shinobi-proxy/* to avoid Mixed Content errors on HTTPS
// Works automatically with any Shinobi host that starts with http://
// Format nomor HP Indonesia ke format internasional untuk wa.me
const toWaNumber = (phone: string): string => {
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('0')) return '62' + digits.slice(1);
    if (digits.startsWith('62')) return digits;
    return digits;
};

const proxyStreamUrl = (url: string): string => {
    if (!url) return url;

    // Explicit mappings for new hosts
    if (url.includes('10.10.56.90')) {
        return url.replace('http://10.10.56.90:8080', '/shinobi-proxy-90');
    }
    if (url.includes('10.10.56.94')) {
        return url.replace('http://10.10.56.94:8080', '/shinobi-proxy-94');
    }

    // Match http:// URLs (not https:// — those don't need proxying)
    // Default fallback to main proxy (usually .89)
    const match = url.match(/^http:\/\/[^/]+(\/.*)$/);
    if (match) return `/shinobi-proxy${match[1]}`;
    return url;
};


export default function DashboardGrid({ isAdmin = false }: { isAdmin?: boolean }) {
    const { data, error, isLoading } = useSWR('/api/cameras', fetcher, {
        refreshInterval: 5000,
    });

    const [gridSize, setGridSize] = useState<GridSize>('3x3');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [groupByLocation, setGroupByLocation] = useState(false);

    // Per-camera stream status tracked in the grid
    const [streamStatus, setStreamStatus] = useState<Record<string, StreamStatus>>({});
    // Key map to force-reload individual cameras
    const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});

    const handleStatusChange = useCallback((id: string, status: StreamStatus) => {
        setStreamStatus(prev => prev[id] === status ? prev : { ...prev, [id]: status });
    }, []);

    const reloadOffline = useCallback(() => {
        const offlineIds = Object.entries(streamStatus)
            .filter(([, s]) => s === 'offline')
            .map(([id]) => id);
        if (offlineIds.length === 0) return;
        setReloadKeys(prev => {
            const next = { ...prev };
            offlineIds.forEach(id => { next[id] = (next[id] ?? 0) + 1; });
            return next;
        });
    }, [streamStatus]);

    // Auto-reload offline streams every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            const hasOffline = Object.values(streamStatus).some(s => s === 'offline');
            if (hasOffline) {
                reloadOffline();
            }
        }, 5000); // 30 seconds interval

        return () => clearInterval(interval);
    }, [streamStatus, reloadOffline]);

    const cameras: ICameraData[] = data?.data || [];

    const offlineCount = Object.values(streamStatus).filter(s => s === 'offline').length;
    const liveCount = Object.values(streamStatus).filter(s => s === 'live').length;

    const sortedCameras = useMemo(() => {
        return [...cameras].sort((a, b) => {
            const aVal = (a[sortField] || '').toString().toLowerCase();
            const bVal = (b[sortField] || '').toString().toLowerCase();
            return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });
    }, [cameras, sortField, sortOrder]);

    const groupedCameras = useMemo(() => {
        if (!groupByLocation) return { 'All Cameras': sortedCameras };
        return sortedCameras.reduce<Record<string, ICameraData[]>>((acc, cam) => {
            const key = cam.location || 'No Location';
            if (!acc[key]) acc[key] = [];
            acc[key].push(cam);
            return acc;
        }, {});
    }, [sortedCameras, groupByLocation]);

    const toggleSort = (field: SortField) => {
        if (sortField === field) setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortOrder('asc'); }
    };

    if (isLoading) return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black flex items-center justify-center">
            <div className="text-blue-400 animate-pulse text-lg font-medium">Loading Surveillance System...</div>
        </div>
    );

    if (error) return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black flex items-center justify-center">
            <div className="text-red-400 text-lg">System Error: Failed to load camera feeds.</div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black text-white">
            {/* Sticky Header */}
            <header className="sticky top-0 z-50 px-4 py-3 bg-slate-900/90 backdrop-blur-md border-b border-white/10">
                <div className="flex flex-wrap gap-3 items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <img
                            src="/abipraya_original.svg"
                            alt="Brantas Abipraya"
                            className="h-10 w-10 object-contain drop-shadow-[0_0_8px_rgba(254,213,51,0.6)]"
                        />
                        <div>
                            <h1 className="text-base font-bold tracking-wide bg-gradient-to-r from-yellow-400 to-yellow-200 bg-clip-text text-transparent">
                                TENGOK – SURVEILLANCE SYSTEM
                            </h1>
                            <p className="text-[10px] text-slate-500 -mt-0.5 uppercase tracking-widest">PT Brantas Abipraya</p>
                            <div className="flex items-center gap-3 text-xs mt-0.5">
                                <span className="flex items-center gap-1 text-green-400">
                                    <Wifi className="w-3 h-3" /> {liveCount} Live
                                </span>
                                <span className="flex items-center gap-1 text-red-400">
                                    <WifiOff className="w-3 h-3" /> {offlineCount} Offline
                                </span>
                                <span className="text-slate-500">{cameras.length} Total</span>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Grid Size */}
                        <div className="flex items-center bg-slate-800/80 rounded-lg p-1 border border-white/5">
                            {(['2x2', '3x3', '4x4'] as GridSize[]).map((size) => (
                                <button
                                    key={size}
                                    onClick={() => setGridSize(size)}
                                    className={`px-2 py-1.5 rounded-md transition-all text-xs font-semibold w-9 ${gridSize === size
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                                        }`}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>

                        {/* Sort */}
                        <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg p-1 border border-white/5">
                            {(['name', 'location', 'status'] as SortField[]).map((field) => (
                                <button
                                    key={field}
                                    onClick={() => toggleSort(field)}
                                    className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${sortField === field
                                        ? 'bg-blue-600 text-white'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                                        }`}
                                >
                                    {field}
                                    {sortField === field && (
                                        sortOrder === 'asc'
                                            ? <SortAsc className="w-3 h-3" />
                                            : <SortDesc className="w-3 h-3" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Group by Location */}
                        <button
                            onClick={() => setGroupByLocation(prev => !prev)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${groupByLocation
                                ? 'bg-purple-600 text-white border-purple-500'
                                : 'bg-slate-800/80 text-slate-400 hover:text-white border-white/5 hover:bg-slate-700'
                                }`}
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Group
                        </button>

                        {/* Reload Offline - HIDDEN (Auto-reload implemented) */}
                        {/* {offlineCount > 0 && (
                            <button
                                onClick={reloadOffline}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-red-600/80 hover:bg-red-600 text-white border border-red-500/50 transition-all"
                            >
                                <RefreshCcw className="w-3.5 h-3.5" />
                                Reload Offline ({offlineCount})
                            </button>
                        )} */}

                        {/* Admin */}
                        {isAdmin ? (
                            <Link href="/" className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all text-xs font-medium border border-white/5">
                                View Mode
                            </Link>
                        ) : (
                            <Link href="/admin" className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all border border-white/5 group">
                                <Settings className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="p-4">
                {cameras.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-700 rounded-xl bg-slate-900/20">
                        <LayoutGrid className="w-10 h-10 mb-3 text-slate-700" />
                        <p className="font-medium">No cameras configured.</p>
                        {!isAdmin && <p className="text-sm mt-1">Go to Admin panel to add cameras.</p>}
                    </div>
                ) : (
                    Object.entries(groupedCameras).map(([groupName, groupCams]) => (
                        <div key={groupName} className="mb-8">
                            {groupByLocation && (
                                <div className="flex items-center gap-2 mb-3">
                                    <MapPin className="w-4 h-4 text-purple-400 flex-shrink-0" />
                                    <h2 className="text-sm font-semibold text-purple-300 uppercase tracking-widest">{groupName}</h2>
                                    <div className="flex-1 h-px bg-purple-800/30" />
                                    <span className="text-xs text-slate-500">{groupCams.length} cam{groupCams.length !== 1 ? 's' : ''}</span>
                                </div>
                            )}

                            <div className={`grid ${GRID_COLS[gridSize]} gap-4`}>
                                {groupCams.map((cam) => {
                                    const id = cam._id as string;

                                    return (
                                        <div
                                            key={id}
                                            className="bg-black/40 backdrop-blur-sm rounded-xl overflow-hidden border border-white/5 hover:border-blue-500/30 transition-all duration-300 group"
                                        >
                                            {/* Card Header */}
                                            <div className="px-3 py-2 flex justify-between items-center bg-slate-900/80 border-b border-white/5">
                                                <div className="min-w-0">
                                                    <h3 className="font-semibold text-yellow-400 text-sm truncate">{cam.name}</h3>
                                                    {cam.location && (
                                                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                                                            <MapPin className="w-3 h-3 flex-shrink-0" />
                                                            <span className="truncate">{cam.location}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Video */}
                                            <div className="aspect-video bg-black">
                                                <VideoPlayer
                                                    src={proxyStreamUrl(cam.streamUrl)}
                                                    className="w-full h-full"
                                                    reloadKey={reloadKeys[id] ?? 0}
                                                    onStatusChange={(s) => handleStatusChange(id, s)}
                                                />
                                            </div>

                                            {/* Footer */}
                                            <div className="px-3 py-2 bg-slate-900/60 border-t border-white/5 flex justify-between items-center text-xs text-slate-400">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <User className="w-3 h-3 text-slate-600 flex-shrink-0" />
                                                    <span className="truncate">{cam.picName || 'N/A'}</span>
                                                </div>
                                                {cam.picPhone && (
                                                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                                                        <a
                                                            href={`tel:${cam.picPhone}`}
                                                            className="flex items-center gap-1 px-2 py-1 bg-green-900/30 text-green-400 rounded-md hover:bg-green-900/50 transition-colors border border-green-800/40"
                                                            title={`Call ${cam.picName || cam.picPhone}`}
                                                        >
                                                            <Phone className="w-3 h-3" />
                                                        </a>
                                                        <a
                                                            href={`https://wa.me/${toWaNumber(cam.picPhone)}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1 px-2 py-1 bg-emerald-900/30 text-emerald-400 rounded-md hover:bg-emerald-900/50 transition-colors border border-emerald-800/40"
                                                            title={`WhatsApp ${cam.picName || cam.picPhone}`}
                                                        >
                                                            <MessageCircle className="w-3 h-3" />
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </main>
        </div>
    );
}
