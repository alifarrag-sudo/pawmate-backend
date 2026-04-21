import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, Request, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdoptionService } from './adoption.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CommunityGuard } from '../../common/guards/community.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('adoption')
@ApiBearerAuth()
@UseGuards(CommunityGuard, JwtAuthGuard)
@Controller('adoption')
export class AdoptionController {
  constructor(private adoptionService: AdoptionService) {}

  @Post()
  create(@Request() req: any, @Body() body: any) {
    return this.adoptionService.createPost(req.user?.id, body);
  }

  @Public()
  @Get()
  list(
    @Query('species') species?: string,
    @Query('district') district?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
  ) {
    return this.adoptionService.list({ species, district, status, search, page: page ? +page : 1 });
  }

  @Get('mine')
  getMine(@Request() req: any) {
    return this.adoptionService.getMine(req.user?.id);
  }

  @Get('threads')
  getMyThreads(@Request() req: any) {
    return this.adoptionService.getMyThreads(req.user?.id);
  }

  @Public()
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.adoptionService.getById(id);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.adoptionService.update(req.user?.id, id, body);
  }

  @Patch(':id/status')
  updateStatus(@Request() req: any, @Param('id') id: string, @Body('status') status: string) {
    return this.adoptionService.updateStatus(req.user?.id, id, status);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.adoptionService.remove(req.user?.id, id);
  }

  @Post(':id/messages')
  sendMessage(@Request() req: any, @Param('id') postId: string, @Body('text') text: string) {
    return this.adoptionService.sendMessage(req.user?.id, postId, text);
  }

  @Get(':id/messages')
  getMessages(@Request() req: any, @Param('id') postId: string) {
    return this.adoptionService.getMessages(req.user?.id, postId);
  }
}
