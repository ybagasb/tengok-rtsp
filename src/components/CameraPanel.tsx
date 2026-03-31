import { useState, useEffect } from 'react';
import { X, Phone, User, Signal, SignalZero } from 'lucide-react';
import axios from 'axios';
import OptimizedVideoPlayer from './OptimizedVideoPlayer';
import { useStreamManager } from '@/lib/StreamManager';

interface CameraPanelProps {
    location: any;
    onClose: () => void;
    onStatusChange?: (id: string, status: 'online' | 'offline') => void;
    realtimeStatuses?: Record<string, 'online' | 'offline'>;
}

export default function CameraPanel({ location, onClose, onStatusChange, realtimeStatuses }: CameraPanelProps) {
    // Reset global stream manager when we switch locations
    const streamManager = useStreamManager();
    const [statuses, setStatuses] = useState<Record<string, 'online' | 'offline'>>({});

    useEffect(() => {
        const initial: Record<string, 'online' | 'offline'> = {};
        if (location?.cameras) {
            location.cameras.forEach((cam: any) => {
                initial[cam._id] = cam.status || 'offline';
            });
        }
        setStatuses(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location?._id]);

    const handleStatusChange = (id: string, status: 'online' | 'offline') => {
        setStatuses(prev => {
            if (prev[id] === status) return prev;
            return { ...prev, [id]: status };
        });

        // Persist offline status to DB so map/other users see it too
        if (status === 'offline') {
            axios.patch(`/api/cameras/${id}/status`, { status }).catch(() => {
                // Ignore silent failures — next DB poll / checker might pick it up
            });
        }

        if (onStatusChange) {
            onStatusChange(id, status);
        }
    };

    const dynamicOnlineCount = location?.cameras?.filter((c: any) => (realtimeStatuses?.[c._id] || statuses[c._id] || c.status) === 'online').length || 0;
    const dynamicOfflineCount = (location?.cameras?.length || 0) - dynamicOnlineCount;

    return (
        <div className="h-full flex flex-col pt-4">
            {/* Header */}
            <div className="flex justify-between items-center px-8 pb-6 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-4 w-full">
                    <h2 className="text-2xl font-bold text-white tracking-tight leading-none truncate pr-4">
                        {location.name.toUpperCase()}
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 rounded-lg transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {/* Location Info */}
                <div className="p-6 border-b border-white/10 shrink-0">
                    {location.image ? (
                        <div className="w-full h-48 mb-4 overflow-hidden rounded-xl bg-slate-900 border border-white/10">
                            <img src={location.image} alt={location.name} className="w-full h-full object-cover" />
                        </div>
                    ) : (
                        <div className="w-full h-32 sm:h-48 mb-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 border border-white/5 flex flex-col items-center justify-center text-slate-500 font-medium shadow-inner relative overflow-hidden group">
                            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] opacity-20" />
                            <div className="p-3 bg-slate-800/50 rounded-2xl mb-2 group-hover:scale-110 group-hover:bg-slate-800 transition-all duration-500 relative z-10">
                                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <span className="text-xs tracking-wide relative z-10">No Photo Available</span>
                        </div>
                    )}

                    <div className="mb-6">
                        {location.description ? (
                            <p className="text-slate-300 text-sm leading-relaxed">{location.description}</p>
                        ) : (
                            <div className="flex items-center justify-center gap-3 text-slate-500 text-sm italic py-2 opacity-80">
                                <span className="block w-6 h-px bg-slate-700"></span>
                                <span className="text-xs tracking-wide">Tidak ada deskripsi proyek</span>
                                <span className="block w-6 h-px bg-slate-700"></span>
                            </div>
                        )}
                    </div>

                    {/* PIC Info */}
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                        <div className="flex-1 p-3 bg-slate-900/50 rounded-xl border border-white/5 flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <User className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                                <div className="text-xs text-slate-500">Person In Charge</div>
                                <div className="text-sm font-semibold text-slate-200">{location.pmName || '-'}</div>
                            </div>
                        </div>
                        <div className="flex-1 p-3 bg-slate-900/50 rounded-xl border border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="p-2 bg-green-500/10 rounded-lg shrink-0">
                                    <Phone className="w-4 h-4 text-green-400" />
                                </div>
                                <div className="overflow-hidden min-w-0 pr-2">
                                    <div className="text-xs text-slate-500">Contact Number</div>
                                    <div className="text-sm font-semibold text-slate-200 truncate">{location.pmPhone || '-'}</div>
                                </div>
                            </div>
                            {location.pmPhone && (
                                <a
                                    href={`https://wa.me/${location.pmPhone.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-all shadow-lg shadow-green-900/20 active:scale-95 group"
                                    title="Chat on WhatsApp"
                                >
                                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                    </svg>
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* Cameras Section */}
                <div className="p-5 sm:p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-bold text-white tracking-wide">LIVE SURVEILLANCE</h3>
                            <p className="text-xs text-slate-400 mt-1 font-medium">Monitoring real-time project security</p>
                        </div>
                        <div className="flex items-center gap-4 bg-slate-900/80 px-5 py-2.5 rounded-2xl border border-white/10 shadow-inner">
                            <div className="flex items-center gap-2.5 group/pill">
                                <div className="relative">
                                    <Signal className="w-4 h-4 text-emerald-400" />
                                    <div className="absolute inset-0 bg-emerald-400 blur-sm opacity-60 animate-pulse" />
                                </div>
                                <span className="text-base font-bold text-white tracking-tight">{dynamicOnlineCount}</span>
                            </div>
                            <div className="w-px h-6 bg-white/10 mx-1" />
                            <div className="flex items-center gap-2.5">
                                <SignalZero className="w-4 h-4 text-rose-400" />
                                <span className="text-base font-bold text-white tracking-tight">{dynamicOfflineCount}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {location.cameras && location.cameras.map((cam: any) => {
                            const currentStatus = realtimeStatuses?.[cam._id] || statuses[cam._id] || cam.status || 'offline';
                            return (
                                <div key={cam._id} className="relative rounded-2xl overflow-hidden border border-white/5 bg-slate-900/50 group hover:border-white/20 transition-all duration-500 shadow-xl hover:shadow-2xl hover:-translate-y-1">
                                    {/* Header Overlay */}
                                    <div className="absolute top-0 left-0 right-0 z-10 p-3 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex justify-between items-start pointer-events-none opacity-100 group-hover:opacity-100 transition-opacity">
                                        <div className="flex flex-col gap-0.5 w-[calc(100%-48px)]">
                                            <span className="text-[10px] font-semibold text-white uppercase tracking-wide drop-shadow-lg line-clamp-2 leading-tight">
                                                {cam.name}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-1 h-1 rounded-full ${currentStatus === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                                <span className="text-[8px] font-bold text-slate-300 uppercase tracking-tight">
                                                    {currentStatus === 'online' ? 'Live Stream' : 'Offline'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5">
                                            <span className={`px-2.5 py-1 rounded-xl text-[9px] font-bold tracking-[0.1em] border shadow-lg ${currentStatus === 'online'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-900/10'
                                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-rose-900/10'
                                                }`}>
                                                {currentStatus === 'online' ? 'LIVE' : 'OFFLINE'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Video Area */}
                                    <div className="aspect-video bg-black flex items-center justify-center relative">
                                        <OptimizedVideoPlayer
                                            streamUrl={cam.streamUrl}
                                            cameraId={cam._id}
                                            manager={streamManager}
                                            onStatusChange={(status: 'online' | 'offline') => handleStatusChange(cam._id, status)}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
            {/* Add custom scrollbar hiding styles here or in global.css */}
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #334155;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #475569;
                }

                .pulse-emerald {
                    animation: pulse-emerald 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }

                @keyframes pulse-emerald {
                    0%, 100% { opacity: 1; }
                    50% { opacity: .5; }
                }
            `}</style>
        </div>
    );
}
