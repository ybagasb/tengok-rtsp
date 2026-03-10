import dbConnect from '../src/lib/db';
import Camera from '../src/models/Camera';
import Location from '../src/models/Location';

async function migrate() {
    console.log("Starting migration...");
    await dbConnect();

    // 1. Get all cameras
    const cameras = await Camera.find({}).lean() as any[];
    console.log(`Found ${cameras.length} cameras.`);

    // 2. Group cameras by their old 'location' string implicitly if they had one, 
    // but the problem says "how do I do it now since db data wasn't updated".
    // We will create 1 default location for testing, or we map existing properties to a generic location.

    // Let's create a "Default Migrated Location" to hold all unassigned cameras
    // if there are no locations yet.

    const count = await Location.countDocuments();
    if (count === 0 && cameras.length > 0) {
        console.log("No locations exist. Creating 'Pusat Migrasi' and binding all existing cameras...");

        const cameraIds = cameras.map(c => c._id);

        await Location.create({
            name: 'Pusat Migrasi (Default)',
            category: 'sekolah', // default category
            description: 'Lokasi default yang dibuat dari data kamera lama.',
            lat: -6.200000, // Default Jakarta
            lng: 106.816666,
            cameras: cameraIds
        });

        console.log("Successfully created default location and bound cameras.");
    } else {
        console.log("Locations already exist or no cameras found. Skipping default creation.");
    }

    console.log("Migration finished.");
    process.exit(0);
}

migrate().catch(console.error);
