import mongoose, { Schema, Document, Model } from 'mongoose';
import type { LaporanBulanan, RencanaKurvaS } from '@/lib/projectReport';

// ── Sub-document shapes ──────────────────────────────────────────────────────
export interface IMilestone {
    title: string;
    done: boolean;
    date?: Date | string;
    progress?: number;       // Progress milestone ini sendiri (0..100)
}

export interface IHasilUsaha {
    pendapatan: number;      // Pendapatan Usaha / PU (IDR)
    biaya: number;           // HPP / biaya (IDR)
    laba: number;            // Laba (IDR) = pendapatan - biaya
}

export interface IGalleryItem {
    key: string;
    caption?: string;
    uploadedAt: Date | string;
}

export interface IDocumentItem {
    name: string;
    key: string;
    size?: number;
    contentType?: string;
    uploadedAt: Date | string;
}

export interface IProgressKeuangan {
    tahun: number;           // Tahun anggaran (DIPA), e.g. 2025
    rencana: number;         // Rencana keuangan (IDR)
    realisasi: number;       // Realisasi keuangan (IDR)
}

// Progress mingguan (W1–W4): Rencana (RA) dan Realisasi (RI) dalam persen.
export interface IProgressMinggu {
    bulan: string;           // Label bulan, e.g. "Oktober 2026"
    tahun: number;           // Tahun, e.g. 2026
    w1Ra: number;            // Minggu 1 Rencana (%)
    w1Ri: number;            // Minggu 1 Realisasi (%)
    w2Ra: number;            // Minggu 2 Rencana (%)
    w2Ri: number;            // Minggu 2 Realisasi (%)
    w3Ra: number;            // Minggu 3 Rencana (%)
    w3Ri: number;            // Minggu 3 Realisasi (%)
    w4Ra: number;            // Minggu 4 Rencana (%)
    w4Ri: number;            // Minggu 4 Realisasi (%)
}

export interface ISumberDaya {
    namaAlat: string;        // Nama sumber daya, e.g. "Excavator", "Tukang", "Besi Beton"
    jumlah: number;          // Kuantitas
    kategori?: string;       // Pengelompokan bebas, e.g. "Alat Berat", "Tenaga Kerja", "Material"
    satuan?: string;         // Satuan bebas, e.g. "Unit", "Orang", "m³", "Ton"
}

export interface IIsuStrategis {
    isu: string;             // Deskripsi isu
    usulan: string;          // Usulan dari Abipraya
}

export interface IKendala {
    masalah: string;
    penyebab: string;
    tindakan: string;
    harapan?: string;        // Harapan dukungan manajemen
    target?: string;         // Target waktu penyelesaian, e.g. "M2 Okt 2026"
    pic?: string;            // Person in charge
    status: 'OPEN' | 'CLOSED' | 'ON_PROGRESS';
}

// Jenis entri Legal & Change Management.
export type ChangeJenis =
    | 'PERUBAHAN_HARGA'
    | 'PERUBAHAN_LINGKUP'
    | 'KLAIM'
    | 'LEGAL_ISSUE'
    | 'LAINNYA';

export interface IChangeManagement {
    judul: string;           // Ringkasan perubahan
    jenis?: ChangeJenis;     // Kategori: Perubahan Harga/Lingkup/Klaim/Legal Issue/Lain-lain
    deskripsi?: string;      // Detail perubahan / latar belakang
    dampak?: string;         // Dampak perubahan terhadap proyek (biaya/waktu/mutu)
    mitigasi?: string;       // Langkah mitigasi atas dampak
    nilai?: number;          // Nilai perubahan kontrak (IDR), bisa negatif
    tanggal?: Date | string; // Tanggal usulan / penetapan
    target?: string;         // Target implementasi/penyelesaian, e.g. "M2 Okt 2026"
    pic?: string;            // Penanggung jawab
    status: 'USULAN' | 'DISETUJUI' | 'DITOLAK';
    dariKendala?: boolean;   // Penanda item ini berasal dari daftar kendala
}

