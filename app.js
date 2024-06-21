const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const BRAND_NAME = "Louis Vuitton";
const CATEGORY_VALUE = "Jacket";
const GENDER = "Mens";

async function getProductDetails(url) {
    console.log("getProductDetails " + url);
    const browser = await puppeteer.launch({
        headless: false,
        // headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();

    // Set viewport to desired width and height
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(url, { waitUntil: 'networkidle2' });

    // Handle cookie modal
    // try {
    //     await page.waitForSelector('#ucm-details > div.ucm-popin.ucm-popin--pushpop.ucm-popin--active > div', { timeout: 5000 }); // Change selector to match the actual cookie modal
    //     await page.click('#ucm-details > div.ucm-popin.ucm-popin--pushpop.ucm-popin--active > div > form > ul > li:nth-child(3) > button'); // Change selector to match the actual accept button
    // } catch (error) {
    //     console.log('No cookie modal found or failed to accept cookies:', error);
    // }
    // // Change country modal

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for images to load


    // Scroll down to load all images
    await autoScroll(page);
    // Custom wait function
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for images to load

    console.log("Scroll, and now entering page")

    // Wait for the specific elements to ensure they are loaded
    // Cwith fugazi I have to keep chaning the image ids--- longgggg
    await page.waitForSelector('#main > div.lv-product > div > section > div.lv-product-page-header__primary > div > div > ul > li:nth-child(2) > div > div > picture > img');
    // await page.waitForSelector('#ProductImage-36340024475820');

    const details = await page.evaluate((BRAND_NAME, CATEGORY_VALUE, GENDER) => {
        const brand = BRAND_NAME;
        const name = document.querySelector(".lv-product__name")?.innerText.trim();

        const category = CATEGORY_VALUE;
        const priceText = document.querySelector('.lv-product__price > span')?.innerText.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;
        const gender = GENDER;
        const description = document.querySelector("#main > div.lv-product > section > div.lv-product-seo-details > p")?.innerText.trim();
        const color = document.querySelector("#main > div.lv-product > section > div.lv-product-seo-details > div > div > div > ul:nth-child(1) > li:nth-child(2)")?.innerText.trim();

        const imagesUrl = [];
        const imageNames = [];
        // /Get first Image,
        // console.log("getting image")

        const onlyImage = document.querySelector("#image-container4 > div > picture > img");

        if (onlyImage) {
            const srcset = onlyImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[4].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${brand.replace(/\s+/g, '-')}-${name.replace(/\s+/g, '-')}-0`;
                imageNames.push(imageName);
            } else {
                imagesUrl.push(onlyImage.src);
                const imageName = `${brand.replace(/\s+/g, '-')}-${name.replace(/\s+/g, '-')}-0`;
                imageNames.push(imageName);
            }
        }
        // const secondImage = document.querySelector("#owl-carousel-gallery > div.owl-stage-outer > div > div:nth-child(2) > div > a > img");
        // if (secondImage) {
        //     const srcset = secondImage.getAttribute('srcset');
        //     if (srcset) {
        //         const firstSrc = srcset.split(',')[7].trim().split(' ')[0]; // Get the first srcset URL
        //         imagesUrl.push(firstSrc);
        //         const imageName = `${brand.replace(/\s+/g, '-')}-${name.replace(/\s+/g, '-')}-1`;
        //         imageNames.push(imageName);
        //     }
        //     else {
        //         imagesUrl.push(secondImage.src);
        //         const imageName = `${brand.replace(/\s+/g, '-')}-${name.replace(/\s+/g, '-')}-1`;
        //         imageNames.push(imageName);
        //     }
        // }
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
            from: brand,
            info: '',
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
        'https://uk.louisvuitton.com/eng-gb/products/leather-blouson-nvprod4920020v/1AFAJW',
        'https://uk.louisvuitton.com/eng-gb/products/monogram-printed-denim-shorts-nvprod5460015v/1AFQFD',
        'https://uk.louisvuitton.com/eng-gb/products/embroidered-denim-blouson-nvprod4920008v/1AF774',
        'https://uk.louisvuitton.com/eng-gb/products/mix-leather-varsity-blouson-nvprod4940204v/1AFIQA'
        // 'https://uk.louisvuitton.com/eng-gb/products/monogram-printed-denim-shorts-nvprod5460015v/1AFQFD'
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