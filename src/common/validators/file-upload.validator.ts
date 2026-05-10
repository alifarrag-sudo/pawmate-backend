/**
 * Shared file-upload validator.
 *
 * The single place every upload endpoint reads its rules from. Mirrors
 * the mobile-side error copy so a rejection on the backend renders
 * identically in the user's language.
 *
 * Accepted formats: JPEG, PNG, WebP, PDF. Maximum 10 MB.
 *
 * GIF was removed in G1 — vaccination passports / pet licences /
 * provider KYC have no use case for animated frames, and accepting
 * .gif inflates Cloudinary storage with consumer pet-meme uploads.
 */
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

export const ACCEPTED_UPLOAD_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const ERR_INVALID_TYPE = {
  code: 'INVALID_FILE_TYPE',
  messageEn: 'Please upload JPEG, PNG, or PDF (max 10MB)',
  messageAr: 'يرجى رفع ملف JPEG أو PNG أو PDF (الحد الأقصى 10 ميجابايت)',
} as const;

const ERR_TOO_LARGE = {
  code: 'FILE_TOO_LARGE',
  messageEn: 'File too large. Max 10MB.',
  messageAr: 'الملف كبير جداً. الحد الأقصى 10 ميجابايت.',
} as const;

/**
 * Multer fileFilter. Wired into NestJS via FileInterceptor's options.
 * Rejection surfaces a bilingual BadRequestException so the mobile
 * client can render `messageAr` directly when the user's locale is ar.
 */
export const uploadFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
): void => {
  if (!ACCEPTED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
    return callback(new BadRequestException(ERR_INVALID_TYPE), false);
  }
  callback(null, true);
};

/**
 * Multer limits. fileSize gives multer first crack at rejecting the
 * upload before it ever buffers it. We still re-check size in
 * `validateUploadedFile` so the bilingual error is consistent.
 */
export const uploadFileLimits = {
  fileSize: MAX_UPLOAD_BYTES,
  files: 1,
};

/**
 * Explicit post-upload validator. Call after the FileInterceptor has
 * delivered the buffer — multer's filter rejects on MIME type, but
 * size needs a re-check because some clients lie about Content-Length
 * and multer's fileSize cap surfaces a generic LIMIT_FILE_SIZE error.
 */
export function validateUploadedFile(file: Express.Multer.File | undefined): void {
  if (!file) {
    throw new BadRequestException({
      code: 'NO_FILE',
      messageEn: 'No file uploaded.',
      messageAr: 'لم يتم رفع أي ملف.',
    });
  }
  if (!ACCEPTED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
    throw new BadRequestException(ERR_INVALID_TYPE);
  }
  const size = (file as any).size ?? file.buffer?.length ?? 0;
  if (size > MAX_UPLOAD_BYTES) {
    throw new BadRequestException(ERR_TOO_LARGE);
  }
}
