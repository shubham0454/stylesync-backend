"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeWebsiteTokens = scrapeWebsiteTokens;
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const chromium_1 = __importDefault(require("@sparticuz/chromium"));
const node_vibrant_1 = __importDefault(require("node-vibrant"));
const FALLBACK_TOKENS = {
    colors: { primary: '#6366f1', secondary: '#818cf8', accent: '#22d3ee', background: '#ffffff', text: '#0f172a' },
    typography: { headingFont: 'Inter', bodyFont: 'Inter', baseSize: '16px' },
    spacing: { baseUnit: 4 }
};
const rgb2hex = (rgb) => {
    const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m)
        return rgb;
    const h = (n) => ('0' + parseInt(n).toString(16)).slice(-2);
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
};
const isTransparent = (c) => !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent' || c === '#00000000';
async function scrapeWebsiteTokens(url) {
    let browser;
    try {
        const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
        if (isVercel) {
            console.log('Launching browser for Vercel...');
            browser = await puppeteer_core_1.default.launch({
                args: chromium_1.default.args,
                defaultViewport: chromium_1.default.defaultViewport,
                executablePath: await chromium_1.default.executablePath(),
                headless: chromium_1.default.headless,
            });
        }
        else {
            // Local development on Windows
            browser = await puppeteer_core_1.default.launch({
                headless: true,
                executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--window-size=1440,900'
                ]
            });
        }
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        // Use a simpler UA to avoid some detection issues
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        // Try navigation; shorter timeouts for Vercel Hobby (10s total limit)
        const navTimeout = isVercel ? 8000 : 25000;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
        }
        catch (e) {
            console.warn('Navigation timeout or error, trying to proceed anyway:', e.message);
        }
        const tokens = await page.evaluate(() => {
            const rgb2hex = (rgb) => {
                const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (!m)
                    return rgb;
                const h = (n) => ('0' + parseInt(n).toString(16)).slice(-2);
                return '#' + h(m[1]) + h(m[2]) + h(m[3]);
            };
            const isTransparent = (c) => !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent' || c === '#00000000';
            const clean = (f) => f.replace(/['"]/g, '').split(',')[0].trim();
            const bodyStyle = window.getComputedStyle(document.body);
            // ── Background ──
            let bg = rgb2hex(bodyStyle.backgroundColor);
            if (isTransparent(bg))
                bg = '#ffffff';
            // ── Text ──
            let text = rgb2hex(bodyStyle.color) || '#0f172a';
            // ── Heading font ──
            const h1 = document.querySelector('h1,h2,h3,[class*="title"],[class*="heading"]');
            const headingFont = h1 ? clean(window.getComputedStyle(h1).fontFamily) : clean(bodyStyle.fontFamily);
            const bodyFont = clean(bodyStyle.fontFamily);
            const baseSize = bodyStyle.fontSize || '16px';
            // ── Primary color: scan CTAs / nav links / headings ──
            const ctaSelectors = ['button', 'a[class*="btn"]', '[class*="cta"]', '[class*="button"]', 'nav a', 'header a'];
            let primary = '';
            for (const sel of ctaSelectors) {
                const els = document.querySelectorAll(sel);
                for (const el of Array.from(els).slice(0, 30)) {
                    const s = window.getComputedStyle(el);
                    const bgC = rgb2hex(s.backgroundColor);
                    if (!isTransparent(bgC) && bgC !== bg && bgC !== '#000000') {
                        primary = bgC;
                        break;
                    }
                    const col = rgb2hex(s.color);
                    if (!isTransparent(col) && col !== text && col !== '#000000' && col !== '#ffffff') {
                        if (!primary)
                            primary = col;
                    }
                }
                if (primary)
                    break;
            }
            if (!primary)
                primary = '#6366f1';
            // ── Find a hero image to extract colors ──
            const images = Array.from(document.querySelectorAll('img'));
            const heroImg = images.find(img => img.width > 200 && img.height > 200 && img.src.startsWith('http'));
            const _heroImage = heroImg ? heroImg.src : undefined;
            // ── Accent: look for <a> tags, icons, borders ──
            let accent = '';
            const links = document.querySelectorAll('a,svg,[class*="icon"]');
            for (const el of Array.from(links).slice(0, 30)) {
                const s = window.getComputedStyle(el);
                const col = rgb2hex(s.color);
                if (!isTransparent(col) && col !== text && col !== primary && col !== '#000000' && col !== '#ffffff') {
                    accent = col;
                    break;
                }
            }
            if (!accent)
                accent = primary;
            // ── Secondary: midpoint blend ──
            const secondary = '#' + [1, 2].map(i => {
                const p = parseInt(primary.slice(i * 2 - 1, i * 2 + 1), 16);
                const t = parseInt(text.slice(i * 2 - 1, i * 2 + 1), 16);
                return ('0' + Math.round((p + t) / 2).toString(16)).slice(-2);
            }).join('') + 'ff';
            return {
                colors: { primary, secondary: secondary.slice(0, 7), accent, background: bg, text },
                typography: { headingFont, bodyFont, baseSize },
                spacing: { baseUnit: 4 },
                _heroImage
            };
        });
        const heroImage = tokens._heroImage;
        delete tokens._heroImage;
        if (heroImage) {
            try {
                const palette = await node_vibrant_1.default.from(heroImage).getPalette();
                if (palette.Vibrant) {
                    const vibrantHex = palette.Vibrant.hex;
                    // Only overwrite if primary is fallback or very simple
                    if (tokens.colors.primary === '#6366f1' || tokens.colors.primary === tokens.colors.background) {
                        tokens.colors.primary = vibrantHex;
                        if (palette.Muted) {
                            tokens.colors.secondary = palette.Muted.hex;
                        }
                    }
                    else if (!tokens.colors.accent || tokens.colors.accent === tokens.colors.primary) {
                        tokens.colors.accent = vibrantHex;
                    }
                }
            }
            catch (err) {
                console.error('Vibrant color extraction failed:', err);
            }
        }
        // Sanity-check: if primary is the same as background, flip it
        if (tokens.colors.primary === tokens.colors.background) {
            tokens.colors.primary = FALLBACK_TOKENS.colors.primary;
        }
        return tokens;
    }
    catch (err) {
        console.error('Scraper error:', err.message ?? err);
        // Return sensible fallback so the dashboard still loads
        return { ...FALLBACK_TOKENS, _fallback: true };
    }
    finally {
        if (browser)
            await browser.close().catch(() => { });
    }
}
