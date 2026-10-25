/**
 * seed_divisi2.ts — Seed proyek DIVISI 2 dari "internal-docs/data/Segmentasi Proyek.pdf".
 *
 * - Membuat kategori dari kolom SEGMENTASI (Irigasi, JIAT, Embung, Bendungan,
 *   Sungai Pantai, PLTM, Bencana, Lainnya) bila belum ada.
 * - Menambah 64 proyek sebagai Location baru di DIVISI 2.
 * - projectType dikosongkan (diisi admin). Koordinat = perkiraan titik
 *   kota/kabupaten/provinsi dari nama proyek/kontrak.
 * - Field detail lain dikosongkan.
 *
 * Pakai:
 *   npx tsx --env-file=.env.local scripts/seed_divisi2.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/seed_divisi2.ts
 */

import dbConnect from '../src/lib/db';
import Location from '../src/models/Location';
import Category from '../src/models/Category';

const RIBU = 1; // nilai sudah dalam rupiah penuh di tabel di bawah

// ── Kategori (segmentasi) ────────────────────────────────────────────────────
interface Cat { name: string; identifier: string; icon: string; color: string; }
const CATEGORIES: Cat[] = [
    { name: 'Irigasi',       identifier: 'irigasi',       icon: 'Waves',       color: 'from-cyan-500 to-blue-500' },
    { name: 'JIAT',          identifier: 'jiat',          icon: 'Droplets',    color: 'from-sky-500 to-cyan-400' },
    { name: 'Embung',        identifier: 'embung',        icon: 'Droplet',     color: 'from-teal-500 to-emerald-400' },
    { name: 'Bendungan',     identifier: 'bendungan',     icon: 'Dam',         color: 'from-blue-600 to-indigo-500' },
    { name: 'Sungai Pantai', identifier: 'sungai-pantai', icon: 'Sailboat',    color: 'from-sky-600 to-blue-400' },
    { name: 'PLTM',          identifier: 'pltm',          icon: 'Zap',         color: 'from-amber-500 to-yellow-400' },
    { name: 'Bencana',       identifier: 'bencana',       icon: 'AlertTriangle', color: 'from-rose-500 to-orange-500' },
    { name: 'Lainnya',       identifier: 'lainnya',       icon: 'LayoutGrid',  color: 'from-slate-500 to-slate-400' },
];

// ── Titik koordinat kota/kabupaten/provinsi (perkiraan pusat) ────────────────
const LOC: Record<string, [number, number]> = {
    // [lat, lng]
    'bangka-belitung': [-2.1316, 106.1169],      // Pangkalpinang
    'bengkulu': [-3.8004, 102.2655],
    'sumbar': [-0.9471, 100.4172],               // Padang
    'padang': [-0.9471, 100.4172],
    'tanah-datar': [-0.4546, 100.5790],          // Batusangkar
    'sulawesi-ii': [0.5435, 123.0568],           // Gorontalo (BWS Sulawesi II)
    'pohuwato': [0.7073, 121.9170],
    'gorontalo': [0.5435, 123.0568],
    'mesuji': [-4.0000, 105.5000],               // Mesuji, Lampung
    'lombok-barat': [-8.6500, 116.1000],         // Gerung
    'bima': [-8.4604, 118.7267],
    'sulawesi-v': [-5.1477, 119.4327],           // Makassar (BWS Sulawesi V)
    'polewali-mandar': [-3.4319, 119.3463],
    'mamuju-tengah': [-1.9270, 119.3650],
    'jeneberang': [-5.1477, 119.4327],           // BBWS Pompengan Jeneberang - Makassar
    'bone': [-4.7010, 120.1710],                 // Watampone
    'kendari': [-3.9728, 122.5150],
    'kolaka-timur': [-4.0300, 121.7500],
    'bombana': [-4.5500, 121.9000],
    'papua-barat': [-0.8615, 134.0620],          // Manokwari
    'papua-barat-daya': [-0.8762, 131.2558],     // Sorong
    'medan': [3.5952, 98.6722],                  // BBWS Sumatera II - Medan
    'citarum': [-6.9000, 107.6000],              // BBWS Citarum - Bandung
    'brantas': [-7.9797, 112.6304],              // BBWS Brantas - Malang
    'bangkalan': [-7.0455, 112.7370],
    'banyuwangi': [-8.2192, 114.3691],
    'maluku-utara': [0.7900, 127.3800],          // Ternate (BWS Maluku Utara)
    'bone-bolango': [0.5500, 123.1000],          // Bendungan Bulango Ulu
    'nageko': [-8.6000, 121.1500],               // Bendungan Mbay - Nagekeo
    'purworejo': [-7.7130, 109.9810],            // Bendungan Bener
    'mamuju': [-2.6748, 118.8885],               // Budong-budong
    'jakarta': [-6.1200, 106.8000],              // NCICD / Pesisir Teluk Jakarta
    'merauke': [-8.4933, 140.4010],
    'sumut': [3.5952, 98.6722],                  // Medan (bencana Sumut)
    'aceh': [5.5483, 95.3238],                   // Banda Aceh (Pidie Jaya & Bireuen)
    'poigar': [0.8000, 124.0000],                // PLTA Poigar - Bolaang Mongondow
    'riam-kiwa': [-3.4500, 115.0500],            // Kalimantan Selatan
    'trenggalek': [-8.0500, 111.7080],           // Bendungan Bagong
    'cabean': [-6.9000, 110.4000],               // perkiraan Jateng
    'jragung': [-7.1000, 110.5500],              // Semarang/Demak
    'bekasi': [-6.2383, 107.0000],
    'cijurey': [-6.6000, 107.0000],              // perkiraan Jabar
    'semeru': [-8.1077, 112.9220],               // Lumajang
    'batanghari': [-1.0000, 101.4000],           // PLTM Batanghari - Sumbar
    'wulan': [-6.7500, 110.8000],                // Sungai Wulan - Demak
};

