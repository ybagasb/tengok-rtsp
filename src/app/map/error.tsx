'use client';

import RouteError from '@/components/RouteError';

export default function MapError(props: { error: Error & { digest?: string }; reset: () => void }) {
    return <RouteError {...props} title="Peta gagal dimuat" />;
}
