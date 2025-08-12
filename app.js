const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const BRAND_NAME = "Nike";
const CATEGORY_VALUE = "SNEAKERS";
const GENDER = "ALL";

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

    await page.waitForSelector('#hero-image > div.hero-image.selected.css-2qo0n7 > div > div > div > picture > img');

    const details = await page.evaluate((BRAND_NAME, CATEGORY_VALUE, GENDER) => {
        const brand = BRAND_NAME;
        const gender = GENDER;
        const category = CATEGORY_VALUE;


        const headline = document.querySelector('.product-info.ncss-col-sm-12.full.product-info-padding > h2')?.innerText.trim();
        const headlineSecond = document.querySelector('.product-info.ncss-col-sm-12.full.product-info-padding > h1')?.innerText.trim();
        const name = `${headline} ${headlineSecond}`.trim();
        const priceText = document.querySelector('[data-qa=price]')?.innerText.trim() || document.querySelector('.product-info.ncss-col-sm-12.full.product-info-padding > div')?.innerText.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;
        const descriptionElements = document.querySelector(".description-text.text-color-grey.mb9-sm > p")
        const description = (descriptionElements)?.innerText.trim();
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
        const firstImage = document.querySelector("#hero-image > div.hero-image.selected.css-2qo0n7 > div > div > div > picture > img");

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
        const secondImage = document.querySelector("#hero-image > div:nth-child(3) > div > div > div > picture > img");
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

        const thirdImage = document.querySelector("#hero-image > div:nth-child(4) > div > div > div > picture > img");
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


        const fourImage = document.querySelector("#hero-image > div:nth-child(6) > div > div > div > picture > img");
        if (fourImage) {
            const srcset = fourImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[2].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${sanitize(brand)}-${sanitize(name)}-2`;
                imageNames.push(imageName);
            }
            else {
                imagesUrl.push(fourImage.src);
                const imageName = `${sanitize(brand)}-${sanitize(name)}-2`;
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

        // 'https://www.off---white.com/en-gb/shopping/off-white-xray-denim-shorts-22102695',
        "https://www.nike.com/gb/launch/t/air-jordan-4-rare-air-emea",
        "https://www.nike.com/gb/launch/t/shox-ride-2-black-and-cargo-khaki",
        "https://www.nike.com/gb/launch/t/shox-ride-2-metallic-silver-and-desert-khaki"


        // Add more URLs as needed
    ];
    console.log("calling app.js")

    // Load existing data if available
    let existingData = [];
    if (fs.existsSync('nike.json')) {
        const rawData = fs.readFileSync('nike.json');
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

    fs.writeFileSync('nike.json', JSON.stringify(updatedData, null, 2), 'utf-8');
    console.log('Product details saved to nike.json');
})();


// const debugInfo = imgElement ? {
//     srcset: imgElement.getAttribute('srcset'),
//     src: imgElement.getAttribute('src'),
//     dataSrc: imgElement.getAttribute('data-src')
// } : null;

// console.log(`imgElement for index ${index}:`, debugInfo);