// Monitoring pengadaan major item (tab Operasi).
export interface IMonitoringPengadaan {
    nama: string;            // Nama item pengadaan major
    persentase: number;      // Progress pengadaan (0..100)
}

// Titik sudut footprint bangunan proyek (poligon, tanpa titik penutup).
export interface IFootprintPoint {
    lng: number;
    lat: number;
}

export type ProjectStatus = 'planning' | 'ongoing' | 'completed';
export type Divisi = 'DIVISI 1' | 'DIVISI 2' | 'DIVISI 3';
export type ProjectType = 'JO' | 'NON_JO';

export interface ILocationData {
    _id?: string;
    name: string;
    category: string;
    description?: string;
    image?: string;
    lat: number;
    lng: number;
    pmName?: string;
    pmPhone?: string;
    cameras: string[] | mongoose.Types.ObjectId[];

    // ── Footprint bangunan proyek (ditampilkan sebagai blok 3D di peta) ───────
    footprint?: IFootprintPoint[];   // poligon 3..200 titik, urutan sisi
    footprintHeight?: number;        // tinggi blok 3D (meter)

    // ── Kepemilikan (RBAC) ─────────────────────────────────────────────────────
    picSubs?: string[];          // cognito_sub PIC proyek — KONTROL AKSES, bukan teks deskriptif. Bukan EDITABLE_FIELDS.

    // ── Hierarki organisasi ──────────────────────────────────────────────────
    division?: Divisi;           // Divisi pemegang proyek (DIVISI 1/2/3)
    projectType?: ProjectType;   // Tipe proyek: JO (Joint Operation) / NON_JO

    // ── Project identity ─────────────────────────────────────────────────────
    penggunaJasa?: string;       // Instansi pengguna jasa (e.g. "Kementerian PU")
    pengawas?: string;           // Pengawas lapangan (e.g. "PTK-CEC-SPR, KSO")
    penyediaJasa?: string;       // Nama kontraktor KSO (e.g. "ABIPRAYA-WINS, KSO (65%:35%)")

    // ── Ikhtiar (bobot proyek) ───────────────────────────────────────────────
    cpi?: number;                // Cost Performance Index (mis. 1.02)
    spi?: number;                // Schedule Performance Index (mis. 0.98)

    // ── Finansial (ringkas, angka tunggal) ───────────────────────────────────
    tagihanBruto?: number;       // Tagihan bruto (IDR)
    cashIn?: number;             // Total penerimaan (IDR)
    cashOut?: number;            // Total pengeluaran (IDR)
    saldoKas?: number;           // Cash balance (IDR); default = cashIn - cashOut
    saldoHutang?: number;        // Saldo hutang (IDR)
    bad?: number;                // BAD — komponen hutang (IDR), di samping saldo hutang
    piutang?: number;            // Saldo piutang (IDR)
    ccc?: number;                // Cash Conversion Cycle (hari); >90 = merah
    bebanKonstruksi?: number;    // Beban konstruksi (IDR)
    hasilUsaha?: IHasilUsaha;    // Hasil usaha (PU/HPP/Laba) s.d periode

    // ── Operasi (ringkas, angka tunggal, IDR) ────────────────────────────────
    pu?: number;                 // Pendapatan Usaha (IDR)
    bk?: number;                 // Beban Konstruksi operasi (IDR)
    lk?: number;                 // Laba Kotor (IDR) = PU - BK

    // ── Project details ──────────────────────────────────────────────────────
    status?: ProjectStatus;
    contractor?: string;
    startDate?: Date | string;
    endDate?: Date | string;
    contractNumber?: string;
    contractValue?: number;

    // ── Progress fisik ───────────────────────────────────────────────────────
    progressPercent?: number;    // Realisasi fisik (0..100)
    progressRencana?: number;    // Rencana fisik (0..100)
    progressDeviasi?: number;    // Deviasi = realisasi - rencana (bisa negatif)
    progressPeriode?: string;    // Progres fisik s.d. bulan ini, format 'YYYY-MM'

    // ── Progress keuangan per DIPA ───────────────────────────────────────────
    progressKeuangan?: IProgressKeuangan[];

