"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Loader2, Play, Maximize2, WifiOff } from 'lucide-react';
import { StreamManager } from '@/lib/StreamManager';

interface OptimizedVideoPlayerProps {
    cameraId: string;
    manager: StreamManager;
    onStatusChange?: (status: 'online' | 'offline') => void;
}

// Exponential backoff delays (ms): 1s, 2s, 5s, 10s, 30s, then cap at 30s
const BACKOFF_DELAYS = [1000, 2000, 5000, 10000, 30000];
const MAX_RETRIES = 10;

function getBackoffDelay(attempt: number): number {
    const idx = Math.min(attempt, BACKOFF_DELAYS.length - 1);
    return BACKOFF_DELAYS[idx];
}

export default function OptimizedVideoPlayer({ cameraId, manager, onStatusChange }: OptimizedVideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
    const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
    const retryCountRef = useRef(0);

    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [retryAttempt, setRetryAttempt] = useState(0);

    // Zoom & Pan State
    const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
    const transformRef = useRef({ scale: 1, x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const initialDistance = useRef(0);
    const clickStartPos = useRef({ x: 0, y: 0 });

    useEffect(() => {
        transformRef.current = transform;
    }, [transform]);

    // Track fullscreen state & Native Pan/Zoom
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleFullscreenChange = () => {
            const isFs = !!document.fullscreenElement;
            setIsFullscreen(isFs);
            if (!isFs) setTransform({ scale: 1, x: 0, y: 0 });
        };

        const updateTransform = (t: typeof transform) => setTransform(t);

        const handleWheel = (e: WheelEvent) => {
            if (!document.fullscreenElement) return;
            e.preventDefault();
            const delta = e.deltaY * -0.005;
            const current = transformRef.current;
            const newScale = Math.min(Math.max(1, current.scale + delta), 8);
            updateTransform({
                scale: newScale,
                x: newScale === 1 ? 0 : current.x,
                y: newScale === 1 ? 0 : current.y
            });
        };

        const getDistance = (touches: TouchList) =>
            Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

        const handleTouchStart = (e: TouchEvent) => {
            if (!document.fullscreenElement) return;
            if (e.touches.length === 2) {
                initialDistance.current = getDistance(e.touches);
            } else if (e.touches.length === 1 && transformRef.current.scale > 1) {
                isDragging.current = true;
                lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!document.fullscreenElement) return;
            if (e.touches.length > 1 || transformRef.current.scale > 1) e.preventDefault();

            if (e.touches.length === 2) {
                const dist = getDistance(e.touches);
                if (initialDistance.current > 0) {
                    const delta = dist - initialDistance.current;
                    const current = transformRef.current;
                    const newScale = Math.min(Math.max(1, current.scale + delta * 0.015), 8);
                    updateTransform({ ...current, scale: newScale, x: newScale === 1 ? 0 : current.x, y: newScale === 1 ? 0 : current.y });
                }
                initialDistance.current = dist;
            } else if (e.touches.length === 1 && isDragging.current && transformRef.current.scale > 1) {
                const dx = e.touches[0].clientX - lastPos.current.x;
                const dy = e.touches[0].clientY - lastPos.current.y;
                lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                const current = transformRef.current;
                updateTransform({ ...current, x: current.x + dx, y: current.y + dy });
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (e.touches.length < 2) initialDistance.current = 0;
            if (e.touches.length === 0) isDragging.current = false;
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (!document.fullscreenElement || transformRef.current.scale <= 1) return;
            isDragging.current = true;
            lastPos.current = { x: e.clientX, y: e.clientY };
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!document.fullscreenElement || !isDragging.current) return;
            const dx = e.clientX - lastPos.current.x;
            const dy = e.clientY - lastPos.current.y;
            lastPos.current = { x: e.clientX, y: e.clientY };
            const current = transformRef.current;
            updateTransform({ ...current, x: current.x + dx, y: current.y + dy });
        };

        const handleMouseUp = () => { isDragging.current = false; };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        container.addEventListener('wheel', handleWheel, { passive: false });
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);
        container.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const stopHeartbeat = useCallback(() => {
        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
        }
    }, []);

    const stopRetry = useCallback(() => {
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
    }, []);

    const destroyPlayer = useCallback(async (stopServer = true) => {
        stopHeartbeat();
        stopRetry();

        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.removeAttribute('src');
            videoRef.current.load();
        }
        setIsPlaying(false);
        setIsLoading(false);

        if (stopServer) {
            try {
                await fetch('/api/streams/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cameraId }),
                    keepalive: true,
                });
            } catch { /* ignore stop errors */ }
        }
    }, [cameraId, stopHeartbeat, stopRetry]);

    const scheduleRetry = useCallback((attempt: number) => {
        const delay = getBackoffDelay(attempt);
        const nextAttempt = attempt + 1;
        setRetryAttempt(nextAttempt);
        setError(`Mencoba ulang dalam ${delay / 1000}s... (${nextAttempt}/${MAX_RETRIES})`);
        retryTimerRef.current = setTimeout(() => {
            setError(null);
            initPlayer();
        }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const initPlayer = useCallback(async () => {
        if (!videoRef.current) return;

        setIsLoading(true);
        setError(null);

        try {
            // Only cameraId is sent — server looks up RTSP URL from DB
            const res = await fetch('/api/streams/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cameraId }),
            });

            const data = await res.json();

            if (!res.ok || !data.success || !data.hlsUrl) {
                throw new Error(data.error || 'Failed to start stream');
            }

            if (!videoRef.current) return;

            // Start heartbeat immediately after confirmed stream start
            stopHeartbeat();
            heartbeatRef.current = setInterval(() => {
                fetch('/api/streams/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cameraId }),
                }).catch(() => {});
            }, 10000);

            // Setup HLS.js player
            if (Hls.isSupported()) {
                if (hlsRef.current) hlsRef.current.destroy();

                const hls = new Hls({
                    liveSyncDurationCount: 1,
                    liveMaxLatencyDurationCount: 3,
                    maxBufferLength: 3,
                    maxMaxBufferLength: 8,
                    maxBufferSize: 5 * 1000 * 1000,
                    startLevel: -1,
                    abrEwmaDefaultEstimate: 5_000_000,
                    enableWorker: true,
                    lowLatencyMode: true,
                    progressive: true,
                });
                hlsRef.current = hls;

                hls.loadSource(data.hlsUrl);
                hls.attachMedia(videoRef.current);

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    retryCountRef.current = 0;
                    setRetryAttempt(0);
                    videoRef.current?.play().catch(() => {});
                    setIsPlaying(true);
                    setIsLoading(false);
                    onStatusChange?.('online');
                });

                hls.on(Hls.Events.ERROR, (_, errData) => {
                    if (!errData.fatal) return;

                    if (errData.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                        return;
                    }

                    console.warn(`[Player] HLS error for ${cameraId}:`, errData.type);
                    hls.destroy();

                    if (retryCountRef.current < MAX_RETRIES) {
                        scheduleRetry(retryCountRef.current);
                        retryCountRef.current++;
                    } else {
                        destroyPlayer(true);
                        setError('Kamera Offline');
                        setIsLoading(false);
                        onStatusChange?.('offline');
                    }
                });

            } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
                videoRef.current.src = data.hlsUrl;
                videoRef.current.play().then(() => {
                    setIsPlaying(true);
                    setIsLoading(false);
                    onStatusChange?.('online');
                }).catch(() => {});
            }
        } catch (err: any) {
            console.warn(`[Player] Stream fetch failed for ${cameraId}:`, err.message);
            if (retryCountRef.current < MAX_RETRIES) {
                scheduleRetry(retryCountRef.current);
                retryCountRef.current++;
            } else {
                destroyPlayer(true);
                setError('Kamera Offline');
                setIsLoading(false);
                onStatusChange?.('offline');
            }
        }
    }, [cameraId, destroyPlayer, onStatusChange, stopHeartbeat, scheduleRetry]);

    // Stream lifecycle: start on mount, destroy on unmount.
    // StreamManager still enforces MAX_STREAMS limit if needed.
    useEffect(() => {
        manager.register(cameraId, () => initPlayer(), () => destroyPlayer());
        return () => {
            manager.unregister(cameraId);
            destroyPlayer();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cameraId]);

    const handleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    };

    const handleVideoPointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        clickStartPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleVideoPointerUp = (e: React.PointerEvent) => {
        const dx = e.clientX - clickStartPos.current.x;
        const dy = e.clientY - clickStartPos.current.y;
        if (Math.hypot(dx, dy) < 10) {
            handleFullscreen();
        }
    };

    return (
        <div ref={containerRef} className="w-full h-full relative bg-slate-950 group">
            {/* Video element - always present in DOM */}
            <video
                ref={videoRef}
                className={`w-full h-full transition-all ${isFullscreen ? 'object-contain bg-black' : 'object-cover duration-300'}`}
                style={isFullscreen ? {
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    touchAction: 'none',
                    transition: isDragging.current ? 'none' : 'transform 0.05s linear',
                    cursor: transform.scale > 1 ? 'grab' : 'pointer'
                } : {}}
                playsInline
                muted
                aria-label={`Stream kamera ${cameraId}`}
                onPointerDown={handleVideoPointerDown}
                onPointerUp={handleVideoPointerUp}
            />

            {/* Loading Overlay */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-7 h-7 animate-spin text-yellow-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Menghubungkan...</span>
                    </div>
                </div>
            )}

            {/* Error / Offline State */}
            {error && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm gap-3">
                    <WifiOff className="w-8 h-8 text-rose-400 opacity-70" />
                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider text-center px-4">{error}</span>
                    {error === 'Kamera Offline' && (
                        <button
                            onClick={() => { retryCountRef.current = 0; setRetryAttempt(0); setError(null); initPlayer(); }}
                            className="mt-1 px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold text-slate-300 uppercase tracking-wider transition-all"
                            aria-label="Coba lagi koneksi kamera"
                        >
                            Coba Lagi
                        </button>
                    )}
                </div>
            )}

            {/* Play Button - shown when idle and not loading and no error */}
            {!isPlaying && !isLoading && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm group-hover:bg-black/40 transition-colors">
                    <button
                        onClick={() => manager.register(cameraId, initPlayer, destroyPlayer)}
                        className="w-14 h-14 rounded-full bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 flex items-center justify-center transition-all border border-yellow-500/40 hover:scale-110 active:scale-95"
                        aria-label="Putar stream kamera"
                    >
                        <Play className="w-6 h-6 ml-1" />
                    </button>
                </div>
            )}

            {/* Overlay buttons: Fullscreen */}
            {isPlaying && (
                <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleFullscreen(); }}
                        className="p-2 bg-black/60 hover:bg-black/80 rounded-xl text-white backdrop-blur-md transition-all shadow-xl border border-white/10 group/btn"
                        title="Layar Penuh"
                        aria-label="Tampilkan layar penuh"
                    >
                        <Maximize2 className="w-5 h-5 drop-shadow-md group-hover/btn:scale-110 transition-transform" />
                    </button>
                </div>
            )}

            {/* Fullscreen Brand Watermark */}
            {isFullscreen && (
                <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
                    <img
                        src="/abipraya_original.svg"
                        alt=""
                        aria-hidden="true"
                        className="w-48 h-48 sm:w-64 sm:h-64 object-contain opacity-[0.09] drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
                        draggable={false}
                    />
                </div>
            )}
        </div>
    );
}
