import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

export async function POST(req: NextRequest) {
    const { pin, recaptchaToken } = await req.json();

    if (!pin || !recaptchaToken) {
        return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });
    }

    // 1. Verify Recaptcha
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
        return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    try {
        const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`;
        const recaptchaRes = await axios.post(verifyUrl);

        if (!recaptchaRes.data.success || recaptchaRes.data.score < 0.5) {
            return NextResponse.json({ success: false, error: 'Recaptcha validation failed' }, { status: 403 });
        }
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Recaptcha verification error' }, { status: 500 });
    }

    // 2. Verify PIN
    const appPin = process.env.APP_PIN;
    if (pin !== appPin) {
        return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 });
    }

    // 3. Set Session Cookie
    const cookieStore = await cookies();
    cookieStore.set('auth_token', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7, // 1 week
        path: '/'
    });

    return NextResponse.json({ success: true });
}
