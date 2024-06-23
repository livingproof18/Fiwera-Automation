const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const BRAND_NAME = "systemic";
const CATEGORY_VALUE = "Tops";
const GENDER = "Mens";

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
    // await page.waitForSelector('#\\:R6l35\\:-slide-1 > div > img');
    await page.waitForSelector('#Image43421892509961 > div > img');

    // Click to open the modal
    // try {
    //     await page.click('#product-view > button.flex.justify-start.uppercase.underline.hover\\:text-gray-300.hover\\:no-underline.phone\\:ml-5.text-sm.phone\\:order-6.phone\\:mb-0');
    //     await page.waitForSelector('body > div:nth-child(7) > div > div > div', { timeout: 5000 });
    // } catch (error) {
    //     console.log('Failed to open description modal:', error);
    // }


    const details = await page.evaluate((BRAND_NAME, CATEGORY_VALUE, GENDER) => {
        const brand = BRAND_NAME;
        const gender = GENDER;
        const category = CATEGORY_VALUE;
        //depending on catr CATEGORY will need to change, product-jeans, product-template, product-tops e.g
        const nameElement = document.querySelector("#shopify-section-product-template  > section > div > div.Product__InfoWrapper > div.Product__Info > div > div.ProductMeta > h1");
        const name = nameElement ? nameElement.innerText?.trim() : null;
        console.log('name:', name);

        const priceText = document.querySelector("#shopify-section-product-template  > section > div > div.Product__InfoWrapper > div.Product__Info > div > div.ProductMeta > div > span")?.innerText?.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;
        console.log('price:', price);

        const descriptionElement = document.querySelector("#shopify-section-product-template  > section > div > div.Product__InfoWrapper > div.Product__Info > div > div:nth-child(4) > div");
        const description = descriptionElement ? descriptionElement.innerText?.trim() : null;
        console.log('description:', description);

        // const colorElement = document.querySelector("#option-label-color > span.swatch-attribute-value");
        // const color = colorElement ? colorElement.innerText.trim() : null;
        const color = ""

        const imagesUrl = [];
        const imageNames = [];
        // /Get first Image,
        // console.log("getting image")

        // const firstImage = document.querySelector("#maincontent > div.columns > div > div.product.media > div.gallery-placeholder.product-image-mosaic._block-content-loading > ul > li:nth-child(11) > img.zoomImg");
        const firstImage = document.querySelector("#Image43421892509961 > div > img");
        if (firstImage) {
            const srcset = firstImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[6].trim().split(' ')[0]; // Get the first srcset URL
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
        const secondImage = document.querySelector("#Image43421892477193 > div > img");
        if (secondImage) {
            const srcset = secondImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[6].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${String(brand).replace(/\s+/g, '-')}-${String(name).replace(/\s+/g, '-')}-1`;
                imageNames.push(imageName);
            }
            else {
                imagesUrl.push(secondImage.src);
                const imageName = `${String(brand).replace(/\s+/g, '-')}-${String(name).replace(/\s+/g, '-')}-1`;
                imageNames.push(imageName);
            }
        }


        return {
            Brand: brand,
            name: name,
            category: category,
            id: '',
            code: '',
            url: window.location.href,
            Price: price,
            currency: 'EUR',
            gender: gender,
            description: description,
            color: color,
            from: 'sys-temic',
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
        // 'https://sys-temic.com/collections/all-products/products/striker-logo-jersey',
        // 'https://sys-temic.com/collections/all-products/products/marine-double-barrel-jeans',
        'https://sys-temic.com/collections/all-products/products/ecru-teddy-fleece-v2'

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