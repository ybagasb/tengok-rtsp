"use client";

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2, Play, Pause, Maximize2 } from 'lucide-react';
import { StreamManager } from '@/lib/StreamManager';

interface OptimizedVideoPlayerProps {
    streamUrl: string;
    cameraId: string;
    manager: StreamManager;
    onStatusChange?: (status: 'online' | 'offline') => void;
}

export default function OptimizedVideoPlayer({ streamUrl, cameraId, manager, onStatusChange }: OptimizedVideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const hlsRef = useRef<Hls | null>(null);

    const [isVisible, setIsVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Intersection Observer for Lazy Loading
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsVisible(entry.isIntersecting);
            },
            {
                root: null,
                rootMargin: '50px', // Reduce margin so it unloads faster when scrolling away
                threshold: 0.05
            }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            if (containerRef.current) observer.unobserve(containerRef.current);
        };
    }, []);

    const destroyPlayer = () => {
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
    };

    const initPlayer = () => {
        if (!videoRef.current || !streamUrl) return;

        const getProxiedUrl = (url: string) => {
            if (url.includes('10.10.56.90')) return url.replace('http://10.10.56.90:8080', '/shinobi-proxy-90');
            if (url.includes('10.10.56.94')) return url.replace('http://10.10.56.94:8080', '/shinobi-proxy-94');
            if (url.includes('10.10.56.101')) return url.replace('http://10.10.56.101:8080', '/shinobi-proxy-101');
            if (url.includes('10.10.56.89')) return url.replace('http://10.10.56.89:8080', '/shinobi-proxy');
            return url;
        };
        const proxiedStreamUrl = getProxiedUrl(streamUrl);

        setIsLoading(true);
        setError(null);

        if (Hls.isSupported()) {
            destroyPlayer(); // Ensure clean slate

            const hls = new Hls({
                maxBufferLength: 5, // Limit buffer drastically to save RAM on weak devices
                maxMaxBufferLength: 10,
                maxBufferSize: 15 * 1000 * 1000, // 15MB max buffer
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 10,
                enableWorker: true,
            });
            hlsRef.current = hls;

            hls.loadSource(proxiedStreamUrl);
            hls.attachMedia(videoRef.current);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoRef.current?.play().then(() => {
                    setIsPlaying(true);
                    setIsLoading(false);
                    onStatusChange?.('online');
                }).catch(err => {
                    console.log("Autoplay prevented", err);
                    setIsLoading(false);
                    onStatusChange?.('online');
                });
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error("Network error, stream offline.");
                            destroyPlayer();
                            setError("Please contact Project Manager");
                            onStatusChange?.('offline');
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error("Media error, trying to recover...");
                            hls.recoverMediaError();
                            break;
                        default:
                            destroyPlayer();
                            setError("Please contact Project Manager");
                            onStatusChange?.('offline');
                            break;
                    }
                }
            });
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS fallback (Safari)
            videoRef.current.src = proxiedStreamUrl;
            videoRef.current.addEventListener('loadedmetadata', () => {
                videoRef.current?.play().then(() => {
                    setIsPlaying(true);
                    setIsLoading(false);
                    onStatusChange?.('online');
                }).catch(err => {
                    console.log("Autoplay prevented", err);
                    setIsLoading(false);
                    onStatusChange?.('online');
                });
            });
            videoRef.current.addEventListener('error', () => {
                setError("Please contact Project Manager");
                setIsLoading(false);
                onStatusChange?.('offline');
            });
        } else {
            setError("Browser tidak mendukung HLS");
            onStatusChange?.('offline');
        }
    };

    // Handle visibility and Stream Manager
    useEffect(() => {
        if (isVisible) {
            // Register this player to trigger play when allowed by manager
            manager.register(cameraId, () => {
                initPlayer();
            }, () => {
                destroyPlayer();
            });
        } else {
            // Unregister and destroy aggressively when off-screen to save RAM/CPU
            manager.unregister(cameraId);
            destroyPlayer();
        }

        return () => {
            manager.unregister(cameraId);
            destroyPlayer();
        };
    }, [isVisible, streamUrl, cameraId, manager]);

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
        <div ref={containerRef} className="w-full h-full relative bg-slate-950 group">
            {error ? (
                <div className="absolute inset-0 flex items-center justify-center text-red-500 text-xs font-bold uppercase tracking-widest text-center px-4">
                    {error}
                </div>
            ) : (
                <>
                    <video
                        ref={videoRef}
                        className="w-full h-full object-cover cursor-pointer"
                        playsInline
                        muted
                        onClick={handleFullscreen}
                    />

                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                            <Loader2 className="w-6 h-6 animate-spin text-yellow-500" />
                        </div>
                    )}

                    {!isPlaying && !isLoading && !error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm group-hover:bg-black/40 transition-colors">
                            <button
                                onClick={() => manager.register(cameraId, initPlayer, destroyPlayer)}
                                className="w-12 h-12 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center hover:bg-yellow-500/30 transition-colors border border-yellow-500/50"
                            >
                                <Play className="w-5 h-5 ml-1" />
                            </button>
                        </div>
                    )}

                    {isPlaying && !isLoading && !error && (
                        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            <Maximize2 className="w-4 h-4 text-white/60 drop-shadow-md" />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
