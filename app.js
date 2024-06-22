const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const BRAND_NAME = "Seventh";
const CATEGORY_VALUE = "Hoodie";
const GENDER = "Mens & Womens";

async function getProductDetails(url) {
    console.log("getProductDetails " + url);
    const browser = await puppeteer.launch({
        headless: false,
        // headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--enable-http2', '--disable-web-security'],
        ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();

    // Set viewport to desired width and height
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(url, { waitUntil: 'networkidle2' });


    // Scroll down to load all images
    await autoScroll(page);
    // Custom wait function
    await new Promise(resolve => setTimeout(resolve, 4000)); // Wait for images to load

    console.log("Scroll, and now entering page")
    // Wait for the specific elements to ensure they are loaded
    // Cwith fugazi I have to keep chaning the image ids--- longgggg
    await page.waitForSelector('#shopify-section-template--22695676870973__main > div:nth-child(6) > div > div > div.md\\:col-span-6.lg\\:col-span-7 > div > div > div:nth-child(2) > img');
    // await page.waitForSelector('#ProductImage-36340024475820');

    const details = await page.evaluate((BRAND_NAME, CATEGORY_VALUE, GENDER) => {
        const brand = BRAND_NAME;
        const nameElement = document.querySelector("#shopify-section-template--22695676870973__main > div:nth-child(6) > div > div > div.flex-shrink-0.px-4.py-6.lg\\:pt-10.lg\\:pl-10.lg\\:pr-5.lg\\:sticky.lg\\:top-4.md\\:col-span-6.lg\\:col-span-5.lg\\:self-start > product-form > h1");
        const name = nameElement ? nameElement.innerText?.trim() : null;
        console.log('name:', name);

        const category = CATEGORY_VALUE;
        const priceText = document.querySelector("#productPrice4735376162915 > p > span.text-sm")?.innerText?.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;
        console.log('price:', price);

        const gender = GENDER;
        const descriptionElement = document.querySelector("#shopify-section-template--22695676870973__main > div:nth-child(6) > div > div > div.flex-shrink-0.px-4.py-6.lg\\:pt-10.lg\\:pl-10.lg\\:pr-5.lg\\:sticky.lg\\:top-4.md\\:col-span-6.lg\\:col-span-5.lg\\:self-start > product-form > details:nth-child(10) > div");
        const description = descriptionElement ? descriptionElement.innerText?.trim() : null;
        console.log('description:', description);

        // const description = '';
        // const color = document.querySelector("#product-description-container > div.Product > div.Product__hero.flex.flex-col.md\\:flex-row > div.Product__hero-description-container.relative.flex.items-start.md\\:items-center > div.none.md\\:block.absolute.b0.l0.r0.z1 > div > div.relative.z1 > div > div > div > a.ProductVariantDrawers__color-swatch-wrapper.is-active > span")?.innerText?.trim();
        const colorElement = document.querySelector("#shopify-section-template--22695676870973__main > div:nth-child(6) > div > div > div.\\[.flex-shrink-0.px-4.py-6.lg\\:pt-10.lg\\:pl-10.lg\\:pr-5.lg\\:sticky.lg\\:top-4.md\\:col-span-6.lg\\:col-span-5.lg\\:self-start.\\] > product-form > div.my-2.lg\\:my-4.flex.lg\\:block.items-center > p");
        const color = colorElement ? colorElement.innerText.trim() : null;
        console.log('color:', color);

        // const color = "CAMO"

        const imagesUrl = [];
        const imageNames = [];
        // /Get first Image,
        // console.log("getting image")

        const firstImage = document.querySelector("#shopify-section-template--22695676870973__main > div:nth-child(6) > div > div > div.md\\:col-span-6.lg\\:col-span-7 > div > div > div:nth-child(2) > img");

        if (firstImage) {
            const srcset = firstImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[1].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${String(brand).replace(/\s+/g, '-')}-${String(name).replace(/\s+/g, '-')}-0`;
                // const imageName = `${brand.replace(/\s+/g, '-').replace(/\//g, '-').replace(/'/g, '')}-${name.replace(/\s+/g, '-').replace(/\//g, '-').replace(/'/g, '')}-0`;
                imageNames.push(imageName);
            } else {
                imagesUrl.push(firstImage.src);
                const imageName = `${String(brand).replace(/\s+/g, '-')}-${String(name).replace(/\s+/g, '-')}-0`;
                imageNames.push(imageName);
            }
        }
        // const secondImage = document.querySelector("#Image-23062229483614-1400-0");
        // if (secondImage) {
        //     const srcset = secondImage.getAttribute('srcset');
        //     if (srcset) {
        //         const firstSrc = srcset.split(',')[5].trim().split(' ')[0]; // Get the first srcset URL
        //         imagesUrl.push(firstSrc);
        //         const imageName = `${String(brand).replace(/\s+/g, '-')}-${String(name).replace(/\s+/g, '-')}-1`;
        //         imageNames.push(imageName);
        //     }
        //     else {
        //         imagesUrl.push(secondImage.src);
        //         const imageName = `${String(brand).replace(/\s+/g, '-')}-${String(name).replace(/\s+/g, '-')}-1`;
        //         imageNames.push(imageName);
        //     }
        // }


        return {
            Brand: brand,
            name: name,
            category: category,
            id: '',
            code: '',
            url: window.location.href,
            Price: price,
            currency: 'GBP',
            gender: gender,
            description: description,
            color: color,
            from: 'seventhstores',
            info: 'Retail Price',
            'image': imageNames,
            'imagesUrl': imagesUrl,
            // Debug: {
            //     'imgElement for index 0': document.querySelector('#main > div.lv-product > div > section > div.lv-product-page-header__primary > div > div > ul > li:nth-child(2) > div > div > picture > img') ? document.querySelector('#main > div.lv-product > div > section > div.lv-product-page-header__primary > div > div > ul > li:nth-child(2) > div > div > picture > img').getAttribute('srcset') : null
            //     //     'imgElement for index 4': document.querySelector('li[data-index="4"] img') ? document.querySelector('li[data-index="4"] img').getAttribute('srcset') : null
            // }
        };
    }, BRAND_NAME, CATEGORY_VALUE, GENDER);
    // console.log(details.Debug);  // Log the intermediate results
    // Print details for debugging
    console.log('Product details:', details);
    // Download images
    for (let i = 0; i < details.image.length; i++) {
        const imageUrl = details.imagesUrl[i];
        const imageName = details.image[i];
        try {
            console.log(`Downloading image ${imageName} from ${imageUrl}`);
            await downloadImage(imageUrl, path.join(__dirname, 'clothing', `${imageName}.jpg`));
        } catch (error) {
            console.error(`Failed to download image ${imageName} from ${imageUrl}:`, error);
        }
    }

    await browser.close();
    return details;
}
// Function to download image
async function downloadImage(url, filepath) {
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            headers: {
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'User-Agent': 'axios/1.7.2',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        return new Promise((resolve, reject) => {
            response.data.pipe(fs.createWriteStream(filepath))
                .on('error', (err) => {
                    console.error(`Error writing file ${filepath}:`, err);
                    reject(err);
                })
                .on('finish', resolve);
        });
    } catch (error) {
        console.error(`Error downloading image from ${url}:`, error);
        throw error;
    }
}


// Function to auto-scroll the page
async function autoScroll(page) {
    console.log("autoScroll called")
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            let totalHeight = 0;
            const distance = 2000; // Increase the scroll distance
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight - window.innerHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 500);
        });
    });
}

