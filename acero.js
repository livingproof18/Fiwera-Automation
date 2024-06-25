const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const BRAND_NAME = "ICECREAM X G-SHOCK";
const CATEGORY_VALUE = "Accessories";
const GENDER = "Mens & Womens";

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


    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for images to load

    // Scroll down to load all images
    await autoScroll(page);
    // console.log(window.innerHeight)
    // Custom wait function
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for images to load


    // Wait for the specific elements to ensure they are loaded
    // Cwith fugazi I have to keep chaning the image ids--- longgggg
    await page.waitForSelector('#Image-22079047893086-1400-0');
    // await page.waitForSelector('#ProductImage-36340024475820');

    const details = await page.evaluate((BRAND_NAME, CATEGORY_VALUE, GENDER) => {
        const brand = BRAND_NAME; const category = CATEGORY_VALUE; const gender = GENDER;


        const name = document.querySelector('.prd-Content_Title')?.innerText.trim();
        const priceText = document.querySelector('.prd-Price_Price.js-Product_Price > span')?.innerText.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;
        const descriptionElements = document.querySelector('prd-Content_ShortDesc');
        const description = (descriptionElements)?.innerText.trim();
        // const color = document.querySelector("#selected-option-1")?.innerText.trim()
        const color = ""
        console.log(name, 'name')
        console.log(price, 'price')
        console.log(description, 'description')
        console.log(color, 'color')



        const imagesUrl = [];
        const imageNames = [];

        // /Get first Image,


        const firstImage = document.querySelector("#Image-22079047893086-1400-0");
        if (firstImage) {
            const srcset = firstImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[5].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${brand.replace(/\s+/g, '-')}-${name.replace(/\s+/g, '-')}-0`;
                imageNames.push(imageName);
            }
        }
        const secondImage = document.querySelector("#Image-22079047958622-1400-0");
        if (secondImage) {
            const srcset = secondImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[5].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${brand.replace(/\s+/g, '-')}-${name.replace(/\s+/g, '-')}-1`;
                imageNames.push(imageName);
            }
        }
        const thirdImage = document.querySelector("#Image-22079047991390-1400-0");
        if (thirdImage) {
            const srcset = thirdImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[5].trim().split(' ')[0]; // Get the first srcset URL
                imagesUrl.push(firstSrc);
                const imageName = `${brand.replace(/\s+/g, '-')}-${name.replace(/\s+/g, '-')}-2`;
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
            color: color,
            from: 'bbcicecream',
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
        await downloadImage(imageUrl, path.join(__dirname, 'acero', `${imageName}.jpg`));
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
        'https://bbcicecream.eu/products/casio-g-shock-watch-pink'

        // Add more URLs as needed
    ];

    // Load existing data if available
    let existingData = [];
    if (fs.existsSync('acero_details.json')) {
        const rawData = fs.readFileSync('acero_details.json');
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

    // Append new results to existing data
    const updatedData = existingData.concat(results);

    fs.writeFileSync('acero_details.json', JSON.stringify(updatedData, null, 2), 'utf-8');
    console.log('Product details saved to acero_details.json');
})();


// const debugInfo = imgElement ? {
//     srcset: imgElement.getAttribute('srcset'),
//     src: imgElement.getAttribute('src'),
//     dataSrc: imgElement.getAttribute('data-src')
// } : null;

// console.log(`imgElement for index ${index}:`, debugInfo);