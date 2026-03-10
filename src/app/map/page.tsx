"use client";

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Require MapComponent dynamically with SSR disabled because Leaflet uses window object
const MapComponent = dynamic(
    () => import('@/components/MapComponent'),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-screen flex items-center justify-center bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
                <span className="ml-3 text-slate-400">Loading Map...</span>
            </div>
        )
    }
);

import { useSearchParams } from 'next/navigation';

export default function MapPage() {
    return (
        <Suspense fallback={
            <div className="w-full h-screen flex items-center justify-center bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
                <span className="ml-3 text-slate-400">Loading Map...</span>
            </div>
        }>
            <MapPageContent />
        </Suspense>
    );
}

function MapPageContent() {
    const searchParams = useSearchParams();
    const category = searchParams.get('category');
    return <MapComponent category={category} />;
}
