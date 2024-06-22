const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const BRAND_NAME = "Kenzo";
const CATEGORY_VALUE = "TOP";
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

    // // Handle cookie modal
    // try {
    //     await page.waitForSelector('#onetrust-banner-sdk > div', { timeout: 5000 }); // Change selector to match the actual cookie modal
    //     await page.click('#onetrust-accept-btn-handler'); // Change selector to match the actual accept button
    // } catch (error) {
    //     console.log('No cookie modal found or failed to accept cookies:', error);
    // }
    // Change country modal
    // Handle change country modal
    // try {
    //     await page.waitForSelector('#modalContent', { timeout: 5000 });
    //     await page.click('#modalContent > div.lv-localize-modal__other-wrapper > button');
    // } catch (error) {
    //     console.log('No region modal found or failed to accept region selection:', error);
    // }


    // Scroll down to load all images
    await autoScroll(page);
    // Custom wait function
    await new Promise(resolve => setTimeout(resolve, 4000)); // Wait for images to load

    console.log("Scroll, and now entering page")
    // Wait for the specific elements to ensure they are loaded
    // Cwith fugazi I have to keep chaning the image ids--- longgggg
    await page.waitForSelector('#maincontent > div.pdp-container.product-detail > div.swiper > div.swiper-wrapper.zoom-wrapper > picture:nth-child(1) > img');
    // await page.waitForSelector('#ProductImage-36340024475820');

    const details = await page.evaluate((BRAND_NAME, CATEGORY_VALUE, GENDER) => {
        const brand = BRAND_NAME;
        const nameElement = document.querySelector("#maincontent > div.pdp-container.product-detail > div:nth-child(3) > div > div:nth-child(2) > div.title > h1");
        const name = nameElement ? nameElement.innerText.trim() : null;

        const category = CATEGORY_VALUE;
        const priceText = document.querySelector("#maincontent > div.pdp-container.product-detail > div:nth-child(3) > div > div:nth-child(2) > div.t-big.mt-4 > div > span")?.innerText.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;
        const gender = GENDER;
        const descriptionElement = document.querySelector("#product-description-panel > div");
        const description = descriptionElement ? descriptionElement.innerText.trim() : null;
        // const description = '';
        // const color = document.querySelector("#product-description-container > div.Product > div.Product__hero.flex.flex-col.md\\:flex-row > div.Product__hero-description-container.relative.flex.items-start.md\\:items-center > div.none.md\\:block.absolute.b0.l0.r0.z1 > div > div.relative.z1 > div > div > div > a.ProductVariantDrawers__color-swatch-wrapper.is-active > span")?.innerText.trim();
        const colorElement = document.querySelector("#maincontent > div.pdp-container.product-detail > div:nth-child(3) > div > div:nth-child(3) > div:nth-child(1) > div.title.t-body.lh-17 > span.info.t-capitalize");
        const color = colorElement ? colorElement.innerText.trim() : null;

        const imagesUrl = [];
        const imageNames = [];
        // /Get first Image,
        // console.log("getting image")

        const firstImage = document.querySelector("#maincontent > div.pdp-container.product-detail > div.swiper > div.swiper-wrapper.zoom-wrapper > picture:nth-child(1) > img")

        if (firstImage) {
            const srcset = firstImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[3].trim().split(' ')[0]; // Get the first srcset URL
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
        const secondImage = document.querySelector("#maincontent > div.pdp-container.product-detail > div.swiper > div.swiper-wrapper.zoom-wrapper > picture:nth-child(2) > img");
        if (secondImage) {
            const srcset = secondImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[3].trim().split(' ')[0]; // Get the first srcset URL
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
        // const thirdImage = document.querySelector("#slider > div > div > div > div:nth-child(2) > div > div > img");
        // if (thirdImage) {
        //     const srcset = thirdImage.getAttribute('srcset');
        //     if (srcset) {
        //         const firstSrc = srcset.split(',')[7].trim().split(' ')[0]; // Get the first srcset URL
        //         imagesUrl.push(firstSrc);
        //         const imageName = `${brand.replace(/\s+/g, '-')}-${name.replace(/\s+/g, '-')}-1`;
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
            from: 'kenzo',
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
        // 'https://www.kenzo.com/en-gb/kenzo-orange-hawaiian-shirt/FE55CH1119LO.64.html',
        // 'https://www.kenzo.com/en-gb/kenzo-by-verdy-sleeveless-jumper/FE55PU4583CB.77.html',
        // 'https://www.kenzo.com/en-gb/kenzo-fruit-stickers-waistcoat/FE55PU0103BH.02.html',
        'https://www.kenzo.com/en-gb/boke-flower-embroidered-sleeveless--wool-jumper/FE65PU4863LC.11.html',
        'https://www.kenzo.com/en-gb/kenzo-constellation-hawaiian-shirt/FE65CH1199LI.01.html',
        'https://www.kenzo.com/en-gb/kenzo-drawn-varsity-embroidered-genderless-jumper/FE58PU0063BF.02.html',
        'https://www.kenzo.com/en-gb/boke-flower-trucker-jacket-in-japanese-denim/FE65DV3016C1.BM.html',
        'https://www.kenzo.com/en-gb/kenzo-constellation-embroidered-kimono-in-japanese-denim/FE65DV1426A1.DM.html',
        'https://www.kenzo.com/en-gb/kenzo-by-verdy-cropped-jacket/FE55BL1659OX.12.html',
        'https://www.kenzo.com/en-gb/kenzo-by-verdy-genderless-motorcycle-jacket/FE58LB1420AA.99J.html',
        'https://www.kenzo.com/en-gb/kenzo-by-verdy-genderless-varsity-jacket/FE58BL1459OH.51.html',
        'https://www.kenzo.com/en-gb/kenzo-constellation-embroidered-zipped-hoodie/FE65SW2294MG.99J.html'

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