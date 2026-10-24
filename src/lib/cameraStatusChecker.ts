/**
 * CameraStatusChecker
 * 
 * Background service that periodically probes all RTSP cameras
 * in configurable batches and updates their status in MongoDB.
 * 
 * This approach scales to 75+ cameras without overwhelming the server:
 * - Runs silently in the background (not triggered by user requests)
 * - Processes cameras in small concurrent batches (default: 5 at a time)
 * - Saves results to DB so all clients see accurate status instantly on page load
 */

import { spawn } from 'child_process';
import dbConnect from './db';
import Camera from '@/models/Camera';
import { ffmpegManager } from './ffmpegManager';
import { cameraStatusEmitter } from './cameraStatusEmitter';
import StatusLog from '@/models/StatusLog';

const BATCH_SIZE = 5;           // Concurrent RTSP probes (increased for faster cycles)
const PROBE_TIMEOUT_MS = 10000; // 10s max per camera
const INITIAL_DELAY_MS = 5 * 1000;        // Wait 5s after server start before first check
// Adaptive interval: slower when all cameras are healthy, faster when some are offline
const INTERVAL_ALL_ONLINE_MS  = 2 * 60 * 1000; // 2 minutes — less load when healthy
const INTERVAL_HAS_OFFLINE_MS = 1 * 60 * 1000; // 1 minute — faster recovery detection

// Probe a single RTSP URL using ffprobe
export function probeCamera(rtspUrl: string): Promise<'online' | 'offline'> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve('offline');
        }, PROBE_TIMEOUT_MS);

        const proc = spawn('ffprobe', [
            '-rtsp_transport', 'tcp',
            '-timeout', '8000000',          // 8s RTSP handshake timeout
            '-v', 'quiet',                  // Suppress all logs
            '-print_format', 'json',
            '-show_streams',
            '-i', rtspUrl
        ]);

        let outputData = '';
        proc.stdout?.on('data', (data) => { outputData += data.toString(); });
        proc.stderr?.on('data', () => {}); // Suppress stderr

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                resolve('offline');
                return;
            }
            try {
                const parsed = JSON.parse(outputData);
                const hasVideoStream = (parsed as { streams?: Array<{ codec_type?: string }> } | null)?.streams?.some((s) => s.codec_type === 'video');
                resolve(hasVideoStream ? 'online' : 'offline');
            } catch {
                resolve('offline'); // If output isn't valid JSON or format changes, assume offline to be safe
            }
        });

        proc.on('error', () => {
            clearTimeout(timer);
            resolve('offline');
        });
    });
}

// Process an array in chunks of `size` concurrently, sequentially per batch
export async function runInBatches<T>(
    items: T[],
    size: number,
    fn: (item: T) => Promise<void>
): Promise<void> {
    for (let i = 0; i < items.length; i += size) {
        const batch = items.slice(i, i + size);
        await Promise.all(batch.map(fn));
    }
}

class CameraStatusChecker {
    private timer: NodeJS.Timeout | null = null;
    private isRunning = false;

    start() {
        console.log(`[StatusChecker] Started — first check in ${INITIAL_DELAY_MS / 1000}s`);
        // Delay first check so server can fully start up
        setTimeout(() => {
            this.scheduleNext(INTERVAL_HAS_OFFLINE_MS);
        }, INITIAL_DELAY_MS);
    }

    private scheduleNext(intervalMs: number) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(async () => {
            const nextInterval = await this.runCheck();
            this.scheduleNext(nextInterval);
        }, intervalMs);
    }

    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    async runCheck(): Promise<number> {
        if (this.isRunning) {
            console.log('[StatusChecker] Previous check still running, skipping...');
            return INTERVAL_HAS_OFFLINE_MS;
        }
        this.isRunning = true;
        const startTime = Date.now();

        try {
            await dbConnect();
            const cameras = await Camera.find({ streamUrl: { $exists: true, $ne: '' } })
                .select('_id streamUrl status')
                .lean();

            if (cameras.length === 0) return INTERVAL_ALL_ONLINE_MS;

            // Skip cameras that are currently being actively streamed
            // to avoid RTSP connection conflicts (many cameras only allow 1 connection)
            const camerasToProbe = cameras.filter((cam) => !ffmpegManager.isStreaming(cam._id.toString()));
            const skipped = cameras.length - camerasToProbe.length;
            if (skipped > 0) console.log(`[StatusChecker] Skipping ${skipped} camera(s) with active streams`);

            console.log(`[StatusChecker] Probing ${camerasToProbe.length} cameras in batches of ${BATCH_SIZE}...`);

            let onlineCount = 0;
            let offlineCount = 0;

            const now = new Date();
            await runInBatches(camerasToProbe, BATCH_SIZE, async (cam) => {
                const status = await probeCamera(cam.streamUrl);
                if (status === 'online') onlineCount++;
                else offlineCount++;

                const updateFields: Record<string, unknown> = { status, lastCheckedAt: now };
                if (status === 'online') {
                    updateFields.lastOnlineAt = now;
                }
                await Camera.updateOne({ _id: cam._id }, { $set: updateFields });
                // Log status change to history (only if changed)
                if (cam.status !== status) {
                    await StatusLog.create({ cameraId: cam._id, status, checkedBy: 'auto' });
                }
                // Push status to all connected SSE clients immediately
                cameraStatusEmitter.emit('status', { cameraId: cam._id.toString(), status, lastCheckedAt: now.toISOString() });
            });

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            // Adaptive interval: if everything is healthy, check less frequently
            const nextInterval = offlineCount === 0 ? INTERVAL_ALL_ONLINE_MS : INTERVAL_HAS_OFFLINE_MS;
            console.log(`[StatusChecker] Done in ${elapsed}s → ${onlineCount} online, ${offlineCount} offline. Next check in ${nextInterval / 1000}s`);
            return nextInterval;

        } catch (err) {
            console.error('[StatusChecker] Error:', err instanceof Error ? err.message : undefined);
            return INTERVAL_HAS_OFFLINE_MS;
        } finally {
            this.isRunning = false;
        }
    }
}

// Singleton — survives HMR in Next.js dev mode
const globalForChecker = global as unknown as { cameraStatusChecker?: CameraStatusChecker };

if (!globalForChecker.cameraStatusChecker) {
    globalForChecker.cameraStatusChecker = new CameraStatusChecker();
    globalForChecker.cameraStatusChecker.start();
}

export const cameraStatusChecker = globalForChecker.cameraStatusChecker;
