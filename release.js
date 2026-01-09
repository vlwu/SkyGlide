import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read package.json to get the version
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

const distDir = path.join(__dirname, 'dist');
const releaseDir = path.join(__dirname, 'release');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
    console.error('Error: dist/ directory not found. The build process may have failed.');
    process.exit(1);
}

// Sync manifest.json version with package.json
const manifestPath = path.join(distDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        // Chrome requires strictly dot-separated integers (e.g. 1.0.0)
        // Strip any prerelease tags (e.g. -beta.1)
        manifest.version = version.split('-')[0];
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`\nUpdated dist/manifest.json to version ${manifest.version}`);
    } catch (e) {
        console.warn('Warning: Failed to update manifest.json version', e);
    }
} else {
    console.warn('\nWarning: manifest.json not found in dist/. Skipping version sync.');
}

// Ensure release directory exists
if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir);
}

const outputFilename = `skyglide-v${version}.zip`;
const outputPath = path.join(releaseDir, outputFilename);
const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level
});

output.on('close', () => {
    console.log(`✅ Release packaged successfully!`);
    console.log(`📁 File: ${outputFilename}`);
    console.log(`📦 Size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📍 Path: ${outputPath}\n`);
});

archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
        console.warn(err);
    } else {
        throw err;
    }
});

archive.on('error', (err) => {
    throw err;
});

archive.pipe(output);

// Append files from dist directory, putting its contents at the root of archive
archive.directory(distDir, false);

archive.finalize();