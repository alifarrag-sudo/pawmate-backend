import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SocialService {
  constructor(private prisma: PrismaService) {}

  async getPlaydates(limit = 20) {
    return (this.prisma as any).playdate.findMany({
      where: { status: 'open', scheduledAt: { gte: new Date() } },
      include: { attendees: true },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    });
  }

  async getFeed(userId: string, page = 1) {
    // Social posts not in schema yet — return empty feed
    return { posts: [] };
  }

  async createPost(userId: string, data: { content: string; photos?: string[] }) {
    // Social posts not in schema yet — return mock
    return { id: 'mock', content: data.content, authorId: userId, createdAt: new Date() };
  }
}
