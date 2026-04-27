import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto';

export class MedicalDataDecryptionError extends Error {
  constructor(message = 'Failed to decrypt medical data') {
    super(message);
    this.name = 'MedicalDataDecryptionError';
  }
}

@Injectable()
export class MedicalEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(MedicalEncryptionService.name);
  private key: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const keyHex = this.config.get<string>('MEDICAL_DATA_ENCRYPTION_KEY');
    if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
      this.logger.error(
        'MEDICAL_DATA_ENCRYPTION_KEY missing or invalid (must be 64 hex chars = 32 bytes)',
      );
      throw new Error(
        'MEDICAL_DATA_ENCRYPTION_KEY is required for medical data encryption',
      );
    }
    this.key = Buffer.from(keyHex, 'hex');
    this.logger.log('Medical encryption service initialized');
  }

  isConfigured(): boolean {
    return !!this.key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  decrypt(encryptedString: string): string {
    try {
      const parts = encryptedString.split(':');
      if (parts.length !== 3) {
        throw new MedicalDataDecryptionError('Invalid encrypted data format');
      }

      const [ivB64, authTagB64, ciphertextB64] = parts;
      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(authTagB64, 'base64');
      const ciphertext = Buffer.from(ciphertextB64, 'base64');

      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      if (error instanceof MedicalDataDecryptionError) throw error;
      // Never log the encrypted content in error messages
      throw new MedicalDataDecryptionError(
        'Decryption failed — key mismatch or corrupted data',
      );
    }
  }

  hashContent(content: string, issuedAt: Date, vetId: string): string {
    const payload = JSON.stringify({
      content,
      issuedAt: issuedAt.toISOString(),
      vetId,
    });
    return createHash('sha256').update(payload).digest('hex');
  }
}
