import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { scrapeWebsiteTokens } from './services/scraper.service';
import { Site } from './models/Site';
import { DesignToken } from './models/DesignToken';
import { VersionHistory } from './models/VersionHistory';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/stylesync';

// Connect to DB
mongoose.connect(MONGO_URI)
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
    let site = await Site.findOne({ url });
    if (!site) {
      site = new Site({ url, status: 'pending' });
    } else {
      site.status = 'pending';
    }
    await site.save();

    // 2. Perform Scraping
    const tokens = await scrapeWebsiteTokens(url);

    // 3. Update or Create DesignToken entry
    let designToken = await DesignToken.findOne({ siteId: site._id });
    if (!designToken) {
      designToken = new DesignToken({
        siteId: site._id,
        url,
        colors: tokens.colors,
        typography: tokens.typography,
        spacing: tokens.spacing
      });
    } else {
      // Merge logic: only overwrite properties that are NOT locked
      const isLocked = (propPath: string) => designToken!.lockedProps.includes(propPath);
      
      if (!isLocked('colors.primary')) designToken.colors.primary = tokens.colors.primary;
      if (!isLocked('colors.secondary')) designToken.colors.secondary = tokens.colors.secondary;
      if (!isLocked('colors.accent')) designToken.colors.accent = tokens.colors.accent;
      if (!isLocked('colors.background')) designToken.colors.background = tokens.colors.background;
      if (!isLocked('colors.text')) designToken.colors.text = tokens.colors.text;

      if (!isLocked('typography.headingFont')) designToken.typography.headingFont = tokens.typography.headingFont;
      if (!isLocked('typography.bodyFont')) designToken.typography.bodyFont = tokens.typography.bodyFont;
      if (!isLocked('typography.baseSize')) designToken.typography.baseSize = tokens.typography.baseSize;

      if (!isLocked('spacing.baseUnit')) designToken.spacing.baseUnit = tokens.spacing.baseUnit;
    }
    
    await designToken.save();

    // Log Version History
    await new VersionHistory({
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
  } catch (error: any) {
    console.error('Extraction error:', error);
    try {
      // Mark as failed
      const site = await Site.findOne({ url });
      if (site) {
        site.status = 'failed';
        site.errorMessage = error.message;
        await site.save();
      }
    } catch (dbError) {
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
  if (!url) return res.status(400).json({ error: 'URL query param is required' });

  try {
    const token = await DesignToken.findOne({ url: String(url) });
    if (!token) return res.status(404).json({ error: 'Tokens not found for this URL' });
    res.json(token);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// Update/Lock tokens
app.put('/api/tokens', async (req, res) => {
  const { url, tokens, lockedProps } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    let tokenDoc = await DesignToken.findOne({ url });
    if (!tokenDoc) return res.status(404).json({ error: 'Tokens not found' });

    if (tokens) {
      if (tokens.colors) tokenDoc.colors = { ...tokenDoc.colors, ...tokens.colors };
      if (tokens.typography) tokenDoc.typography = { ...tokenDoc.typography, ...tokens.typography };
      if (tokens.spacing) tokenDoc.spacing = { ...tokenDoc.spacing, ...tokens.spacing };
    }
    if (lockedProps !== undefined) {
      tokenDoc.lockedProps = lockedProps;
    }

    await tokenDoc.save();

    // Log Version History
    await new VersionHistory({
      url,
      tokens: {
        colors: tokenDoc.colors,
        typography: tokenDoc.typography,
        spacing: tokenDoc.spacing
      }
    }).save();

    res.json(tokenDoc);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
});

app.get('/api/history', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL query param is required' });

  try {
    const history = await VersionHistory.find({ url: String(url) })
      .sort({ timestamp: -1 })
      .limit(20);
    res.json(history);
  } catch (err) {
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

export default app;