interface Proj {
    name: string;
    kontrak: string;
    kategori: string;   // identifier kategori
    nilai: number;      // IDR
    loc: string;        // key LOC
}

// ── 64 proyek (A: PL INPRES I 2026 = 35, B: NON INPRES = 29) ──────────────────
const PROJECTS: Proj[] = [
    // ===== A. PL INPRES I 2026 =====
    { name: 'DIR Babel', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BWS Bangka Belitung', kategori: 'irigasi', nilai: 47847964000, loc: 'bangka-belitung' },
    { name: 'DIR Bengkulu Paket 2', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BWS Sumatera VII Bengkulu (Paket II)', kategori: 'irigasi', nilai: 54938163000, loc: 'bengkulu' },
    { name: 'DIR Sumbar Paket 5', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di SNVT PJPA WS Indragiri-Akuaman, Kampar, Rokan BWS Sumatera V (Paket V)', kategori: 'irigasi', nilai: 59045298000, loc: 'sumbar' },
    { name: 'DIR Sulawesi II Paket 1', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BWS Sulawesi II (Paket I)', kategori: 'irigasi', nilai: 23242488000, loc: 'sulawesi-ii' },
    { name: 'DIR Sulawesi II Paket 2', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BWS Sulawesi II (Paket II)', kategori: 'irigasi', nilai: 30375822000, loc: 'sulawesi-ii' },
    { name: 'JIAT Pohuwato', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah (JIAT) Di Kab. Pohuwato', kategori: 'jiat', nilai: 10332738000, loc: 'pohuwato' },
    { name: 'JIAT Pohuwato Paket 1', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah (JIAT) 5 Titik (Paket I) Di Kab. Pohuwato', kategori: 'jiat', nilai: 4763088500, loc: 'pohuwato' },
    { name: 'JIAT Pohuwato Paket 2', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah (JIAT) 5 Titik (Paket II) Di Kab. Pohuwato', kategori: 'jiat', nilai: 4763088500, loc: 'pohuwato' },
    { name: 'JIAT Gorontalo Paket 1', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah 5 Titik di Kab. Gorontalo (Paket I)', kategori: 'jiat', nilai: 4298066500, loc: 'gorontalo' },
    { name: 'JIAT Gorontalo Paket 2', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah 5 Titik di Kab. Gorontalo (Paket II)', kategori: 'jiat', nilai: 4298066500, loc: 'gorontalo' },
    { name: 'DIR Mesuji Paket 1', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BBWS Mesuji Sekampung (Paket I)', kategori: 'irigasi', nilai: 140502426000, loc: 'mesuji' },
    { name: 'DIR Mesuji Paket 3', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BBWS Mesuji Sekampung (Paket III)', kategori: 'irigasi', nilai: 44992465000, loc: 'mesuji' },
    { name: 'Embung Lombok', kontrak: 'Pembangunan Embung Giri Tambesi dalam Rangka Mendukung Swasembada Pangan di Kecamatan Gerung Kabupaten Lombok Barat', kategori: 'embung', nilai: 10700000000, loc: 'lombok-barat' },
    { name: 'Embung Bima', kontrak: 'Pembangunan Embung Mada Oi Lambu dalam Rangka Mendukung Swasembada Pangan di Kabupaten Bima', kategori: 'embung', nilai: 5817000000, loc: 'bima' },
    { name: 'DIR Sulawesi V Paket 2', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BWS Sulawesi V (Paket II)', kategori: 'irigasi', nilai: 20613997000, loc: 'sulawesi-v' },
    { name: 'JIAT Polewali Paket 1', kontrak: 'Pembangunan JIAT Kab Mamuju Tengah dan Kab. Polewali Mandar I', kategori: 'jiat', nilai: 36375909000, loc: 'polewali-mandar' },
    { name: 'JIAT Polewali Paket 2', kontrak: 'Pembangunan JIAT Kab Polewali Mandar II', kategori: 'jiat', nilai: 29226281000, loc: 'polewali-mandar' },
    { name: 'DIR Jeneberang Paket 3', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BBWS Pompengan Jeneberang (Paket III)', kategori: 'irigasi', nilai: 91311836000, loc: 'jeneberang' },
    { name: 'JIAT Embung Bone', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah dan Embung Kab. Bone', kategori: 'jiat', nilai: 89910474000, loc: 'bone' },
    { name: 'DIR Kendari Paket 1', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Utama Kewenangan Daerah di BWS Sulawesi IV Kendari Paket I', kategori: 'irigasi', nilai: 56525498000, loc: 'kendari' },
    { name: 'DIR Kendari Paket 2', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Utama Kewenangan Daerah di BWS Sulawesi IV Kendari Paket II', kategori: 'irigasi', nilai: 81662963000, loc: 'kendari' },
    { name: 'DIR Kendari Paket 3', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Utama Kewenangan Daerah di BWS Sulawesi IV Kendari Paket III', kategori: 'irigasi', nilai: 72133982000, loc: 'kendari' },
    { name: 'DIR Kendari Paket 6', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Utama Kewenangan Daerah di BWS Sulawesi IV Kendari Paket VI', kategori: 'irigasi', nilai: 74151563000, loc: 'kendari' },
    { name: 'JIAT Kolaka Timur', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah di Kab. Kolaka Timur', kategori: 'jiat', nilai: 81330650000, loc: 'kolaka-timur' },
    { name: 'JIAT Bombana', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah di Kab. Bombana', kategori: 'jiat', nilai: 72441527000, loc: 'bombana' },
    { name: 'DIR Papua Barat Paket 2', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Utama Kewenangan Daerah di BWS Papua Barat (Paket II)', kategori: 'irigasi', nilai: 53024050000, loc: 'papua-barat' },
    { name: 'DIR Papua Barat Daya Paket 1', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Utama Kewenangan Daerah di BWS Papua Barat (Paket 1)', kategori: 'irigasi', nilai: 31779500000, loc: 'papua-barat-daya' },
    { name: 'DIR Medan Paket 1', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BBWS Sumatera II Medan (Paket I)', kategori: 'irigasi', nilai: 160545252000, loc: 'medan' },
    { name: 'DIR Medan Paket 2', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BBWS Sumatera II Medan (Paket II)', kategori: 'irigasi', nilai: 133584519000, loc: 'medan' },
    { name: 'DIR Medan Paket 3', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BBWS Sumatera II Medan (Paket III)', kategori: 'irigasi', nilai: 105601902000, loc: 'medan' },
    { name: 'DIR Citarum Paket 3', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BBWS Citarum (Paket 3)', kategori: 'irigasi', nilai: 42929609000, loc: 'citarum' },
    { name: 'DIR Brantas Paket 2', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BBWS Brantas Paket II', kategori: 'irigasi', nilai: 48632504000, loc: 'brantas' },
    { name: 'JIAT Bangkalan', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah (JIAT) di Kabupaten Bangkalan', kategori: 'jiat', nilai: 29108879000, loc: 'bangkalan' },
    { name: 'JIAT Banyuwangi', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah (JIAT) di Kabupaten Banyuwangi', kategori: 'jiat', nilai: 34245740000, loc: 'banyuwangi' },
    { name: 'DIR Maluku Paket 4', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah BWS Maluku Utara Paket IV', kategori: 'irigasi', nilai: 71836311000, loc: 'maluku-utara' },

    // ===== B. NON INPRES ON HAND =====
    { name: 'Bendungan Bulango Ulu', kontrak: 'Pembangunan Bendungan Bulango Ulu Paket II (MYC) Di Kab. Bone Bolango', kategori: 'bendungan', nilai: 646983536208, loc: 'bone-bolango' },
    { name: 'PLTM Batanghari', kontrak: 'Pembangunan PLTM Batanghari 3 x 1,7 MW Sumatera Barat', kategori: 'pltm', nilai: 150850092000, loc: 'batanghari' },
    { name: 'DIR Sumatera Barat Paket 2', kontrak: 'Rehabilitasi Jaringan Utama D.I Kewenangan Daerah di Provinsi Sumatera Barat (Paket II); 7.67 Km; 2171,76 Hektar; F; K; SYC', kategori: 'irigasi', nilai: 50466841668, loc: 'sumbar' },
    { name: 'JIAT Padang', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah Pada Kota Padang; Prov. Sumatera Barat; 8.00 km; 80 Hektar; F; K; SYC', kategori: 'lainnya', nilai: 12591057808, loc: 'padang' },
    { name: 'JIAT Tanah Datar', kontrak: 'Pembangunan Jaringan Irigasi Air Tanah Pada Kabupaten Tanah Datar: Prov. Sumatera Barat; 8.00 km; 80 Hektar; F; K; SYC', kategori: 'lainnya', nilai: 12652298862, loc: 'tanah-datar' },
    { name: 'DIR Sumatera V', kontrak: 'Peningkatan dan Rehabilitasi Jaringan Irigasi Utama Kewenangan Daerah di BWS Sumatera V (Inpres Tahap III)', kategori: 'irigasi', nilai: 68586153709, loc: 'sumbar' },
    { name: 'NCICD Fase A Tahap 3 Paket 1', kontrak: 'Pembangunan Tanggul Pengaman Pantai NCICD Fase A Tahap 3 Paket 1', kategori: 'sungai-pantai', nilai: 104380288288, loc: 'jakarta' },
    { name: 'Embung Sunter Hulu TIU', kontrak: 'Pembangunan Sistem Tata Air Waduk/Embung Sunter Hulu TIU Beserta Kelengkapannya', kategori: 'embung', nilai: 98794594594, loc: 'jakarta' },
    { name: 'Rumah Pompa Daan Mogot', kontrak: 'Pembangunan Sistem Tata Air Pompa Daan Mogot (DEPAG, KM 13, KM 13A, KM 138) Beserta Kelengkapannya', kategori: 'lainnya', nilai: 146355855855, loc: 'jakarta' },
    { name: 'Bencana Aceh', kontrak: 'Pekerjaan Konstruksi Terintegrasi Rancang dan Bangun Penanganan Kawasan Pasca Bencana Kabupaten Pidie Jaya dan Kabupaten Bireuen', kategori: 'bencana', nilai: 163091891891, loc: 'aceh' },
    { name: 'Bencana Sumatera Barat', kontrak: 'Penanggulangan Bencana Tanggap Darurat di Provinsi Sumatera Barat Paket III', kategori: 'bencana', nilai: 37837626161, loc: 'sumbar' },
    { name: 'EPC PLTA Poigar-2 HEPP (2x15MW)', kontrak: 'EPC PLTA Poigar-2 HEPP (2x15MW)', kategori: 'pltm', nilai: 309510158467, loc: 'poigar' },
    { name: 'Pesisir Teluk Jakarta Tahap 7 Paket 3', kontrak: 'Pembangunan Pengaman Pantai di Pesisir Teluk Jakarta Tahap 7 Paket 3', kategori: 'sungai-pantai', nilai: 119818916216, loc: 'jakarta' },
    { name: 'Bottom Outlet Bulango Ulu', kontrak: 'Pembangunan Bottom Outlet Bendungan Bulango Ulu', kategori: 'bendungan', nilai: 38818061373, loc: 'bone-bolango' },
    { name: 'Bendungan Mbay', kontrak: 'Bendungan Mbay di Kabupaten Nageko (Paket-2)', kategori: 'bendungan', nilai: 767716248648, loc: 'nageko' },
    { name: 'Bendungan Bener Paket 4', kontrak: 'Pembangunan Bendungan Bener Kabupaten Purworejo Paket 4 (MYC)', kategori: 'bendungan', nilai: 821662323970, loc: 'purworejo' },
    { name: 'Bendungan Budong-budong', kontrak: 'Pembangunan Bendungan Budong - Budong Kab. Mamuju Tengah', kategori: 'bendungan', nilai: 649365279279, loc: 'mamuju' },
    { name: 'UFCS Bima', kontrak: 'Urban Flood Control System Improvement in Selected Cities (Phase 2) Sub Project Bima, Package IVB', kategori: 'sungai-pantai', nilai: 103039785478, loc: 'bima' },
    { name: 'Bendungan Bener Paket 1', kontrak: 'Pembangunan Bendungan Bener Kabupaten Purworejo Paket 1 (MYC)', kategori: 'bendungan', nilai: 411056760286, loc: 'purworejo' },
    { name: 'DIR Merauke', kontrak: 'Pembangunan Jaringan Irigasi Rawa pada KSPP Kabupaten Merauke (Paket 2)', kategori: 'irigasi', nilai: 226878378378, loc: 'merauke' },
    { name: 'Bencana Sumatera Utara', kontrak: 'Penanggulangan Bencana Tanggap Darurat Bencana di Provinsi Sumatera Utara Paket III', kategori: 'bencana', nilai: 13159980275, loc: 'sumut' },
    { name: 'Bendungan Riam Kiwa', kontrak: 'Riam Kiwa Multipurpose Dam Construction Project', kategori: 'bendungan', nilai: 534777410000, loc: 'riam-kiwa' },
    { name: 'Bendungan Bagong', kontrak: 'Pembangunan Bendungan Bagong Paket I di Kab. Trenggalek (MYC)', kategori: 'bendungan', nilai: 765283500000, loc: 'trenggalek' },
    { name: 'Banjir Wulan', kontrak: 'CWP-3DJK Wulan River Improvement Works Package III', kategori: 'sungai-pantai', nilai: 233678486626, loc: 'wulan' },
    { name: 'Bendungan Cabean', kontrak: 'Pembangunan Bendungan Cabean', kategori: 'bendungan', nilai: 292586985880, loc: 'cabean' },
    { name: 'Jragung Paket 6', kontrak: 'Pembangunan Bendungan Jragung Paket VI', kategori: 'bendungan', nilai: 124268333330, loc: 'jragung' },
    { name: 'Kali Bekasi', kontrak: 'Pengendalian Banjir Kali Bekasi Paket 7', kategori: 'sungai-pantai', nilai: 257144999970, loc: 'bekasi' },
    { name: 'Bendungan Cijurey', kontrak: 'Pembangunan Bendungan Cijurey Paket I', kategori: 'bendungan', nilai: 738422775842, loc: 'cijurey' },
    { name: 'Sabo Dam Semeru S4', kontrak: 'Volcanic Disaster Risk Reduction Sector Loan Project-Package S4', kategori: 'lainnya', nilai: 113262577984, loc: 'semeru' },
];

async function run() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`Seed DIVISI 2${dryRun ? ' (DRY RUN)' : ''} — ${PROJECTS.length} proyek, ${CATEGORIES.length} kategori\n`);

    await dbConnect();

    // 1) Upsert kategori
    for (const c of CATEGORIES) {
        const exists = await Category.findOne({ identifier: c.identifier }).lean();
        if (exists) {
            console.log(`  kategori "${c.identifier}" sudah ada — lewati`);
        } else {
            console.log(`  + kategori "${c.name}" (${c.identifier})`);
            if (!dryRun) {
                await Category.create({ ...c, description: `Proyek segmentasi ${c.name}` });
            }
        }
    }

    // 2) Insert proyek
    let created = 0, skipped = 0, missingLoc = 0;
    for (const p of PROJECTS) {
        const coord = LOC[p.loc];
        if (!coord) { missingLoc++; console.warn(`  !! koordinat "${p.loc}" tidak ada untuk ${p.name}`); continue; }
        const [lat, lng] = coord;
        const dup = await Location.findOne({ name: p.name, division: 'DIVISI 2' }).lean();
        if (dup) { skipped++; console.log(`  = sudah ada: ${p.name}`); continue; }
        console.log(`  + ${p.name}  [${p.kategori}]  ${lat},${lng}  Rp ${p.nilai.toLocaleString('id-ID')}`);
        if (!dryRun) {
            await Location.create({
                name: p.name,
                category: p.kategori,
                division: 'DIVISI 2',
                lat, lng,
                contractNumber: '',
                description: p.kontrak,
                contractValue: p.nilai * RIBU,
                cameras: [],
                status: 'ongoing',
            });
            created++;
        }
    }

    console.log('\n── Ringkasan ──');
    console.log(`Proyek dibuat   : ${dryRun ? '(dry-run)' : created}`);
    console.log(`Sudah ada       : ${skipped}`);
    console.log(`Koordinat hilang: ${missingLoc}`);
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
