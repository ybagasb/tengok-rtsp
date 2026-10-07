// Next.js instrumentation hook. register() dipanggil sekali saat server start
// (termasuk standalone `node server.js`). Dipakai untuk memasang handler
// shutdown yang menghentikan semua proses FFmpeg secara graceful pada SIGTERM/
// SIGINT, mencegah proses ffmpeg orphan tiap kali deploy/restart.
//
// Next 16 mengaktifkan hook instrumentation secara default (tanpa flag di
// next.config). register() hanya memasang handler di runtime Node.js.

let handlersRegistered = false;

export async function register() {
    // Hanya runtime Node.js yang menjalankan FFmpeg (bukan edge/browser).
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    // Cegah pemasangan ganda (register bisa terpanggil lebih dari sekali
    // antar reload modul).
    if (handlersRegistered) return;
    handlersRegistered = true;

    const { ffmpegManager } = await import('@/lib/ffmpegManager');

    const shutdown = (signal: string) => {
        console.log(`[instrumentation] Menerima ${signal}, menghentikan semua stream FFmpeg...`);
        try {
            ffmpegManager.stopAll();
        } catch (err) {
            console.error('[instrumentation] Gagal menghentikan stream saat shutdown:', err);
        }
        // Beri waktu singkat agar SIGTERM→SIGKILL + flush HLS selesai sebelum keluar.
        setTimeout(() => process.exit(0), 2500);
    };

    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
}
