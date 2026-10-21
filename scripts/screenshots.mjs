// Ambil screenshot halaman utama Tengok (desktop + mobile) untuk review visual.
//
// Prasyarat:
//   1. Jalankan dev server sendiri:  npm run dev
//   2. Edge atau Chrome terpasang (dipakai lewat playwright-core, tanpa unduh browser).
//
// Pemakaian (bash):
//   SCREENSHOT_PIN=123456 npm run shots                 # halaman viewer (PIN)
//   npm run shots:login   (sekali)  lalu  npm run shots # + halaman SSO (project, admin)
//   SHOT_PROJECT_ID=<_id Location> npm run shots        # pilih proyek tertentu
//   BASE_URL=http://localhost:3000 SHOT_PAGES=login,map npm run shots
//
// PIN dibaca dari env SCREENSHOT_PIN (tidak pernah ditulis ke disk/log).
// Halaman bertanda sso:true memakai sesi dari .auth/sso-state.json
// (dibuat oleh `npm run shots:login`); dilewati bila file itu tidak ada.
// Hasil: folder ./screenshots/<viewport>/<halaman>.png  (ter-ignore git).

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const PIN = process.env.SCREENSHOT_PIN || '';
const OUT_DIR = path.resolve(process.cwd(), 'screenshots');
const SSO_STATE = path.resolve(process.cwd(), '.auth', 'sso-state.json');
const HAS_SSO = existsSync(SSO_STATE);
const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS || 4000);

const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

// auth: 'none' | 'pin' | 'sso'.  fullPage: ambil seluruh tinggi halaman (untuk halaman panjang).
const PAGES = [
    { name: 'login', url: '/login', auth: 'none' },
    { name: 'categories-hq', url: '/categories', auth: 'pin' },
    { name: 'categories-split', url: '/categories', auth: 'pin', introSeen: true },
    { name: 'categories-detail-div1', url: '/categories?div=DIVISI%201', auth: 'pin', introSeen: true },
    { name: 'map-div1', url: '/map?division=DIVISI%201', auth: 'pin' },
    { name: 'multiview-div1', url: '/multiview?division=DIVISI%201', auth: 'pin' },
    { name: 'project-detail', url: '/project/__PROJECT__', auth: 'sso', introSeen: true, fullPage: true },
    { name: 'admin-dashboard', url: '/admin', auth: 'sso' },
    { name: 'admin-cameras', url: '/admin/cameras', auth: 'sso' },
    { name: 'admin-locations', url: '/admin/locations', auth: 'sso' },
    { name: 'admin-categories', url: '/admin/categories', auth: 'sso' },
    { name: 'admin-share-links', url: '/admin/share-links', auth: 'sso' },
    { name: 'admin-statistics', url: '/admin/statistics', auth: 'sso' },
    { name: 'admin-uptime', url: '/admin/uptime', auth: 'sso' },
    { name: 'admin-notifications', url: '/admin/notifications', auth: 'sso' },
    { name: 'admin-audit-log', url: '/admin/audit-log', auth: 'sso' },
    { name: 'admin-roles', url: '/admin/roles', auth: 'sso' },
];

const only = (process.env.SHOT_PAGES || '').split(',').map((s) => s.trim()).filter(Boolean);

async function launch() {
    const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    for (const channel of ['msedge', 'chrome']) {
        try {
            return await chromium.launch({ channel, headless: true, args });
        } catch {
            // coba channel berikutnya
        }
    }
    // Fallback: Chromium bawaan Playwright (node node_modules/playwright-core/cli.js install chromium).
    try {
        return await chromium.launch({ headless: true, args });
    } catch {
        throw new Error('Edge/Chrome/Chromium tidak ditemukan. Pasang salah satunya.');
    }
}

async function loginWithPin(context) {
    const res = await context.request.post(`${BASE_URL}/api/auth/verify`, { data: { pin: PIN } });
    if (!res.ok()) {
        throw new Error(`Login PIN gagal (HTTP ${res.status()}). Periksa SCREENSHOT_PIN dan server dev.`);
    }
}

