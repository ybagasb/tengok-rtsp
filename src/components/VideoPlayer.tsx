"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { RotateCcw, MonitorX, Loader2, Maximize2 } from 'lucide-react';
import clsx from 'clsx';

interface VideoPlayerProps {
    src: string;
    poster?: string;
    className?: string;
    autoPlay?: boolean;
    reloadKey?: number; // increment to force reload from outside
    onStatusChange?: (status: 'live' | 'offline' | 'loading') => void;
}

export default function VideoPlayer({
    src,
    poster,
    className,
    autoPlay = true,
    reloadKey = 0,
    onStatusChange,
}: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isOffline, setIsOffline] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const hlsRef = useRef<Hls | null>(null);

    const notifyStatus = useCallback((status: 'live' | 'offline' | 'loading') => {
        onStatusChange?.(status);
    }, [onStatusChange]);

    useEffect(() => {
        let hls: Hls | null = null;
        const video = videoRef.current;

        if (!video) return;

        const initPlayer = () => {
            // Destroy previous instance if any
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }

            setIsLoading(true);
            setIsOffline(false);
            notifyStatus('loading');

            if (Hls.isSupported()) {
                hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: false,
                    // Tuning for stability over real-time latency
                    maxBufferLength: 60,       // Try to keep 60 seconds of video buffered
                    maxMaxBufferLength: 120,    // Hard maximum of 120 seconds
                    liveSyncDuration: 30,      // Stay 30 seconds behind the live edge
                    liveMaxLatencyDuration: 60,// Allow up to 60 seconds behind before catching up
                    manifestLoadingTimeOut: 20000,
                    manifestLoadingMaxRetry: 4,
                    manifestLoadingRetryDelay: 1000,
                });
                hlsRef.current = hls;

                hls.loadSource(src);
                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setIsLoading(false);
                    notifyStatus('live');
                    if (autoPlay) {
                        video.play().catch(() => {
                            setIsPlaying(false);
                        });
                    }
                });

                hls.on(Hls.Events.ERROR, (_event: unknown, data: Record<string, any>) => {
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                hls?.startLoad();
                                if (
                                    data.details === 'manifestLoadError' ||
                                    data.details === 'manifestParsingError' ||
                                    data.details === 'manifestLoadTimeOut'
                                ) {
                                    setIsOffline(true);
                                    setIsLoading(false);
                                    notifyStatus('offline');
                                }
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                hls?.recoverMediaError();
                                break;
                            default:
                                hls?.destroy();
                                setIsOffline(true);
                                setIsLoading(false);
                                notifyStatus('offline');
                                break;
                        }
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = src;
                video.addEventListener('loadedmetadata', () => {
                    setIsLoading(false);
                    notifyStatus('live');
                    if (autoPlay) video.play().catch(() => { });
                });
                video.addEventListener('error', () => {
                    setIsOffline(true);
                    setIsLoading(false);
                    notifyStatus('offline');
                });
            } else {
                setIsOffline(true);
                setIsLoading(false);
                notifyStatus('offline');
            }
        };

        initPlayer();

        return () => {
            if (hls) hls.destroy();
        };
    }, [src, autoPlay]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRetry = useCallback((e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setIsOffline(false);
        setIsLoading(true);
        notifyStatus('loading');
        if (hlsRef.current) {
            hlsRef.current.loadSource(src);
            hlsRef.current.startLoad();
        } else if (videoRef.current) {
            videoRef.current.load();
        }
    }, [src, notifyStatus]);

    // Expose reload logic to respond to reloadKey changes without unmounting the whole player
    useEffect(() => {
        if (reloadKey > 0 && isOffline) {
            handleRetry();
        }
    }, [reloadKey, isOffline, handleRetry]);

    const handleFullscreen = () => {
        const el = containerRef.current;
        if (!el) return;
        if (!document.fullscreenElement) {
            el.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen().catch(() => { });
        }
    };

    return (
        <div
            ref={containerRef}
            className={clsx("relative bg-black rounded-lg overflow-hidden group cursor-pointer", className)}
            onClick={handleFullscreen}
            title="Click to fullscreen"
        >
            <video
                ref={videoRef}
                poster={poster}
                className="w-full h-full object-cover"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                muted
                playsInline
            />

            {/* Fullscreen hint on hover */}
            {!isLoading && !isOffline && (
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <Maximize2 className="w-4 h-4 text-white/60" />
                </div>
            )}

            {/* Loading / offline overlay */}
            {(isLoading || isOffline) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                    {isLoading && !isOffline && (
                        <div className="flex flex-col items-center text-blue-400 p-4">
                            <Loader2 className="w-10 h-10 animate-spin mb-3" />
                            <span className="text-xs text-white/70 max-w-[200px] text-center">
                                Please contact Project Manager by clicking the button below.
                            </span>
                        </div>
                    )}
                    {isOffline && (
                        <div className="flex flex-col items-center text-red-500">
                            <MonitorX className="w-12 h-12 mb-2" />
                            <span className="font-semibold mb-1">Stream Offline</span>
                            <span className="text-xs text-white/70 max-w-[200px] text-center mb-3">
                                Please contact Project Manager by clicking the button below.
                            </span>
                            <button
                                onClick={handleRetry}
                                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded-full text-sm transition-colors mt-2"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Retry
                            </button>
                        </div>
                    )}
                </div>
            )}


            {/* LIVE badge */}
            {!isOffline && !isLoading && (
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-red-600/90 text-white text-xs font-bold rounded animate-pulse shadow-lg pointer-events-none">
                    LIVE
                </div>
            )}
        </div>
    );
}