    // ── Progress mingguan W1–W4 (RA/RI) ─────────────────────────────────────
    progressMinggu?: IProgressMinggu[];
    tagihanBelumDiproses?: number; // Nilai progress yang belum ditagihkan (IDR)

    // ── Lingkup pekerjaan ────────────────────────────────────────────────────
    lingkupPekerjaan?: string[];  // e.g. ["Pekerjaan Struktur", "Pekerjaan MEP", ...]

    // ── Sumber daya alat berat ───────────────────────────────────────────────
    sumberDaya?: ISumberDaya[];

    // ── Isu strategis ────────────────────────────────────────────────────────
    isuStrategis?: IIsuStrategis[];

    // ── Kendala ──────────────────────────────────────────────────────────────
    kendala?: IKendala[];

    // ── Monitoring pengadaan (major item) ────────────────────────────────────
    monitoringPengadaan?: IMonitoringPengadaan[];

    // ── Legal & change management ────────────────────────────────────────────
    changeManagement?: IChangeManagement[];

    // ── Laporan bulanan (dashboard Project Control) ──────────────────────────
    // Dikelola HANYA lewat /api/projects/[id]/laporan (bukan EDITABLE_FIELDS).
    laporanBulanan?: LaporanBulanan[];
    rencanaKurvaS?: RencanaKurvaS[];
    cashInAwal?: number;         // Total cash in SEBELUM laporan bulanan pertama (IDR)
    cashOutAwal?: number;        // Total cash out SEBELUM laporan bulanan pertama (IDR)

    // Waktu & pelaku pembaruan terakhir per dimensi data (lihat lib/projectSections).
    sectionUpdates?: Record<string, { at: Date | string; by?: string }>;

    milestones?: IMilestone[];
    gallery?: IGalleryItem[];
    documents?: IDocumentItem[];

    // Timestamp dikelola otomatis oleh Mongoose ({ timestamps: true }).
    createdAt?: Date | string;
    updatedAt?: Date | string;   // Waktu terakhir dokumen diperbarui
}

export interface ILocation extends Document, Omit<ILocationData, '_id' | 'cameras'> {
    cameras: mongoose.Types.ObjectId[];
}

// ── Sub-schemas ──────────────────────────────────────────────────────────────
const FootprintPointSchema = new Schema<IFootprintPoint>({
    lng: { type: Number, required: true, min: -180, max: 180 },
    lat: { type: Number, required: true, min: -90, max: 90 },
}, { _id: false });

const MilestoneSchema = new Schema<IMilestone>({
    title: { type: String, required: true },
    done: { type: Boolean, default: false },
    date: { type: Date },
    progress: { type: Number, min: 0, max: 100, default: 0 },
}, { _id: false });

const HasilUsahaSchema = new Schema<IHasilUsaha>({
    pendapatan: { type: Number, required: true, default: 0 },
    biaya: { type: Number, required: true, default: 0 },
    laba: { type: Number, required: true, default: 0 },
}, { _id: false });

