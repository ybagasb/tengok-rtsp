'use client';

import RouteError from '@/components/RouteError';

export default function CategoriesError(props: { error: Error & { digest?: string }; reset: () => void }) {
    return <RouteError {...props} title="Halaman kategori gagal dimuat" backHref="/map" backLabel="Buka Peta" />;
}
