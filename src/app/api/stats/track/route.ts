import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/db';
import AccessLog from '@/models/AccessLog';
import { createRateLimiter } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * POST /api/stats/track
 * Body: { token?: string, page?: string }
 *
 * - For shared URL visits: pass { token, page: 'shared' }
 * - For direct app visits: pass { page: 'categories' | 'map' | 'app' }
 * - token is now optional
 *
 * Endpoint ini PUBLIK (whitelist di middleware) sehingga input dibatasi dan
 * dibatasi laju (anti write-amplification ke Mongo produksi).
 */

// Halaman yang memang dikirim aplikasi; nilai lain di-cap panjang sebagai fallback.
const KNOWN_PAGES = new Set(['shared', 'categories', 'categories-division', 'map', 'app']);
const MAX_TOKEN_LEN = 128;
const MAX_PAGE_LEN = 32;
const MAX_UA_LEN = 256;

// Maks 30 permintaan / 60 detik per IP. Lihat catatan batasan di src/lib/rateLimit.ts.
const limiter = createRateLimiter({ max: 30, windowMs: 60_000 });

export async function POST(req: Request) {
    try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
            || req.headers.get('x-real-ip')
            || 'unknown';

        const { limited, retryAfterMs } = limiter.check(ip);
        if (limited) {
            return NextResponse.json(
                { success: false, error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
                { status: 429, headers: { 'Retry-After': String(Math.ceil((retryAfterMs || 60_000) / 1000)) } },
            );
        }

        const body = await req.json();

        // Batasi input yang dikendalikan penyerang.
        const token: string | null = typeof body.token === 'string'
            ? body.token.slice(0, MAX_TOKEN_LEN)
            : null;

        const rawPage = typeof body.page === 'string' ? body.page : 'app';
        const page: string = KNOWN_PAGES.has(rawPage) ? rawPage : rawPage.slice(0, MAX_PAGE_LEN) || 'app';

        await dbConnect();

        const userAgent = (req.headers.get('user-agent') || 'unknown').slice(0, MAX_UA_LEN);

        const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

        let deviceType = 'desktop';
        const uaLower = userAgent.toLowerCase();
        if (/mobile|android|iphone|ipod/.test(uaLower)) {
            deviceType = 'mobile';
        } else if (/ipad|tablet/.test(uaLower)) {
            deviceType = 'tablet';
        }

        // Fire-and-forget — never blocks the user's request
        AccessLog.create({
            token,
            page,
            ipHash,
            userAgent,
            deviceType,
        }).catch(err => console.error('Failed to log access silently:', err));

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ success: false }, { status: 200 });
    }
}
