
const mongoose = require('mongoose');

// Trying the IP from docker-compose.yml (ending in .46 instead of .45)
const uri = "mongodb://admin:Qwerty123@54.169.114.46:27017/tengok?authSource=admin";

console.log("Attempting to connect to MongoDB at .46...");

mongoose.connect(uri)
    .then(() => {
        console.log("Successfully connected to MongoDB!");
        process.exit(0);
    })
    .catch((err) => {
        console.error("Connection failed:", err.message);
        process.exit(1);
    });
