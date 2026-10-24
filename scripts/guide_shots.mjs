// Ambil gambar untuk Panduan Pengisian (scripts/make_user_guide.py) dari app yang sedang berjalan.
//
// Prasyarat:
//   1. Dev server berjalan:  npm run dev   (BASE_URL bawaan http://localhost:3000)
//   2. Sesi SSO tersimpan:   npm run shots:login   (membuat .auth/sso-state.json)
//   3. Proyek "SR Kendari" sudah berisi data laporan bulanan
//      (npx tsx --env-file=.env.local scripts/seed_laporan_kendari.ts).
//
// Pemakaian:
//   node scripts/guide_shots.mjs
//   GUIDE_SETTLE_MS=8000 node scripts/guide_shots.mjs     # tambah waktu tunggu bila server lambat
//
// Aman: skrip ini TIDAK menyimpan apa pun. Semua permintaan tulis ke proyek/laporan,
// status kamera, dan stream diblokir di tingkat browser; form hanya dibuka lalu dibatalkan.
// Setiap gambar diambil setelah (a) elemen yang dituju tampil, (b) tidak ada kerangka
// "Memuat...", (c) waktu tunggu tambahan, dan (d) dua tangkapan berurutan identik.
// Hasil: scripts/guide-img/*.png
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SSO_STATE = path.resolve(process.cwd(), '.auth', 'sso-state.json');
const OUT_DIR = path.resolve(process.cwd(), 'scripts', 'guide-img');
const SETTLE_MS = Number(process.env.GUIDE_SETTLE_MS || 5000);   // jeda setelah tiap navigasi / ganti tab
const PROJECT_NAME = process.env.GUIDE_PROJECT || 'SR Kendari';

if (!existsSync(SSO_STATE)) {
    console.error('Sesi SSO tidak ada. Jalankan: npm run shots:login');
    process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
    const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    for (const channel of ['msedge', 'chrome']) {
        try { return await chromium.launch({ channel, headless: true, args }); } catch { /* coba berikutnya */ }
    }
    return chromium.launch({ headless: true, args });
}

/** Blokir semua permintaan yang bisa mengubah data / memulai stream. */
async function installGuards(context) {
    await context.route('**/api/**', (route) => {
        const req = route.request();
        const url = req.url();
        const isWrite = req.method() !== 'GET' && req.method() !== 'HEAD';
        const isStream = /\/api\/streams\//.test(url) || /\/api\/stream-file\//.test(url);
        if (isWrite || isStream) return route.abort();
        return route.continue();
    });
}

/**
 * Tunggu sampai halaman benar-benar siap: elemen penanda tampil, kerangka "Memuat..." hilang,
 * lalu jeda tambahan agar animasi (framer-motion, CountUp) selesai.
 */
async function ready(page, { waitFor, extraMs = SETTLE_MS } = {}) {
    if (waitFor) await waitFor.first().waitFor({ state: 'visible', timeout: 90000 });
    await page.locator('[aria-label^="Memuat"]').first().waitFor({ state: 'detached', timeout: 90000 }).catch(() => {});
    await sleep(extraMs);
    // Pastikan tidak ada indikator memuat yang tersisa di area utama.
    const loading = await page.getByText(/^Memuat/).count();
    if (loading > 0) await sleep(extraMs);
}

