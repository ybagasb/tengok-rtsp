/**
 * seed-sr-kendari.mjs
 * Isi data proyek SR Kendari di MongoDB dari data PPT SR SULTRA.
 * Jalankan: node scripts/seed-sr-kendari.mjs
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = 'mongodb://admin:Qwerty123.@54.169.114.45:27017/rtsp_tengok?authSource=admin';

const DATA = {
    penggunaJasa: 'Kementerian PU — Direktorat Jenderal Prasarana Strategis',
    pengawas:     'PTK-CEC-SPR, KSO',
    penyediaJasa: 'ABIPRAYA-WINS, KSO (65%:35%)',
    description:  'Proyek Pembangunan Sekolah Rakyat Sulawesi Tenggara — Lokasi Kendari. Meliputi pembangunan gedung SD, SMP, SMA, Gedung Serbaguna, Asrama, dan Rusun Guru di Jl. Simbo - Abeli Dalam, Puuwatu, Kendari, Sulawesi Tenggara.',
    contractValue:  508070718200,
    contractNumber: 'ADD VI',
    startDate:      new Date('2025-11-28'),
    endDate:        new Date('2026-08-30'),
    status:         'ongoing',
    progressRencana:  100.00,
    progressPercent:  99.27,
    progressDeviasi:  -0.73,
    progressKeuangan: [
        { tahun: 2025, rencana: 121600840569, realisasi: 121600840569 },
        { tahun: 2026, rencana: 373247877631, realisasi: 249535698101 },
    ],
    tagihanBelumDiproses: 45147392541,
    lingkupPekerjaan: [
        'Pekerjaan Struktur',
        'Pekerjaan Arsitektur',
        'Pekerjaan MEP',
        'Pekerjaan Landscape & Kawasan',
        'Pekerjaan Lapangan',
        'Pekerjaan Furniture',
    ],
    sumberDaya: [
        { namaAlat: 'Roughter',      jumlah: 0 },
        { namaAlat: 'Hiab Crane',    jumlah: 0 },
        { namaAlat: 'Excavator',     jumlah: 0 },
        { namaAlat: 'Vibro',         jumlah: 0 },
        { namaAlat: 'Dump Truck',    jumlah: 0 },
        { namaAlat: 'Concrete Pump', jumlah: 0 },
        { namaAlat: 'Grader',        jumlah: 0 },
    ],
    isuStrategis: [
        {
            isu:    'Pertumbuhan rumput lapangan sepak bola terhambat akibat cuaca panas ekstrem dan musim kemarau sudah 5 bulan.',
            usulan: 'Penyiraman rutin dilakukan setiap hari.',
        },
        {
            isu:    'Proses pengajuan klaim atas dasar kondisi geopolitik global yang menyebabkan eskalasi harga.',
            usulan: 'Berkoordinasi dengan divisi dan DLMK untuk perhitungan eskalasi harga.',
        },
    ],
    kendala: [
        {
            masalah:  'Pengajuan klaim eskalasi harga',
            penyebab: 'Kondisi ekonomi global yang menyebabkan perubahan harga yang signifikan.',
            tindakan: 'Koordinasi dengan divisi untuk kelengkapan data pengajuan eskalasi/klaim harga pekerjaan.',
            harapan:  'Dukungan koordinasi dengan pihak terkait.',
            target:   'M2 Oktober 2026',
            pic:      'PM, SEM',
            status:   'OPEN',
        },
        {
            masalah:  'Perlakuan denda akibat keterlambatan penyelesaian pekerjaan',
            penyebab: 'Keterlambatan penyelesaian pekerjaan.',
            tindakan: 'Koordinasi dengan divisi dan PPK/Satker untuk meminimalisir pengenaan denda.',
            harapan:  'Dukungan koordinasi dengan PPK/Satker.',
            target:   'M2 Oktober 2026',
            pic:      'PM, SEM',
            status:   'OPEN',
        },
        {
            masalah:  'Pengiriman material di daerah kepulauan',
            penyebab: 'Lokasi proyek yang berada di kepulauan.',
            tindakan: 'Perketatan monitoring pengiriman material dengan penyewaan kapal.',
            harapan:  'Dukungan pengiriman material dengan kapal.',
            target:   'M1 Oktober 2026',
            pic:      'PM, SEM',
            status:   'OPEN',
        },
        {
            masalah:  'Penyelesaian Defect',
            penyebab: 'Ketidaksesuaian dengan standar penerimaan pekerjaan.',
            tindakan: 'Melakukan percepatan pekerjaan defect.',
            harapan:  '-',
            target:   'M1 Oktober 2026',
            pic:      'PM, SOM, SQM',
            status:   'OPEN',
        },
    ],
};

async function main() {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('Connected to MongoDB');

    const col = client.db().collection('locations');

    // Cari lokasi yang namanya mengandung "kendari" (case-insensitive)
    const candidates = await col.find({ name: { $regex: /kendari/i } }).toArray();

    if (candidates.length === 0) {
        console.log('\nTidak ada lokasi dengan nama mengandung "Kendari".');
        console.log('Lokasi yang tersedia:');
        const all = await col.find({}, { projection: { name: 1, _id: 1 } }).toArray();
        all.forEach(l => console.log(`  - [${l._id}] ${l.name}`));
        await client.close();
        return;
    }

    for (const loc of candidates) {
        const result = await col.updateOne({ _id: loc._id }, { $set: DATA });
        console.log(`Updated "${loc.name}" [${loc._id}] — modified: ${result.modifiedCount}`);
    }

    await client.close();
    console.log('\nSelesai! Refresh halaman di browser untuk melihat perubahan.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
