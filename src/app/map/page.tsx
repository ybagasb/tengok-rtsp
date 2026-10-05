"use client";

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import BrandLoader from '@/components/BrandLoader';

// Require MapComponent dynamically with SSR disabled — MapLibre GL needs the
// browser (WebGL / window) and cannot render on the server.
const MapComponent = dynamic(
    () => import('@/components/MapComponent'),
    {
        ssr: false,
        loading: () => <BrandLoader label="Memuat Peta" />,
    }
);

import { useSearchParams } from 'next/navigation';
import { usePageTracking } from '@/hooks/usePageTracking';

export default function MapPage() {
    return (
        <Suspense fallback={<BrandLoader label="Memuat Peta" />}>
            <MapPageContent />
        </Suspense>
    );
}

function MapPageContent() {
    const searchParams = useSearchParams();
    const category = searchParams.get('category');
    const division = searchParams.get('division');
    usePageTracking('map');
    return <MapComponent category={category} division={division} />;
}
