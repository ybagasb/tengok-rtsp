import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

interface StreamSession {
    process: ChildProcess;
    lastHeartbeat: number;
}

class FfmpegManager {
    private streams: Map<string, StreamSession> = new Map();
    private streamsDir: string;
    private maxIdleTimeMs = 300000; // 5 minutes (menghindari browser throttling)

    constructor() {
        this.streamsDir = path.join(process.cwd(), 'public', 'streams');
        if (!fs.existsSync(this.streamsDir)) {
            fs.mkdirSync(this.streamsDir, { recursive: true });
        }
        setInterval(() => this.cleanupIdleStreams(), 15000);
    }

    private async waitForFile(filePath: string, timeoutMs: number = 15000, processObject?: ChildProcess): Promise<void> {
        return new Promise((resolve, reject) => {
            if (fs.existsSync(filePath)) return resolve();
            
            let isExited = false;
            if (processObject) {
                processObject.once('close', () => { isExited = true; });
                processObject.once('exit', () => { isExited = true; });
            }

            const startTime = Date.now();
            const interval = setInterval(() => {
                if (fs.existsSync(filePath)) {
                    clearInterval(interval);
                    resolve();
                } else if (isExited) {
                    clearInterval(interval);
                    reject(new Error(`FFmpeg process exited before stream started`));
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
        const outDir = path.join(this.streamsDir, cameraId);
        const m3u8Path = path.join(outDir, 'index.m3u8');

        if (this.streams.has(cameraId)) {
            this.heartbeat(cameraId);
            console.log(`[FFmpegManager] Stream ${cameraId} already running.`);
            await this.waitForFile(m3u8Path, 15000, this.streams.get(cameraId)?.process);
            return streamPath;
        }

        // Wipe stale data
        if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
        fs.mkdirSync(outDir, { recursive: true });

        console.log(`\n==============================`);
        console.log(`[FFmpegManager] Starting stream: ${cameraId}`);
        console.log(`[FFmpegManager] RTSP URL: ${rtspUrl}`);
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
            '-i', rtspUrl,
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
        ffmpeg.stderr?.on('data', (data: Buffer) => {
            const line = data.toString().trim();
            if (line) console.log(`[FFmpeg] ${line}`);
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
            await this.waitForFile(m3u8Path, 15000, ffmpeg);
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
            session.process.kill('SIGKILL');
            this.streams.delete(cameraId);
            console.log(`[FFmpegManager] Stopped ${cameraId}`);
            const outDir = path.join(this.streamsDir, cameraId);
            if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
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

const globalForFfmpeg = global as unknown as { ffmpegManager: FfmpegManager | undefined };
export const ffmpegManager = globalForFfmpeg.ffmpegManager || new FfmpegManager();
if (process.env.NODE_ENV !== 'production') globalForFfmpeg.ffmpegManager = ffmpegManager;
