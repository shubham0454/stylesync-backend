import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import Vibrant from 'node-vibrant';

const FALLBACK_TOKENS = {
  colors: { primary: '#6366f1', secondary: '#818cf8', accent: '#22d3ee', background: '#ffffff', text: '#0f172a' },
  typography: { headingFont: 'Inter', bodyFont: 'Inter', baseSize: '16px' },
  spacing: { baseUnit: 4 }
};

const rgb2hex = (rgb: string): string => {
  const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return rgb;
  const h = (n: string) => ('0' + parseInt(n).toString(16)).slice(-2);
  return '#' + h(m[1]) + h(m[2]) + h(m[3]);
};

const isTransparent = (c: string) =>
  !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent' || c === '#00000000';

export async function scrapeWebsiteTokens(url: string) {
  let browser: any;
  try {
    const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
    
    if (isVercel) {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless as any,
      });
    } else {
      // Local development on Windows
      browser = await puppeteer.launch({
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
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    // Try navigation; on timeout, use whatever partial render we have
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    } catch {
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
      catch { /* fall through */ }
    }

    const tokens = await page.evaluate(() => {
      const rgb2hex = (rgb: string): string => {
        const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return rgb;
        const h = (n: string) => ('0' + parseInt(n).toString(16)).slice(-2);
        return '#' + h(m[1]) + h(m[2]) + h(m[3]);
      };
      const isTransparent = (c: string) =>
        !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent' || c === '#00000000';
      const clean = (f: string) => f.replace(/['"]/g, '').split(',')[0].trim();

      const bodyStyle = window.getComputedStyle(document.body);

      // ── Background ──
      let bg = rgb2hex(bodyStyle.backgroundColor);
      if (isTransparent(bg)) bg = '#ffffff';

      // ── Text ──
      let text = rgb2hex(bodyStyle.color) || '#0f172a';

      // ── Heading font ──
      const h1 = document.querySelector('h1,h2,h3,[class*="title"],[class*="heading"]');
      const headingFont = h1 ? clean(window.getComputedStyle(h1).fontFamily) : clean(bodyStyle.fontFamily);
      const bodyFont    = clean(bodyStyle.fontFamily);
      const baseSize    = bodyStyle.fontSize || '16px';

      // ── Primary color: scan CTAs / nav links / headings ──
      const ctaSelectors = ['button','a[class*="btn"]','[class*="cta"]','[class*="button"]','nav a','header a'];
      let primary = '';
      for (const sel of ctaSelectors) {
        const els = document.querySelectorAll<HTMLElement>(sel);
        for (const el of Array.from(els).slice(0, 30)) {
          const s = window.getComputedStyle(el);
          const bgC = rgb2hex(s.backgroundColor);
          if (!isTransparent(bgC) && bgC !== bg && bgC !== '#000000') { primary = bgC; break; }
          const col = rgb2hex(s.color);
          if (!isTransparent(col) && col !== text && col !== '#000000' && col !== '#ffffff') { if (!primary) primary = col; }
        }
        if (primary) break;
      }
      if (!primary) primary = '#6366f1';

      // ── Find a hero image to extract colors ──
      const images = Array.from(document.querySelectorAll('img'));
      const heroImg = images.find(img => img.width > 200 && img.height > 200 && img.src.startsWith('http'));
      const _heroImage = heroImg ? heroImg.src : undefined;

      // ── Accent: look for <a> tags, icons, borders ──
      let accent = '';
      const links = document.querySelectorAll<HTMLElement>('a,svg,[class*="icon"]');
      for (const el of Array.from(links).slice(0, 30)) {
        const s = window.getComputedStyle(el);
        const col = rgb2hex(s.color);
        if (!isTransparent(col) && col !== text && col !== primary && col !== '#000000' && col !== '#ffffff') {
          accent = col; break;
        }
      }
      if (!accent) accent = primary;

      // ── Secondary: midpoint blend ──
      const secondary = '#' + [1, 2].map(i => {
        const p = parseInt(primary.slice(i*2-1, i*2+1), 16);
        const t = parseInt(text.slice(i*2-1, i*2+1), 16);
        return ('0' + Math.round((p + t) / 2).toString(16)).slice(-2);
      }).join('') + 'ff';

      return {
        colors: { primary, secondary: secondary.slice(0, 7), accent, background: bg, text },
        typography: { headingFont, bodyFont, baseSize },
        spacing: { baseUnit: 4 },
        _heroImage
      };
    }) as typeof FALLBACK_TOKENS & { _heroImage?: string };

    const heroImage = tokens._heroImage;
    delete tokens._heroImage;

    if (heroImage) {
      try {
        const palette = await Vibrant.from(heroImage).getPalette();
        if (palette.Vibrant) {
          const vibrantHex = palette.Vibrant.hex;
          // Only overwrite if primary is fallback or very simple
          if (tokens.colors.primary === '#6366f1' || tokens.colors.primary === tokens.colors.background) {
            tokens.colors.primary = vibrantHex;
            if (palette.Muted) {
              tokens.colors.secondary = palette.Muted.hex;
            }
          } else if (!tokens.colors.accent || tokens.colors.accent === tokens.colors.primary) {
            tokens.colors.accent = vibrantHex;
          }
        }
      } catch (err) {
        console.error('Vibrant color extraction failed:', err);
      }
    }

    // Sanity-check: if primary is the same as background, flip it
    if (tokens.colors.primary === tokens.colors.background) {
      tokens.colors.primary = FALLBACK_TOKENS.colors.primary;
    }

    return tokens;
  } catch (err: any) {
    console.error('Scraper error:', err.message ?? err);
    // Return sensible fallback so the dashboard still loads
    return { ...FALLBACK_TOKENS, _fallback: true };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
