/**
 * assign_pics.ts
 * Mengisi daftar picSubs untuk proyek berdasarkan file konfigurasi lokal.
 *
 * Penggunaan:
 *   npx tsx scripts/assign_pics.ts [path/ke/file.local.json]
 *   (Default: scripts/data/assign_pics.local.json)
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

interface PicAssignment {
    id: string;
    name: string;
    user: string;
    subsToAdd: string[];
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("MONGODB_URI is not set!");
        process.exit(1);
    }

    const defaultDataPath = path.resolve(process.cwd(), 'scripts', 'data', 'assign_pics.local.json');
    const dataFilePath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultDataPath;

    if (!fs.existsSync(dataFilePath)) {
        console.error(`[Error] File data PIC tidak ditemukan: ${dataFilePath}`);
        console.error("Buat file tersebut atau berikan path file JSON sebagai argumen CLI.");
        process.exit(1);
    }

    const rawData = fs.readFileSync(dataFilePath, 'utf-8');
    const updates: PicAssignment[] = JSON.parse(rawData);

    console.log("Connecting to MongoDB...");
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log("Connected!");

    const db = mongoose.connection.db;
    if (!db) {
        console.error("No database connection!");
        process.exit(1);
    }

    const locColl = db.collection('locations');
    const auditColl = db.collection('auditlogs');

    for (const item of updates) {
        const targetId = new mongoose.Types.ObjectId(item.id);
        console.log(`\n--- Updating ${item.name} (${targetId}) ---`);
        const before = await locColl.findOne({ _id: targetId });
        console.log(`Before picSubs:`, before?.picSubs);

        await locColl.updateOne(
            { _id: targetId },
            { $addToSet: { picSubs: { $each: item.subsToAdd } } }
        );

        const after = await locColl.findOne({ _id: targetId });
        console.log(`After picSubs:`, after?.picSubs);

        try {
            await auditColl.insertOne({
                action: 'UPDATE',
                entity: 'Project',
                entityId: targetId.toString(),
                entityName: item.name,
                by: 'admin',
                detail: `Menambahkan PIC: ${item.user} (${item.subsToAdd.join(', ')})`,
                timestamp: new Date()
            });
        } catch {
            // ignore audit log error if collection not ready
        }
    }

    console.log("\nAll updates completed successfully!");
    await mongoose.disconnect();
}

main().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
