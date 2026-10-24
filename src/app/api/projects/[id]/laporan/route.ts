import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
import { requireProjectAccess, getAuditActor } from '@/lib/apiAuth';
import { logAudit } from '@/lib/adminAuditLog';
import { syncLegacy } from '@/lib/projectSync';
import {
    sanitizeLaporan, sanitizeRencana, sanitizeSaldoAwal, periodeLabel,
    isValidPeriode, MAX_LAPORAN, MAX_RENCANA,
} from '@/lib/projectReport';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Laporan bulanan proyek — dikelola per-entri (bukan menimpa seluruh array)
 * supaya dua PIC yang mengisi periode berbeda tidak saling menimpa.
 *
 * PUT    { kind: 'bulanan', periode, data }  → upsert satu periode
 * PUT    { kind: 'rencana', data }           → upsert rencana Kurva S satu tahun
 * PUT    { kind: 'saldoAwal', data }         → total cash in/out sebelum laporan pertama
 * DELETE ?kind=bulanan&periode=YYYY-MM
 * DELETE ?kind=rencana&tahun=YYYY
 *
 * Akses: super-admin ATAU PIC proyek (requireProjectAccess).
 */

function badRequest(errors: string[]) {
    return NextResponse.json({ success: false, error: errors.join('; '), fields: errors }, { status: 400 });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const authError = await requireProjectAccess(req, id);
    if (authError) return authError;
    if (!mongoose.isValidObjectId(id)) {
        return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
    }

    let body: Record<string, unknown> | null = null;
    try { body = await req.json(); } catch { /* body kosong/rusak */ }
    if (!body || typeof body !== 'object') return badRequest(['Body permintaan tidak valid']);

    await dbConnect();

    try {
        let detail = '';

        if (body.kind === 'bulanan') {
            const res = sanitizeLaporan({ ...(body.data as object), periode: body.periode });
            if (!res.ok) return badRequest(res.errors);
            const entry = { ...res.value, updatedAt: new Date() };
            const p = entry.periode;

            // 1) Periode sudah ada → ganti utuh (field yang dikosongkan ikut hilang).
            const upd = await Location.updateOne(
                { _id: id, 'laporanBulanan.periode': p },
                { $set: { 'laporanBulanan.$': entry } },
            );
            // 2) Belum ada → tambah (dengan batas jumlah entri).
            if (upd.matchedCount === 0) {
                const ins = await Location.updateOne(
                    { _id: id, 'laporanBulanan.periode': { $ne: p }, [`laporanBulanan.${MAX_LAPORAN - 1}`]: { $exists: false } },
                    { $push: { laporanBulanan: entry } },
                );
                if (ins.matchedCount === 0) {
                    const exists = await Location.exists({ _id: id });
                    if (!exists) return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
                    return badRequest([`Jumlah laporan bulanan sudah mencapai batas (${MAX_LAPORAN})`]);
                }
            }
            await syncLegacy(id);
            detail = `Menyimpan laporan bulanan ${periodeLabel(p)}`;
        } else if (body.kind === 'rencana') {
            const res = sanitizeRencana(body.data);
            if (!res.ok) return badRequest(res.errors);
            const entry = res.value;

            const upd = await Location.updateOne(
                { _id: id, 'rencanaKurvaS.tahun': entry.tahun },
                { $set: { 'rencanaKurvaS.$': entry } },
            );
            if (upd.matchedCount === 0) {
                const ins = await Location.updateOne(
                    { _id: id, 'rencanaKurvaS.tahun': { $ne: entry.tahun }, [`rencanaKurvaS.${MAX_RENCANA - 1}`]: { $exists: false } },
                    { $push: { rencanaKurvaS: entry } },
                );
                if (ins.matchedCount === 0) {
                    const exists = await Location.exists({ _id: id });
                    if (!exists) return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
                    return badRequest([`Jumlah rencana tahunan sudah mencapai batas (${MAX_RENCANA})`]);
                }
            }
            await syncLegacy(id);
            detail = `Menyimpan rencana Kurva S tahun ${entry.tahun}`;
        } else if (body.kind === 'saldoAwal') {
            const res = sanitizeSaldoAwal(body.data);
            if (!res.ok) return badRequest(res.errors);
            const set: Record<string, number> = {};
            const unset: Record<string, ''> = {};
            for (const k of ['cashInAwal', 'cashOutAwal'] as const) {
                if (res.value[k] !== undefined) set[k] = res.value[k] as number; else unset[k] = '';
            }
            const upd = await Location.updateOne(
                { _id: id },
                { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
            );
            if (upd.matchedCount === 0) return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
            await syncLegacy(id);
            detail = 'Menyimpan saldo awal kas';
        } else {
            return badRequest(['Jenis data tidak dikenal']);
        }

        const loc = await Location.findById(id).select('name').lean<{ name?: string }>();
        await logAudit({
            action: 'UPDATE',
            entity: 'Project',
            entityId: id,
            entityName: loc?.name ?? id,
            by: await getAuditActor(req),
            detail,
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Laporan PUT] Error:', error instanceof Error ? error.message : undefined);
        return NextResponse.json({ success: false, error: 'Gagal menyimpan laporan' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const authError = await requireProjectAccess(req, id);
    if (authError) return authError;
    if (!mongoose.isValidObjectId(id)) {
        return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
    }

    const kind = req.nextUrl.searchParams.get('kind');
    await dbConnect();

    try {
        let detail = '';
        if (kind === 'bulanan') {
            const periode = req.nextUrl.searchParams.get('periode');
            if (!isValidPeriode(periode)) return badRequest(['Periode tidak valid']);
            await Location.updateOne({ _id: id }, { $pull: { laporanBulanan: { periode } } });
            await syncLegacy(id);
            detail = `Menghapus laporan bulanan ${periodeLabel(periode)}`;
        } else if (kind === 'rencana') {
            const tahun = Number(req.nextUrl.searchParams.get('tahun'));
            if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2099) return badRequest(['Tahun tidak valid']);
            await Location.updateOne({ _id: id }, { $pull: { rencanaKurvaS: { tahun } } });
            await syncLegacy(id);
            detail = `Menghapus rencana Kurva S tahun ${tahun}`;
        } else {
            return badRequest(['Jenis data tidak dikenal']);
        }

        const loc = await Location.findById(id).select('name').lean<{ name?: string }>();
        await logAudit({
            action: 'UPDATE',
            entity: 'Project',
            entityId: id,
            entityName: loc?.name ?? id,
            by: await getAuditActor(req),
            detail,
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Laporan DELETE] Error:', error instanceof Error ? error.message : undefined);
        return NextResponse.json({ success: false, error: 'Gagal menghapus laporan' }, { status: 500 });
    }
}
