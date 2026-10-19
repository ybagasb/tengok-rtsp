// Simpan sesi login SSO ke file agar skrip screenshot bisa membuka halaman
// yang butuh SSO (/project/[id], /admin/*).
//
// Pemakaian (dev server harus sudah jalan):
//   npm run shots:login
//
// Langkah: jendela Edge/Chrome terbuka -> klik "Masuk dengan SSO" -> selesaikan
// login Cognito di jendela itu. Setelah masuk ke aplikasi, jendela tertutup
// sendiri dan sesi disimpan ke .auth/sso-state.json.
//
// PERINGATAN: file itu berisi cookie sesi (setara kunci login admin kamu).
// Folder .auth/ sudah di-ignore git. Jangan dibagikan; hapus bila sudah selesai.

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const STATE_FILE = path.resolve(process.cwd(), '.auth', 'sso-state.json');
const TIMEOUT_MS = 5 * 60 * 1000;

async function launch() {
    for (const channel of ['msedge', 'chrome']) {
        try {
            return await chromium.launch({ channel, headless: false });
        } catch {
            // coba channel berikutnya
        }
    }
    throw new Error('Edge/Chrome tidak ditemukan.');
}

const browser = await launch();
try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`);
    console.log('Selesaikan login SSO di jendela yang terbuka (maks 5 menit)...');

    // Sukses = kembali ke aplikasi (bukan /login dan bukan domain Cognito) dan cookie sesi ada.
    await page.waitForFunction(
        (base) => location.origin === new URL(base).origin && !location.pathname.startsWith('/login') && !location.pathname.startsWith('/api/auth'),
        BASE_URL,
        { timeout: TIMEOUT_MS },
    );

    const cookies = await context.cookies();
    const hasSession = cookies.some((c) => /authjs\.session-token/.test(c.name));
    if (!hasSession) throw new Error('Cookie sesi SSO tidak ditemukan. Login mungkin belum selesai.');

    await mkdir(path.dirname(STATE_FILE), { recursive: true });
    await context.storageState({ path: STATE_FILE });
    console.log(`Sesi SSO tersimpan: ${STATE_FILE}`);
} finally {
    await browser.close();
}