/** Tangkap elemen / area; ulangi sampai dua hasil berturut-turut identik (animasi selesai). */
async function stableShot(target, file, { clipPage } = {}) {
    const take = () => (clipPage
        ? target.screenshot({ clip: clipPage, animations: 'disabled', caret: 'hide' })
        : target.screenshot({ animations: 'disabled', caret: 'hide' }));
    let prev = await take();
    for (let i = 0; i < 8; i++) {
        await sleep(900);
        const cur = await take();
        if (Buffer.compare(prev, cur) === 0) {
            await writeFile(path.join(OUT_DIR, file), cur);
            console.log(`OK   ${file}`);
            return;
        }
        prev = cur;
    }
    await writeFile(path.join(OUT_DIR, file), prev);
    console.log(`OK*  ${file}  (masih ada animasi halus; hasil terakhir dipakai)`);
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    const browser = await launch();
    try {
        // ── Cari id proyek ──────────────────────────────────────────────────
        const probe = await browser.newContext({ storageState: SSO_STATE });
        const res = await probe.request.get(`${BASE_URL}/api/locations?division=${encodeURIComponent('DIVISI 1')}`);
        if (!res.ok()) throw new Error(`Gagal memuat daftar proyek (HTTP ${res.status()}). Sesi SSO kedaluwarsa? Jalankan npm run shots:login`);
        const list = (await res.json())?.data ?? [];
        const proj = list.find((l) => l?.name === PROJECT_NAME);
        await probe.close();
        if (!proj) throw new Error(`Proyek "${PROJECT_NAME}" tidak ditemukan.`);
        if (!proj.laporanBulanan?.length) throw new Error(`Proyek "${PROJECT_NAME}" belum punya laporan bulanan. Jalankan skrip seed dulu.`);
        console.log(`Proyek: ${proj.name} (${proj._id})`);

        // ═════════════ HALAMAN PROYEK (/project/[id]) ═════════════
        const ctx = await browser.newContext({
            storageState: SSO_STATE, locale: 'id-ID',
            viewport: { width: 1100, height: 1100 }, deviceScaleFactor: 2,
        });
        await installGuards(ctx);
        const page = await ctx.newPage();
        await page.goto(`${BASE_URL}/project/${proj._id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await ready(page, { waitFor: page.getByRole('heading', { level: 1, name: PROJECT_NAME }) });

        const aside = page.locator('aside').first();
        const main = page.locator('main');
        const menu = (label) => aside.getByRole('button', { name: label, exact: true });
        const mainTop = async (file, height) => {
            await page.evaluate(() => window.scrollTo(0, 0));
            const box = await main.boundingBox();
            const y0 = Math.max(0, box.y - 8);
            await stableShot(page, file, { clipPage: { x: box.x, y: y0, width: box.width, height: Math.min(box.height + 8, height) } });
        };

        // 01 – menu samping
        await stableShot(aside, '01-menu-proyek.png');
        // 02 – Beranda + kelengkapan data
        await page.getByText('Kelengkapan Data', { exact: false }).first().waitFor({ state: 'visible', timeout: 60000 });
        await mainTop('02-beranda-kelengkapan.png', 420);   // berhenti setelah baris kartu ringkas, sebelum kartu gauge

        // 03 – Laporan Bulanan: setup awal + periode + banner
        await menu('Laporan Bulanan').click();
        await ready(page, { waitFor: page.getByText('Periode laporan') });
        const setupBtn = page.getByRole('button', { name: /Setup awal/ });
        if ((await setupBtn.getAttribute('aria-expanded')) === 'false') await setupBtn.click();
        await sleep(800);
        await page.getByRole('combobox', { name: 'Periode laporan' }).selectOption('2026-08');
        await ready(page, { waitFor: page.getByText('Earned Value (EVM)'), extraMs: 2500 });
        await mainTop('03-laporan-setup.png', 870);          // berhenti rapi setelah blok Kurva S

        // 04 – Rencana Tahunan (mode isi)
        await page.getByRole('tab', { name: 'Rencana Tahunan' }).click();
        await ready(page, { waitFor: page.getByText('Tahun', { exact: true }) });
        await page.getByRole('button', { name: /^Edit$/ }).click();
        await ready(page, { waitFor: page.getByText('Tempel dari Excel'), extraMs: 3000 });
        // Tabel 12 bulan lebar: perlebar jendela sementara agar lebih banyak kolom terlihat.
        await page.setViewportSize({ width: 1500, height: 1100 });
        await ready(page, { waitFor: page.getByText('Tempel dari Excel'), extraMs: 3000 });
        await mainTop('04-rencana-tahunan.png', 1000);
        await page.setViewportSize({ width: 1100, height: 1100 });
        await sleep(1500);
        await page.getByRole('button', { name: 'Batal' }).click();

        // 05 – Isi laporan bulan baru (September), dengan contoh peringatan oranye
        await page.getByRole('tab', { name: 'Laporan Bulanan' }).click();
        await ready(page, { waitFor: page.getByText('Periode laporan'), extraMs: 2500 });
        await page.getByRole('combobox', { name: 'Periode laporan' }).selectOption('2026-09');
        await ready(page, { waitFor: page.getByRole('button', { name: /Isi laporan/ }), extraMs: 2000 });
        await page.getByRole('button', { name: /Isi laporan/ }).click();
        await ready(page, { waitFor: page.getByText('Satuan', { exact: true }), extraMs: 3000 });
        // Angka September dibuat wajar (naik dari Agustus) KECUALI BCWP yang sengaja salah satuan
        // (59 padahal satuan Juta) → hanya peringatan "Jauh berbeda dari bulan lalu" yang muncul.
        await page.getByLabel('BCWS', { exact: true }).fill('415000');
        await page.getByLabel('ACWP', { exact: true }).fill('412000');
        await page.getByLabel('BCWP', { exact: true }).fill('59');
        await page.getByText('Jauh berbeda dari bulan lalu').first().waitFor({ state: 'visible', timeout: 15000 });
        await sleep(2500);
        await mainTop('05-isi-laporan.png', 950);
        await page.getByRole('button', { name: 'Batal' }).click();

        // 06 – Edit laporan lengkap (blok terlipat + lencana ✓)
        await ready(page, { waitFor: page.getByRole('combobox', { name: 'Periode laporan' }), extraMs: 2000 });
        await page.getByRole('combobox', { name: 'Periode laporan' }).selectOption('2026-08');
        await ready(page, { waitFor: page.getByRole('button', { name: /^Edit$/ }), extraMs: 2000 });
        await page.getByRole('button', { name: /^Edit$/ }).click();
        await ready(page, { waitFor: page.getByText('Satuan', { exact: true }), extraMs: 3000 });
        await mainTop('06-edit-laporan-lengkap.png', 1000);
        await page.getByRole('button', { name: 'Batal' }).click();

        // 07 – Saldo Awal Kas
        await ready(page, { waitFor: page.getByRole('tab', { name: 'Saldo Awal Kas' }), extraMs: 1500 });
        await page.getByRole('tab', { name: 'Saldo Awal Kas' }).click();
        await ready(page, { waitFor: page.getByText('Total Cash In (awal + laporan)') });
        await mainTop('07-saldo-awal.png', 760);

        // 08 – Ringkasan (CPI/SPI terkunci)
        await menu('Ringkasan').click();
        await ready(page, { waitFor: page.getByText(/diisi otomatis dari/).first() });
        await mainTop('08-ringkasan.png', 480);

        // 09 – Cash & Keuangan (kolom terkunci)
        await menu('Cash & Keuangan').click();
        await ready(page, { waitFor: page.getByText(/diisi otomatis dari/).first() });
        await mainTop('09-cash-keuangan.png', 850);
        await ctx.close();

        // ═════════════ PANEL PETA (/map) ═════════════
        const mctx = await browser.newContext({
            storageState: SSO_STATE, locale: 'id-ID',
            viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
        });
        await installGuards(mctx);
        await mctx.addInitScript(() => { try { sessionStorage.setItem('tengok_intro_seen_v1', 'true'); } catch { /* abaikan */ } });
        const mp = await mctx.newPage();
        await mp.goto(`${BASE_URL}/map?division=${encodeURIComponent('DIVISI 1')}&reduced=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        const search = mp.getByLabel('Cari lokasi proyek');
        await ready(mp, { waitFor: search, extraMs: SETTLE_MS });
        await search.fill(PROJECT_NAME);
        await mp.getByRole('button', { name: new RegExp(PROJECT_NAME) }).first().waitFor({ state: 'visible', timeout: 30000 });
        await search.press('Enter');
        const panel = mp.locator('div.fixed.inset-y-0.right-0').filter({ hasText: PROJECT_NAME }).first();
        await ready(mp, { waitFor: panel.getByRole('heading', { name: PROJECT_NAME }), extraMs: SETTLE_MS + 2000 });

        const card = (locator, ancestorClass) => locator.locator(`xpath=ancestor::div[contains(@class,"${ancestorClass}")][1]`);
        const tab = (label) => panel.getByRole('button', { name: label, exact: true });

        // 10 – Ringkasan: Kurva S, 11 – CPI/SPI + CV/SV
        await panel.getByRole('heading', { name: /Kurva S/ }).waitFor({ state: 'visible', timeout: 60000 });
        await sleep(2500);
        await stableShot(card(panel.getByRole('heading', { name: /Kurva S/ }), 'rounded-2xl'), '10-peta-kurva-s.png');
        await stableShot(card(panel.getByText(/Data laporan per/), 'rounded-2xl'), '11-peta-cpi-spi.png');

        // 12 – Finansial: arus kas bulanan, 13 – tagihan vs target, 14 – hasil usaha
        await tab('Finansial').click();
        await ready(mp, { waitFor: panel.getByText(/Arus Kas Bulanan/), extraMs: SETTLE_MS });
        await stableShot(card(panel.getByText(/Arus Kas Bulanan/), 'rounded-2xl'), '12-peta-arus-kas.png');
        await stableShot(card(panel.getByText(/Tagihan vs Target/), 'rounded-2xl'), '13-peta-tagihan.png');
        await stableShot(card(panel.getByRole('heading', { name: /Hasil Usaha ·/ }), 'space-y-2.5'), '14-peta-hasil-usaha.png');

        // 15 – Operasi: ringkasan pengadaan
        await tab('Operasi').click();
        await ready(mp, { waitFor: panel.getByRole('heading', { name: /Ringkasan Pengadaan/ }), extraMs: SETTLE_MS });
        await stableShot(card(panel.getByRole('heading', { name: /Ringkasan Pengadaan/ }), 'space-y-2'), '15-peta-pengadaan.png');
        await mctx.close();
    } finally {
        await browser.close();
    }
    console.log(`\nSelesai. Gambar di: ${OUT_DIR}`);
}

main().catch((err) => {
    // Hanya baris pertama: call log Playwright bisa memuat header Cookie (token sesi).
    console.error(String(err.message).split('\n')[0]);
    process.exit(1);
});
