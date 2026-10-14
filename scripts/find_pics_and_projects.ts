import mongoose from 'mongoose';

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("MONGODB_URI not set!");
        process.exit(1);
    }
    console.log("Connecting to MongoDB...");
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log("Connected to MongoDB!");

    const db = mongoose.connection.db;
    if (!db) {
        console.error("No db!");
        process.exit(1);
    }

    const ssoColl = db.collection('ssoidentities');
    const locColl = db.collection('locations');

    const usernames = [
        'dendi_tri',
        'hafizMT2017',
        'febriawan_indra',
        'miftakhul_iman',
        'desy_mega',
        'rizky_ristanto'
    ];

    console.log("\n=== Checking SsoIdentity in MongoDB ===");
    for (const u of usernames) {
        const found = await ssoColl.findOne({
            $or: [
                { username: u },
                { username: { $regex: new RegExp(`^${u}$`, 'i') } }
            ]
        });
        console.log(`User: ${u} ->`, found ? { cognitoSub: found.cognitoSub, username: found.username, name: found.name } : "NOT FOUND in SsoIdentity");
    }

    console.log("\n=== Checking Locations for Bencana / Sumatra / Tanggap ===");
    const bencanaLocs = await locColl.find({
        division: "DIVISI 2",
        $or: [
            { name: { $regex: /bencana|sumat|tanggap|darurat/i } },
            { contractTitle: { $regex: /bencana|sumat|tanggap|darurat/i } }
        ]
    }).project({ name: 1, division: 1, picSubs: 1, contractTitle: 1 }).toArray();

    for (const loc of bencanaLocs) {
        console.log(`Found Bencana: [${loc._id}] "${loc.name}" | Contract: "${loc.contractTitle}"`);
    }

    console.log("\n=== Listing ALL Divisi 2 Projects ===");
    const allDiv2 = await locColl.find({ division: "DIVISI 2" }).project({ name: 1, contractTitle: 1, category: 1, picSubs: 1 }).toArray();
    console.log(`Total Divisi 2 projects: ${allDiv2.length}`);
    for (const loc of allDiv2) {
        console.log(`- [${loc._id}] "${loc.name}" (${loc.category || '-'}) | Contract: "${loc.contractTitle || '-'}" | picSubs: ${JSON.stringify(loc.picSubs)}`);
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
