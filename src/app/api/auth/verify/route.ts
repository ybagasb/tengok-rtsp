import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';

export async function POST(req: NextRequest) {
    const { pin, recaptchaToken } = await req.json();

    if (!pin) {
        return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });
    }

    // 1. Verify reCAPTCHA token (Only in production or if token is explicitly required)
    if (process.env.NODE_ENV === 'production' && !recaptchaToken) {
        return NextResponse.json({ success: false, error: 'Missing reCAPTCHA token' }, { status: 400 });
    }

    if (recaptchaToken) {
        try {
            const secretKey = process.env.RECAPTCHA_SECRET_KEY;
            const recaptchaRes = await axios.post(
                `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`
            );

            if (!recaptchaRes.data.success || recaptchaRes.data.score < 0.1) {
                console.warn('reCAPTCHA bot detected:', recaptchaRes.data);
                return NextResponse.json({ success: false, error: 'reCAPTCHA verification failed (score too low)' }, { status: 403 });
            }
        } catch (error) {
            console.error('reCAPTCHA Error:', error);
            return NextResponse.json({ success: false, error: 'Failed to verify reCAPTCHA' }, { status: 500 });
        }
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
