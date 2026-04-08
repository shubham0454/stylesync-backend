import mongoose, { Schema, Document } from 'mongoose';

export interface ISite extends Document {
  url: string;
  lastScraped: Date;
  status: 'pending' | 'completed' | 'failed';
  errorMessage?: string;
}

const SiteSchema: Schema = new Schema({
  url: { type: String, required: true, unique: true },
  lastScraped: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  errorMessage: { type: String }
});

export const Site = mongoose.model<ISite>('Site', SiteSchema);
