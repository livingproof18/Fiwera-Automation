
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BRAND_NAME = "StockX";
const CATEGORY_VALUE = "ACCESSORIES";
const GENDER = "All";
const OUTPUT_JSON = 'stockx.json';
const IMG_DIR = path.join(__dirname, 'stockx');
const CONCURRENCY = 3; // tweak if you like

// ---------- Utility: small promise pool (no extra dependency) ----------
async function promisePool(items, limit, iteratorFn) {
    const ret = [];
    const executing = [];
    for (const item of items) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);
        if (limit <= items.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}

// ---------- Main per-URL worker ----------
async function getProductDetails(browser, url) {
    const page = await browser.newPage();
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-GB,en;q=0.9',
        'Upgrade-Insecure-Requests': '1'
    });
    await page.setViewport({ width: 1366, height: 900 });
    page.setDefaultTimeout(20000);

    try {
        console.log("Navigating:", url);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

        // Try to accept consent if any
        try {
            await page.waitForSelector('[role="dialog"] button, #onetrust-accept-btn-handler', { timeout: 4000 });
            await page.click('[role="dialog"] button, #onetrust-accept-btn-handler');
            await page.waitForTimeout(500);
        } catch { }

        // Wait for a stable product identifier (title)
        await page.waitForSelector('.css-58l4sv h1', { timeout: 10000 });

        await autoScroll(page);
        await page.waitForTimeout(1500);

        const details = await scrapeDetails(page, { BRAND_NAME, CATEGORY_VALUE, GENDER });
        if (!details) {
            console.warn('No details extracted for:', url);
            return null;
        }

        // download images (if any)
        if (details.imagesUrl?.length && details.image?.length) {
            await fs.promises.mkdir(IMG_DIR, { recursive: true }).catch(() => { });
            const ua = await page.evaluate(() => navigator.userAgent);

            for (let i = 0; i < details.imagesUrl.length; i++) {
                const imageUrl = details.imagesUrl[i];
                const imageName = details.image[i];
                const filepath = path.join(IMG_DIR, `${imageName}.jpg`); // keep .jpg to match your original output
                try {
                    console.log(`Downloading image ${imageName} from ${imageUrl}`);
                    await downloadImage(imageUrl, filepath, { referer: url, ua });
                } catch (err) {
                    console.error(`Failed to download ${imageName}:`, err?.message || err);
                }
            }
        }

        return details;
    } catch (e) {
        console.error('Scrape failed for', url, e?.message || e);
        return null;
    } finally {
        await page.close().catch(() => { });
    }
}

