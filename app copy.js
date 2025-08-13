const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BRAND_NAME = "Diesel";
const DATA_PATH = 'diesel.json';

// ========= Inference helpers =========

// 1) Fast inference from URL path pieces.
function inferFromUrl(url) {
    const lower = url.toLowerCase();

    // Category heuristics – extend as needed
    const categoryMap = [
        [/\/earbuds\//, 'ACCESSORIES'],
        [/\/eyewear\//, 'ACCESSORIES'],
        [/\/accessories\//, 'ACCESSORIES'],
        [/\/wallets\//, 'ACCESSORIES'],
        [/\/belts\//, 'ACCESSORIES'],
        [/\/watches\//, 'ACCESSORIES'],
        [/\/necklaces\//, 'ACCESSORIES'],
        [/\/rings?\//, 'ACCESSORIES'],

        [/\/sneakers?\//, 'FOOTWEAR'],
        [/\/boots?\//, 'FOOTWEAR'],
        [/\/lace-ups-and-clogs\//, 'FOOTWEAR'],

        [/\/outerwear.*jackets\//, 'CLOTHING'],
        [/\/relaxed\//, 'CLOTHING'],
        [/\/jeans?\//, 'CLOTHING'],
        [/\/t-shirts?\//, 'CLOTHING'],
        [/\/shirts?\//, 'CLOTHING'],
        [/\/hoodies?\//, 'CLOTHING'],
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
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--enable-http2', '--disable-web-security'],
        ignoreHTTPSErrors: true
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log("getProductDetails " + url);
    await page.goto(url, { waitUntil: 'networkidle2' });

    await autoScroll(page);
    await new Promise(r => setTimeout(r, 4000));

    // Tolerant wait (your helper below also exists)
    try {
        await page.waitForSelector('#main > div > div.swiper-slide.swiper-slide-active > div > img', { timeout: 10000 });
    } catch {
        console.warn('Hero image not ready after 10s; waiting 5s more and continuing');
        await page.waitForTimeout(5000);
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

    // 3) if still missing, infer from DOM
    if (!category || !gender) {
        const fromDom = await inferFromDom(page);
        category = category || fromDom.category;
        gender = gender || fromDom.gender;
    }

    // Final fallbacks
    if (!category) category = 'ACCESSORIES';
    if (!gender) gender = 'ALL';

    const details = await page.evaluate((BRAND_NAME, category, gender) => {
        const brand = BRAND_NAME;
        const name = document.querySelector(".ProductInfo__Name-sc-yvcr9v-2")?.innerText.trim() || null;

        const priceText = document.querySelector('.BigBuyBarDesktopSwiperSection__Wrapper-sc-196rppg-0.fhyWHl > div > div > div > div > span')?.innerText.trim();
        const price = priceText ? parseFloat(priceText.replace(/[^\d.-]/g, '')) : null;

        const color = document.querySelector("#pdp-wrapper > div > div.FactsWindow__Wrapper-sc-1hjbbqw-1.dnjWGj > div:nth-child(6) > span.WindowItemShortText__Right-sc-jrzdw-2.kZeLHw > button > span")?.innerText.trim() || null;

        const imagesUrl = [];
        const imageNames = [];

        const sanitize = (str) =>
            String(str || '')
                .replace(/\s+/g, '-')
                .replace(/[\/\\\[\]'":]/g, '')
                .replace(/-+/g, '-');

        const firstImage = document.querySelector("#main > div > div.swiper-slide.swiper-slide-active > div > img");
        if (firstImage) {
            const srcset = firstImage.getAttribute('srcset');
            const firstSrc = srcset ? (srcset.split(',').map(s => s.trim().split(' ')[0]).pop() || firstImage.src) : firstImage.src;
            if (firstSrc) {
                imagesUrl.push(firstSrc);
                imageNames.push(`${sanitize(brand)}-${sanitize(name)}-0`);
            }
        }

        return {
            Brand: brand,
            name,
            category,
            id: '',
            code: '',
            url: window.location.href,
            Price: price,
            currency: 'GBP',
            gender,
            description: "",
            color,
            from: 'Diesel',
            info: 'Retail Price',
            image: imageNames,
            imagesUrl
        };
    }, BRAND_NAME, category, gender);

    // Download images
    for (let i = 0; i < (details.image?.length || 0); i++) {
        const imageUrl = details.imagesUrl[i];
        const imageName = details.image[i];
        try {
            console.log(`Downloading image ${imageName} from ${imageUrl}`);
            await downloadImage(imageUrl, path.join(__dirname, 'diesel', `${imageName}.jpg`));
        } catch (error) {
            console.error(`Failed to download image ${imageName} from ${imageUrl}:`, error);
        }
    }

    await browser.close();
    return details;
}

// ---- Helper: tolerant wait (kept for reuse elsewhere) ----
async function waitForSelectorWithExtra(page, selector, baseMs = 30000, extraMs = 5000) {
    try {
        await page.waitForSelector(selector, { timeout: baseMs });
        return true;
    } catch {
        console.warn(`Selector ${selector} not found within ${baseMs}ms; waiting extra ${extraMs}ms and continuing...`);
        await page.waitForTimeout(extraMs);
        return false;
    }
}

// ========= I/O utils (unchanged from your pattern) =========

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

async function autoScroll(page) {
    console.log("autoScroll called");
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 2000;
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
    fs.writeFileSync(DATA_PATH + '.tmp', JSON.stringify(merged, null, 2), 'utf-8');
    fs.renameSync(DATA_PATH + '.tmp', DATA_PATH);
    return merged;
}

// ========= Runner =========
(async () => {
    // You can mix: string URLs or objects with overrides
    const urls = normalizeUrlTasks([
        // Plain string: category/gender inferred automatically
        "https://uk.diesel.com/en/earbuds/60215-true-wireless-earbuds-grey/DP08750PHIN01.html",

        // With explicit overrides (these win over inference)
        { url: "https://uk.diesel.com/en/watches/dz2212-silver/DZ221200QQQ01.html", category: "ACCESSORIES", gender: "MEN" },

        // More items...
    ]);


    // const urls = [
    //     // ACCESSORIES
    //     "https://uk.diesel.com/en/earbuds/60215-true-wireless-earbuds-grey/DP08750PHIN01.html",


    //     "https://uk.diesel.com/en/earbuds/60214-true-wireless-earbuds-black/DP08740PHIN01.html",
    //     "https://uk.diesel.com/en/eyewear/0dl3005u-black/LX300500LEN00287.html",
    //     "https://uk.diesel.com/en/eyewear/0dl3004u-black/LX300400LEN0026G.html",
    //     "https://uk.diesel.com/en/eyewear/0dl2003-size-57-grey/LX200300LEN70187.html",
    //     "https://uk.diesel.com/en/eyewear/0dl2002-size-56-black/LX200200LEN70187.html",
    //     "https://uk.diesel.com/en/eyewear/0dl3002-multicolor/LX300200LEC505B5.html",
    //     "https://uk.diesel.com/en/accessories/holy-c-black/X09691PR581T8013.html",
    //     "https://uk.diesel.com/en/accessories/holy-c-yellow/X09691PR581H2382.html",
    //     "https://uk.diesel.com/en/accessories/k-frok-blue/A196750KICC8AT.html",
    //     "https://uk.diesel.com/en/accessories/s-tevie-tobedefined/A175720AKBM7FGA.html",
    //     "https://uk.diesel.com/en/accessories/k-lollo-scarf-tobedefined/A196920JLCD79TA.html",
    //     "https://uk.diesel.com/en/accessories/k-lollo-scarf-tobedefined/A196920JLCD9AW.html",
    //     "https://uk.diesel.com/en/accessories/k-fur-violet/A178730DBCR61T.html",
    //     "https://uk.diesel.com/en/wallets/card-case-brown/X09018P0685H0738.html",
    //     "https://uk.diesel.com/en/wallets/holi--d-bi-fold-zip-l-blue/X10398PR818T6052.html",
    //     "https://uk.diesel.com/en/wallets/1dr-pouch-iii-black/X10273PS202T8013.html",
    //     "https://uk.diesel.com/en/belts/b-1dr-oval-d-loop-black/X10127P6364T8013.html",
    //     "https://uk.diesel.com/en/belts/b-1dr-oval-d-loop-black/X10127P6364H8206.html",
    //     "https://uk.diesel.com/en/belts/b-1dr-layer-brown/X09813PR271T2184.html",
    //     "https://uk.diesel.com/en/belts/b-1dr-2.0-brown/X10462PR488H0738.html",
    //     "https://uk.diesel.com/en/belts/b-1dr-embraced-brown/X10377P8245T2331.html",
    //     "https://uk.diesel.com/en/watches/dz2212-silver/DZ221200QQQ01.html",
    //     "https://uk.diesel.com/en/watches/dz2216-black/DZ221600QQQ01.html",
    //     "https://uk.diesel.com/en/watches/dz2200-silver/DZ220000QQQ01.html",
    //     "https://uk.diesel.com/en/watches/dz4683-silver/DZ468300QQQ01.html",
    //     "https://uk.diesel.com/en/watches/dz2200-silver/DZ220000QQQ01.html",
    //     "https://uk.diesel.com/en/watches/dz2202-black/DZ220200QQQ01.html",
    //     "https://uk.diesel.com/en/necklaces/dx1342-silver/DX134200DJW01.html",
    //     "https://uk.diesel.com/en/rings/dx1525-jewel-silver/DX152500DJW01.html",
    //     "https://uk.diesel.com/en/rings/dx1526-jewel-red/DX152600DJW01.html",
    //     "https://uk.diesel.com/en/rings/dx1444-silver/DX144400DJW01.html",
    //     "https://uk.diesel.com/en/necklaces/dx1470-silver/DX147000DJW01.html",


    //     // ----
    //     // Footwear
    //     "https://uk.diesel.com/en/boots/d-donald-montone-white/Y03586P6898H9345.html",
    //     "https://uk.diesel.com/en/boots/d-donald-montone-black/Y03586P6898T8013.html",
    //     "https://uk.diesel.com/en/lace-ups-and-clogs/d-hammer-ab-d-black/Y03324P1770T8013.html",
    //     "https://uk.diesel.com/en/sneakers/melissa-quantum-sneakers-x-black/P01607PS916T8246.html",
    //     "https://uk.diesel.com/en/sneakers/melissa-quantum-sneakers-x-grey/P01607PS916H7589.html",



    //     // ------Clothing
    //     "https://uk.diesel.com/en/outerwear-%26-jackets/l-pop-grey/A166810AKBA98B.html",
    //     "https://uk.diesel.com/en/outerwear-%26-jackets/w-ostend-multicolor/A144050DBCH9XX.html",
    //     "https://uk.diesel.com/en/relaxed/relaxed-jeans-2001-d-macro-068td-blue/A19404068TD01.html",
    //     "https://uk.diesel.com/en/relaxed/relaxed-jeans-1997-d-enim-09m74-blue/A1803309M7401.html",
    //     "https://uk.diesel.com/en/relaxed/relaxed-jeans-2001-d-macro-09m53-blue/A1159809M5301.html",
    //     "https://uk.diesel.com/en/relaxed/relaxed-jeans-d-rise-09m06-blue/A0637009M0601.html",
    //     "https://uk.diesel.com/en/relaxed/relaxed-jeans-d-touch-007z9-black/A15766007Z902.html",
    //     "https://uk.diesel.com/en/relaxed/relaxed-jeans-d-touch-0dcbe-grey/A157660DCBE02.html",
    //     "https://uk.diesel.com/en/relaxed/relaxed-jeans-d-rise-007f6-black/A06370007F602.html",
    //     "https://uk.diesel.com/en/relaxed/relaxed-jeans-2001-d-macro-0abdj-blue/A173020ABDJ01.html",
    //     "https://uk.diesel.com/en/relaxed/relaxed-jeans-2001-d-macro-007bg-blue/A19189007BG01.html",


    //     // Add more URLs as needed
    // ];

    console.log("calling app.js");

    let existingData = loadExisting();
    const results = [];

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

    for (const task of urls) {
        try {
            const details = await getProductDetails(task);
            if (details) {
                results.push(details);
                console.log('Saved details for:', task.url);
                existingData = saveProgress(existingData, results); // write after each success
            }
        } catch (err) {
            console.error(`Error scraping ${task.url}:`, err?.message || err);
            existingData = saveProgress(existingData, results); // keep partial progress
            // continue
        }
    }

    existingData = saveProgress(existingData, results);
    console.log('Product details saved to json');
})();
