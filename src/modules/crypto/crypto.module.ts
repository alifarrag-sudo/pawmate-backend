import { Module, Global } from '@nestjs/common';
import { MedicalEncryptionService } from './medical-encryption.service';

@Global()
@Module({
  providers: [MedicalEncryptionService],
  exports: [MedicalEncryptionService],
})
export class CryptoModule {}
