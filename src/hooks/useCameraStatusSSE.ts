import { useState, useEffect } from 'react';

export function useCameraStatusSSE() {
    const [realtimeStatuses, setRealtimeStatuses] = useState<Record<string, 'online' | 'offline'>>({});
    const [lastCheckedTimes, setLastCheckedTimes] = useState<Record<string, string>>({});

    useEffect(() => {
        let isMounted = true;
        const eventSource = new EventSource('/api/cameras/status-stream');

        eventSource.onmessage = (event) => {
            if (!isMounted) return;
            try {
                // Ignore SSE comments
                if (event.data.startsWith(':')) return;

                const data = JSON.parse(event.data);
                if (data.cameraId && data.status) {
                    setRealtimeStatuses(prev => {
                        // Prevent unnecessary re-renders when status is unchanged
                        if (prev[data.cameraId] === data.status) return prev;
                        return { ...prev, [data.cameraId]: data.status };
                    });
                    if (data.lastCheckedAt) {
                        setLastCheckedTimes(prev => ({ ...prev, [data.cameraId]: data.lastCheckedAt }));
                    }
                }
            } catch (err) {
                // Silently ignore ping or parse errors string parsing
            }
        };

        eventSource.onerror = () => {
            // EventSource auto-reconnects natively if the connection drops.
            // Silencing console.error to prevent console spam during normal reconnect cycles.
        };

        return () => {
            isMounted = false;
            eventSource.close();
        };
    }, []);

    return { realtimeStatuses, setRealtimeStatuses, lastCheckedTimes, setLastCheckedTimes };
}