// ---------- In-page extraction (runs inside the browser) ----------
async function scrapeDetails(page, { BRAND_NAME, CATEGORY_VALUE, GENDER }) {
    return page.evaluate((BRAND_NAME, CATEGORY_VALUE, GENDER) => {
        const q = (sel) => document.querySelector(sel);
        const text = (sel) => q(sel)?.textContent?.trim() || null;

        const brand = BRAND_NAME;
        const category = CATEGORY_VALUE;
        const gender = GENDER;

        // product name (several fallbacks)
        const name =
            text('#main-content section.css-58l4sv h1') ||
            text('h1[data-testid="product-name"]') ||
            text('h1');

        // price: prefer "last sale" then "buy now" blocks used on StockX
        const priceText =
            text('#main-content section.css-58l4sv .css-13azw4r p') || // last sale
            text('#main-content section.css-58l4sv .css-1s0m9m0 h2') || // buy now
            text('[data-testid="price"]') || null;

        const price = (() => {
            if (!priceText) return null;
            const m = priceText.match(/[\d,.]+/);
            if (!m) return null;
            return Number(m[0].replace(/,/g, ''));
        })();

        // description: permissive fallbacks
        let description =
            text('#main-content section:nth-child(5) .css-13qkkpi p') ||
            text('.css-13qkkpi p') ||
            text('[data-testid="product-description"]') ||
            null;

        const color = text('#main-content section.css-58l4sv h1 > span') || null;

        // image harvesting: collect imgs and <source> srcset; prefer largest width
        const nodes = Array.from(document.querySelectorAll(
            '#main-content section.css-58l4sv img, [id^="tabs-"][id$="--tabpanel-0"] img, #main-content img, picture source'
        ));

        function parseSrcset(ss) {
            return (ss || '')
                .split(',')
                .map(s => s.trim())
                .map(item => {
                    const [url, size] = item.split(/\s+/);
                    const width = Number((size || '').replace(/[^\d]/g, '')) || 0;
                    return { url, width };
                })
                .filter(x => x.url);
        }

        const candidateUrls = new Set();
        for (const el of nodes) {
            if (el.tagName === 'SOURCE') {
                parseSrcset(el.getAttribute('srcset')).forEach(({ url }) => candidateUrls.add(url));
            } else {
                const ss = el.getAttribute('srcset');
                if (ss) {
                    const best = parseSrcset(ss).sort((a, b) => b.width - a.width)[0];
                    if (best?.url) candidateUrls.add(best.url);
                }
                const s = el.getAttribute('src');
                if (s) candidateUrls.add(s);
            }
        }

        // basic filtering: real URLs, avoid obvious sprites/placeholders/tiny thumbs
        const urls = Array.from(candidateUrls)
            .filter(u => /^https?:\/\//.test(u))
            .filter(u => !u.includes('sprite') && !u.includes('placeholder') && !u.includes('icon'));

        const sanitize = (str) => String(str || '')
            .replace(/\s+/g, '-')
            .replace(/[\/\\\[\]'":]/g, '')
            .replace(/-+/g, '-')
            .slice(0, 120);

        const imagesUrl = urls.slice(0, 8); // cap to a reasonable number
        const imageNames = imagesUrl.map((_, i) => `${sanitize(BRAND_NAME)}-${sanitize(name)}-${i}`);

        return {
            Brand: brand,
            name,
            category,
            id: '',
            code: '',
            url: location.href,
            Price: price || null,
            currency: 'GBP',
            gender,
            description,
            color,
            from: 'stockx',
            info: 'Reseller Price',
            image: imageNames,
            imagesUrl
        };
    }, BRAND_NAME, CATEGORY_VALUE, GENDER);
}

// ---------- Image download with Referer + UA; keeps your .jpg names ----------
async function downloadImage(url, filepath, { referer, ua }) {
    await fs.promises.mkdir(path.dirname(filepath), { recursive: true });
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: {
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'User-Agent': ua || 'Mozilla/5.0',
            'Accept-Encoding': 'gzip, deflate, br',
            ...(referer ? { Referer: referer } : {})
        },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: s => s >= 200 && s < 400
    });

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// ---------- Auto-scroll to load lazy content; stops reasonably ----------
async function autoScroll(page) {
    console.log("autoScroll called");
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let lastHeight = 0;
            let stableTicks = 0;
            const maxTicks = 10; // stop after N stable checks
            const interval = setInterval(() => {
                const { scrollHeight } = document.documentElement;
                window.scrollBy(0, 1000);
                if (scrollHeight === lastHeight) {
                    stableTicks += 1;
                } else {
                    stableTicks = 0;
                    lastHeight = scrollHeight;
                }
                if (stableTicks >= maxTicks) {
                    clearInterval(interval);
                    resolve();
                }
            }, 400);
        });
    });
}

// ---------- Run ----------
(async () => {
    console.log("calling app.js");

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
        "https://stockx.com/beats-x-stussy-studio-pro-headphones"
    ];

    // Load existing JSON (if any)
    let existingData = [];
    if (fs.existsSync(OUTPUT_JSON)) {
        try {
            existingData = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf-8')) || [];
        } catch {
            existingData = [];
        }
    }

    const browser = await puppeteer.launch({
        // headless: 'new',
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--disable-web-security'],
        ignoreHTTPSErrors: true
    });

    try {
        const results = await promisePool(urls, CONCURRENCY, async (u) => await getProductDetails(browser, u));
        const cleaned = results.filter(Boolean);
        const updated = existingData.concat(cleaned);
        fs.writeFileSync(OUTPUT_JSON, JSON.stringify(updated, null, 2), 'utf-8');
        console.log(`Saved ${cleaned.length} items to ${OUTPUT_JSON}`);
    } finally {
        await browser.close();
    }
})();

// ---------- Notes ----------
// • If you hit frequent blocks, consider puppeteer-extra + plugin-stealth.
// • StockX may return WEBP/AVIF; filenames keep .jpg for compatibility, but you can
//   detect content-type in downloadImage and switch extension if you want.
// • Be mindful of the site’s Terms of Service; scraping may be disallowed.
