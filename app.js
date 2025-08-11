const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { type } = require('os');


const BRAND_NAME = "Broken Planet";
const CATEGORY_VALUE = "HOODIE";
const GENDER = "All";
var colorCode;
async function getProductDetails(url) {
    console.log("getProductDetails " + url);
    const browser = await puppeteer.launch({
        // headless: false,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--enable-http2', '--disable-web-security'],
        ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    // const image = document.querySelector(MAIN_IMG);
    // const MAIN_IMG = '#root > div.styles__Root-sc-1nscchl-0.eKhoXc > main > div.product__MainWrapper-sc-793f58-0.djgxcI > div.product__ProductPageWrapper-sc-793f58-11.eIGFqA > div > div.Flex-sc-1fsfqp0-0.fSrsso > div > div.ProductImages__MainImageWrapper-sc-192tdi7-4.dBvqHV > img';
    // const THUMB_SEL = '#root > div.styles__Root-sc-1nscchl-0.eKhoXc > main > div.product__MainWrapper-sc-793f58-0.djgxcI > div.product__ProductPageWrapper-sc-793f58-11.eIGFqA > div > div.Flex-sc-1fsfqp0-0.fSrsso > div > div.ProductImages__Embla-sc-192tdi7-1.bRXdtC > div > div > div:nth-child(1)';

    // 1) Selectors (note: no :nth-child here, we want all thumbs)
    const MAIN_IMG = 'div.ProductImages__MainImageWrapper-sc-192tdi7-4 img';
    const THUMB_ITEM_SEL = 'div.ProductImages__Embla-sc-192tdi7-1 div > div > div';

    // const THUMB_ITEM_SEL = 'div.ProductImages__Embla-sc-192tdi7-1.bRXdtC div > div > div:nth-child(1)';

    const sanitize = (str) =>
        String(str)
            .replace(/\s+/g, '-')
            .replace(/[\/\\\[\]'":]/g, '')
            .replace(/-+/g, '-');

    // Set viewport to desired width and height
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: 'networkidle2' });


    // Scroll down to load all images
    await autoScroll(page);
    // Custom wait function
    await new Promise(resolve => setTimeout(resolve, 4000)); // Wait for images to load

    console.log("Scroll, and now entering page")

    await page.waitForSelector(MAIN_IMG);

    // const imgSelector = document.querySelector("#root > div.styles__Root-sc-1nscchl-0.eKhoXc > main > div.product__MainWrapper-sc-793f58-0.djgxcI > div.product__ProductPageWrapper-sc-793f58-11.eIGFqA > div > div.Flex-sc-1fsfqp0-0.fSrsso > div > div.ProductImages__MainImageWrapper-sc-192tdi7-4.dBvqHV > img")

    const details = await page.evaluate((BRAND_NAME, CATEGORY_VALUE, GENDER, MAIN_IMG) => {
        const brand = BRAND_NAME;
        const name = document.querySelector("#root > div.styles__Root-sc-1nscchl-0.eKhoXc > main > div.product__MainWrapper-sc-793f58-0.djgxcI > div.product__ProductPageWrapper-sc-793f58-11.eIGFqA > div > div.styles__FlashSaleProductDescription-sc-1nscchl-11.fwxOZQ > h1")?.innerText.trim() || "";

        const priceText = document.querySelector('div.flash-sale-price > span')?.innerText.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;

        const description = document.querySelector("#root div.styles__FlashSaleProductDescription-sc-1nscchl-11.fwxOZQ > div:nth-child(3) > ul")?.innerText.trim() || "";
        const color = document.querySelector("div.flash-sale-color > p")?.innerText.trim().replace(/^COLOR:\s*/i, '') || "";


        function pickSrc(img) {
            const ss = img.getAttribute('srcset');
            if (!ss) return img.src || null;
            // pick the last (usually largest) candidate
            const parts = ss.split(',').map(s => s.trim().split(' ')[0]).filter(Boolean);
            return parts[parts.length - 1] || null;
        }

        const sanitize = (str) =>
            String(str)
                .replace(/\s+/g, '-')
                .replace(/[\/\\\[\]'":]/g, '')
                .replace(/-+/g, '-');

        const main = document.querySelector(MAIN_IMG);
        const firstSrc = main ? pickSrc(main) : null;
        // colorCode = color.substring(0, 3);
        return {
            Brand: brand,
            name,
            category: CATEGORY_VALUE,
            id: '',
            code: '',
            url: window.location.href,
            Price: price,
            currency: 'GBP',
            gender: GENDER,
            description,
            color: color,
            from: 'brokenplanet',
            info: 'Retail Price',
            // image: firstSrc ? [`${sanitize(brand)}-${sanitize(name)}-${sanitize(colorCode)}-0`] : [],
            imagesUrl: firstSrc ? [firstSrc] : [],
            type: "jpg"
        };
    }, BRAND_NAME, CATEGORY_VALUE, GENDER, MAIN_IMG);

    // 3) Build the FIRST image filename in Node (uses same sanitize everywhere)
    const colorCode = (details.color || '').slice(0, 3); // or .toUpperCase()
    details.image = [];
    if (details.imagesUrl[0]) {
        details.image.push(`${sanitize(details.Brand)}-${sanitize(details.name)}-${sanitize(colorCode)}-0`);
    }


    console.log('Product details:', details);

    // ...after you log details:
    // console.log('Product details:', details);

    // try to grab a second image, but don't block long if it's not there
    try {
        // wait a bit for thumbnails to render (short timeout)
        await page.waitForSelector(THUMB_ITEM_SEL, { timeout: 2000 });
        const thumbs = await page.$$(THUMB_ITEM_SEL);

        console.log('Found thumbnails:', thumbs.length);
        console.log(thumbs);

        if (thumbs.length > 0) {
            // read current main image src (largest candidate)
            const prevSrc = await page.$eval(MAIN_IMG, (img) => {
                const ss = img.getAttribute('srcset');
                if (!ss) return img.src || '';
                const parts = ss.split(',').map(s => s.trim().split(' ')[0]).filter(Boolean);
                return parts[parts.length - 1] || '';
            });

            // click the SECOND thumbnail (index 1), not the first
            await thumbs[0].click();

            // wait briefly for the main image to change, then proceed either way
            try {
                await page.waitForFunction(
                    (sel, previous) => {
                        const img = document.querySelector(sel);
                        if (!img) return false;
                        const ss = img.getAttribute('srcset');
                        const current = ss
                            ? ss.split(',').map(s => s.trim().split(' ')[0]).filter(Boolean).pop()
                            : img.src;
                        return !!current && current !== previous;
                    },
                    { timeout: 2000 }, // <= short, "decent amount of time"
                    MAIN_IMG,
                    prevSrc
                );
            } catch {
                // No change within 4s—probably only one real image. Just continue.
                console.log('No second image found or image did not change in time. Skipping.');
            }

            // read main image again (if it changed, this will be new)
            const maybeSecondSrc = await page.$eval(MAIN_IMG, (img) => {
                const ss = img.getAttribute('srcset');
                if (!ss) return img.src || '';
                const parts = ss.split(',').map(s => s.trim().split(' ')[0]).filter(Boolean);
                return parts[parts.length - 1] || '';
            });

            if (maybeSecondSrc && !details.imagesUrl.includes(maybeSecondSrc)) {
                details.imagesUrl.push(maybeSecondSrc);
                details.image.push(`${sanitize(details.Brand)}-${sanitize(details.name)}-${sanitize(colorCode)}-1`);
            }
        } else {
            console.log('Only one thumbnail found; skipping second image.');
        }
    } catch (e) {
        // Thumbnails never appeared or click failed—just carry on with the first image
        console.log('Could not get a second image (thumbs missing or not clickable). Continuing.', e?.message || e);
    }





    // Download images
    for (let i = 0; i < details.image.length; i++) {
        const imageUrl = details.imagesUrl[i];
        const imageName = details.image[i];
        try {
            console.log(`Downloading image ${imageName} from ${imageUrl}`);
            await downloadImage(imageUrl, path.join(__dirname, 'brokenplanet', `${imageName}.jpg`));
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
        // "https://www.brokenplanet.com/product/star-logo-zip-up-hoodie-old-copy",
        // "https://www.brokenplanet.com/product/basics-hoodie-copy-1",
        "https://www.brokenplanet.com/product/basics-hoodie-5",
        "https://www.brokenplanet.com/product/basics-cuffed-sweatpants",
        "https://www.brokenplanet.com/product/basics-straight-leg-sweatpants-copy",
        "https://www.brokenplanet.com/product/straight-leg-sweatpants-5",
        "https://www.brokenplanet.com/product/reversible-mesh-jersey-1",
        // "https://www.brokenplanet.com/product/snow-camo-waffle-long-sleeve",
        "https://www.brokenplanet.com/product/button-up-shirt",
        "https://www.brokenplanet.com/product/basics-t-shirt-copy-1",
        "https://www.brokenplanet.com/product/distressed-denim-shorts-1",
        "https://www.brokenplanet.com/product/basics-shorts-copy-1",
        "https://www.brokenplanet.com/product/cargo-pants-1",
        "https://www.brokenplanet.com/product/2-in-1-ripstop-camo-cargo-pants",
        "https://www.brokenplanet.com/product/top-league-track-jacket",
        "https://www.brokenplanet.com/product/top-league-track-pants",
        "https://www.brokenplanet.com/product/camo-mesh-jersey",
        "https://www.brokenplanet.com/product/waffle-beanie",
        "https://www.brokenplanet.com/product/broken-planet-t-shirt",
        "https://www.brokenplanet.com/product/distressed-denim-shorts",
        "https://www.brokenplanet.com/product/basics-shorts-3",
        "https://www.brokenplanet.com/product/stargirl-grafitti-tee-1",
        "https://www.brokenplanet.com/product/star-camo-waffle-long-sleeve",

        // Add more URLs as needed
    ];
    console.log("calling app.js")

    // Load existing data if available
    let existingData = [];
    if (fs.existsSync('brokenplanet.json')) {
        const rawData = fs.readFileSync('brokenplanet.json');
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

    fs.writeFileSync('brokenplanet.json', JSON.stringify(updatedData, null, 2), 'utf-8');
    console.log('Product details saved to brokenplanet.json');
})();


// const debugInfo = imgElement ? {
//     srcset: imgElement.getAttribute('srcset'),
//     src: imgElement.getAttribute('src'),
//     dataSrc: imgElement.getAttribute('data-src')
// } : null;

// console.log(`imgElement for index ${index}:`, debugInfo);