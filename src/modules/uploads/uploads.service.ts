import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { Request } from 'express';

export type UploadFolder = 'profile_photos' | 'pet_photos' | 'social_posts' | 'id_documents' | 'trainer_videos' | 'facility_photos' | 'business_docs' | 'pet_vaccination';

export interface PrivateUploadResult {
  /** Cloudinary public_id — the storage key. NEVER expose this in URLs to
   *  end users; mint a signed URL via signedUrlFor() instead. */
  key: string;
  mimeType: string;
  bytes: number;
  resourceType: 'image' | 'raw';
}

export interface UploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// FIX 6: Allowed MIME types
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

const ALLOWED_DOCUMENT_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  'application/pdf', // For vet certificates and licences only
];

/**
 * Multer file filter — accepts images only (no PDFs).
 * Use for: pet photos, profile photos, social posts, product photos.
 */
export const imageOnlyFileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        `File type not allowed. Accepted formats: jpg, png, webp, gif`,
      ),
      false,
    );
  }
  callback(null, true);
};

/**
 * Multer file filter — accepts images and PDFs.
 * Use for: ID documents, vet certificates, licences.
 */
export const documentFileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        `File type not allowed. Accepted formats: jpg, png, webp, gif, pdf`,
      ),
      false,
    );
  }
  callback(null, true);
};

/**
 * Standard multer limits for all upload endpoints.
 */
export const uploadLimits = {
  fileSize: MAX_FILE_SIZE,
  files: 10,
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly ready: boolean;

  constructor(config: ConfigService) {
    const cloudName = config.get('CLOUDINARY_CLOUD_NAME');
    const ready = cloudName && !cloudName.startsWith('your-');

    if (ready) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: config.get('CLOUDINARY_API_KEY'),
        api_secret: config.get('CLOUDINARY_API_SECRET'),
      });
    } else {
      this.logger.warn('Cloudinary not configured — uploads will return placeholder URLs');
    }

    this.ready = !!ready;
  }

  async uploadImage(
    buffer: Buffer,
    folder: UploadFolder,
    options: { maxWidth?: number; quality?: number } = {},
  ): Promise<UploadResult> {
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException('File too large. Maximum size is 10 MB.');
    }

    // Resize and compress with sharp before uploading
    const maxWidth = options.maxWidth ?? 1200;
    const quality = options.quality ?? 80;

    const processed = await sharp(buffer)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();

    if (!this.ready) {
      // Dev fallback: return a placeholder URL
      const placeholder = `https://placehold.co/${maxWidth}x${maxWidth}/FF6B35/FFFFFF?text=PawMateHub`;
      return { url: placeholder, publicId: `dev_placeholder_${Date.now()}`, width: maxWidth, height: maxWidth };
    }

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `pawmate/${folder}`,
          resource_type: 'image',
          format: 'jpg',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(`Cloudinary upload failed: ${error?.message}`);
            return reject(new BadRequestException('Image upload failed. Please try again.'));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
          });
        },
      );
      stream.end(processed);
    });
  }

  get cloudinaryReady(): boolean {
    return this.ready;
  }

  /**
   * Upload a raw file (image or PDF) without sharp processing.
   * Used for KYC documents where we need to preserve the original file.
   */
  async uploadFile(
    buffer: Buffer,
    mimeType: string,
    folder: UploadFolder,
  ): Promise<UploadResult> {
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException('File too large. Maximum size is 10 MB.');
    }

    if (!this.ready) {
      const placeholder = `https://placehold.co/800x600/FF6B35/FFFFFF?text=PawMateHub+Doc`;
      return { url: placeholder, publicId: `dev_placeholder_${Date.now()}`, width: 800, height: 600 };
    }

    const isPdf = mimeType === 'application/pdf';
    const resourceType = isPdf ? 'raw' : 'image';

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `pawmate/${folder}`,
          resource_type: resourceType,
          ...(isPdf ? {} : { format: 'jpg', transformation: [{ quality: 'auto', fetch_format: 'auto' }] }),
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(`Cloudinary file upload failed: ${error?.message}`);
            return reject(new BadRequestException('File upload failed. Please try again.'));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width ?? 0,
            height: result.height ?? 0,
          });
        },
      );
      stream.end(buffer);
    });
  }

  /**
   * Upload a sensitive file (vaccination passport, pet licence) to private
   * Cloudinary storage. The returned key is what gets persisted to the DB —
   * we never store a public URL. Reads happen through `signedUrlFor`.
   */
  async uploadPrivateFile(
    buffer: Buffer,
    mimeType: string,
    folder: string,
  ): Promise<PrivateUploadResult> {
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException('File too large. Maximum size is 10 MB.');
    }

    const isPdf = mimeType === 'application/pdf';
    const resourceType: 'image' | 'raw' = isPdf ? 'raw' : 'image';

    if (!this.ready) {
      // Dev fallback — return a deterministic placeholder key so callers
      // can still persist + fetch a signed URL (which will resolve to a
      // placeholder image too).
      const key = `dev_private_${folder}_${Date.now()}`;
      return { key, mimeType, bytes: buffer.length, resourceType };
    }

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          // `type: 'private'` makes the asset reachable only via signed
          // URLs. Without this flag the secure_url would be world-readable
          // by anyone who guesses the path.
          type: 'private',
          access_mode: 'authenticated',
        },
        (error, result) => {
          if (error || !result) {
            this.logger.error(`Cloudinary private upload failed: ${error?.message}`);
            return reject(new BadRequestException('File upload failed. Please try again.'));
          }
          resolve({
            key: result.public_id,
            mimeType,
            bytes: result.bytes ?? buffer.length,
            resourceType,
          });
        },
      );
      stream.end(buffer);
    });
  }

  /**
   * Mint a short-lived signed URL for a private storage key. TTL is
   * clamped to 900 seconds (15 minutes) per CONVENTIONS.md — anything
   * longer would defeat the point of private storage.
   */
  signedUrlFor(
    key: string,
    options: { ttlSeconds?: number; resourceType?: 'image' | 'raw' } = {},
  ): { url: string; expiresAt: Date } {
    const ttl = Math.min(Math.max(options.ttlSeconds ?? 900, 60), 900);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    if (!this.ready || key.startsWith('dev_private_')) {
      // Dev placeholder — caller can still render a UI; production
      // requires Cloudinary creds set.
      return {
        url: `https://placehold.co/800x600/FF6B35/FFFFFF?text=Private+Doc`,
        expiresAt,
      };
    }

    const expiresAtUnix = Math.floor(expiresAt.getTime() / 1000);
    const url = cloudinary.utils.private_download_url(key, '', {
      resource_type: options.resourceType ?? 'image',
      type: 'private',
      expires_at: expiresAtUnix,
    });

    return { url, expiresAt };
  }

  async deleteImage(publicId: string): Promise<void> {
    if (!this.ready || publicId.startsWith('dev_placeholder')) return;
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err: any) {
      this.logger.warn(`Failed to delete Cloudinary image ${publicId}: ${err.message}`);
    }
  }
}
