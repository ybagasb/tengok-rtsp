import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

interface StreamSession {
    process: ChildProcess;
    lastHeartbeat: number;
    lastError?: string;
    exitCode?: number | null;
}

class FfmpegManager {
    private streams: Map<string, StreamSession> = new Map();
    // Tracks in-flight startStream() calls so concurrent requests for the same
    // camera share a single ffmpeg spawn instead of racing to spawn duplicates.
    private starting: Map<string, Promise<string>> = new Map();
    private streamsDir: string;
    private maxIdleTimeMs = 300000; // 5 minutes (menghindari browser throttling)

    constructor() {
        this.streamsDir = path.join(process.cwd(), 'public', 'streams');
        if (!fs.existsSync(this.streamsDir)) {
            fs.mkdirSync(this.streamsDir, { recursive: true });
        }
        // Sweep leftover stream directories from a previous process/crash.
        // At construction there are no active sessions, so every subdir is stale.
        this.sweepStaleDirs();
        setInterval(() => this.cleanupIdleStreams(), 15000);
    }

    /** Remove per-camera output dirs that have no active session (startup cleanup). */
    private sweepStaleDirs() {
        try {
            const entries = fs.readdirSync(this.streamsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                if (this.streams.has(entry.name)) continue; // active — keep
                const dir = path.join(this.streamsDir, entry.name);
                try {
                    fs.rmSync(dir, { recursive: true, force: true });
                } catch { /* best-effort */ }
            }
        } catch { /* streamsDir may be empty or unreadable — ignore */ }
    }

    private async waitForFile(filePath: string, timeoutMs: number = 15000, cameraId?: string, processObject?: ChildProcess): Promise<void> {
        return new Promise((resolve, reject) => {
            if (fs.existsSync(filePath)) return resolve();

            let isExited = false;
            let exitCode: number | null = null;
            if (processObject) {
                processObject.once('exit', (code) => { isExited = true; exitCode = code; });
                processObject.once('close', (code) => { isExited = true; if (exitCode === null) exitCode = code; });
            }

            const startTime = Date.now();
            const interval = setInterval(() => {
                if (fs.existsSync(filePath)) {
                    clearInterval(interval);
                    resolve();
                } else if (isExited) {
                    clearInterval(interval);
                    const detail = cameraId ? this.streams.get(cameraId)?.lastError : undefined;
                    const reason = detail ? ` (ffmpeg: ${detail})` : '';
                    reject(new Error(`FFmpeg process exited (code ${exitCode}) before stream started${reason}`));
                } else if (Date.now() - startTime > timeoutMs) {
                    clearInterval(interval);
                    reject(new Error(`Timeout waiting for stream file`));
                }
            }, 250); // Check faster (250ms) to reduce startup perceived delay
        });
    }

    /** Returns true if this camera already has an active FFmpeg stream */
    public isStreaming(cameraId: string): boolean {
        return this.streams.has(cameraId);
    }

    public async startStream(cameraId: string, rtspUrl: string): Promise<string> {
        const streamPath = `/api/stream-file/${cameraId}/index.m3u8`;
        const m3u8Path = path.join(this.streamsDir, cameraId, 'index.m3u8');

        // Fast path: stream already running → just refresh heartbeat and wait.
        if (this.streams.has(cameraId)) {
            this.heartbeat(cameraId);
            console.log(`[FFmpegManager] Stream ${cameraId} already running.`);
            await this.waitForFile(m3u8Path, 15000, cameraId, this.streams.get(cameraId)?.process);
            return streamPath;
        }

        // Dedupe concurrent first-time starts: if a spawn is already in flight
        // for this camera, reuse its promise instead of spawning a second ffmpeg.
        const inFlight = this.starting.get(cameraId);
        if (inFlight) {
            console.log(`[FFmpegManager] Start already in flight for ${cameraId}, reusing.`);
            return inFlight;
        }

        const promise = this._startStream(cameraId, rtspUrl).finally(() => {
            this.starting.delete(cameraId);
        });
        this.starting.set(cameraId, promise);
        return promise;
    }

