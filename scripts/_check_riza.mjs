import mongoose from 'mongoose';

const URI = 'mongodb://admin:Qwerty123.@54.169.114.45:27017/rtsp_tengok?authSource=admin';
const TARGET = 'riza_trisno';

const r = (v) => (v === undefined ? null : v);

try {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;

  // 1) Jejak login SSO (SsoIdentity)
  const ident = await db.collection('ssoidentities').find({
    $or: [
      { username: { $regex: `^${TARGET}$`, $options: 'i' } },
      { email: { $regex: TARGET, $options: 'i' } },
      { name: { $regex: 'riza', $options: 'i' } },
    ],
  }).toArray();

  console.log('=== SsoIdentity (jejak login ke Tengok) ===');
  if (ident.length === 0) {
    console.log('(kosong) -> riza_trisno BELUM PERNAH berhasil login SSO ke Tengok');
  } else {
    for (const i of ident) {
      console.log({
        cognitoSub: r(i.cognitoSub),
        username: r(i.username),
        email: r(i.email),
        name: r(i.name),
        firstLoginAt: r(i.firstLoginAt),
        lastLoginAt: r(i.lastLoginAt),
      });
    }
  }

  // 2) Apakah terdaftar sebagai PIC (Location.picSubs) via placeholder atau sub
  const subs = ident.map((i) => i.cognitoSub).filter(Boolean);
  const picQuery = { picSubs: { $in: [...subs, `ldap_${TARGET}`] } };
  const locs = await db.collection('locations')
    .find(picQuery, { projection: { name: 1, picSubs: 1 } })
    .toArray();
  console.log('\n=== Location dengan riza sebagai PIC ===');
  if (locs.length === 0) console.log('(tidak ada)');
  else locs.forEach((l) => console.log({ name: l.name, picSubs: l.picSubs }));

  // 3) Super-admin?
  const roles = subs.length
    ? await db.collection('approles').find({ cognitoSub: { $in: subs } }).toArray()
    : [];
  console.log('\n=== AppRole (super-admin) ===');
  console.log(roles.length ? roles : '(tidak ada)');

  // 4) Hitung total SsoIdentity biar tahu koleksi memang terisi
  const total = await db.collection('ssoidentities').countDocuments();
  console.log(`\n(info) total dokumen ssoidentities: ${total}`);
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await mongoose.disconnect();
}
