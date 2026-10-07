import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { requireAdmin } from '@/lib/apiAuth';
import { isPublicHttpUrl } from '@/lib/urlGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    // Hanya admin (SSO) — endpoint ini membuat request keluar ke URL dari klien,
    // jadi tidak boleh terbuka untuk viewer PIN.
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const { url } = await req.json();

    if (!url) {
        return NextResponse.json({ status: 'offline', error: 'No URL provided' }, { status: 400 });
    }

    // Anti-SSRF: tolak URL non-http(s) atau yang mengarah ke host internal/
    // loopback/link-local/metadata sebelum melakukan request apa pun.
    if (!isPublicHttpUrl(url)) {
        return NextResponse.json(
            { status: 'offline', error: 'URL tidak valid atau mengarah ke host yang tidak diizinkan.' },
            { status: 400 },
        );
    }

    try {
        // maxRedirects:0 — cegah 3xx memantul ke host internal yang lolos cek awal.
        const res = await axios.get(url, { timeout: 3000, maxRedirects: 0 });
        if (typeof res.data === 'string' && (res.data.includes('#EXTM3U') || res.data.includes('.ts') || res.data.includes('ftyp'))) {
            return NextResponse.json({ status: 'online' });
        }
        return NextResponse.json({ status: 'offline' });
    } catch (error) {
        return NextResponse.json({ status: 'offline' });
    }
}