    private async _startStream(cameraId: string, rtspUrl: string): Promise<string> {
        const streamPath = `/api/stream-file/${cameraId}/index.m3u8`;
        const outDir = path.join(this.streamsDir, cameraId);
        const m3u8Path = path.join(outDir, 'index.m3u8');

        // Wipe stale data
        if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
        fs.mkdirSync(outDir, { recursive: true });

        let safeRtspUrl = rtspUrl;
        try {
            const urlObj = new URL(rtspUrl);
            safeRtspUrl = urlObj.href;
        } catch (e) {
            // Fallback to original URL
        }

        console.log(`\n==============================`);
        console.log(`[FFmpegManager] Starting stream: ${cameraId}`);
        console.log(`[FFmpegManager] RTSP URL: ${safeRtspUrl}`);
        console.log(`[FFmpegManager] Output: ${m3u8Path}`);
        console.log(`==============================\n`);

        const ffmpeg = spawn('ffmpeg', [
            '-loglevel', 'error',
            '-fflags', 'nobuffer+genpts+discardcorrupt',
            '-flags', 'low_delay',
            '-analyzeduration', '100000',
            '-probesize', '100000',
            '-rtsp_transport', 'tcp',
            '-timeout', '5000000', // 5s tcp connection timeout
            '-i', safeRtspUrl,
            '-err_detect', 'ignore_err',
            '-avioflags', 'direct',
            '-c:v', 'copy', // Stream copy mode: Immediate startup, 0% CPU, bypassing transcoding
            '-an', // CCTV audio often missing/delayed, disabling speeds up startup
            '-f', 'hls',
            '-hls_time', '1',
            '-hls_init_time', '1',
            '-hls_list_size', '3',
            '-hls_flags', 'delete_segments',
            m3u8Path
        ]);

        // Log ALL FFmpeg output (stderr = progress/info, stdout = usually empty)
        // Keep the most recent stderr line so we can surface WHY ffmpeg died.
        ffmpeg.stderr?.on('data', (data: Buffer) => {
            const line = data.toString().trim();
            if (line) {
                console.log(`[FFmpeg] ${line}`);
                const session = this.streams.get(cameraId);
                if (session) session.lastError = line;
            }
        });

        ffmpeg.on('close', (code: number | null) => {
            console.log(`[FFmpegManager] Process ${cameraId} exited with code ${code}`);
            this.streams.delete(cameraId);
        });

        ffmpeg.on('error', (err: Error) => {
            console.error(`[FFmpegManager] Spawn error for ${cameraId}: ${err.message}`);
            console.error(`[FFmpegManager] Is FFmpeg installed and in PATH?`);
        });

        this.streams.set(cameraId, { process: ffmpeg, lastHeartbeat: Date.now() });

        try {
            await this.waitForFile(m3u8Path, 15000, cameraId, ffmpeg);
            console.log(`[FFmpegManager] Stream ${cameraId} READY → ${streamPath}`);
            return streamPath;
        } catch (e: any) {
            console.error(`[FFmpegManager] Stream ${cameraId} FAILED: ${e.message}`);
            this.stopStream(cameraId);
            throw new Error(`Stream initialization failed: ${e.message}`);
        }
    }

    public heartbeat(cameraId: string) {
        const session = this.streams.get(cameraId);
        if (session) session.lastHeartbeat = Date.now();
    }

    public stopStream(cameraId: string) {
        const session = this.streams.get(cameraId);
        if (session) {
            // Graceful shutdown: SIGTERM first (lets FFmpeg flush HLS segments),
            // then SIGKILL after 2s if the process hasn't exited cleanly.
            const proc = session.process;
            this.streams.delete(cameraId);
            console.log(`[FFmpegManager] Stopping ${cameraId} (SIGTERM)...`);

            proc.kill('SIGTERM');

            const forceKillTimer = setTimeout(() => {
                if (!proc.killed) {
                    console.warn(`[FFmpegManager] Force-killing ${cameraId} (SIGKILL)`);
                    proc.kill('SIGKILL');
                }
            }, 2000);

            proc.once('close', () => {
                clearTimeout(forceKillTimer);
                console.log(`[FFmpegManager] Stopped ${cameraId}`);
                const outDir = path.join(this.streamsDir, cameraId);
                if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
            });
        }
    }

    private cleanupIdleStreams() {
        const now = Date.now();
        for (const [cameraId, session] of this.streams.entries()) {
            if (now - session.lastHeartbeat > this.maxIdleTimeMs) {
                console.log(`[FFmpegManager] Idle timeout for ${cameraId}, stopping...`);
                this.stopStream(cameraId);
            }
        }
    }
}

// Durable singleton across module reloads and route bundles — in BOTH dev and
// production. Storing on `global` unconditionally is essential: otherwise each
// bundle that imports this module gets its own `streams` map, so stop/heartbeat/
// isStreaming can't see processes started elsewhere, spawning orphan ffmpeg
// processes that can never be reaped. (Matches cameraStatusChecker/Emitter.)
const globalForFfmpeg = global as unknown as { ffmpegManager: FfmpegManager | undefined };
export const ffmpegManager = globalForFfmpeg.ffmpegManager || new FfmpegManager();
globalForFfmpeg.ffmpegManager = ffmpegManager;
