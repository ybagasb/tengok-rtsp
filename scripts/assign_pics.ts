import mongoose from 'mongoose';

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("MONGODB_URI is not set!");
        process.exit(1);
    }

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

    const updates = [
        {
            id: new mongoose.Types.ObjectId("6abe2715f67e2440d75a7d1e"),
            name: "Bendungan Bulango Ulu",
            user: "dendi_tri",
            subsToAdd: ["ebe82bfb-595e-407e-afea-27c7ea94d430"]
        },
        {
            id: new mongoose.Types.ObjectId("6abe2716f67e2440d75a7d5a"),
            name: "Bencana Sumatera Utara",
            user: "hafizMT2017, miftakhul_iman",
            subsToAdd: ["ldap_hafizMT2017", "ldap_miftakhul_iman"]
        },
        {
            id: new mongoose.Types.ObjectId("6abe2716f67e2440d75a7d66"),
            name: "Bendungan Cabean",
            user: "febriawan_indra",
            subsToAdd: ["aa79549f-2c62-42d3-9005-5be61d6efea1"]
        },
        {
            id: new mongoose.Types.ObjectId("6abe2716f67e2440d75a7d63"),
            name: "Banjir Wulan",
            user: "desy_mega, rizky_ristanto",
            subsToAdd: ["6af4b97d-b399-493a-838e-020ca093d6b0", "ldap_rizky_ristanto"]
        }
    ];

    for (const item of updates) {
        console.log(`\n--- Updating ${item.name} (${item.id}) ---`);
        const before = await locColl.findOne({ _id: item.id });
        console.log(`Before picSubs:`, before?.picSubs);

        await locColl.updateOne(
            { _id: item.id },
            { $addToSet: { picSubs: { $each: item.subsToAdd } } }
        );

        const after = await locColl.findOne({ _id: item.id });
        console.log(`After picSubs:`, after?.picSubs);

        try {
            await auditColl.insertOne({
                action: 'UPDATE',
                entity: 'Project',
                entityId: item.id.toString(),
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
