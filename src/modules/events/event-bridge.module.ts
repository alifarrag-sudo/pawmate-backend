import { Module } from '@nestjs/common';
import { EventBridgeService } from './event-bridge.service';

@Module({
  providers: [EventBridgeService],
  exports: [EventBridgeService],
})
export class EventBridgeModule {}
