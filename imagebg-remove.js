// remove-backgrounds.js
const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');
// const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const sharp = require('sharp');

// Paths
const inputDir = path.join(__dirname, 'acero');
const outputDir = path.join(__dirname, 'transparent', 'acero');

// Ensure output directory exists
fs.mkdirSync(outputDir, { recursive: true });

// Process each image in the input directory
async function isTransparentImage(filePath) {
    try {
        const image = sharp(filePath);
        const metadata = await image.metadata();
        // return metadata.hasAlpha || metadata.format === 'png'; // PNG likely to have alpha
        return metadata.hasAlpha; // PNG likely to have alpha
    } catch (err) {
        console.error(`❌ Error checking transparency for ${filePath}:`, err);
        return false;
    }
}

async function processImages() {
    const files = fs.readdirSync(inputDir).filter(file => /\.(jpg|jpeg|png)$/i.test(file));

    for (const fileName of files) {
        const inputPath = path.join(inputDir, fileName);
        const outputFileName = fileName.replace(/\.[^/.]+$/, '.png');
        const outputPath = path.join(outputDir, outputFileName);

        // Skip if already processed
        if (fs.existsSync(outputPath)) {
            console.log(`⏩ Already exists: ${outputFileName}`);
            continue;
        }

        // Check if already transparent
        const isTransparent = await isTransparentImage(inputPath);
        if (isTransparent) {
            console.log(`🟡 Skipping (already transparent): ${fileName}`);
            continue;
        }

        try {
            console.log(`🎯 Processing: ${fileName}`);
            // execSync(`rembg i "${inputPath}" "${outputPath}"`);
            execSync(
                `python -m rembg i "${inputPath}" "${outputPath}"`,
                { stdio: "inherit" }        // show rembg’s own progress/errors
            );
            console.log(`✅ Saved: ${outputFileName}`);
            console.log(`✅ Saved: ${outputFileName}`);
        } catch (err) {
            console.error(`❌ Failed to process ${fileName}:`, err.message);
        }
    }

    console.log('🎉 All done!');
}

processImages().catch(console.error);

// // Supabase credentials
// const supabase = createClient('https://xyz.supabase.co', 'YOUR_SECRET_KEY');

// // List files in the bucket
// async function processImages() {
//   const { data, error } = await supabase.storage.from('products').list('', {
//     limit: 1000,
//   });

//   if (error) throw error;

//   for (const file of data) {
//     const fileName = file.name;
//     const url = `https://xyz.supabase.co/storage/v1/object/public/products/${fileName}`;
//     const inputPath = `tmp/input-${fileName}`;
//     const outputPath = `tmp/output-${fileName.replace(/\.[^/.]+$/, '.png')}`;

//     // Download image
//     const res = await fetch(url);
//     const buffer = await res.buffer();
//     fs.writeFileSync(inputPath, buffer);

//     // Remove background
//     execSync(`rembg i ${inputPath} ${outputPath}`);

//     // Upload processed image
//     const fileBuffer = fs.readFileSync(outputPath);
//     await supabase.storage.from('products-transparent').upload(outputPath, fileBuffer, {
//       contentType: 'image/png',
//       upsert: true,
//     });

//     console.log(`✅ Processed: ${fileName}`);
//   }
// }

// processImages().catch(console.error);