// Pilih proyek untuk halaman detail: SHOT_PROJECT_ID, atau proyek pertama dari API (sesi SSO).
async function resolveProjectId(browser) {
    if (process.env.SHOT_PROJECT_ID) return process.env.SHOT_PROJECT_ID;
    if (!HAS_SSO) return '';
    const context = await browser.newContext({ storageState: SSO_STATE });
    try {
        const res = await context.request.get(`${BASE_URL}/api/locations?division=${encodeURIComponent('DIVISI 1')}`);
        if (!res.ok()) return '';
        const body = await res.json();
        const list = Array.isArray(body?.data) ? body.data : [];
        // Utamakan proyek yang punya data terisi (nilai kontrak) agar tampilan lebih informatif.
        const withData = list.find((l) => l?.contractValue) || list[0];
        return withData?._id || '';
    } catch (err) {
        // Jangan cetak err.message utuh: call log Playwright memuat header Cookie (token sesi).
        throw new Error(`Gagal mengambil daftar proyek dari ${BASE_URL} (server dev jalan?): ${String(err.message).split('\n')[0]}`);
    } finally {
        await context.close();
    }
}

async function main() {
    const browser = await launch();
    let failures = 0;
    let skipped = [];

    try {
        const projectId = await resolveProjectId(browser);
        const pages = (only.length ? PAGES.filter((p) => only.includes(p.name)) : PAGES).filter((p) => {
            // Halaman viewer juga bisa dibuka dengan sesi SSO bila PIN tidak diberikan.
            if (p.auth === 'pin' && !PIN && !HAS_SSO) { skipped.push(`${p.name} (butuh SCREENSHOT_PIN atau npm run shots:login)`); return false; }
            if (p.auth === 'sso' && !HAS_SSO) { skipped.push(`${p.name} (jalankan npm run shots:login)`); return false; }
            if (p.url.includes('__PROJECT__') && !projectId) { skipped.push(`${p.name} (proyek tidak ditemukan)`); return false; }
            return true;
        });

        for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
            await mkdir(path.join(OUT_DIR, vpName), { recursive: true });

            for (const target of pages) {
                const context = await browser.newContext({
                    viewport: { width: vp.width, height: vp.height },
                    ...vp,
                    locale: 'id-ID',
                    ...(target.auth === 'sso' || (target.auth === 'pin' && !PIN) ? { storageState: SSO_STATE } : {}),
                });
                try {
                    if (target.auth === 'pin' && PIN) await loginWithPin(context);
                    if (target.introSeen) {
                        await context.addInitScript(() => {
                            try { sessionStorage.setItem('tengok_intro_seen_v1', 'true'); } catch { /* abaikan */ }
                        });
                    }

                    const page = await context.newPage();
                    const consoleErrors = [];
                    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
                    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`));

                    const url = target.url.replace('__PROJECT__', projectId);
                    // 'networkidle' tidak dipakai: SSE/polling membuatnya tidak pernah tercapai.
                    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await page.waitForTimeout(SETTLE_MS);

                    const finalPath = page.url().replace(BASE_URL, '');
                    const redirected = !finalPath.startsWith(url.split('?')[0]);
                    const file = path.join(OUT_DIR, vpName, `${target.name}.png`);
                    await page.screenshot({ path: file, fullPage: Boolean(target.fullPage) });
                    console.log(`OK   ${vpName}/${target.name}  (${finalPath})${redirected ? '  DIALIHKAN (sesi tidak valid?)' : ''}${consoleErrors.length ? `  console-errors=${consoleErrors.length}` : ''}`);
                    for (const e of consoleErrors.slice(0, 3)) console.log(`       - ${e}`);
                } catch (err) {
                    failures++;
                    console.error(`FAIL ${vpName}/${target.name}: ${err.message}`);
                } finally {
                    await context.close();
                }
            }
        }
    } finally {
        await browser.close();
    }

    if (skipped.length) console.log(`\nDilewati: ${[...new Set(skipped)].join('; ')}`);
    console.log(`\nSelesai. Hasil di: ${OUT_DIR}`);
    if (failures) process.exitCode = 1;
}

main().catch((err) => {
    // Hanya baris pertama: call log Playwright bisa memuat header Cookie (token sesi).
    console.error(String(err.message).split('\n')[0]);
    process.exit(1);
});
