"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DesignToken = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const DesignTokenSchema = new mongoose_1.Schema({
    siteId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Site', required: true },
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
exports.DesignToken = mongoose_1.default.model('DesignToken', DesignTokenSchema);
