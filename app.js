const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const BRAND_NAME = "Fugazi";
const CATEGORY_VALUE = "JACKET";
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



    // Scroll down to load all images
    await autoScroll(page);
    // console.log(window.innerHeight)
    // Custom wait function
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for images to load


    // Wait for the specific elements to ensure they are loaded
    // Cwith fugazi I have to keep chaning the image ids--- longgggg
    await page.waitForSelector('#ProductImage-36340024541356');
    await page.waitForSelector('#ProductImage-36340024475820');

    const details = await page.evaluate((BRAND_NAME, CATEGORY_VALUE, GENDER) => {
        const brand = "Fugazi";
        const name = document.querySelector('.product-single__title')?.innerText.trim();
        const category = CATEGORY_VALUE;
        const priceText = document.querySelector('#ProductPrice > span > span')?.innerText.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;
        const gender = GENDER;
        const description = document.querySelector('#apd-root > section.apd-tab.apd-content.apd-active > p')?.innerText.trim();

        // const description = Array.from(descriptionElements).map(el => el.innerText.trim()).join(' ');
        const color = "";
        const imagesUrl = [];
        const imageNames = [];

        // /Get first Image,

        const firstImage = document.querySelector("#ProductImage-36340024541356");
        if (firstImage) {
            const srcset = firstImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[4].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${brand.replace(/\s+/g, '-')}-${name.replace(/\s+/g, '-')}-0`;
                imageNames.push(imageName);
            }
        }
        const secondImage = document.querySelector("#ProductImage-36340024475820");
        if (secondImage) {
            const srcset = secondImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[4].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${brand.replace(/\s+/g, '-')}-${name.replace(/\s+/g, '-')}-1`;
                imageNames.push(imageName);
            }
        }
        // const indices = [0, 6];
        // indices.forEach((index, i) => {
        //     const imgElement = document.querySelector(`li[data-index="${index}"] img`);
        //     if (imgElement) {
        //         const srcset = imgElement.getAttribute('srcset');
        //         if (srcset) {
        //             const firstSrc = srcset.split(',')[4].trim().split(' ')[0]; // Get the first srcset URL
        //             imagesUrl.push(firstSrc);
        //             const imageName = `${brand.replace(/\s+/g, '-')}-${name.replace(/\s+/g, '-')}${i}`;
        //             imageNames.push(imageName);
        //         }
        //     }
        // });

        return {
            Brand: brand,
            name: name,
            category: category,
            id: '',
            code: '',
            url: window.location.href,
            Price: price,
            currency: 'USD',
            gender: gender,
            description: description,
            color: color,
            from: brand,
            info: '',
            'image': imageNames,
            'imagesUrl': imagesUrl,
            // Debug: {
            //     'imgElement for index 0': document.querySelector('li[data-index="0"] img') ? document.querySelector('li[data-index="0"] img').getAttribute('srcset') : null,
            //     'imgElement for index 4': document.querySelector('li[data-index="4"] img') ? document.querySelector('li[data-index="4"] img').getAttribute('srcset') : null
            // }
        };
    }, BRAND_NAME, CATEGORY_VALUE, GENDER);
    console.log(details.Debug);  // Log the intermediate results

    // Download images
    for (let i = 0; i < details.image.length; i++) {
        const imageUrl = details.imagesUrl[i];
        const imageName = details.image[i];
        await downloadImage(imageUrl, path.join(__dirname, 'clothing', `${imageName}.jpg`));
    }


    await browser.close();
    return details;
}
// Function to download image
async function downloadImage(url, filepath) {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
        response.data.pipe(fs.createWriteStream(filepath))
            .on('error', reject)
            .on('close', resolve);
    });
}


// Function to auto-scroll the page
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            let totalHeight = 0;
            const distance = 3000; // Increase the scroll distance
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight - window.innerHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 300);
        });
    });
}

(async () => {
    const urls = [
        // 'https://www.haven-court.com/collections/mens-jackets/products/black-raw-type-ii-jacket',
        // 'https://fugazi.net/en-gb/collections/all/products/lab-overshirt?variant=42930809438380',
        // 'https://fugazi.net/en-gb/products/chain-splatter-jacket-light-washed?variant=42724172267692',
        // 'https://fugazi.net/en-gb/products/caddie-overshirt?variant=42930809241772'
        // 'https://fugazi.net/en-gb/collections/all/products/face-quad-zip-hoodie?variant=43085076136108'
        // 'https://fugazi.net/en-gb/products/chain-stitch-map-pants-black?variant=42930812616876'
        'https://fugazi.net/en-gb/collections/all/products/rogue-denim-jacket?variant=43085075873964',

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