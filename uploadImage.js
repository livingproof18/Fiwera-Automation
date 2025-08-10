#!/usr/bin/env node
/* eslint-disable no-console */

// If you want to load a .env file, uncomment the next line after installing dotenv:
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

/**
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (recommended for server-side batch jobs)
 *
 * Optional env:
 *   BUCKET=clothing             (public bucket name)
 *   SRC_DIR=images              (local folder with images)
 *   OVERWRITE=false             ("true" to overwrite files with same name)
 *   CACHE_SECONDS=31536000      (cache TTL)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const BUCKET = process.env.BUCKET || 'clothing';
const SRC_DIR = process.env.SRC_DIR || 'corteiz/clothing';
const OVERWRITE = String(process.env.OVERWRITE || 'true').toLowerCase() === 'true';
const CACHE_SECONDS = Number(process.env.CACHE_SECONDS || 31536000);

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.tiff'].includes(ext);
}

function listFilesRecursive(rootDir) {
    const out = [];
    const stack = [rootDir];
    while (stack.length) {
        const current = stack.pop();
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(current, e.name);
            if (e.isDirectory()) stack.push(full);
            else out.push(full);
        }
    }
    return out;
}

async function uploadFile(localFilePath, bucketPath) {
    const buffer = fs.readFileSync(localFilePath);
    const contentType = mime.lookup(localFilePath) || 'application/octet-stream';

    const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(bucketPath, buffer, {
            upsert: OVERWRITE,
            contentType,
            cacheControl: String(CACHE_SECONDS),
        });

    if (upErr) throw upErr;

    // Get public URL (bucket must be public)
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(bucketPath);
    return { publicUrl: pub.publicUrl, contentType };
}

async function main() {
    if (!fs.existsSync(SRC_DIR)) {
        console.error(`Source folder not found: ${SRC_DIR}`);
        process.exit(1);
    }

    const allFiles = listFilesRecursive(SRC_DIR);
    const imageFiles = allFiles.filter(isImageFile);

    if (imageFiles.length === 0) {
        console.log('No image files found.');
        return;
    }

    console.log(`Found ${imageFiles.length} images under "${SRC_DIR}". Uploading to "${BUCKET}"...`);

    let success = 0;
    let failed = 0;

    // Sequential upload (simple & avoids rate-limit surprises)
    for (const absPath of imageFiles) {
        // Keep the relative path structure inside the bucket
        const relPath = path.relative(SRC_DIR, absPath).split(path.sep).join('/');
        const bucketPath = relPath; // if everything is in one folder, this is just the filename

        try {
            const { publicUrl, contentType } = await uploadFile(absPath, bucketPath);
            console.log(`✓ ${relPath} → ${publicUrl} (${contentType})`);
            success++;
        } catch (e) {
            console.error(`✗ ${relPath}: ${e.message}`);
            failed++;
        }
    }

    console.log(`Done. Success: ${success}, Failed: ${failed}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
