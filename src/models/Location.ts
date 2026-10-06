import mongoose, { Schema, Document, Model } from 'mongoose';

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
    contractFileKey?: string;

    // ── Progress fisik ───────────────────────────────────────────────────────
    progressPercent?: number;    // Realisasi fisik (0..100)
    progressRencana?: number;    // Rencana fisik (0..100)
    progressDeviasi?: number;    // Deviasi = realisasi - rencana (bisa negatif)

    // ── Progress keuangan per DIPA ───────────────────────────────────────────
    progressKeuangan?: IProgressKeuangan[];
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
    contractFileKey: { type: String },

    // Progress fisik
    progressPercent: { type: Number, min: 0, max: 100, default: 0 },
    progressRencana: { type: Number, min: 0, max: 100, default: 0 },
    progressDeviasi: { type: Number, default: 0 },

    // Progress keuangan
    progressKeuangan: { type: [ProgressKeuanganSchema], default: [] },
    tagihanBelumDiproses: { type: Number },

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
