"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    LayoutGrid,
    Search,
    CheckSquare,
    Square,
    Loader2,
    PanelLeftOpen,
    PanelLeftClose,
    Signal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import OptimizedVideoPlayer from '@/components/OptimizedVideoPlayer';
import { useStreamManager } from '@/lib/StreamManager';
import { useCameraStatusSSE } from '@/hooks/useCameraStatusSSE';

interface Location {
    _id: string;
    name: string;
    category: string;
    cameras: any[];
}

export default function MultiViewPage() {
    const router = useRouter();
    const streamManager = useStreamManager();
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const { realtimeStatuses: realtimeStatus, setRealtimeStatuses: setRealtimeStatus } = useCameraStatusSSE();

    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const res = await axios.get('/api/locations');
                if (res.data.success) {
                    setLocations(res.data.data);
                }
            } catch (error) {
                console.error("Failed to fetch locations", error);
            } finally {
                setLoading(false);
            }
        };
        fetchLocations();

        const intervalId = setInterval(fetchLocations, 30000);
        return () => clearInterval(intervalId);
    }, []);

    const filteredLocations = useMemo(() => {
        return locations.filter(loc =>
            loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            loc.category.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [locations, searchQuery]);

    const toggleLocation = (id: string) => {
        setSelectedLocationIds(prev =>
            prev.includes(id)
                ? prev.filter(item => item !== id)
                : [...prev, id]
        );
    };

    const selectedCameras = useMemo(() => {
        const cameras: any[] = [];
        locations.forEach(loc => {
            if (selectedLocationIds.includes(loc._id)) {
                loc.cameras.forEach(cam => {
                    cameras.push({
                        ...cam,
                        locationName: loc.name
                    });
                });
            }
        });
        return cameras;
    }, [locations, selectedLocationIds]);

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

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 text-yellow-500 animate-spin" />
                    <p className="text-slate-400 font-bold uppercase tracking-wider text-sm">Initializing Multi-View...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-slate-950 flex overflow-hidden">
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
                            initial={{ x: -400, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -400, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="fixed inset-y-0 left-0 w-[85%] sm:w-80 bg-slate-900/95 backdrop-blur-3xl border-r border-white/5 flex flex-col z-[100] sm:relative sm:z-50 shrink-0 overflow-hidden"
                        >
                            <div className="w-full sm:w-80 h-full flex flex-col">
                                {/* Sidebar Header */}
                                <div className="p-6 border-b border-white/5 bg-slate-900/40">
                                    <div className="flex items-center justify-between mb-6">
                                        <button
                                            onClick={() => router.back()}
                                            className="p-2 hover:bg-white/5 rounded-xl text-slate-400 transition-colors"
                                        >
                                            <ArrowLeft className="w-5 h-5" />
                                        </button>
                                        <h2 className="text-lg font-bold text-white tracking-tight uppercase">Selection</h2>
                                        <button
                                            onClick={() => setIsSidebarOpen(false)}
                                            className="p-2 hover:bg-white/5 rounded-xl text-slate-400 transition-colors group"
                                            title="Close Sidebar"
                                        >
                                            <PanelLeftClose className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                        </button>
                                    </div>

                                    <div className="relative group">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-yellow-500 transition-colors" />
                                        <input
                                            type="text"
                                            placeholder="Cari lokasi..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-yellow-500/50 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Location List */}
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                                    {filteredLocations.map(loc => {
                                        const isSelected = selectedLocationIds.includes(loc._id);
                                        return (
                                            <button
                                                key={loc._id}
                                                onClick={() => toggleLocation(loc._id)}
                                                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 border hover:shadow-lg hover:-translate-y-0.5 active:scale-95 ${isSelected
                                                    ? 'bg-yellow-500/10 border-yellow-500/30 shadow-yellow-500/5'
                                                    : 'bg-white/5 border-transparent hover:bg-white/10'
                                                    }`}
                                            >
                                                <div className={`shrink-0 ${isSelected ? 'text-yellow-500' : 'text-slate-600'}`}>
                                                    {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                                                </div>
                                                <div className="text-left min-w-0 flex-1">
                                                    <div className={`text-sm font-bold tracking-tight uppercase truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                                        {loc.name}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                                                        {loc.cameras.length} CAMERAS • {loc.category}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Sidebar Footer */}
                                <div className="p-6 bg-slate-900/60 border-t border-white/5">
                                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                                        <span className="text-slate-500">Selected</span>
                                        <span className="text-yellow-500">{selectedLocationIds.length} Locations</span>
                                    </div>
                                </div>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>


            {/* Main Content Area */}
            <main className="flex-1 flex flex-col relative overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(15,23,42,1)_0%,rgba(2,6,23,1)_100%)]">
                {/* Overlay Header */}
                <header className="absolute top-0 left-0 right-0 z-40 p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between pointer-events-none gap-4">
                    <div className="flex items-center gap-3 sm:gap-4 pointer-events-auto w-full sm:w-auto">
                        {!isSidebarOpen && (
                            <button
                                onClick={() => setIsSidebarOpen(true)}
                                className="p-2.5 sm:p-3 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl text-white hover:bg-slate-800 transition-all shadow-2xl group"
                                title="Open Sidebar"
                            >
                                <PanelLeftOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            </button>
                        )}
                        <div className="p-2.5 sm:p-3.5 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex items-center gap-3 sm:gap-4 flex-1 sm:flex-initial">
                            <div className="p-1.5 sm:p-2 bg-yellow-500/10 rounded-xl">
                                <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
                            </div>
                            <div>
                                <h2 className="text-sm sm:text-lg font-bold text-white tracking-tight uppercase leading-none">Multi-View</h2>
                                <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                                    <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[8px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-wider">{activeStreamCount} Active</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pointer-events-auto hidden sm:flex">
                        <div className="px-5 py-3.5 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
                            <img src="/abipraya_original.svg" alt="Logo" className="h-4 sm:h-6" />
                        </div>
                    </div>
                </header>

                {/* Grid Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-24">
                    <AnimatePresence mode="popLayout">
                        {selectedCameras.length > 0 ? (
                            <motion.div
                                layout
                                className={`grid ${gridCols} ${selectedCameras.length > 9 ? 'gap-3' : 'gap-6'} auto-rows-fr`}
                            >
                                {selectedCameras.map((cam, idx) => (
                                    <motion.div
                                        key={`${cam._id}-${idx}`}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.3 }}
                                        className="relative aspect-video bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl group ring-1 ring-white/5 hover:border-white/20 hover:shadow-white/10 hover:-translate-y-1 transition-all duration-500"
                                    >
                                        {/* Camera Info Overlay */}
                                        <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 via-black/20 to-transparent flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] font-bold text-white uppercase tracking-wider drop-shadow-md">
                                                    {cam.locationName}
                                                </span>
                                                <span className="text-[12px] font-bold text-slate-300 uppercase tracking-tight leading-none">
                                                    {cam.name}
                                                </span>
                                            </div>
                                            <div className="flex flex-col items-end gap-1.5">
                                                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl backdrop-blur-md border ${(realtimeStatus[cam._id] || cam.status) === 'online'
                                                    ? 'bg-emerald-900/40 border-emerald-500/30'
                                                    : 'bg-rose-900/40 border-rose-500/30'
                                                    }`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${(realtimeStatus[cam._id] || cam.status) === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                                                        }`} />
                                                    <span className="text-[9px] font-bold text-white uppercase tracking-wider">
                                                        {(realtimeStatus[cam._id] || cam.status) === 'online' ? 'Live' : 'Offline'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <OptimizedVideoPlayer
                                            cameraId={cam._id}
                                            streamUrl={cam.streamUrl}
                                            manager={streamManager}
                                            onStatusChange={(status) => setRealtimeStatus(prev => ({ ...prev, [cam._id]: status }))}
                                        />
                                    </motion.div>
                                ))}
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="h-full flex flex-col items-center justify-center text-center px-12"
                            >
                                <div className="w-24 h-24 rounded-[2.5rem] bg-slate-900/50 border border-white/5 flex items-center justify-center mb-8 shadow-2xl">
                                    <LayoutGrid className="w-10 h-10 text-slate-600 opacity-50" />
                                </div>
                                <h2 className="text-3xl font-bold text-white tracking-tight uppercase mb-4">No Cameras Selected</h2>
                                <p className="text-slate-500 text-sm max-w-md font-medium opacity-70 leading-relaxed">
                                    Pilih lokasi dari panel sebelah kiri untuk mulai memantau beberapa aliran kamera secara bersamaan.
                                </p>
                                {!isSidebarOpen && (
                                    <button
                                        onClick={() => setIsSidebarOpen(true)}
                                        className="mt-10 px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold uppercase tracking-wider rounded-2xl transition-all shadow-xl shadow-yellow-500/20 active:scale-95 flex items-center gap-3"
                                    >
                                        <PanelLeftOpen className="w-5 h-5" />
                                        Buka Filter Lokasi
                                    </button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
}
