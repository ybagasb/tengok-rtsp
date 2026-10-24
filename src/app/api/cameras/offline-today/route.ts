import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import StatusLog from '@/models/StatusLog';
// Side-effect import: registers the Camera model (needed for populate / refs)
import '@/models/Camera';
import { requireAuth } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cameras/offline-today
 * Returns a map of { cameraId: incidentCount } — counts of real OUTAGE INCIDENTS today.
 */
export async function GET(req: NextRequest) {
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

    await dbConnect();
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Get all logs since midnight, sorted by camera + time
        const logs = await StatusLog.find({
            timestamp: { $gte: startOfDay },
        }).sort({ cameraId: 1, timestamp: 1 }).lean<Array<{ cameraId: { toString(): string }; status: string; timestamp: Date }>>();

        // Group by cameraId
        const byCam: Record<string, { status: string; timestamp: Date }[]> = {};
        for (const log of logs) {
            const key = log.cameraId.toString();
            if (!byCam[key]) byCam[key] = [];
            byCam[key].push({ status: log.status, timestamp: log.timestamp });
        }

        // Count incident transitions: the moment status flips from 'online' → 'offline'
        const map: Record<string, number> = {};
        for (const [camId, entries] of Object.entries(byCam)) {
            let incidents = 0;
            let prevStatus = 'online';

            for (let i = 0; i < entries.length; i++) {
                const cur = entries[i].status;
                if (cur === 'offline' && prevStatus === 'online') {
                    incidents++;
                }
                prevStatus = cur;
            }

            if (incidents > 0) {
                map[camId] = incidents;
            }
        }

        return NextResponse.json({ success: true, data: map });
    } catch (err) {
        console.error('[offline-today] Error:', err instanceof Error ? err.message : undefined);
        return NextResponse.json({ error: 'Gagal memuat data kamera offline' }, { status: 500 });
    }
}
