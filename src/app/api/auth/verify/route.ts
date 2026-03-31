import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
    const { pin } = await req.json();

    if (!pin) {
        return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });
    }

    // 1. Verify PIN
    const appPin = process.env.APP_PIN;
    if (pin !== appPin) {
        return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 });
    }

    // 2. Set Session Cookie
    const isHttps = req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:';
    const cookieStore = await cookies();
    cookieStore.set('auth_token', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && isHttps,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 1 week
        path: '/'
    });

    return NextResponse.json({ success: true });
}
