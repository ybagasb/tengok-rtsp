"use client";

/**
 * Halaman intro lama kini MENYATU dengan /categories (sekuens gedung 3D → divisi
 * ada di halaman kategori). Rute ini dipertahankan hanya untuk menjaga bookmark
 * / tautan lama tetap bekerja: langsung alihkan ke /categories.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function IntroRedirectPage() {
    const router = useRouter();
    useEffect(() => { router.replace('/categories'); }, [router]);
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
            <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
        </div>
    );
}
