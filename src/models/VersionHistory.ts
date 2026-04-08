import mongoose, { Schema, Document } from 'mongoose';

export interface IVersionHistory extends Document {
  url: string;
  tokens: {
    colors: { primary: string; secondary: string; accent: string; background: string; text: string; };
    typography: { headingFont: string; bodyFont: string; baseSize: string; };
    spacing: { baseUnit: number; };
  };
  timestamp: Date;
}

const VersionHistorySchema: Schema = new Schema({
  url: { type: String, required: true },
  tokens: { type: Object, required: true },
  timestamp: { type: Date, default: Date.now }
});

export const VersionHistory = mongoose.model<IVersionHistory>('VersionHistory', VersionHistorySchema);
