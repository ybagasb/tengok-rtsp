import dbConnect from '../src/lib/db';
import mongoose from 'mongoose';

(async () => {
    await dbConnect();
    const db = mongoose.connection.db!;

    console.log('=== CEK USER teddi_apriyadi ===');
    const ssoUser = await db.collection('ssoidentities').findOne({ username: 'teddi_apriyadi' });
    console.log('SSO Identity:', JSON.stringify(ssoUser, null, 2));

    // Cek di collections lain apakah nama Teddi ada (misal di pic, roles, dsb)
    const collections = await db.listCollections().toArray();
    for (const c of collections) {
        const col = db.collection(c.name);
        const count = await col.countDocuments({
            $or: [
                { username: /teddi/i },
                { email: /teddi/i },
                { name: /teddi/i },
                { pic: /teddi/i },
                { 'pic.name': /teddi/i },
            ]
        });
        if (count > 0) {
            console.log(`\nDitemukan di collection "${c.name}" (${count} dokumen):`);
            const docs = await col.find({
                $or: [
                    { username: /teddi/i },
                    { email: /teddi/i },
                    { name: /teddi/i },
                    { pic: /teddi/i },
                    { 'pic.name': /teddi/i },
                ]
            }).limit(5).toArray();
            docs.forEach(d => console.log(' -', d.name || d.title || d.username || d._id));
        }
    }

    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
