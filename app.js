const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const BRAND_NAME = "StockX";
const CATEGORY_VALUE = "ACCESSORIES";
const GENDER = "All";

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
    await page.waitForSelector('#main-content > div > section.css-58l4sv > div > div.css-102uabd > div > div > div > div > img');


    const details = await page.evaluate(async (BRAND_NAME, CATEGORY_VALUE, GENDER) => {
        const brand = BRAND_NAME;
        const name = document.querySelector("#main-content > div > section.css-58l4sv > div > div.css-hfp9tp > div > div > h1")?.innerText.trim();

        const category = CATEGORY_VALUE;
        const gender = GENDER;

        let priceText = document.querySelector('#main-content > div > section.css-58l4sv > div > div.css-1dwax6t > div > div.css-1y6ibuq > div.css-13azw4r > div > div > p')?.innerText.trim() || null; //last sale price
        if (!priceText) {
            priceText = document.querySelector('#main-content > div > section.css-58l4sv > div > div.css-1dwax6t > div > div.css-1y6ibuq > div.css-0 > div.css-1s0m9m0 > div.css-0 > h2')?.innerText.trim(); //buy now price, to be use only if last sale price not found

        }
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;


        let description = document.querySelector("#main-content > div > section:nth-child(5) > div > div:nth-child(1) > div > div > div.css-13qkkpi > div > div > p")?.innerText.trim() || null;
        if (!description) {
            description = document.querySelector("div.css-13qkkpi > p")?.innerText.trim() || null;
        }
        const color = document.querySelector("#main-content > div > section.css-58l4sv > div > div.css-hfp9tp > div > div > h1 > span")?.innerText.trim() || null;


        const imagesUrl = [];
        const imageNames = [];

        function findFirstImage(root = document) {
            const selectors = [
                // Be as general as you can while still specific enough
                '#main-content section.css-58l4sv img',
                // Any tab panel image whose ID follows the "tabs-<something>--tabpanel-0" pattern
                '[id^="tabs-"][id$="--tabpanel-0"] img',
                // Add other stable, structure-based selectors here if needed
                '#main-content img'
            ];

            for (const sel of selectors) {
                const img = root.querySelector(sel);
                if (img) return img;
            }

            console.warn('First image not found');
            return null;
        }

        async function waitForFirstImage(timeoutMs = 1000, root = document) {
            const found = findFirstImage(root);
            if (found) return found;

            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    observer.disconnect();
                    resolve(null);
                }, timeoutMs);

                const observer = new MutationObserver(() => {
                    const img = findFirstImage(root);
                    if (img) {
                        clearTimeout(timeout);
                        observer.disconnect();
                        resolve(img);
                    }
                });

                observer.observe(root, { childList: true, subtree: true });
            });
        }

        // usage
        const firstImage = await waitForFirstImage();



        // let firstImage = document.querySelector("#main-content > div > section.css-58l4sv > div > div.css-102uabd > div > div > div > div > img");
        // if (!firstImage) {
        //     console.error("First image not found");
        //     // return null; // Return null if the first image is not found
        //     firstImage = document.querySelector("#tabs-«r6»--tabpanel-0 > div > div > img")

        //     if (!firstImage) {
        //         firstImage = document.querySelector("#tabs-«ra»--tabpanel-0 > div > div > img")
        //     }
        //     if (!firstImage) {
        //         firstImage = document.querySelector("#tabs-«r1p»--tabpanel-0 > div > div > img")
        //     }
        //     if (!firstImage) {
        //         firstImage = document.querySelector("#tabs-«r1p»--tabpanel-0 > div > div > img")
        //     }
        // }
        // if (!firstImage) {
        //     firstImage = document.querySelector("#tabs-«r9»--tabpanel-0 > div > div > img")
        // }

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
        // const secondImage = document.querySelector("#ProductSection > div > div:nth-child(1) > div.flexslider.product-gallery-slider > div > ul > li:nth-child(2) > a > img");
        // if (secondImage) {
        //     const srcset = secondImage.getAttribute('srcset');
        //     if (srcset) {
        //         const firstSrc = srcset.split(',')[8].trim().split(' ')[0]; // Get the first srcset URL
        //         imagesUrl.push(firstSrc);
        //         const imageName = `${sanitize(brand)}-${sanitize(name)}-1`;
        //         imageNames.push(imageName);
        //     }
        //     else {
        //         imagesUrl.push(secondImage.src);
        //         const imageName = `${sanitize(brand)}-${sanitize(name)}-1`;
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
            from: 'stockx',
            info: 'Reseller Price',
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
            await downloadImage(imageUrl, path.join(__dirname, 'stockx', `${imageName}.jpg`));
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
        "https://stockx.com/apple-airpods-pro-2nd-gen-2023-magsafe-case-usb-c-mtjv3am-a",
        "https://stockx.com/beats-by-dr-dre-solo3-wireless-headphones-mx442ll-a-rose-gold",
        "https://stockx.com/beats-by-dr-dre-solo-3-wireless-on-ear-headphones-mx472ll-a-product-red",
        "https://stockx.com/ray-ban-meta-wayfarer-limited-edition-rw4006-transparent-blue",
        "https://stockx.com/pop-mart-the-monsters-big-into-energy-series-wireless-charger",
        "https://stockx.com/supreme-blu-burner-phone-red",
        "https://stockx.com/pop-mart-labubu-the-monsters-big-into-energy-series-id-secret-version-vinyl-plush-pendant",
        "https://stockx.com/pop-mart-labubu-time-to-chill-vinyl-plush-doll",
        "https://stockx.com/pop-mart-labubu-the-monsters-have-a-seat-duoduo-vinyl-plush",
        "https://stockx.com/bearbrick-star-wars-the-mandalorian-1000-chrome#main-content",
        "https://stockx.com/bearbrick-x-care-bears-love-a-lot-bear-tm-400",
        "https://stockx.com/bearbrick-x-fragment-design-karimoku-haroshi-vertical-carved-wooden-2g-exclusive-400",
        "https://stockx.com/bearbrick-x-fifa-world-cup-qatar-2022-1000-gold",
        "https://stockx.com/kaws-star-wars-storm-trooper-companion-vinyl-figure-white",
        "https://stockx.com/apple-airpods-max-2024-mww43am-a-midnight",
        "https://stockx.com/apple-airpods-max-2024-mww63am-a-blue",
        "https://stockx.com/supreme-koss-portapro-headphones-silver",

        "https://stockx.com/supreme-koss-portapro-headphones-white",
        "https://stockx.com/bose-headphones-700-wireless-noise-cancelling-over-the-ear-headphones-794297-0300-luxe-silver",
        "https://stockx.com/sony-wireless-noise-cancelling-over-the-ear-headphones-wh1000xm4-s-silver",
        "https://stockx.com/sony-wireless-noise-cancelling-over-the-ear-headphones-wh1000xm4-b-black",
        "https://stockx.com/apple-beats-solo-pro-wireless-noise-cancelling-headphones-mrj72ll-a-ivory",
        "https://stockx.com/beats-x-stussy-studio-pro-headphones",

        // "https://www.crtz.xyz/collections/tops-jerseys/products/open-mesh-panel-jersey-2",
        // Add more URLs as needed
    ];
    console.log("calling app.js")

    // Load existing data if available
    let existingData = [];
    if (fs.existsSync('stockx.json')) {
        const rawData = fs.readFileSync('stockx.json');
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

    fs.writeFileSync('stockx.json', JSON.stringify(updatedData, null, 2), 'utf-8');
    console.log('Product details saved to stockx.json');
})();


// const debugInfo = imgElement ? {
//     srcset: imgElement.getAttribute('srcset'),
//     src: imgElement.getAttribute('src'),
//     dataSrc: imgElement.getAttribute('data-src')
// } : null;

// console.log(`imgElement for index ${index}:`, debugInfo);