import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/db';
import AccessLog from '@/models/AccessLog';

export async function POST(req: Request) {
    try {
        const { token } = await req.json();
        
        if (!token) {
            return NextResponse.json({ success: false, error: 'Token is required' }, { status: 400 });
        }

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
        
        // Fire-and-forget logic for insertion speed
        AccessLog.create({
            token,
            ipHash,
            userAgent,
            deviceType
        }).catch(err => console.error('Failed to log access silently:', err));

        // Return immediately so frontend tracking is 100% non-blocking
        return NextResponse.json({ success: true });
    } catch (error) {
        // Never throw an error to the frontend tracking ping
        return NextResponse.json({ success: false }, { status: 200 });
    }
}
