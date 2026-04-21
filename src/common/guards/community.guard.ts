import { Injectable, CanActivate, NotFoundException } from '@nestjs/common';
import { isCommunityEnabled } from '../feature-flags';

@Injectable()
export class CommunityGuard implements CanActivate {
  canActivate(): boolean {
    if (!isCommunityEnabled()) {
      throw new NotFoundException();
    }
    return true;
  }
}
