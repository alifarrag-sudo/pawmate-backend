import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AdoptionService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ============================================================
  // POSTS
  // ============================================================

  async createPost(userId: string, data: {
    petName: string;
    species: string;
    breed?: string;
    ageCategory?: string;
    gender?: string;
    isNeutered?: boolean;
    isVaccinated?: boolean;
    description: string;
    photos?: string[];
    district?: string;
    city?: string;
    requirements?: string;
    contactMethod?: string;
    contactPhone?: string;
  }) {
    return this.prisma.adoptionPost.create({
      data: {
        posterId: userId,
        petName: data.petName,
        species: data.species as any,
        breed: data.breed,
        ageCategory: data.ageCategory as any,
        gender: (data.gender as any) || 'unknown',
        isNeutered: data.isNeutered ?? false,
        isVaccinated: data.isVaccinated ?? false,
        description: data.description,
        photos: data.photos || [],
        district: data.district,
        city: data.city || 'Cairo',
        requirements: data.requirements,
        contactMethod: (data.contactMethod as any) || 'in_app',
        contactPhone: data.contactPhone,
      } as any,
      include: { poster: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
    });
  }

  async list(params: {
    species?: string;
    district?: string;
    status?: string;
    search?: string;
    page?: number;
  }) {
    const page = params.page || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (params.status) {
      where.status = params.status;
    } else {
      where.status = { in: ['available', 'pending'] };
    }
    if (params.species) where.species = params.species;
    if (params.district) where.district = { contains: params.district, mode: 'insensitive' };
    if (params.search) {
      where.OR = [
        { petName: { contains: params.search, mode: 'insensitive' } },
        { breed: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.adoptionPost.findMany({
        where,
        include: { poster: { select: { id: true, firstName: true, profilePhoto: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.adoptionPost.count({ where }),
    ]);

    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    const post = await this.prisma.adoptionPost.findFirst({
      where: { id, deletedAt: null },
      include: { poster: { select: { id: true, firstName: true, lastName: true, profilePhoto: true, phone: true } } },
    });
    if (!post) throw new NotFoundException('Adoption post not found.');
    return post;
  }

  async getMine(userId: string) {
    return this.prisma.adoptionPost.findMany({
      where: { posterId: userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, id: string, data: any) {
    const post = await this.getById(id);
    if (post.posterId !== userId) throw new ForbiddenException('Not your post.');
    return this.prisma.adoptionPost.update({
      where: { id },
      data: data as any,
    });
  }

  async updateStatus(userId: string, id: string, status: string) {
    const post = await this.getById(id);
    if (post.posterId !== userId) throw new ForbiddenException('Not your post.');
    const allowed = ['available', 'pending', 'adopted'];
    if (!allowed.includes(status)) throw new BadRequestException('Invalid status.');
    return this.prisma.adoptionPost.update({ where: { id }, data: { status: status as any } });
  }

  async remove(userId: string, id: string) {
    const post = await this.getById(id);
    if (post.posterId !== userId) throw new ForbiddenException('Not your post.');
    await this.prisma.adoptionPost.update({ where: { id }, data: { deletedAt: new Date() } });
    return { success: true };
  }

  // ============================================================
  // MESSAGES
  // ============================================================

  async sendMessage(senderId: string, postId: string, text: string) {
    const post = await this.getById(postId);
    if (post.posterId === senderId) throw new BadRequestException('Cannot message your own post.');

    const message = await this.prisma.adoptionMessage.create({
      data: {
        postId,
        senderId,
        receiverId: post.posterId,
        text,
      },
      include: { sender: { select: { id: true, firstName: true, profilePhoto: true } } },
    });

    this.eventEmitter.emit('adoption.message', {
      receiverId: post.posterId,
      senderName: (message.sender as any).firstName,
      petName: post.petName,
      postId,
      messageId: message.id,
    });

    return message;
  }

  async getMessages(userId: string, postId: string) {
    const post = await this.getById(postId);
    // Poster sees all threads; inquirer sees only their own thread
    const where: any = { postId };
    if (post.posterId !== userId) {
      where.OR = [
        { senderId: userId, receiverId: post.posterId },
        { senderId: post.posterId, receiverId: userId },
      ];
    }

    const messages = await this.prisma.adoptionMessage.findMany({
      where,
      include: { sender: { select: { id: true, firstName: true, profilePhoto: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Mark received messages as read
    await this.prisma.adoptionMessage.updateMany({
      where: { postId, receiverId: userId, isRead: false },
      data: { isRead: true },
    });

    return messages;
  }

  async getMyThreads(userId: string) {
    // Returns distinct adoption posts the user has messaged about
    const messages = await this.prisma.adoptionMessage.findMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      distinct: ['postId'],
      include: {
        post: { select: { id: true, petName: true, photos: true, status: true } },
        sender: { select: { id: true, firstName: true, profilePhoto: true } },
        receiver: { select: { id: true, firstName: true, profilePhoto: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return messages;
  }
}
