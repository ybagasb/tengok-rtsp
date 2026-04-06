import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import StatusLog from '@/models/StatusLog';
import Camera from '@/models/Camera';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cameras/offline-today
 * Returns a map of { cameraId: incidentCount } — counts of real OUTAGE INCIDENTS today.
 *
 * An "incident" = a transition from online → offline (not every probe that finds it offline).
 * If a camera was offline for 2 hours straight, it counts as 1 incident, not 120.
 *
 * Logic: for each camera, fetch all logs today ordered by time, then count
 * how many times the status changed TO 'offline' from a previous 'online' entry.
 */
export async function GET() {
    await dbConnect();
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Get all logs since midnight, sorted by camera + time
        const logs = await StatusLog.find({
            timestamp: { $gte: startOfDay },
        }).sort({ cameraId: 1, timestamp: 1 }).lean() as any[];

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
            let prevStatus = 'online'; // Assume online before day started

            // If the first log today is 'offline', check yesterday's last status to see if
            // this is a continuing outage or a new one — for simplicity, count it as 1 if
            // first entry of the day is offline (conservative)
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
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
