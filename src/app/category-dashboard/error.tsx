'use client';

import RouteError from '@/components/RouteError';

export default function CategoryDashboardError(props: { error: Error & { digest?: string }; reset: () => void }) {
    return <RouteError {...props} title="Dashboard kategori gagal dimuat" backHref="/categories" backLabel="Kembali ke Kategori" />;
}
