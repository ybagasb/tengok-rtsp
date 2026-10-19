import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import dbConnect from '@/lib/db';
import PinSession from '@/models/PinSession';
import { createRateLimiter } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Umur sesi PIN: 7 hari (sebelumnya cookie konstanta 1 tahun).
const PIN_SESSION_TTL_MS = 60 * 60 * 24 * 7 * 1000;

// Anti brute-force PIN: maksimum 5 percobaan per IP dalam 60 detik.
const verifyLimiter = createRateLimiter({ max: 5, windowMs: 60_000 });

export async function POST(req: NextRequest) {
    // 0. Rate limit DULU — sebelum membandingkan PIN — agar brute-force 6 digit
    //    tidak trivial. Key per IP klien.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? req.headers.get('x-real-ip')
        ?? 'unknown';

    const { limited, retryAfterMs } = verifyLimiter.check(ip);
    if (limited) {
        const retryAfterSec = Math.ceil((retryAfterMs ?? 60_000) / 1000);
        return NextResponse.json(
            { success: false, error: 'Terlalu banyak percobaan. Coba lagi nanti.' },
            { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
        );
    }

    let pin: unknown;
    try {
        ({ pin } = await req.json());
    } catch {
        return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });
    }

    if (!pin || typeof pin !== 'string') {
        return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });
    }

    // 1. Verify PIN (dilakukan SETELAH rate-limit check). Bila APP_PIN tidak
    //    diset, tolak semua (jangan pernah meloloskan).
    const appPin = process.env.APP_PIN;
    if (!appPin || pin !== appPin) {
        return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 });
    }

    // 2. Buat token sesi opaque + simpan record server-side (bisa dicabut).
    const token = crypto.randomBytes(32).toString('hex');
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
    const expiresAt = new Date(Date.now() + PIN_SESSION_TTL_MS);

    await dbConnect();
    await PinSession.create({ token, expiresAt, ipHash });

    // 3. Set Session Cookie (httpOnly — untuk auth server/middleware)
    const isHttps = req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:';
    const cookieStore = await cookies();
    cookieStore.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && isHttps,
        sameSite: 'lax',
        maxAge: PIN_SESSION_TTL_MS / 1000,
        path: '/'
    });

    // 4. Set a non-httpOnly flag cookie so client-side JS (AuthStateSync)
    //    can detect PIN login via document.cookie. Tidak mengandung rahasia.
    cookieStore.set('auth_flag', '1', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && isHttps,
        sameSite: 'lax',
        maxAge: PIN_SESSION_TTL_MS / 1000,
        path: '/'
    });

    return NextResponse.json({ success: true });
}
