"use client";

import { useState, useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios';
import { Trash2, Plus, Monitor, Loader2, Pencil, X, Check, Camera, ShieldCheck, PlayCircle, FileDown, ArrowUpAZ, ArrowDownAZ, Link, Wifi, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ICameraData } from '@/models/Camera';
import { containerVariants, itemVariants, inputCls } from '@/components/admin/shared';
import { PageHeader, FormField, EmptyState, LoadingState, SearchBar, CountBadge, useConfirm } from '@/components/admin/AdminUI';

const schema = z.object({
    name: z.string().min(1, "Nama tidak boleh kosong"),
    streamUrl: z.string().min(1, "URL tidak boleh kosong").url("Harus berupa URL yang valid"),
});

type FormData = z.infer<typeof schema>;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({
    camera,
    onClose,
}: {
    camera: ICameraData;
    onClose: () => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: { name: camera.name, streamUrl: camera.streamUrl },
    });

    const onSubmit = async (data: FormData) => {
        setIsSaving(true);
        try {
            await axios.put(`/api/cameras/${camera._id}`, data);
            toast.success('Kamera berhasil diperbarui');
            mutate('/api/cameras');
            onClose();
        } catch {
            toast.error('Gagal memperbarui kamera');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" 
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 24 }}
                    className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-3xl w-full max-w-lg shadow-[0_30px_60px_rgba(0,0,0,0.6)] overflow-hidden relative"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="absolute -top-32 -right-32 w-64 h-64 bg-yellow-500/20 rounded-full blur-[80px] pointer-events-none" />
                    
                    <div className="flex items-center justify-between px-8 pt-6 pb-5 border-b border-white/5 relative z-10">
                        <h2 className="text-xl font-bold flex items-center gap-3 text-white">
                            <div className="p-2 rounded-xl bg-yellow-500/10">
                                <Pencil className="w-5 h-5 text-yellow-500" />
                            </div>
                            Edit Kamera
                        </h2>
                        <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-6 relative z-10">
                        <FormField label="Nama Perangkat CCTV" error={errors.name?.message}>
                            <input {...register('name')} className={inputCls()} placeholder="Contoh: Gerbang Utama" />
                        </FormField>

                        <FormField label="Stream URL (RTSP / HLS)" error={errors.streamUrl?.message}>
                            <input {...register('streamUrl')} className={inputCls()} placeholder="rtsp://admin:pass@ip:port/stream" />
                        </FormField>

                        <div className="flex gap-4 pt-4 border-t border-white/5 mt-6">
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-4 rounded-xl border border-white/10 text-slate-400 font-bold hover:text-white hover:bg-white/5 transition-all text-sm uppercase tracking-wider"
                            >
                                Batal
                            </motion.button>
                            <motion.button
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: 0.97 }}
                                type="submit"
                                disabled={isSaving}
                                className="flex-1 py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-slate-950 font-bold transition-all shadow-[0_4px_20px_rgba(234,179,8,0.4)] disabled:opacity-50 flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                            >
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> Simpan</>}
                            </motion.button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
