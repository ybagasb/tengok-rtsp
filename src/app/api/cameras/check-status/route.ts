import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { requireAuth } from '@/lib/apiAuth';

export async function POST(req: NextRequest) {
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

    const { url } = await req.json();

    if (!url) {
        return NextResponse.json({ status: 'offline', error: 'No URL provided' }, { status: 400 });
    }

    try {
        const res = await axios.get(url, { timeout: 3000 });
        if (typeof res.data === 'string' && (res.data.includes('#EXTM3U') || res.data.includes('.ts') || res.data.includes('ftyp'))) {
            return NextResponse.json({ status: 'online' });
        }
        return NextResponse.json({ status: 'offline' });
    } catch (error) {
        return NextResponse.json({ status: 'offline' });
    }
}
