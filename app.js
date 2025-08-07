const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const BRAND_NAME = "Corteiz";
const CATEGORY_VALUE = "TOP";
const GENDER = "All";

async function getProductDetails(url) {
    console.log("getProductDetails " + url);
    const browser = await puppeteer.launch({
        headless: false,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--enable-http2', '--disable-web-security'],
        ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();

    // Set viewport to desired width and height
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(url, { waitUntil: 'networkidle2' });
    // // Handle cookie modal
    // try {
    //     await page.waitForSelector('#ucm-details > div.ucm-popin.ucm-popin--pushpop.ucm-popin--active > div', { timeout: 5000 }); // Change selector to match the actual cookie modal
    //     await page.click('#ucm-details > div.ucm-popin.ucm-popin--pushpop.ucm-popin--active > div > form > ul > li:nth-child(3) > button'); // Change selector to match the actual accept button
    // } catch (error) {
    //     console.log('No cookie modal found or failed to accept cookies:', error);
    // }

    // Scroll down to load all images
    await autoScroll(page);
    // Custom wait function
    await new Promise(resolve => setTimeout(resolve, 4000)); // Wait for images to load

    console.log("Scroll, and now entering page")
    // Wait for the specific elements to ensure they are loaded
    // Cwith fugazi I have to keep chaning the image ids--- longgggg
    // await page.waitForSelector('#\\:R6l35\\:-slide-1 > div > img');
    // await page.waitForSelector('#main > div.lv-product > div > section > div.lv-product-page-header__primary > div > div > ul > li:nth-child(2) > div > div > picture > img');
    await page.waitForSelector('#ProductSection > div > div:nth-child(1) > div.flexslider.product-gallery-slider > div > ul > li.flex-active-slide > a > img');


    const details = await page.evaluate((BRAND_NAME, CATEGORY_VALUE, GENDER) => {
        const brand = BRAND_NAME;
        const name = document.querySelector("#ProductSection > div > div:nth-child(2) > div > h1")?.innerText.trim();

        const category = CATEGORY_VALUE;
        const priceText = document.querySelector('#ProductPrice')?.innerText.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;
        const gender = GENDER;
        const description = document.querySelector("#ProductSection > div > div:nth-child(2) > div > div.product-single__description.rte > ul:nth-child(1)")?.innerText.trim();
        // const color = document.querySelector("#main > div.lv-product > section > div.lv-product-seo-details > div > div > div > ul:nth-child(1) > li:nth-child(2)")?.innerText.trim();


        const imagesUrl = [];
        const imageNames = [];
        // /Get first Image,
        // console.log("getting image")

        const firstImage = document.querySelector("#ProductSection > div > div:nth-child(1) > div.flexslider.product-gallery-slider > div > ul > li.flex-active-slide > a > img");
        // const onlyImage = document.querySelector("#main > div.lv-product > div > section > div.lv-product-page-header__primary > div > div > ul > li.-critical > div > div > picture > img");
        const sanitize = (str) =>
            String(str)
                .replace(/\s+/g, '-')   // Replace spaces with hyphens
                .replace(/[\/\\\[\]'":]/g, '') // Remove problematic chars
                .replace(/-+/g, '-');   // Collapse repeated dashes

        if (firstImage) {
            const srcset = firstImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[4].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${sanitize(brand)}-${sanitize(name)}-0`;
                imageNames.push(imageName);
            } else {
                imagesUrl.push(firstImage.src);
                const imageName = `${sanitize(brand)}-${sanitize(name)}-0`;
                imageNames.push(imageName);
            }
        }
        const secondImage = document.querySelector("#ProductSection > div > div:nth-child(1) > div.flexslider.product-gallery-slider > div > ul > li:nth-child(2) > a > img");
        if (secondImage) {
            const srcset = secondImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[8].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${sanitize(brand)}-${sanitize(name)}-1`;
                imageNames.push(imageName);
            }
            else {
                imagesUrl.push(secondImage.src);
                const imageName = `${sanitize(brand)}-${sanitize(name)}-1`;
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
            currency: 'GBP',
            gender: gender,
            description: description,
            color: "",
            from: 'corteiz',
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
            await downloadImage(imageUrl, path.join(__dirname, 'corteiz', `${imageName}.jpg`));
        } catch (error) {
            console.error(`Failed to download image ${imageName} from ${imageUrl}:`, error);
        }
    }

    await browser.close();
    return details;
}
// Function to download image
async function downloadImage(url, filepath) {
    console.log(`Downloading image from ${url} to ${filepath}`);
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
        "https://www.crtz.xyz/collections/tops-jerseys/products/open-mesh-panel-jersey-2",
        "https://www.crtz.xyz/collections/tops-jerseys/products/open-mesh-panel-jersey-3",
        "https://www.crtz.xyz/collections/tops-jerseys/products/open-mesh-panel-jersey-4",
        "https://www.crtz.xyz/collections/tops-jerseys/products/open-mesh-panel-jersey-6",
        "https://www.crtz.xyz/products/boy-better-know-shuku-jacket",
        "https://www.crtz.xyz/products/bbk-royale-open-hem-pant",
        "https://www.crtz.xyz/products/bbk-royale-zip-hoodie",
        "https://www.crtz.xyz/products/boy-better-know-shuku-pant",
        "https://www.crtz.xyz/products/sponsors-training-pullover",
        "https://www.crtz.xyz/products/dual-stripe-denim-short-one-wash-indigo",
        "https://www.crtz.xyz/products/stencil-camo-bball-jersey",
        "https://www.crtz.xyz/products/stars-bball-jersey",
        "https://www.crtz.xyz/products/acetate-wrap-sunglasses-blue",
        "https://www.crtz.xyz/products/serie-a-knit-jersey",
        "https://www.crtz.xyz/products/serie-a-knit-jersey-blue",
        "https://www.crtz.xyz/products/serie-a-knit-jersey-2",
        "https://www.crtz.xyz/products/flames-football-jersey-white",
        "https://www.crtz.xyz/collections/jackets/products/rtw-racing-jacket-black",
        "https://www.crtz.xyz/collections/jackets/products/da-skydive-jacket-grey",
        "https://www.crtz.xyz/collections/jackets/products/da-skydive-jacket-black",
        "https://www.crtz.xyz/products/western-open-mesh-jersey-white",

        // Add more URLs as needed
    ];
    console.log("calling app.js")

    // Load existing data if available
    let existingData = [];
    if (fs.existsSync('corteiz.json')) {
        const rawData = fs.readFileSync('corteiz.json');
        existingData = JSON.parse(rawData);
    }

    const results = [];
    for (const url of urls) {
        const details = await getProductDetails(url);
        if (details) {
            results.push(details);
            console.log(details)
        }
    }
    // return;

    // Append new results to existing data
    const updatedData = existingData.concat(results);

    fs.writeFileSync('corteiz.json', JSON.stringify(updatedData, null, 2), 'utf-8');
    console.log('Product details saved to corteiz.json');
})();


// const debugInfo = imgElement ? {
//     srcset: imgElement.getAttribute('srcset'),
//     src: imgElement.getAttribute('src'),
//     dataSrc: imgElement.getAttribute('data-src')
// } : null;

// console.log(`imgElement for index ${index}:`, debugInfo);