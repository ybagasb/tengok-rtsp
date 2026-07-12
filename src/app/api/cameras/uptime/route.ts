import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import StatusLog from '@/models/StatusLog';
import Camera from '@/models/Camera';
import Location from '@/models/Location';
import { requireAuth } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

    const days = parseInt(req.nextUrl.searchParams.get('days') || '7');
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    await dbConnect();

    try {
        // Get all cameras with their location info (exclude streamUrl)
        const locations = await Location.find()
            .select('name category cameras')
            .populate('cameras', 'name status lastCheckedAt lastOnlineAt')
            .lean();

        // Get all status logs in the date range
        const logs = await StatusLog.find({ timestamp: { $gte: sinceDate } })
            .sort({ timestamp: 1 })
            .lean();

        // Group logs by cameraId
        const logsByCamera: Record<string, any[]> = {};
        logs.forEach((log: any) => {
            const id = log.cameraId.toString();
            if (!logsByCamera[id]) logsByCamera[id] = [];
            logsByCamera[id].push(log);
        });

        // Calculate uptime per camera
        const results: any[] = [];

        locations.forEach((loc: any) => {
            (loc.cameras || []).forEach((cam: any) => {
                const camId = cam._id.toString();
                const cameraLogs = logsByCamera[camId] || [];
                const totalChecks = cameraLogs.length;
                const onlineChecks = cameraLogs.filter((l: any) => l.status === 'online').length;
                const uptimePercent = totalChecks > 0 ? Math.round((onlineChecks / totalChecks) * 100) : -1;

                results.push({
                    cameraId: camId,
                    cameraName: cam.name,
                    locationName: loc.name,
                    category: loc.category,
                    currentStatus: cam.status || 'offline',
                    lastCheckedAt: cam.lastCheckedAt || null,
                    lastOnlineAt: cam.lastOnlineAt || null,
                    uptimePercent,
                    totalChecks,
                    onlineChecks,
                });
            });
        });

        // Sort by uptime ascending (worst first)
        results.sort((a, b) => {
            if (a.uptimePercent === -1) return 1;
            if (b.uptimePercent === -1) return -1;
            return a.uptimePercent - b.uptimePercent;
        });

        return NextResponse.json({ success: true, days, data: results });
    } catch (error: any) {
        console.error('[Uptime API] Error:', error.message);
        return NextResponse.json({ error: 'Failed to fetch uptime data' }, { status: 500 });
    }
}
