'use client';

import RouteError from '@/components/RouteError';

export default function ProjectError(props: { error: Error & { digest?: string }; reset: () => void }) {
    return <RouteError {...props} title="Detail proyek gagal dimuat" backHref="/map" backLabel="Kembali ke Peta" />;
}