(async () => {
    const urls = [
        'https://seventhstores.com/products/copy-of-double-layered-v2-hooded-sweatshirt-in-night',
        'https://seventhstores.com/collections/shop-all/products/night-v2-stacks-m',
        'https://seventhstores.com/collections/shop-all/products/cbhs-m',
        'https://seventhstores.com/collections/shop-all/products/desert-bow-tech-pant',
        'https://seventhstores.com/collections/shop-all/products/smoke-v2-hoodie',
        'https://seventhstores.com/collections/shop-all/products/cactus-v2-zipped-hoodie'


        // Add more URLs as needed
    ];

    // Load existing data if available
    let existingData = [];
    if (fs.existsSync('product_details.json')) {
        const rawData = fs.readFileSync('product_details.json');
        existingData = JSON.parse(rawData);
    }

    const results = [];
    for (const url of urls) {
        const details = await getProductDetails(url);
        if (details) {
            results.push(details);
        }
    }

    // Append new results to existing data
    const updatedData = existingData.concat(results);

    fs.writeFileSync('product_details.json', JSON.stringify(updatedData, null, 2), 'utf-8');
    console.log('Product details saved to product_details.json');
})();


// const debugInfo = imgElement ? {
//     srcset: imgElement.getAttribute('srcset'),
//     src: imgElement.getAttribute('src'),
//     dataSrc: imgElement.getAttribute('data-src')
// } : null;

// console.log(`imgElement for index ${index}:`, debugInfo);