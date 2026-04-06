import { useEffect } from 'react';

/**
 * usePageTracking
 * Call this hook at the top of any page component to track a visit.
 *
 * @param page - page identifier: 'categories' | 'map' | 'app' | 'shared'
 * @param enabled - optional: only run when true (default true)
 */
export function usePageTracking(page: string, enabled: boolean = true) {
    useEffect(() => {
        if (!enabled) return;

        const timer = setTimeout(() => {
            fetch('/api/stats/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page }),
                keepalive: true,
            }).catch(() => {});
        }, 1500); // Small delay to avoid tracking bounced visits

        return () => clearTimeout(timer);
    }, [page, enabled]);
}
