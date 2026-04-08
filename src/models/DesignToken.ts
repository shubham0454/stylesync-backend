import mongoose, { Schema, Document } from 'mongoose';

export interface IDesignToken extends Document {
  siteId: mongoose.Types.ObjectId;
  url: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    baseSize: string;
  };
  spacing: {
    baseUnit: number;
  };
  lockedProps: string[];
}

const DesignTokenSchema: Schema = new Schema({
  siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true },
  url: { type: String, required: true, unique: true },
  colors: {
    primary: { type: String, default: '#000000' },
    secondary: { type: String, default: '#666666' },
    accent: { type: String, default: '#0055ff' },
    background: { type: String, default: '#ffffff' },
    text: { type: String, default: '#1a1a1a' }
  },
  typography: {
    headingFont: { type: String, default: 'Inter, sans-serif' },
    bodyFont: { type: String, default: 'Inter, sans-serif' },
    baseSize: { type: String, default: '16px' }
  },
  spacing: {
    baseUnit: { type: Number, default: 4 }
  },
  lockedProps: { type: [String], default: [] }
});

export const DesignToken = mongoose.model<IDesignToken>('DesignToken', DesignTokenSchema);
