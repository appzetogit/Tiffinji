import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';

const cloudName = String(config.cloudinaryCloudName || process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const apiKey = String(config.cloudinaryApiKey || process.env.CLOUDINARY_API_KEY || '').trim();
const apiSecret = String(config.cloudinaryApiSecret || process.env.CLOUDINARY_API_SECRET || '').trim();

const isCloudinaryConfigured = Boolean(cloudName && apiKey && apiSecret);

if (isCloudinaryConfigured) {
    try {
        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret
        });
    } catch (err) {
        console.error('Cloudinary config error:', err.message || err);
    }
}

export const uploadBufferToCloudinary = (buffer, options = {}) => {
    return new Promise((resolve, reject) => {
        if (!isCloudinaryConfigured) {
            return reject(new Error('Cloudinary credentials missing or unconfigured'));
        }
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            return resolve(result);
        });
        stream.end(buffer);
    });
};

const saveBufferToDisk = (buffer, ext = 'png') => {
    try {
        const uploadDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, buffer);
        return `/uploads/${filename}`;
    } catch (err) {
        console.error('Error saving file locally, falling back to base64:', err.message || err);
        return `data:image/${ext};base64,${buffer.toString('base64')}`;
    }
};

export const uploadImageBuffer = async (buffer, folder = 'tiffinji/uploads') => {
    if (!buffer) return null;
    try {
        const result = await uploadBufferToCloudinary(buffer, {
            folder: folder ? String(folder).trim() : 'tiffinji/uploads',
            resource_type: 'image'
        });
        return result?.secure_url || result?.url || null;
    } catch (err) {
        console.error('Cloudinary uploadImageBuffer failed, saving to local disk /uploads:', err.message || err);
        return saveBufferToDisk(buffer, 'png');
    }
};

export const uploadImageBufferDetailed = async (buffer, folder = 'tiffinji/uploads') => {
    if (!buffer) return null;
    try {
        const result = await uploadBufferToCloudinary(buffer, {
            folder: folder ? String(folder).trim() : 'tiffinji/uploads',
            resource_type: 'image'
        });
        const url = result?.secure_url || result?.url || '';
        const publicId = result?.public_id || '';
        return {
            url,
            secure_url: url,
            publicId,
            public_id: publicId
        };
    } catch (err) {
        console.error('Cloudinary uploadImageBufferDetailed failed, saving to local disk /uploads:', err.message || err);
        const fileUrl = saveBufferToDisk(buffer, 'png');
        return {
            url: fileUrl,
            secure_url: fileUrl,
            publicId: fileUrl,
            public_id: fileUrl
        };
    }
};

export const uploadFileBuffer = async (buffer, folder = 'tiffinji/docs', resourceType = 'auto') => {
    if (!buffer) return null;
    try {
        const result = await uploadBufferToCloudinary(buffer, {
            folder: folder ? String(folder).trim() : 'tiffinji/docs',
            resource_type: resourceType
        });
        return result?.secure_url || result?.url || null;
    } catch (err) {
        console.error('Cloudinary uploadFileBuffer failed, saving to local disk /uploads:', err.message || err);
        return saveBufferToDisk(buffer, 'pdf');
    }
};

export const uploadVideoBuffer = async (buffer, folder = 'tiffinji/videos') => {
    if (!buffer) return null;
    try {
        const result = await uploadBufferToCloudinary(buffer, {
            folder: folder ? String(folder).trim() : 'tiffinji/videos',
            resource_type: 'video'
        });
        return result?.secure_url || result?.url || null;
    } catch (err) {
        console.error('Cloudinary uploadVideoBuffer failed, saving to local disk /uploads:', err.message || err);
        return saveBufferToDisk(buffer, 'mp4');
    }
};

export const buildRawDownloadUrlFromFileUrl = (fileUrl, _options = {}) => {
    if (!fileUrl) return '';
    if (typeof fileUrl === 'string' && fileUrl.startsWith('http')) {
        return fileUrl;
    }
    return fileUrl;
};


