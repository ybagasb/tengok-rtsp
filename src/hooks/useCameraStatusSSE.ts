import { useState, useEffect } from 'react';

export function useCameraStatusSSE() {
    const [realtimeStatuses, setRealtimeStatuses] = useState<Record<string, 'online' | 'offline'>>({});

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
                }
            } catch (err) {
                // Silently ignore ping or parse errors string parsing
            }
        };

        eventSource.onerror = (err) => {
            // EventSource auto-reconnects natively if the connection drops.
            console.error('[SSE] Connection error/renewed');
        };

        return () => {
            isMounted = false;
            eventSource.close();
        };
    }, []);

    return { realtimeStatuses, setRealtimeStatuses };
}
