const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const BRAND_NAME = "Nike";
const CATEGORY_VALUE = "SNEAKERS";
const GENDER = "ALL";
const DATA_PATH = 'nike.json';

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

    await autoScroll(page);
    // Custom wait function
    await new Promise(resolve => setTimeout(resolve, 4000)); // Wait for images to load

    console.log("Scroll, and now entering page")
    // Wait for the specific elements to ensure they are loaded

    try {
        // Try waiting up to 30 seconds
        await page.waitForSelector('#hero-image > div:nth-child(1) > img', { timeout: 10000 });
    } catch (err) {
        console.warn('Image not found within 30s, waiting an extra 5 seconds...');
        await page.waitForTimeout(5000); // extra wait without checking selector
    }

    const details = await page.evaluate((BRAND_NAME, CATEGORY_VALUE, GENDER) => {
        const brand = BRAND_NAME;
        const gender = GENDER;
        const category = CATEGORY_VALUE;

        // NIKE SNEAKERS SITE   
        const headline = document.querySelector('.product-info.ncss-col-sm-12.full.product-info-padding > h2')?.innerText.trim();
        const headlineSecond = document.querySelector('.product-info.ncss-col-sm-12.full.product-info-padding > h1')?.innerText.trim();
        // const name = `${headline} ${headlineSecond}`.trim();
        // const priceText = document.querySelector('[data-qa=price]')?.innerText.trim() || document.querySelector('.product-info.ncss-col-sm-12.full.product-info-padding > div')?.innerText.trim();
        // const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;
        // const descriptionElements = document.querySelector(".description-text.text-color-grey.mb9-sm > p")
        // const description = (descriptionElements)?.innerText.trim();

        const name = document.querySelector("[data-testid=\"product_title\"]")?.innerText.trim() || document.querySelector("#pdp_product_title")?.innerText.trim();
        const priceText = document.querySelector('[data-testid="currentPrice-container"]')?.innerText.trim() || document.querySelector('#price-container > span')?.innerText.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;

        const descriptionElements = document.querySelector('[data-testid="product-description"]')?.innerText.trim() || document.querySelector("#product-description-container > p")?.innerText.trim()
        const description = (descriptionElements)
        // const color = document.querySelector(".ProductColorSelection__product-color-selection__info-color--vURi1")?.innerText.trim();


        const imagesUrl = [];
        const imageNames = [];
        // /Get first Image,
        // console.log("getting image")

        // const onlyImage = document.querySelector("#main > div.lv-product > div > section > div.lv-product-page-header__primary > div > div > ul > li.-critical > div > div > picture > img");
        const sanitize = (str) =>
            String(str)
                .replace(/\s+/g, '-')   // Replace spaces with hyphens
                .replace(/[\/\\\[\]'":]/g, '') // Remove problematic chars
                .replace(/-+/g, '-');   // Collapse repeated dashes

        // const onlyImage = document.querySelector(".product-images > div:nth-child(1) > picture > img");

        // if (onlyImage) {
        //     const srcset = onlyImage.getAttribute('srcset');
        //     if (srcset) {
        //         const firstSrc = srcset.split(',')[4].trim().split(' ')[0]; // Get the first srcset URL
        //         imagesUrl.push(firstSrc);
        //         const imageName = `${sanitize(brand)}-${sanitize(name)}-0`;
        //         imageNames.push(imageName);
        //     } else {
        //         imagesUrl.push(onlyImage.src);
        //         const imageName = `${sanitize(brand)}-${sanitize(name)}-1`;
        //         imageNames.push(imageName);
        //     }
        // }
        const firstImage = document.querySelector("#hero-image > div:nth-child(1) > img");

        if (firstImage) {
            const srcset = firstImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[2].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${sanitize(brand)}-${sanitize(name)}-0`;
                imageNames.push(imageName);
            } else {
                imagesUrl.push(firstImage.src);
                const imageName = `${sanitize(brand)}-${sanitize(name)}-0`;
                imageNames.push(imageName);
            }
        }
        const secondImage = document.querySelector("#hero-image > div:nth-child(3) > img");
        if (secondImage) {
            const srcset = secondImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[2].trim().split(' ')[0]; // Get the first srcset URL
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

        const thirdImage = document.querySelector("#hero-image > div:nth-child(5) > img");
        if (thirdImage) {
            const srcset = thirdImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[2].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${sanitize(brand)}-${sanitize(name)}-2`;
                imageNames.push(imageName);
            }
            else {
                imagesUrl.push(thirdImage.src);
                const imageName = `${sanitize(brand)}-${sanitize(name)}-2`;
                imageNames.push(imageName);
            }
        }


        // const fourImage = document.querySelector("#hero-image > div:nth-child(6) > div > div > div > picture > img");
        // if (fourImage) {
        //     const srcset = fourImage.getAttribute('srcset');
        //     if (srcset) {
        //         const firstSrc = srcset.split(',')[2].trim().split(' ')[0]; // Get the first srcset URL
        //         imagesUrl.push(firstSrc);
        //         const imageName = `${sanitize(brand)}-${sanitize(name)}-2`;
        //         imageNames.push(imageName);
        //     }
        //     else {
        //         imagesUrl.push(fourImage.src);
        //         const imageName = `${sanitize(brand)}-${sanitize(name)}-2`;
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
            color: "",
            from: brand,
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
            await downloadImage(imageUrl, path.join(__dirname, 'nike', `${imageName}.jpg`));
        } catch (error) {
            console.error(`Failed to download image ${imageName} from ${imageUrl}:`, error);
        }
    }

    await browser.close();
    return details;
}

