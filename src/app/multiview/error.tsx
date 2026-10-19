'use client';

import RouteError from '@/components/RouteError';

export default function MultiviewError(props: { error: Error & { digest?: string }; reset: () => void }) {
    return <RouteError {...props} title="Multiview gagal dimuat" />;
}