export default function AdminPage() {
    const { data, isLoading } = useSWR('/api/cameras', fetcher);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingCamera, setEditingCamera] = useState<ICameraData | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'url'>('name-asc');
    const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
    const [showAddSheet, setShowAddSheet] = useState(false);
    const ITEMS_PER_PAGE = 5;
    const { confirm, ConfirmDialog } = useConfirm();

    const handleExportPDF = async () => {
        setIsExporting(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');

            const [res, offlineRes] = await Promise.all([
                axios.get('/api/locations'),
                axios.get('/api/cameras/offline-today'),
            ]);
            const locations = res.data.data || [];
            const offlineTodayMap: Record<string, number> = offlineRes.data.data || {};

            // ── Logo helper ──────────────────────────────────────────────────
            const getBase64Image = (): Promise<string | null> =>
                new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || 400;
                        canvas.height = img.naturalHeight || 400;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) { resolve(null); return; }
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL('image/png'));
                    };
                    img.onerror = () => resolve(null);
                    img.src = '/LOGO_ABIPRAYA.png';
                });

            const logoBase64 = await getBase64Image();
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 14;
            const now = new Date();

            const drawHeader = (pageNum: number) => {
                if (logoBase64) doc.addImage(logoBase64, 'PNG', margin, 8, 26, 26);
                const textX = logoBase64 ? margin + 30 : margin;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(0);
                doc.text('PT BRANTAS ABIPRAYA (PERSERO)', textX, 14);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(80);
                doc.text('Jl. D.I. Panjaitan Kav. 14, Jakarta 13340', textX, 19.5);
                doc.text('Telp: (021) 8516290 | Fax: (021) 8516289', textX, 24);

                const bW = 62, bX = pageW - margin - bW, bY = 8, bH = 22;
                doc.setDrawColor(0); doc.setLineWidth(0.6);
                doc.rect(bX, bY, bW, bH);
                doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0);
                doc.text('LAPORAN BULANAN', bX + bW / 2, bY + 7.5, { align: 'center' });
                doc.text('STATUS KAMERA CCTV', bX + bW / 2, bY + 14, { align: 'center' });
                doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(80);
                doc.text('TENGOK Surveillance System', bX + bW / 2, bY + 19.5, { align: 'center' });

                doc.setDrawColor(0); doc.setLineWidth(0.8);
                doc.line(margin, 37, pageW - margin, 37);
                doc.setLineWidth(0.25);
                doc.line(margin, 38.5, pageW - margin, 38.5);

                if (pageNum > 1) {
                    doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(140);
                    doc.text(`Hal. ${pageNum}`, pageW - margin, 6, { align: 'right' });
                }
                doc.setTextColor(0);
            };

            drawHeader(1);

            let y = 44;
            const col1 = margin, col2 = margin + 40;
            const metaRows = [
                ['Nomor Dokumen', `: TGK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-001`],
                ['Tanggal Laporan', `: ${now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`],
                ['Periode', `: ${now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`],
                ['Sistem Monitoring', `: TENGOK Surveillance Monitoring System`],
            ];
            doc.setFontSize(8.5);
            metaRows.forEach(([label, value]) => {
                doc.setFont('helvetica', 'bold'); doc.text(label, col1, y);
                doc.setFont('helvetica', 'normal'); doc.text(value, col2, y);
                y += 5.5;
            });
            y += 2;
            doc.setDrawColor(200); doc.setLineWidth(0.2);
            doc.line(margin, y, pageW - margin, y);
            y += 6;

            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0);
            doc.text('RINGKASAN EKSEKUTIF', margin, y);
            y += 5;

            let totalCams = 0, totalOnline = 0, totalOffline = 0, totalOfflineEvents = 0;
            locations.forEach((loc: any) => {
                (loc.cameras || []).forEach((cam: any) => {
                    totalCams++;
                    if (cam.status === 'online') totalOnline++;
                    else totalOffline++;
                    totalOfflineEvents += offlineTodayMap[cam._id?.toString()] ?? 0;
                });
            });
            const uptimePct = totalCams > 0 ? ((totalOnline / totalCams) * 100).toFixed(1) : '0.0';

            const summaryData = [
                ['Total Kamera Terdaftar', `${totalCams} unit`],
                ['Kamera Aktif / Online', `${totalOnline} unit`],
                ['Kamera Tidak Aktif / Offline', `${totalOffline} unit`],
                [`Persentase Ketersediaan (Uptime)`, `${uptimePct}%`],
                ['Total Kejadian Offline Hari Ini', `${totalOfflineEvents} kali (seluruh kamera)`],
            ];

            autoTable(doc, {
                startY: y,
                body: summaryData,
                theme: 'plain',
                styles: { fontSize: 8.5, cellPadding: 2 },
                columnStyles: {
                    0: { cellWidth: 80, fontStyle: 'bold', textColor: [40, 40, 40] },
                    1: { cellWidth: 80, textColor: [0, 0, 0] },
                },
                didParseCell: (data: any) => {
                    if (data.column.index === 1) {
                        const v = data.cell.raw as string;
                        if (v.includes('%')) {
                            const pct = parseFloat(v);
                            data.cell.styles.textColor = pct >= 80 ? [22, 163, 74] : pct >= 60 ? [202, 138, 4] : [220, 38, 38];
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                },
                margin: { left: margin, right: margin },
            });
            y = (doc as any).lastAutoTable.finalY + 8;

            doc.setDrawColor(200); doc.setLineWidth(0.2);
            doc.line(margin, y, pageW - margin, y);
            y += 6;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0);
            doc.text('DETAIL STATUS KAMERA PER LOKASI', margin, y);
            y += 2;

            let locIdx = 0;
            for (const loc of locations) {
                if (!loc.cameras || loc.cameras.length === 0) continue;
                locIdx++;

                if (y > pageH - 50) {
                    doc.addPage();
                    drawHeader(doc.getNumberOfPages());
                    y = 46;
                }

                y += 5;
                const locOnline = (loc.cameras || []).filter((c: any) => c.status === 'online').length;
                const locTotal = (loc.cameras || []).length;
                doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20, 20, 80);
                doc.text(`${locIdx}. ${loc.name}`, margin, y);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(80);
                doc.text(
                    `Kategori: ${loc.category}   |   Person in Charge: ${loc.pmName || '-'}   |   Telp: ${loc.pmPhone || '-'}   |   ${locOnline}/${locTotal} kamera aktif`,
                    margin, y + 4.5
                );
                doc.setTextColor(0);
                y += 8;

                const tableData = loc.cameras.map((cam: any, idx: number) => {
                    const offlineCount = offlineTodayMap[cam._id?.toString()] ?? 0;
                    let offlineLabel = 'Tidak ada';
                    if (offlineCount === 1) offlineLabel = '1 kali';
                    else if (offlineCount > 1) offlineLabel = `${offlineCount} kali`;

                    let lastOnlineStr = 'Belum terekam';
                    if (cam.status === 'online') {
                        lastOnlineStr = 'Aktif Sekarang';
                    } else if (cam.lastOnlineAt) {
                        const lastOnlineDate = new Date(cam.lastOnlineAt);
                        const formattedDate = lastOnlineDate.toLocaleString('id-ID', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: '2-digit', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        });
                        const diffMs = Date.now() - lastOnlineDate.getTime();
                        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                        
                        if (diffDays >= 1) {
                            lastOnlineStr = `${formattedDate}\n(Mati ${diffDays} hari)`;
                        } else {
                            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                            if (diffHours >= 1) {
                                lastOnlineStr = `${formattedDate}\n(Mati ${diffHours} jam)`;
                            } else {
                                lastOnlineStr = `${formattedDate}\n(Baru saja mati)`;
                            }
                        }
                    } else if (cam.createdAt) {
                        const createdDate = new Date(cam.createdAt);
                        const diffMs = Date.now() - createdDate.getTime();
                        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                        if (diffDays >= 1) {
                            lastOnlineStr = `Belum aktif\n(${diffDays} hari sejak daftar)`;
                        } else {
                            lastOnlineStr = 'Belum pernah aktif';
                        }
                    }

                    let statusKeterangan = 'Baik';
                    if (cam.status === 'offline') {
                        statusKeterangan = 'Kritis';
                    } else if (offlineCount > 0) {
                        statusKeterangan = offlineCount <= 2 ? 'Perlu Perhatian' : 'Kritis';
                    }

                    return [
                        idx + 1,
                        cam.name,
                        cam.status === 'online' ? 'Aktif' : 'Tidak Aktif',
                        lastOnlineStr,
                        offlineLabel,
                        statusKeterangan,
                    ];
                });

                autoTable(doc, {
                    startY: y,
                    head: [['No.', 'Nama Kamera', 'Status', 'Terakhir Online', 'Gangguan Hari Ini', 'Keterangan']],
                    body: tableData,
                    theme: 'grid',
                    headStyles: { fillColor: [20, 20, 80], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold', cellPadding: 1.8 },
                    bodyStyles: { fontSize: 7.5, cellPadding: 2.2 },
                    alternateRowStyles: { fillColor: [248, 249, 252] },
                    columnStyles: {
                        0: { cellWidth: 12, halign: 'center' },
                        1: { cellWidth: 48 },
                        2: { cellWidth: 18, halign: 'center' },
                        3: { cellWidth: 38, halign: 'center' },
                        4: { cellWidth: 30, halign: 'center' },
                        5: { cellWidth: 26, halign: 'center' },
                    },
                    didParseCell: (data: any) => {
                        if (data.cell.section !== 'body') return;
                        if (data.column.index === 2) {
                            if (data.cell.raw === 'Aktif') { data.cell.styles.textColor = [22, 163, 74]; data.cell.styles.fontStyle = 'bold'; }
                            else { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'bold'; }
                        }
                        if (data.column.index === 4 && data.cell.raw !== 'Tidak ada') {
                            data.cell.styles.textColor = [180, 60, 0]; data.cell.styles.fontStyle = 'bold';
                        }
                        if (data.column.index === 5) {
                            if (data.cell.raw === 'Kritis') { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'bold'; }
                            else if (data.cell.raw === 'Perlu Perhatian') { data.cell.styles.textColor = [180, 100, 0]; data.cell.styles.fontStyle = 'bold'; }
                            else { data.cell.styles.textColor = [22, 163, 74]; }
                        }
                    },
                    margin: { left: margin, right: margin },
                });

                y = (doc as any).lastAutoTable.finalY + 4;
            }

            if (y > pageH - 55) { doc.addPage(); drawHeader(doc.getNumberOfPages()); y = 46; }
            y += 8;
            doc.setDrawColor(200); doc.setLineWidth(0.2);
            doc.line(margin, y, pageW - margin, y);
            y += 6;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(0);
            doc.text('PENUTUP & PENGESAHAN', margin, y);
            y += 5;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
            doc.text(
                'Laporan ini dibuat secara otomatis oleh sistem TENGOK Surveillance Monitoring berdasarkan data real-time',
                margin, y
            );
            doc.text(
                'dari seluruh kamera CCTV yang terdaftar. Mohon tindak lanjuti kamera dengan status "Kritis" sesegera mungkin.',
                margin, y + 4.5
            );
            y += 14;

            const sigY = y;
            const sigCols = [margin, margin + 60, margin + 125];
            const sigLabels = ['Disiapkan Oleh', 'Diperiksa Oleh', 'Disetujui Oleh'];
            const sigTitles = ['Teknisi Monitoring', 'Kepala Divisi IT', 'Direktur Operasional'];
            sigCols.forEach((sx, i) => {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(0);
                doc.text(sigLabels[i], sx, sigY);
                doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(100);
                doc.text(sigTitles[i], sx, sigY + 4.5);
                doc.setDrawColor(0); doc.setLineWidth(0.3);
                doc.line(sx, sigY + 22, sx + 50, sigY + 22);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(0);
                doc.text('(                                    )', sx, sigY + 26.5);
            });

            const totalPages = doc.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(6.5); doc.setTextColor(150); doc.setFont('helvetica', 'italic');
                doc.text(
                    `PT Brantas Abipraya (Persero)  |  TENGOK Surveillance Monitoring  |  Dicetak: ${now.toLocaleString('id-ID')}  |  Halaman ${i} dari ${totalPages}`,
                    pageW / 2, pageH - 7, { align: 'center' }
                );
                doc.setDrawColor(180); doc.setLineWidth(0.2);
                doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
            }

            const monthYear = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).replace(' ', '-');
            doc.save(`Laporan-Status-CCTV-${monthYear}.pdf`);
            toast.success('Laporan PDF berhasil diunduh');
        } catch (err) {
            console.error('PDF export error:', err);
            toast.error('Gagal mengunduh laporan');
        } finally {
            setIsExporting(false);
        }
    };

    const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema)
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        try {
            await axios.post('/api/cameras', data);
            toast.success('Kamera berhasil ditambahkan');
            reset();
            mutate('/api/cameras');
        } catch {
            toast.error('Gagal menambahkan kamera');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        const ok = await confirm(`Yakin ingin menghapus kamera "${name}"? Tindakan ini tidak dapat dibatalkan.`, {
            title: 'Hapus Kamera',
        });
        if (!ok) return;
        try {
            await axios.delete(`/api/cameras/${id}`);
            toast.success('Kamera dihapus');
            mutate('/api/cameras');
        } catch {
            toast.error('Gagal menghapus kamera');
        }
    };

    const cameras: ICameraData[] = data?.data || [];

    const filteredCameras = useMemo(() => {
        let result = [...cameras];

        // Filter by status
        if (filterStatus !== 'all') {
            result = result.filter(c => c.status === filterStatus);
        }

        // Filter by search query
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.streamUrl.toLowerCase().includes(q)
            );
        }

        // Sort
        result.sort((a, b) => {
            if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
            if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
            if (sortBy === 'url') return a.streamUrl.localeCompare(b.streamUrl);
            return 0;
        });

        return result;
    }, [cameras, searchQuery, filterStatus, sortBy]);

    const totalPages = Math.ceil(filteredCameras.length / ITEMS_PER_PAGE);

    const paginatedCameras = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredCameras.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredCameras, currentPage]);

    const handleSearch = (val: string) => {
        setSearchQuery(val);
        setCurrentPage(1);
    };

    const handleFilterStatus = (val: 'all' | 'online' | 'offline') => {
        setFilterStatus(val);
        setCurrentPage(1);
    };

    const handleSort = (val: 'name-asc' | 'name-desc' | 'url') => {
        setSortBy(val);
        setCurrentPage(1);
    };

    // Count per status for badges
    const onlineCount = cameras.filter(c => c.status === 'online').length;
    const offlineCount = cameras.filter(c => c.status === 'offline').length;

    return (
        <div className="min-h-full bg-slate-950 p-6 md:p-10 font-sans">
            {ConfirmDialog}
            {editingCamera && <EditModal camera={editingCamera} onClose={() => setEditingCamera(null)} />}

            <div className="max-w-6xl mx-auto">
                <PageHeader
                    icon={Camera}
                    title="Kamera Terpusat"
                    subtitle="Kelola alamat stream (RTSP/HLS) perangkat CCTV sebelum dipasangkan ke dalam lokasi."
                    actions={
                        <motion.button
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={handleExportPDF}
                            disabled={isExporting}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900/80 border border-white/10 hover:border-yellow-500/30 text-slate-300 hover:text-yellow-500 transition-all text-sm font-bold uppercase tracking-wider disabled:opacity-50 shrink-0"
                        >
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                            Export PDF
                        </motion.button>
                    }
                />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Add Camera Form (Sticky Sidebar — Desktop only) */}
                    <div className="hidden lg:block lg:col-span-1">
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 24 }}
                            className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-8 rounded-3xl sticky top-6 shadow-[0_30px_60px_rgba(0,0,0,0.4)] relative overflow-hidden group"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-[40px] pointer-events-none" />
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-500/5 rounded-full blur-[30px] pointer-events-none" />
                            
                            <h2 className="text-lg font-bold mb-8 flex items-center gap-3 text-white uppercase tracking-wide">
                                <div className="p-2 rounded-xl bg-yellow-500/10">
                                    <Plus className="w-5 h-5 text-yellow-500" />
                                </div>
                                Daftarkan Kamera
                            </h2>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 relative z-10">
                                <FormField label="Nama CCTV" error={errors.name?.message}>
                                    <input {...register('name')} className={inputCls()} placeholder="Contoh: Kamera Proyek Tol Cisumdawu" />
                                </FormField>
                                <FormField label="Stream URL" error={errors.streamUrl?.message}>
                                    <input {...register('streamUrl')} className={inputCls()} placeholder="rtsp://admin:pass@ip:port/stream" />
                                </FormField>
                                <motion.button
                                    whileHover={{ y: -2 }}
                                    whileTap={{ scale: 0.97 }}
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-slate-950 font-bold py-4 rounded-xl transition-all shadow-[0_4px_20px_rgba(234,179,8,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4 uppercase text-sm tracking-wider"
                                >
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Tambahkan Perangkat'}
                                </motion.button>
                            </form>
                        </motion.div>
                    </div>

                    {/* Camera List */}
                    <div className="lg:col-span-2 space-y-6">
                        <motion.div
                            initial={{ opacity: 0, x: 16 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 mb-2 ml-1"
                        >
                            <h2 className="text-xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <Monitor className="w-5 h-5 text-yellow-500" />
                                Kamera Aktif
                            </h2>
                            <CountBadge count={cameras.length} />
                        </motion.div>

                        {/* Search */}
                        <SearchBar
                            value={searchQuery}
                            onChange={handleSearch}
                            placeholder="Cari nama kamera atau URL..."
                        />

                        {/* Filter Status + Sort */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            {/* Filter Buttons */}
                            <div className="flex items-center bg-slate-900/60 border border-white/10 rounded-xl p-1 gap-1">
                                {([
                                    { val: 'all', label: 'Semua', count: cameras.length },
                                    { val: 'online', label: 'Online', count: onlineCount },
                                    { val: 'offline', label: 'Offline', count: offlineCount },
                                ] as const).map(({ val, label, count }) => (
                                    <button
                                        key={val}
                                        onClick={() => handleFilterStatus(val)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                                            filterStatus === val
                                                ? val === 'online' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                : val === 'offline' ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                : 'bg-yellow-500 text-slate-950'
                                                : 'text-slate-500 hover:text-white'
                                        }`}
                                    >
                                        {val === 'online' && <Wifi className="w-3 h-3" />}
                                        {val === 'offline' && <WifiOff className="w-3 h-3" />}
                                        {label}
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                            filterStatus === val
                                                ? val === 'online' ? 'bg-emerald-500/30'
                                                : val === 'offline' ? 'bg-red-500/30'
                                                : 'bg-black/20'
                                                : 'bg-white/5'
                                        }`}>{count}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Sort */}
                            <div className="flex items-center gap-1 ml-auto">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mr-1">Urut:</span>
                                {([
                                    { val: 'name-asc', icon: ArrowUpAZ, label: 'A-Z' },
                                    { val: 'name-desc', icon: ArrowDownAZ, label: 'Z-A' },
                                    { val: 'url', icon: Link, label: 'URL' },
                                ] as const).map(({ val, icon: Icon, label }) => (
                                    <button
                                        key={val}
                                        onClick={() => handleSort(val)}
                                        title={`Urutkan: ${label}`}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            sortBy === val
                                                ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                                                : 'text-slate-500 hover:text-white hover:bg-white/5 border border-transparent'
                                        }`}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {isLoading ? (
                            <LoadingState />
                        ) : filteredCameras.length === 0 ? (
                            <EmptyState
                                icon={ShieldCheck}
                                title={searchQuery ? 'Tidak ditemukan' : 'Belum ada kamera'}
                                subtitle={searchQuery ? 'Coba ubah kata pencarian Anda' : 'Daftarkan URL streaming pertama Anda di panel samping'}
                            />
                        ) : (
                            <motion.div 
                                variants={containerVariants} 
                                initial="hidden" 
                                animate="show" 
                                className="grid gap-4"
                            >
                                {paginatedCameras.map((cam) => (
                                    <motion.div 
                                        variants={itemVariants}
                                        key={cam._id as string} 
                                        className="bg-slate-900/60 backdrop-blur-md border border-white/5 p-4 md:p-5 rounded-2xl hover:border-yellow-500/30 hover:shadow-[0_20px_40px_rgba(234,179,8,0.05)] transition-all group overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 md:gap-5 min-w-0 flex-1">
                                                <div className="hidden md:flex w-16 h-12 flex-shrink-0 bg-black/50 rounded-xl border border-white/10 items-center justify-center text-slate-700 relative overflow-hidden group-hover:border-yellow-500/30 transition-colors">
                                                    <PlayCircle className="w-6 h-6 z-10" />
                                                    <div className="absolute inset-0 bg-yellow-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-bold text-white text-base md:text-lg tracking-tight truncate group-hover:text-yellow-400 transition-colors">{cam.name}</h3>
                                                    <div className="flex items-center gap-2 mt-1 overflow-hidden">
                                                        <span className="text-[9px] font-bold bg-white/5 text-slate-400 px-2 py-0.5 rounded border border-white/5 uppercase tracking-wider shrink-0">HLS/RTSP</span>
                                                        <p className="text-slate-500 text-[10px] md:text-[11px] font-mono truncate">{cam.streamUrl}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                                                <button
                                                    onClick={() => setEditingCamera(cam)}
                                                    className="p-2.5 md:p-3 text-slate-500 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-xl transition-all"
                                                    title="Edit Data"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(cam._id as string, cam.name)}
                                                    className="p-2.5 md:p-3 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                                    title="Hapus Data"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}

                        {/* Pagination Controls */}
                        {!isLoading && totalPages > 1 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-white/5 mt-6">
                                <span className="text-sm text-slate-400 font-medium tracking-wide">
                                    Menampilkan {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredCameras.length)} dari {filteredCameras.length}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-4 py-2 text-xs font-bold text-slate-300 bg-slate-900/60 border border-white/10 rounded-xl hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-wider"
                                    >
                                        Prev
                                    </button>
                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                                            if (totalPages > 5 && (page < currentPage - 1 || page > currentPage + 1) && page !== 1 && page !== totalPages) {
                                                if (page === currentPage - 2 || page === currentPage + 2) return <span key={page} className="text-slate-500 mx-1">...</span>;
                                                return null;
                                            }
                                            return (
                                                <button
                                                    key={page}
                                                    onClick={() => setCurrentPage(page)}
                                                    className={`w-9 h-9 flex items-center justify-center text-xs font-bold rounded-xl transition-all ${
                                                        currentPage === page
                                                            ? 'bg-yellow-500 text-slate-950 shadow-[0_4px_10px_rgba(234,179,8,0.3)]'
                                                            : 'bg-slate-900/40 text-slate-400 hover:bg-white/5 border border-white/5 hover:text-white'
                                                    }`}
                                                >
                                                    {page}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-4 py-2 text-xs font-bold text-slate-300 bg-slate-900/60 border border-white/10 rounded-xl hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-wider"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Mobile FAB (Add Camera) ─────────────────────────────────── */}
            <motion.button
                className="lg:hidden fixed bottom-24 right-5 z-40 w-14 h-14 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl shadow-[0_8px_30px_rgba(234,179,8,0.5)] flex items-center justify-center text-slate-950"
                whileTap={{ scale: 0.92 }}
                whileHover={{ y: -2 }}
                onClick={() => setShowAddSheet(true)}
                title="Tambah Kamera"
            >
                <Plus className="w-7 h-7 stroke-[2.5]" />
            </motion.button>

            {/* ── Mobile Slide-Up Sheet (Add Camera Form) ────────────────── */}
            <AnimatePresence>
                {showAddSheet && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="lg:hidden fixed inset-0 z-[70] flex items-end"
                    >
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAddSheet(false)} />
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                            className="relative w-full bg-slate-900/98 backdrop-blur-2xl border-t border-white/10 rounded-t-3xl p-6 pb-10 shadow-[0_-20px_60px_rgba(0,0,0,0.6)]"
                        >
                            {/* Handle bar */}
                            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />

                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-yellow-500/10">
                                        <Plus className="w-5 h-5 text-yellow-500" />
                                    </div>
                                    Daftarkan Kamera
                                </h3>
                                <button
                                    onClick={() => setShowAddSheet(false)}
                                    className="p-2 rounded-xl bg-white/5 text-slate-400 hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit(async (data) => {
                                await onSubmit(data);
                                setShowAddSheet(false);
                            })} className="space-y-5">
                                <FormField label="Nama CCTV" error={errors.name?.message}>
                                    <input {...register('name')} className={inputCls()} placeholder="Contoh: Kamera Proyek Tol Cisumdawu" />
                                </FormField>
                                <FormField label="Stream URL" error={errors.streamUrl?.message}>
                                    <input {...register('streamUrl')} className={inputCls()} placeholder="rtsp://admin:pass@ip:port/stream" />
                                </FormField>
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-slate-950 font-bold py-4 rounded-xl transition-all shadow-[0_4px_20px_rgba(234,179,8,0.4)] disabled:opacity-50 flex items-center justify-center gap-2 uppercase text-sm tracking-wider mt-2"
                                >
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Tambahkan Perangkat'}
                                </motion.button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
