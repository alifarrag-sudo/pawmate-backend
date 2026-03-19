import { Module, Global } from '@nestjs/common';
import { UploadsService } from './uploads.service';

@Global()
@Module({
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
