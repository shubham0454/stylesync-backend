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
// Connect to DB
mongoose_1.default.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));
// API: Ingest URL and Scrape Tokens
app.post('/api/extract', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    try {
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
        try {
            // Mark as failed
            const site = await Site_1.Site.findOne({ url });
            if (site) {
                site.status = 'failed';
                site.errorMessage = error.message;
                await site.save();
            }
        }
        catch (dbError) {
            console.error('Failed to save error state to DB:', dbError);
        }
        // Explicitly send a 500 error instead of letting Express hang on unhandled rejection
        return res.status(500).json({
            error: 'Failed to extract design tokens from URL',
            details: error.message || 'Unknown error'
        });
    }
});
app.get('/api/tokens', async (req, res) => {
    const { url } = req.query;
    if (!url)
        return res.status(400).json({ error: 'URL query param is required' });
    try {
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
        const history = await VersionHistory_1.VersionHistory.find({ url: String(url) })
            .sort({ timestamp: -1 })
            .limit(20);
        res.json(history);
    }
    catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
