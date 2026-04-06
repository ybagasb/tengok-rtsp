import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/db';
import AccessLog from '@/models/AccessLog';

/**
 * POST /api/stats/track
 * Body: { token?: string, page?: string }
 *
 * - For shared URL visits: pass { token, page: 'shared' }
 * - For direct app visits: pass { page: 'categories' | 'map' | 'app' }
 * - token is now optional
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const token: string | null = body.token || null;
        const page: string = body.page || 'app';

        await dbConnect();

        const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
        const userAgent = req.headers.get('user-agent') || 'unknown';

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
