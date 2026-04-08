"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const scraper_service_1 = require("./services/scraper.service");
const Site_1 = require("./models/Site");
const DesignToken_1 = require("./models/DesignToken");
const VersionHistory_1 = require("./models/VersionHistory");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/stylesync';
// Database Connection Helper for Serverless
let cachedConnection = null;
let lastConnectionError = null;
async function connectToDatabase() {
    if (cachedConnection && mongoose_1.default.connection.readyState === 1) {
        return cachedConnection;
    }
    try {
        console.log('Initializing new MongoDB connection...');
        cachedConnection = await mongoose_1.default.connect(MONGO_URI);
        lastConnectionError = null;
        return cachedConnection;
    }
    catch (err) {
        lastConnectionError = err.message;
        console.error('Mongoose connection error:', err);
        throw err;
    }
}
// Initial connection for local dev
if (!process.env.VERCEL) {
    connectToDatabase().catch(err => console.error('Initial DB connect failed:', err));
}
// Diagnostic Endpoint
app.get('/api/debug', async (req, res) => {
    try {
        await connectToDatabase();
    }
    catch (e) { }
    const dbStatus = mongoose_1.default.connection.readyState === 1 ? 'connected' : 'disconnected';
    const env = {
        VERCEL: process.env.VERCEL || 'false',
        NODE_ENV: process.env.NODE_ENV,
        HAS_MONGO_URI: !!process.env.MONGO_URI,
        DB_STATE: dbStatus,
        DB_ERROR: lastConnectionError
    };
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env
    });
});
// API: Ingest URL and Scrape Tokens
app.post('/api/extract', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    try {
        await connectToDatabase();
        // 1. Get or Create Site
        let site = await Site_1.Site.findOne({ url });
        if (!site) {
            site = new Site_1.Site({ url, status: 'pending' });
        }
        else {
            site.status = 'pending';
        }
        await site.save();
        // 2. Perform Scraping
        const tokens = await (0, scraper_service_1.scrapeWebsiteTokens)(url);
        // 3. Update or Create DesignToken entry
        let designToken = await DesignToken_1.DesignToken.findOne({ siteId: site._id });
        if (!designToken) {
            designToken = new DesignToken_1.DesignToken({
                siteId: site._id,
                url,
                colors: tokens.colors,
                typography: tokens.typography,
                spacing: tokens.spacing
            });
        }
        else {
            // Merge logic: only overwrite properties that are NOT locked
            const isLocked = (propPath) => designToken.lockedProps.includes(propPath);
            if (!isLocked('colors.primary'))
                designToken.colors.primary = tokens.colors.primary;
            if (!isLocked('colors.secondary'))
                designToken.colors.secondary = tokens.colors.secondary;
            if (!isLocked('colors.accent'))
                designToken.colors.accent = tokens.colors.accent;
            if (!isLocked('colors.background'))
                designToken.colors.background = tokens.colors.background;
            if (!isLocked('colors.text'))
                designToken.colors.text = tokens.colors.text;
            if (!isLocked('typography.headingFont'))
                designToken.typography.headingFont = tokens.typography.headingFont;
            if (!isLocked('typography.bodyFont'))
                designToken.typography.bodyFont = tokens.typography.bodyFont;
            if (!isLocked('typography.baseSize'))
                designToken.typography.baseSize = tokens.typography.baseSize;
            if (!isLocked('spacing.baseUnit'))
                designToken.spacing.baseUnit = tokens.spacing.baseUnit;
        }
        await designToken.save();
        // Log Version History
        await new VersionHistory_1.VersionHistory({
            url,
            tokens: {
                colors: designToken.colors,
                typography: designToken.typography,
                spacing: designToken.spacing
            }
        }).save();
        site.status = 'completed';
        site.lastScraped = new Date();
        await site.save();
        res.json({ site, tokens: designToken });
    }
    catch (error) {
        console.error('Extraction error:', error);
        // Categorize error for better debugging
        let step = 'unknown';
        if (error.message?.includes('launch'))
            step = 'browser-launch';
        else if (error.message?.includes('goto'))
            step = 'navigation';
        else if (error.message?.includes('evaluate'))
            step = 'scraping';
        else if (error.message?.includes('Vibrant'))
            step = 'color-extraction';
        try {
            // Mark as failed
            const site = await Site_1.Site.findOne({ url });
            if (site) {
                site.status = 'failed';
                site.errorMessage = `[${step}] ${error.message}`;
                await site.save();
            }
        }
        catch (dbError) {
            console.error('Failed to save error state to DB:', dbError);
        }
        return res.status(500).json({
            error: 'Failed to extract design tokens from URL',
            step,
            details: error.message || 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
app.get('/api/tokens', async (req, res) => {
    const { url } = req.query;
    if (!url)
        return res.status(400).json({ error: 'URL query param is required' });
    try {
        await connectToDatabase();
        const token = await DesignToken_1.DesignToken.findOne({ url: String(url) });
        if (!token)
            return res.status(404).json({ error: 'Tokens not found for this URL' });
        res.json(token);
    }
    catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
});
// Update/Lock tokens
app.put('/api/tokens', async (req, res) => {
    const { url, tokens, lockedProps } = req.body;
    if (!url)
        return res.status(400).json({ error: 'URL is required' });
    try {
        await connectToDatabase();
        let tokenDoc = await DesignToken_1.DesignToken.findOne({ url });
        if (!tokenDoc)
            return res.status(404).json({ error: 'Tokens not found' });
        if (tokens) {
            if (tokens.colors)
                tokenDoc.colors = { ...tokenDoc.colors, ...tokens.colors };
            if (tokens.typography)
                tokenDoc.typography = { ...tokenDoc.typography, ...tokens.typography };
            if (tokens.spacing)
                tokenDoc.spacing = { ...tokenDoc.spacing, ...tokens.spacing };
        }
        if (lockedProps !== undefined) {
            tokenDoc.lockedProps = lockedProps;
        }
        await tokenDoc.save();
        // Log Version History
        await new VersionHistory_1.VersionHistory({
            url,
            tokens: {
                colors: tokenDoc.colors,
                typography: tokenDoc.typography,
                spacing: tokenDoc.spacing
            }
        }).save();
        res.json(tokenDoc);
    }
    catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
});
app.get('/api/history', async (req, res) => {
    const { url } = req.query;
    if (!url)
        return res.status(400).json({ error: 'URL query param is required' });
    try {
        await connectToDatabase();
        const history = await VersionHistory_1.VersionHistory.find({ url: String(url) })
            .sort({ timestamp: -1 })
            .limit(20);
        res.json(history);
    }
    catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
});
app.get('/', (req, res) => {
    res.send('StyleSync Backend is running successfully!');
});
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}
exports.default = app;
