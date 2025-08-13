const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BRAND_NAME = "Meaculpa";
const DATA_PATH = 'meaculpa.json';

// ========= Inference helpers =========

// 1) Fast inference from URL path pieces.
function inferFromUrl(url) {
    const lower = url.toLowerCase();

    // Category heuristics – extend as needed
    const categoryMap = [
        [/\/earbuds\//, 'Tech Accessories'],
        [/\/eyewear\//, 'Eyewear'],
        [/\/accessories\//, 'ACCESSORIES'],
        [/\/wallets\//, 'Wallets'],
        [/\/belts\//, 'Belts'],
        [/\/watches\//, 'Watches'],
        [/\/necklaces\//, 'Jewellery'],
        [/\/rings?\//, 'Jewellery'],

        [/\/sneakers?\//, 'Sneakers'],
        [/\/boots?\//, 'Boots'],
        [/\/lace-ups-and-clogs\//, 'Mules & Clogs'],

        [/\/outerwear.*jackets\//, 'JACKET'],
        [/\/jeans?\//, 'BOTTOM'],
        [/\/t-shirts?\//, 'TOP'],
        [/\/shirts?\//, 'TOP'],
        [/\/hoodies?\//, 'HOODIE'],
    ];

    let category = null;
    for (const [re, cat] of categoryMap) {
        if (re.test(lower)) { category = cat; break; }
    }

    // Gender heuristics – many Diesel URLs won’t include gender; default to ALL.
    // If you have men/women in paths (e.g., /men/ or /women/), capture here:
    let gender = null;
    if (/\bmen\b|\bman\b/.test(lower)) gender = 'MEN';
    else if (/\bwomen\b|\bwom(e)?n\b/.test(lower)) gender = 'WOMEN';
    else gender = 'ALL';

    return { category, gender };
}

// 2) Slower, on-page inference (breadcrumbs / JSON-LD)
async function inferFromDom(page) {
    // Try breadcrumbs first
    const crumbs = await page.$$eval('nav[aria-label="breadcrumb"] a, .Breadcrumbs a, nav.breadcrumb a',
        els => els.map(a => (a.textContent || '').trim().toLowerCase())).catch(() => []);

    let category = null;
    const cands = ['accessories', 'footwear', 'shoes', 'sneakers', 'boots', 'clothing', 'outerwear', 'jackets', 'jeans', 't-shirts', 'shirts', 'hoodies', 'rings', 'necklaces', 'belts', 'wallets', 'watches', 'eyewear', 'earbuds'];
    for (const c of cands) {
        if (crumbs.some(t => t.includes(c))) {
            // map breadcrumb token to our normalized categories
            if (['shoes', 'sneakers', 'boots', 'footwear'].some(x => c.includes(x))) category = 'FOOTWEAR';
            else if (['outerwear', 'jackets', 'jeans', 't-shirts', 'shirts', 'hoodies', 'clothing'].some(x => c.includes(x))) category = 'CLOTHING';
            else category = 'ACCESSORIES';
            break;
        }
    }

    // Try JSON-LD <script type="application/ld+json"> for gender/category hints
    let gender = null;
    try {
        const ldjsons = await page.$$eval('script[type="application/ld+json"]', nodes => nodes.map(n => n.textContent || ''));
        for (const txt of ldjsons) {
            try {
                const data = JSON.parse(txt);
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    // Gender sometimes appears in Product or Offer metadata
                    const g = item.gender || item.audience?.suggestedGender || item.audience?.gender;
                    if (g) {
                        const s = String(g).toLowerCase();
                        if (s.includes('female') || s.includes('women')) { gender = 'WOMEN'; break; }
                        if (s.includes('male') || s.includes('men')) { gender = 'MEN'; break; }
                    }
                    // Occasionally category may appear
                    const cat = item.category || item.itemCategory;
                    if (!category && cat) {
                        const cl = String(cat).toLowerCase();
                        if (/(shoe|sneaker|boot|footwear)/.test(cl)) category = 'FOOTWEAR';
                        else if (/(outerwear|jacket|jean|t-shirt|shirt|hoodie|clothing|apparel)/.test(cl)) category = 'CLOTHING';
                        else if (/(accessor|belt|wallet|watch|ring|necklace|eyewear|sunglass|earbud)/.test(cl)) category = 'ACCESSORIES';
                    }
                }
                if (gender && category) break;
            } catch {/* ignore bad JSON */ }
        }
    } catch {/* ignore */ }

    if (!gender) gender = 'ALL';
    return { category, gender };
}

// Normalize urls array: accept strings or {url, category, gender}
function normalizeUrlTasks(urls) {
    return urls.map(u => (typeof u === 'string' ? { url: u } : u));
}

// ========= Core scraping =========

async function getProductDetails(task) {
    const { url } = task;
    const browser = await puppeteer.launch({
        headless: false,
        // headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--enable-http2', '--disable-web-security'],
        ignoreHTTPSErrors: true
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log("getProductDetails " + url);
    await page.goto(url, { waitUntil: 'networkidle2' });

    await autoScroll(page);
    await new Promise(resolve => setTimeout(resolve, 4000)); // Wait for images to load

    // Tolerant wait (your helper below also exists)
    try {
        // Try waiting up to 30 seconds
        await page.waitForSelector('#Slider-Gallery-template--18890165616798__main', { timeout: 10000 });
    } catch (err) {
        console.warn('Image not found within 30s, waiting an extra 5 seconds...');
        await page.waitForTimeout(5000); // extra wait without checking selector
    }
    // Determine category/gender for THIS url
    // 1) start with provided overrides
    let category = task.category || null;
    let gender = task.gender || null;

    // 2) if missing, infer from URL
    if (!category || !gender) {
        const fromUrl = inferFromUrl(url);
        category = category || fromUrl.category;
        gender = gender || fromUrl.gender;
    }

    // // 3) if still missing, infer from DOM
    // if (!category || !gender) {
    //     const fromDom = await inferFromDom(page);
    //     category = category || fromDom.category;
    //     gender = gender || fromDom.gender;
    // }




    // Final fallbacks
    if (!category) category = 'ACCESSORIES';
    if (!gender) gender = 'ALL';

    const details = await page.evaluate((BRAND_NAME, category, gender) => {
        const brand = BRAND_NAME;
        const name = document.querySelector("#xtitle")?.innerText.trim();
        console.log(name);
        // var name;
        const priceText = document.querySelector('#price-template--18890165616798__main > div > div > div.price__regular > span')?.innerText.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;
        console.log(priceText, price);
        const selectedSwatch = document.querySelector('.swatch-view-item[aria-checked="true"]');
        const swatchValue = selectedSwatch.getAttribute('orig-value');
        console.log(swatchValue);

        const color = swatchValue || '';

        // const imageName = `${sanitize(brand)}-${sanitize(name)}-${color}-0`;

        // const description = document.querySelector("#main > div.lv-product > section > div.lv-product-seo-details > p")?.innerText.trim();

        const imagesUrl = [];
        const imageNames = [];

        const sanitize = (str) =>
            String(str)
                .replace(/\s+/g, '-')            // Replace spaces with hyphens
                .replace(/[:\/\\\[\]'"]/g, '')   // Remove colon and other problematic chars
                .replace(/&/g, 'and')            // Optional: replace & with 'and'
                .replace(/-+/g, '-');            // Collapse repeated dashes


        // const cell = document.querySelector("#Slider-Gallery-template--18890165616798__main").firstChild;
        // const img = cell.querySelector("img");
        // const imgSrc = img ? img.src : null; // Get the src attribute, if img exists
        // console.log(imgSrc);

        function getImageNameFromUrl(url) {
            const regex = /\/([^\/]+?)(?=\.\w+$)/; // Matches the image name before the extension
            const match = url.match(regex);
            return match ? match[1] : null;
        }

        const firstImageCell = document.querySelector("#Slider-Gallery-template--18890165616798__main");
        const firstImage = firstImageCell.querySelector("img");

        // const secondImage = document.querySelector("#swiperCarousel-items > div.swiper-slide.product-slide.swiper-slide-prev > picture > img");
        // const thirdImage = document.querySelector("#swiperCarousel-items > div.swiper-slide.product-slide.swiper-slide-next > picture > img");
        var ImageNameFromUrl;
        if (firstImage) {
            const srcset = firstImage.getAttribute('srcset');
            if (srcset) {
                const firstSrc = srcset.split(',')[6].trim().split(' ')[0]; // Get the first srcset URL
                // ImageNameFromUrl = getImageNameFromUrl(firstSrc);
                imagesUrl.push(firstSrc);
                const imageName = `${sanitize(name)}-${color}-0`;
                console.log(imageName);
                imageNames.push(imageName);
            } else {
                imagesUrl.push(firstImage.src);
                // ImageNameFromUrl = getImageNameFromUrl(firstImage.src);
                const imageName = `${sanitize(name)}-${color}-0`;
                imageNames.push(imageName);
            }
        }


        // const secondImage = document.querySelector("#swiperCarousel-items > div.swiper-slide.product-slide.swiper-slide-prev > picture > img");
        // if (secondImage) {
        //     const srcset = secondImage.getAttribute('srcset');
        //     if (srcset) {
        //         const firstSrc = srcset.split(',')[2].trim().split(' ')[0]; // Get the first srcset URL
        //         imagesUrl.push(firstSrc);
        //         const imageName = `${sanitize(brand)}-${sanitize(name)}-${color}-1`;
        //         imageNames.push(imageName);
        //     }
        //     else {
        //         imagesUrl.push(secondImage.src);
        //         const imageName = `${sanitize(brand)}-${sanitize(name)}-${color}-1`;
        //         imageNames.push(imageName);
        //     }
        // }

        // const thirdImage = document.querySelector("#swiperCarousel-items > div.swiper-slide.product-slide.swiper-slide-next > picture > img");
        // if (thirdImage) {
        //     const srcset = thirdImage.getAttribute('srcset');
        //     if (srcset) {
        //         const firstSrc = srcset.split(',')[2].trim().split(' ')[0]; // Get the first srcset URL
        //         imagesUrl.push(firstSrc);
        //         const imageName = `${sanitize(brand)}-${sanitize(name)}-${color}-2`;
        //         imageNames.push(imageName);
        //     }
        //     else {
        //         imagesUrl.push(thirdImage.src);
        //         const imageName = `${sanitize(brand)}-${sanitize(name)}-${color}-2`;
        //         imageNames.push(imageName);
        //     }
        // }

        return {
            Brand: brand,
            name: name + " " + color,
            category,
            id: '',
            code: '',
            url: window.location.href,
            Price: price,
            currency: 'GBP',
            gender,
            description: "",
            color,
            from: 'meaculpa',
            info: 'Retail Price',
            image: imageNames,
            imagesUrl
        };
    }, BRAND_NAME, category, gender);

    console.log('Product details:', details);
    // Download images
    for (let i = 0; i < details.image.length; i++) {
        const imageUrl = details.imagesUrl[i];
        const imageName = details.image[i];
        try {
            console.log(`Downloading image ${imageName} from ${imageUrl}`);
            await downloadImage(imageUrl, path.join(__dirname, 'meaculpa', `${imageName}.jpg`));
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
        await new Promise((resolve) => {
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

        { url: "https://meaculpa.us/products/fun-day-beanie?variant=43768084955294", category: "Hats & Headwear", gender: "ALL" },


        // // { url: "https://uk.diesel.com/en/accessories/holy-c-black/X09691PR581T8013.html", category: "ACCESSORIES", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie-mohair?variant=43377319248030", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie-mohair?variant=43377319280798", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie-mohair?variant=43377319313566", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie-mohair?variant=43377319346334", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie-mohair?variant=43377319379102", category: "Hats & Headwear", gender: "ALL" },



        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43768084955294", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43768084988062", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43377387438238", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43768085086366", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43768085151902", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43768089084062", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43768085217438", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43377387536542", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43377387471006", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43768085348510", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43768085381278", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43377387405470", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/fun-day-beanie?variant=43768085610654", category: "Hats & Headwear", gender: "ALL" },




        // { url: "https://meaculpa.us/products/mea-culpa-fun-day-beanie-blue-rhinestone?variant=43377289167006", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/mea-culpa-fun-day-beanie-blue-rhinestone?variant=43377289199774", category: "Hats & Headwear", gender: "ALL" },


        // { url: "https://meaculpa.us/products/camo-fun-day-beanie?variant=43377304928414", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/camo-fun-day-beanie?variant=43377304961182", category: "Hats & Headwear", gender: "ALL" },
        // { url: "https://meaculpa.us/products/camo-fun-day-beanie?variant=43377304993950", category: "Hats & Headwear", gender: "ALL" },

        // { url: "https://meaculpa.us/products/mc-logo-ring?variant=44451553575070", category: "Jewellery", gender: "ALL" }



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
    console.log('Product details saved to json');

    // console.log('Product details saved to nike.json');
})();