const GalleryItemSchema = new Schema<IGalleryItem>({
    key: { type: String, required: true },
    caption: { type: String },
    uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

const DocumentItemSchema = new Schema<IDocumentItem>({
    name: { type: String, required: true },
    key: { type: String, required: true },
    size: { type: Number },
    contentType: { type: String },
    uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

const ProgressKeuanganSchema = new Schema<IProgressKeuangan>({
    tahun: { type: Number, required: true },
    rencana: { type: Number, required: true },
    realisasi: { type: Number, required: true },
}, { _id: false });

const ProgressMingguSchema = new Schema<IProgressMinggu>({
    bulan:  { type: String, required: true },
    tahun:  { type: Number, required: true },
    w1Ra:   { type: Number, default: 0 },
    w1Ri:   { type: Number, default: 0 },
    w2Ra:   { type: Number, default: 0 },
    w2Ri:   { type: Number, default: 0 },
    w3Ra:   { type: Number, default: 0 },
    w3Ri:   { type: Number, default: 0 },
    w4Ra:   { type: Number, default: 0 },
    w4Ri:   { type: Number, default: 0 },
}, { _id: false });

const SumberDayaSchema = new Schema<ISumberDaya>({
    namaAlat: { type: String, required: true },
    jumlah: { type: Number, required: true, min: 0, default: 0 },
    kategori: { type: String },
    satuan: { type: String },
}, { _id: false });

const IsuStrategisSchema = new Schema<IIsuStrategis>({
    isu: { type: String, required: true },
    usulan: { type: String, required: true },
}, { _id: false });

const KendalaSchema = new Schema<IKendala>({
    masalah: { type: String, required: true },
    penyebab: { type: String, required: true },
    tindakan: { type: String, required: true },
    harapan: { type: String },
    target: { type: String },
    pic: { type: String },
    status: { type: String, enum: ['OPEN', 'CLOSED', 'ON_PROGRESS'], default: 'OPEN' },
}, { _id: false });

const ChangeManagementSchema = new Schema<IChangeManagement>({
    judul: { type: String, required: true },
    jenis: {
        type: String,
        enum: ['PERUBAHAN_HARGA', 'PERUBAHAN_LINGKUP', 'KLAIM', 'LEGAL_ISSUE', 'LAINNYA'],
        default: 'LAINNYA',
    },
    deskripsi: { type: String },
    dampak: { type: String },
    mitigasi: { type: String },
    nilai: { type: Number },
    tanggal: { type: Date },
    target: { type: String },
    pic: { type: String },
    status: { type: String, enum: ['USULAN', 'DISETUJUI', 'DITOLAK'], default: 'USULAN' },
    dariKendala: { type: Boolean, default: false },
}, { _id: false });

const MonitoringPengadaanSchema = new Schema<IMonitoringPengadaan>({
    nama: { type: String, required: true },
    persentase: { type: Number, min: 0, max: 100, default: 0 },
}, { _id: false });

// Laporan bulanan: semua field opsional (PIC boleh mengisi sebagian).
const HasilUsahaPeriodeSchema = new Schema({
    pendapatan: { type: Number },
    hpp: { type: Number },
    ebitda: { type: Number },
    labaBersih: { type: Number },
}, { _id: false });

const LaporanBulananSchema = new Schema({
    periode: { type: String, required: true, match: /^20\d{2}-(0[1-9]|1[0-2])$/ },
    evm: {
        type: new Schema({
            bac: { type: Number },
            bcws: { type: Number },
            bcwp: { type: Number },
            acwp: { type: Number },
        }, { _id: false }),
    },
    huBulanIni: { type: HasilUsahaPeriodeSchema },
    huSdBulanIni: { type: HasilUsahaPeriodeSchema },
    cashIn: { type: Number },
    cashOut: { type: Number },
    tagihanBruto: { type: Number },
    targetTagihan: { type: Number },
    posisi: {
        type: new Schema({
            saldoHutang: { type: Number },
            bad: { type: Number },
            piutang: { type: Number },
            ccc: { type: Number },
        }, { _id: false }),
    },
    pengadaan: {
        type: new Schema({
            paketTotal: { type: Number },
            paketRealisasi: { type: Number },
            paguTotal: { type: Number },
            paguRealisasi: { type: Number },
        }, { _id: false }),
    },
    updatedAt: { type: Date },
}, { _id: false });

const RencanaKurvaSSchema = new Schema({
    tahun: { type: Number, required: true },
    puRkap: { type: Number },
    raRkap: { type: [Number], default: [] },
    raEksternal: { type: [Number], default: [] },
    huRencana: {
        type: new Schema({
            hpp: { type: [Number], default: [] },
            ebitda: { type: [Number], default: [] },
            labaBersih: { type: [Number], default: [] },
        }, { _id: false }),
    },
}, { _id: false });

// ── Main schema ──────────────────────────────────────────────────────────────
const LocationSchema: Schema = new Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String },
    image: { type: String },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    pmName: { type: String },
    pmPhone: { type: String },
    cameras: [{ type: Schema.Types.ObjectId, ref: 'Camera' }],

    // Footprint bangunan proyek (blok 3D di peta). Dokumen lama dibaca sebagai [].
    footprint: { type: [FootprintPointSchema], default: [] },
    footprintHeight: { type: Number, min: 1, max: 300 },

    // Kepemilikan (RBAC): daftar cognito_sub PIC. Dokumen lama tanpa field ini
    // dibaca sebagai [] (tanpa migrasi). Tidak ada di EDITABLE_FIELDS.
    picSubs: { type: [String], default: [], index: true },

    // Hierarki organisasi
    division: { type: String, enum: ['DIVISI 1', 'DIVISI 2', 'DIVISI 3'] },
    projectType: { type: String, enum: ['JO', 'NON_JO'] },

    // Project identity
    penggunaJasa: { type: String },
    pengawas: { type: String },
    penyediaJasa: { type: String },

    // Ikhtiar
    cpi: { type: Number },
    spi: { type: Number },

    // Finansial (ringkas)
    tagihanBruto: { type: Number },
    cashIn: { type: Number },
    cashOut: { type: Number },
    saldoKas: { type: Number },
    saldoHutang: { type: Number },
    bad: { type: Number },
    piutang: { type: Number },
    ccc: { type: Number },
    bebanKonstruksi: { type: Number },
    hasilUsaha: { type: HasilUsahaSchema },

    // Operasi (ringkas)
    pu: { type: Number },
    bk: { type: Number },
    lk: { type: Number },

    // Project status & contract
    status: { type: String, enum: ['planning', 'ongoing', 'completed'], default: 'ongoing' },
    contractor: { type: String },
    startDate: { type: Date },
    endDate: { type: Date },
    contractNumber: { type: String },
    contractValue: { type: Number },

    // Progress fisik
    progressPercent: { type: Number, min: 0, max: 100, default: 0 },
    progressRencana: { type: Number, min: 0, max: 100, default: 0 },
    progressDeviasi: { type: Number, default: 0 },
    progressPeriode: { type: String, match: /^20\d{2}-(0[1-9]|1[0-2])$/ },

    // Progress keuangan
    progressKeuangan: { type: [ProgressKeuanganSchema], default: [] },
    tagihanBelumDiproses: { type: Number },

    // Progress mingguan W1–W4
    progressMinggu: { type: [ProgressMingguSchema], default: [] },

    // Lingkup pekerjaan
    lingkupPekerjaan: { type: [String], default: [] },

    // Sumber daya
    sumberDaya: { type: [SumberDayaSchema], default: [] },

    // Isu strategis
    isuStrategis: { type: [IsuStrategisSchema], default: [] },

    // Kendala
    kendala: { type: [KendalaSchema], default: [] },

    // Monitoring pengadaan (major item)
    monitoringPengadaan: { type: [MonitoringPengadaanSchema], default: [] },

    // Legal & change management
    changeManagement: { type: [ChangeManagementSchema], default: [] },

    // Laporan bulanan & rencana Kurva S (lihat src/lib/projectReport.ts)
    laporanBulanan: { type: [LaporanBulananSchema], default: [] },
    rencanaKurvaS: { type: [RencanaKurvaSSchema], default: [] },
    cashInAwal: { type: Number, min: 0 },
    cashOutAwal: { type: Number, min: 0 },

    sectionUpdates: { type: Schema.Types.Mixed },

    milestones: { type: [MilestoneSchema], default: [] },
    gallery: { type: [GalleryItemSchema], default: [] },
    documents: { type: [DocumentItemSchema], default: [] },
}, {
    // Mongoose mengelola createdAt & updatedAt otomatis. Nama field createdAt
    // cocok dengan field manual sebelumnya, jadi dokumen lama tetap mempertahankan
    // nilainya; updatedAt dibump otomatis pada save/findByIdAndUpdate/updateOne.
    timestamps: true,
});

const Location: Model<ILocation> = mongoose.models.Location || mongoose.model<ILocation>('Location', LocationSchema);

export default Location;
