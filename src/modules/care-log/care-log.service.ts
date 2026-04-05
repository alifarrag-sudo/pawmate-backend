import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CareLogService {
  constructor(private prisma: PrismaService) {}

  async getByBooking(bookingId: string) {
    return this.prisma.careLog.findMany({
      where: { bookingId },
      include: {
        pet: { select: { id: true, name: true, species: true, profilePhoto: true } },
        completedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { scheduledTime: 'asc' },
    });
  }

  async markComplete(sitterId: string, careLogId: string, notes?: string) {
    const log = await this.prisma.careLog.findUnique({ where: { id: careLogId } });
    if (!log) throw new NotFoundException('Care log entry not found');
    return this.prisma.careLog.update({
      where: { id: careLogId },
      data: {
        completedAt: new Date(),
        completedById: sitterId,
        notes: notes || null,
      },
    });
  }

  // Called by the notification queue when service starts — creates all care log entries
  async scheduleFromPetProfiles(bookingId: string, petIds: string[], serviceDate: Date) {
    const pets = await this.prisma.pet.findMany({
      where: { id: { in: petIds } },
      include: {
        schedules: { where: { isActive: true, scheduleType: { in: ['walk', 'feeding'] } } },
        medications: { where: { isActive: true } },
      },
    });

    const entries: any[] = [];

    for (const pet of pets) {
      // Walk schedules
      for (const sched of pet.schedules.filter((s: any) => s.scheduleType === 'walk')) {
        const [h, m] = sched.scheduledTime.split(':').map(Number);
        const scheduled = new Date(serviceDate);
        scheduled.setHours(h, m, 0, 0);
        entries.push({
          bookingId, petId: pet.id,
          actionType: 'walk',
          scheduledTime: scheduled,
        });
      }

      // Meal schedules
      for (const sched of pet.schedules.filter((s: any) => s.scheduleType === 'feeding')) {
        const [h, m] = sched.scheduledTime.split(':').map(Number);
        const scheduled = new Date(serviceDate);
        scheduled.setHours(h, m, 0, 0);
        entries.push({
          bookingId, petId: pet.id,
          actionType: 'meal',
          scheduledTime: scheduled,
        });
      }

      // Medication schedules
      for (const med of pet.medications) {
        for (const time of (med.adminTimes || [])) {
          const [h, m] = time.split(':').map(Number);
          const scheduled = new Date(serviceDate);
          scheduled.setHours(h, m, 0, 0);
          entries.push({
            bookingId, petId: pet.id,
            actionType: 'medication',
            scheduledTime: scheduled,
          });
        }
      }
    }

    if (entries.length > 0) {
      await this.prisma.careLog.createMany({ data: entries });
    }

    return this.getByBooking(bookingId);
  }

  async cancelByBooking(bookingId: string) {
    // Delete uncompleted care logs when booking is cancelled/completed
    await this.prisma.careLog.deleteMany({
      where: { bookingId, completedAt: null },
    });
  }
}
