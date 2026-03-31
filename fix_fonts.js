const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
    });
}

const srcDir = path.join(__dirname, 'src');

walk(srcDir, function(filePath) {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let newContent = content
            .replace(/font-black/g, 'font-bold')
            .replace(/italic\s+/g, '') // remove italic followed by space
            .replace(/\s+italic/g, '') // remove space followed by italic
            .replace(/italic/g, '') // just in case
            .replace(/tracking-\[0\.2em\]/g, 'tracking-wider')
            .replace(/tracking-\[0\.15em\]/g, 'tracking-wider')
            .replace(/tracking-widest/g, 'tracking-wider')
            .replace(/tracking-tighter/g, 'tracking-tight');
            
        if (content !== newContent) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`Updated: ${filePath}`);
        }
    }
});
console.log('Done.');
