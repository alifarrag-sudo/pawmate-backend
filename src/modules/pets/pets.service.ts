import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PetsService {
  constructor(private prisma: PrismaService) {}

  async findByOwner(ownerId: string) {
    return this.prisma.pet.findMany({
      where: { ownerId, isActive: true },
      include: { medicalInfo: true, behavior: true, vaccinations: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(ownerId: string, data: any) {
    return this.prisma.pet.create({
      data: { ...data, ownerId },
    });
  }

  async update(ownerId: string, petId: string, data: any) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, ownerId } });
    if (!pet) throw new NotFoundException('Pet not found');
    return this.prisma.pet.update({ where: { id: petId }, data });
  }

  async softDelete(ownerId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, ownerId } });
    if (!pet) throw new NotFoundException('Pet not found');
    return this.prisma.pet.update({ where: { id: petId }, data: { isActive: false } });
  }

  async addPhotos(ownerId: string, petId: string, photoUrls: string[]) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, ownerId } });
    if (!pet) throw new NotFoundException('Pet not found');
    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        photos: { push: photoUrls },
        profilePhoto: pet.profilePhoto ?? photoUrls[0],
      },
    });
    return updated;
  }
}
