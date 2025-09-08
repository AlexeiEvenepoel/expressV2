import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { TicketsService } from './tickets.service';
import * as schedule from 'node-schedule';

@Injectable()
export class ScheduleService implements OnModuleInit {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(forwardRef(() => TicketsService))
    private readonly ticketsService: TicketsService,
  ) {}

  async onModuleInit() {
    // Initialize all active schedules when the module starts
    setTimeout(() => this.initializeSchedules(), 2000); // Delay to ensure TicketsService is ready
  }

  async createSchedule(createScheduleDto: CreateScheduleDto) {
    const {
      userId,
      scheduledDate,
      scheduledTime,
      isRecurring,
      recurringDays,
      description,
    } = createScheduleDto;

    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Normalize time format (add seconds if not provided)
    const normalizedTime =
      scheduledTime.includes(':') && scheduledTime.split(':').length === 2
        ? `${scheduledTime}:00`
        : scheduledTime;

    // Create schedule in database
    const newSchedule = await this.prisma.schedule.create({
      data: {
        userId,
        scheduledDate: new Date(scheduledDate),
        scheduledTime: normalizedTime,
        isRecurring: isRecurring || false,
        recurringDays: recurringDays ? JSON.stringify(recurringDays) : null,
        description,
      },
      include: {
        user: true,
      },
    });

    // Create the actual scheduled job
    await this.createScheduledJob(newSchedule);

    this.logger.log(
      `Created schedule ${newSchedule.id} for user ${user.name} on ${scheduledDate} at ${normalizedTime}`,
    );

    return newSchedule;
  }

  async findAllSchedules(userId?: number) {
    const where = userId ? { userId } : {};

    return this.prisma.schedule.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            dni: true,
            code: true,
          },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
    });
  }

  async findSchedule(id: number) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            dni: true,
            code: true,
          },
        },
      },
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }

    return schedule;
  }

  async updateSchedule(id: number, updateScheduleDto: UpdateScheduleDto) {
    const existingSchedule = await this.findSchedule(id);

    // Remove old job if it exists
    await this.removeScheduledJob(existingSchedule);

    // Update schedule in database
    const updatedSchedule = await this.prisma.schedule.update({
      where: { id },
      data: {
        ...updateScheduleDto,
        recurringDays: updateScheduleDto.recurringDays
          ? JSON.stringify(updateScheduleDto.recurringDays)
          : undefined,
      },
      include: {
        user: true,
      },
    });

    // Create new job if schedule is still active
    if (updatedSchedule.isActive) {
      await this.createScheduledJob(updatedSchedule);
    }

    this.logger.log(`Updated schedule ${id}`);

    return updatedSchedule;
  }

  async deleteSchedule(id: number) {
    const schedule = await this.findSchedule(id);

    // Remove scheduled job
    await this.removeScheduledJob(schedule);

    // Delete from database
    await this.prisma.schedule.delete({
      where: { id },
    });

    this.logger.log(`Deleted schedule ${id}`);

    return { message: `Schedule ${id} deleted successfully` };
  }

  async toggleSchedule(id: number) {
    const schedule = await this.findSchedule(id);

    const updatedSchedule = await this.prisma.schedule.update({
      where: { id },
      data: {
        isActive: !schedule.isActive,
      },
      include: {
        user: true,
      },
    });

    if (updatedSchedule.isActive) {
      await this.createScheduledJob(updatedSchedule);
    } else {
      await this.removeScheduledJob(updatedSchedule);
    }

    this.logger.log(
      `Toggled schedule ${id} to ${updatedSchedule.isActive ? 'active' : 'inactive'}`,
    );

    return updatedSchedule;
  }

  private async createScheduledJob(scheduleData: any) {
    const jobName = `schedule_${scheduleData.id}`;

    try {
      // Remove existing job if it exists
      try {
        this.schedulerRegistry.deleteCronJob(jobName);
      } catch (error) {
        // Job doesn't exist, continue
      }

      const [hour, minute, second] = scheduleData.scheduledTime
        .split(':')
        .map(Number);

      let cronExpression: string;

      if (scheduleData.isRecurring && scheduleData.recurringDays) {
        // Recurring schedule
        const days = JSON.parse(scheduleData.recurringDays);
        const dayNumbers = this.convertDaysToNumbers(days);
        cronExpression = `${second} ${minute} ${hour} * * ${dayNumbers.join(',')}`;
      } else {
        // One-time schedule
        const scheduleDate = new Date(scheduleData.scheduledDate);
        const targetDate = new Date(scheduleDate);
        targetDate.setHours(hour, minute, second, 0);

        // Check if the date is in the future
        if (targetDate <= new Date()) {
          this.logger.warn(
            `Schedule ${scheduleData.id} is set for a past date/time, skipping job creation`,
          );
          return;
        }

        cronExpression = `${second} ${minute} ${hour} ${scheduleDate.getDate()} ${scheduleDate.getMonth() + 1} *`;
      }

      const job = schedule.scheduleJob(cronExpression, async () => {
        this.logger.log(
          `Executing scheduled ticket registration for user ${scheduleData.user.name}`,
        );

        try {
          const results = await this.ticketsService.manualRegisterParallel(
            scheduleData.userId,
          );
          const successResults = results.filter((r) => r.code === 201);

          if (successResults.length > 0) {
            this.logger.log(
              `✅ Scheduled registration successful! ${successResults.length} tickets obtained for ${scheduleData.user.name}`,
            );
          } else {
            this.logger.warn(
              `⚠️ Scheduled registration failed for ${scheduleData.user.name} - no tickets obtained`,
            );
          }

          // If it's a one-time schedule, mark it as inactive after execution
          if (!scheduleData.isRecurring) {
            await this.prisma.schedule.update({
              where: { id: scheduleData.id },
              data: { isActive: false },
            });
            this.removeScheduledJob(scheduleData);
          }
        } catch (error) {
          this.logger.error(
            `❌ Error in scheduled registration for ${scheduleData.user.name}: ${error.message}`,
          );
        }
      });

      this.schedulerRegistry.addCronJob(jobName, job);

      this.logger.log(
        `Created scheduled job ${jobName} with cron: ${cronExpression}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create scheduled job for schedule ${scheduleData.id}: ${error.message}`,
      );
    }
  }

  private async removeScheduledJob(scheduleData: any) {
    const jobName = `schedule_${scheduleData.id}`;

    try {
      this.schedulerRegistry.deleteCronJob(jobName);
      this.logger.log(`Removed scheduled job ${jobName}`);
    } catch (error) {
      // Job doesn't exist or already removed
      this.logger.debug(`Job ${jobName} not found or already removed`);
    }
  }

  private convertDaysToNumbers(days: string[]): number[] {
    const dayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    return days
      .map((day) => dayMap[day.toLowerCase()])
      .filter((num) => num !== undefined);
  }

  // Get upcoming schedules for the next 7 days
  getUpcomingSchedules(userId?: number) {
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    const where: any = {
      isActive: true,
      OR: [
        {
          // One-time schedules in the next week
          isRecurring: false,
          scheduledDate: {
            gte: now,
            lte: nextWeek,
          },
        },
        {
          // Recurring schedules (always show if active)
          isRecurring: true,
        },
      ],
    };

    if (userId) {
      where.userId = userId;
    }

    return this.prisma.schedule.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            dni: true,
            code: true,
          },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
    });
  }

  // Initialize all active schedules on service startup
  async initializeSchedules() {
    const activeSchedules = await this.prisma.schedule.findMany({
      where: { isActive: true },
      include: { user: true },
    });

    this.logger.log(`Initializing ${activeSchedules.length} active schedules`);

    for (const schedule of activeSchedules) {
      await this.createScheduledJob(schedule);
    }

    this.logger.log('All active schedules initialized');
  }
}
