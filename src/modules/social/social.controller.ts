import { Controller, UseGuards, Get, Post, Param, Body, Query, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CommunityGuard } from '../../common/guards/community.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SocialService } from './social.service';

@ApiTags('social')
@ApiBearerAuth()
@UseGuards(CommunityGuard, JwtAuthGuard)
@Controller('social')
export class SocialController {
  constructor(private socialService: SocialService) {}

  @Get('playdates')
  getPlaydates() {
    return this.socialService.getPlaydates();
  }

  @Get('feed')
  getFeed(@Request() req: any, @Query('page') page?: string) {
    return this.socialService.getFeed(req.user?.id, page ? +page : 1);
  }

  @Post('posts')
  createPost(@Request() req: any, @Body() body: { content: string; photos?: string[] }) {
    return this.socialService.createPost(req.user?.id, body);
  }

  @Post('posts/:id/like')
  likePost(@Request() req: any, @Param('id') id: string) {
    // Like functionality not implemented yet — return mock
    return { success: true, postId: id };
  }
}