// ---- Helper: tolerant wait ----
async function waitForSelectorWithExtra(page, selector, baseMs = 30000, extraMs = 5000) {
    try {
        await page.waitForSelector(selector, { timeout: baseMs });
        return true; // found within base timeout
    } catch (e) {
        console.warn(`Selector ${selector} not found within ${baseMs}ms; waiting extra ${extraMs}ms and continuing...`);
        await page.waitForTimeout(extraMs); // just wait a bit more and continue
        return false; // not found, but we didn't throw
    }
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

function loadExisting() {
    if (!fs.existsSync(DATA_PATH)) return [];
    try {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')) || [];
    } catch {
        console.error('Failed to read existing JSON; starting with empty array.');
        return [];
    }
}

function mergeByUrl(baseArr, addArr) {
    const byUrl = new Map();
    for (const item of baseArr) if (item && item.url) byUrl.set(item.url, item);
    for (const item of addArr) if (item && item.url) byUrl.set(item.url, item); // new overwrites old
    return Array.from(byUrl.values());
}

function saveProgress(existing, results) {
    const merged = mergeByUrl(existing, results);
    // Atomic-ish write: write temp then rename
    fs.writeFileSync(DATA_PATH + '.tmp', JSON.stringify(merged, null, 2), 'utf-8');
    fs.renameSync(DATA_PATH + '.tmp', DATA_PATH);
    return merged; // return merged so caller can keep `existing` up to date
}
(async () => {
    const urls = [
        // 'https://www.off---white.com/en-gb/shopping/off-white-xray-denim-shorts-22102695',
        "https://www.nike.com/gb/t/air-jordan-5-retro-grape-shoes-qUtJBbwU/HQ7978-100",
        "https://www.nike.com/gb/t/air-jordan-12-retro-french-blue-shoes-yElRhxBT/CT8013-114",
        "https://www.nike.com/gb/t/air-max-plus-shoes-JZMlsj0s/IB7671-700",
        "https://www.nike.com/gb/t/air-max-plus-shoes-WWM1O4Lz/IH4458-001",
        "https://www.nike.com/gb/t/air-max-95-shoes-cbxu16ox/IB7683-001",
        "https://www.nike.com/gb/t/shox-ride-2-shoes-VMBVws/HV4447-010",
        "https://www.nike.com/gb/t/air-max-plus-3-shoes-2WxEl2Ed/IF6319-001",
        "https://www.nike.com/gb/t/air-jordan-1-high-og-rare-air-shoes-oSRhapAE/DZ5485-100",
        "https://www.nike.com/gb/t/air-max-tl-2-5-shoes-5tS7MV/FZ4110-002",
        "https://www.nike.com/gb/t/shox-ride-2-shoes-4zXvzP2v/II7635-001",
        "https://www.nike.com/gb/t/air-max-90-shoes-9gBgRX5l/IB6392-001",
        "https://www.nike.com/gb/u/custom-nike-air-max-90-shoes-by-you-10002041/4103055326",
        "https://www.nike.com/gb/t/clogposite-shoes-CoxofkPn/HJ4478-001",
        "https://www.nike.com/gb/t/p-6000-shoes-kkM7cNNT/IF6199-003",
        "https://www.nike.com/gb/t/p-6000-se-shoes-MurbK6lc/IB2986-002",
        "https://www.nike.com/gb/t/p-6000-denim-shoes-HvFifNLx/IH3646-499",
        "https://www.nike.com/gb/t/p-6000-shoes-OUU4WGqE/BV1021-109",
        "https://www.nike.com/gb/t/acg-rufus-shoes-8pTVF3/FV2923-400"
        // Add more URLs as needed
    ];
    console.log("calling app.js")

    let existingData = loadExisting();
    const results = [];

    // Emergency saver if something crashes outside our try/catch
    const emergencySave = (reason) => {
        try {
            existingData = saveProgress(existingData, results);
            console.error(`Emergency save after error: ${reason}`);
        } catch (e) {
            console.error('Emergency save failed:', e);
        }
    };
    process.on('unhandledRejection', emergencySave);
    process.on('uncaughtException', emergencySave);

    for (const url of urls) {
        try {
            const details = await getProductDetails(url);
            if (details) {
                results.push(details);
                console.log('Saved details for:', url);
                // Save after every successful scrape so you never lose more than one item
                existingData = saveProgress(existingData, results);
            }
        } catch (err) {
            console.error(`Error scraping ${url}:`, err?.message || err);
            // Save whatever we have so far, then continue to next URL
            existingData = saveProgress(existingData, results);
            // Optionally continue; do NOT rethrow
        }
    }

    // return;


    // Final save (noop if nothing new since last URL)
    existingData = saveProgress(existingData, results);
    console.log('Product details saved to nike.json');

    console.log('Product details saved to nike.json');
})();


// const debugInfo = imgElement ? {
//     srcset: imgElement.getAttribute('srcset'),
//     src: imgElement.getAttribute('src'),
//     dataSrc: imgElement.getAttribute('data-src')
// } : null;

// console.log(`imgElement for index ${index}:`, debugInfo);