import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { TicketsService } from './tickets.service';
import { TicketsGateway } from './tickets.gateway';

@Injectable()
export class ScheduleService implements OnModuleInit {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(forwardRef(() => TicketsService))
    private readonly ticketsService: TicketsService,
    @Inject(forwardRef(() => TicketsGateway))
    private readonly ticketsGateway: TicketsGateway,
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

    this.logger.log(
      `Creating schedule for user ${userId} on ${scheduledDate} at ${scheduledTime}`,
    );

    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      this.logger.error(`User with ID ${userId} not found`);
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Validate and normalize time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    let normalizedTime = scheduledTime;

    if (!timeRegex.test(scheduledTime)) {
      // Try to add seconds if format is HH:MM
      if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(scheduledTime)) {
        normalizedTime = `${scheduledTime}:00`;
      } else {
        this.logger.error(`Invalid time format: ${scheduledTime}`);
        throw new Error(
          `Invalid time format. Expected HH:MM:SS, got: ${scheduledTime}`,
        );
      }
    }

    // Validate and parse date (keep it as local date, not UTC)
    const scheduleDate = new Date(scheduledDate + 'T00:00:00'); // Force local timezone
    if (isNaN(scheduleDate.getTime())) {
      this.logger.error(`Invalid date format: ${scheduledDate}`);
      throw new Error(`Invalid date format: ${scheduledDate}`);
    }

    this.logger.log(
      `📅 Parsed schedule date (LOCAL): ${scheduleDate.toLocaleString()}`,
    );
    this.logger.log(
      `📅 Parsed schedule date (UTC): ${scheduleDate.toISOString()}`,
    );

    // For non-recurring schedules, check if the datetime is in the future
    if (!isRecurring) {
      const [hour, minute, second] = normalizedTime.split(':').map(Number);

      // Create target datetime in local timezone
      const targetDateTime = new Date(scheduleDate);
      targetDateTime.setHours(hour, minute, second, 0);

      const now = new Date();

      this.logger.log(
        `Target datetime (local): ${targetDateTime.toLocaleString()}`,
      );
      this.logger.log(`Current datetime (local): ${now.toLocaleString()}`);
      this.logger.log(
        `Time difference: ${targetDateTime.getTime() - now.getTime()}ms`,
      );

      if (targetDateTime <= now) {
        this.logger.warn(
          `Schedule datetime is in the past: ${targetDateTime.toLocaleString()}`,
        );
        // Don't throw error, just warn - allow past dates for testing
      }
    }

    // Validate recurring days if recurring is enabled
    if (isRecurring && (!recurringDays || recurringDays.length === 0)) {
      this.logger.error('Recurring schedule requires at least one day');
      throw new Error(
        'Recurring schedule requires at least one day to be selected',
      );
    }

    try {
      // Create schedule in database
      const newSchedule = await this.prisma.schedule.create({
        data: {
          userId,
          scheduledDate: scheduleDate,
          scheduledTime: normalizedTime,
          isRecurring: isRecurring || false,
          recurringDays: recurringDays ? JSON.stringify(recurringDays) : null,
          description,
        },
        include: {
          user: true,
        },
      });

      this.logger.log(
        `Schedule created in database with ID: ${newSchedule.id}`,
      );

      // Create the actual scheduled job
      await this.createScheduledJob(newSchedule);

      this.logger.log(
        `✅ Successfully created schedule ${newSchedule.id} for user ${user.name} on ${scheduledDate} at ${normalizedTime}`,
      );

      return newSchedule;
    } catch (error) {
      this.logger.error(`Failed to create schedule: ${error.message}`);
      throw error;
    }
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
      this.logger.log(`🔧 Creating scheduled job: ${jobName}`);
      this.logger.log(
        `🌍 Server timezone offset: ${new Date().getTimezoneOffset()} minutes`,
      );
      this.logger.log(`🌍 Server local time: ${new Date().toLocaleString()}`);
      this.logger.log(
        `📋 Schedule data: ${JSON.stringify(
          {
            id: scheduleData.id,
            userId: scheduleData.userId,
            scheduledDate: scheduleData.scheduledDate,
            scheduledTime: scheduleData.scheduledTime,
            isRecurring: scheduleData.isRecurring,
            recurringDays: scheduleData.recurringDays,
          },
          null,
          2,
        )}`,
      );

      // Remove existing job if it exists
      await this.removeScheduledJob(scheduleData);

      // Parse time components
      const timeParts = scheduleData.scheduledTime.split(':');
      if (timeParts.length !== 3) {
        throw new Error(
          `Invalid time format: ${scheduleData.scheduledTime}. Expected HH:MM:SS`,
        );
      }

      const [hour, minute, second] = timeParts.map(Number);

      // Validate time components
      if (
        isNaN(hour) ||
        isNaN(minute) ||
        isNaN(second) ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59 ||
        second < 0 ||
        second > 59
      ) {
        throw new Error(`Invalid time values: ${hour}:${minute}:${second}`);
      }

      let cronExpression: string;
      let targetDate: Date | null = null;

      if (scheduleData.isRecurring && scheduleData.recurringDays) {
        // Recurring schedule - runs on specific days of the week
        const days = JSON.parse(scheduleData.recurringDays);
        const dayNumbers = this.convertDaysToNumbers(days);

        if (dayNumbers.length === 0) {
          throw new Error('No valid recurring days specified');
        }

        // Cron format: second minute hour day month dayOfWeek
        cronExpression = `${second} ${minute} ${hour} * * ${dayNumbers.join(',')}`;
        this.logger.log(
          `🔄 Recurring schedule cron: ${cronExpression} for days: ${days.join(', ')}`,
        );
      } else {
        // One-time schedule - runs on a specific date and time
        const scheduleDate = new Date(scheduleData.scheduledDate);

        // Create target date in LOCAL timezone (not UTC)
        targetDate = new Date(
          scheduleDate.getFullYear(),
          scheduleDate.getMonth(),
          scheduleDate.getDate(),
          hour,
          minute,
          second,
        );

        this.logger.log(
          `🎯 Target execution time (LOCAL): ${targetDate.toLocaleString()}`,
        );
        this.logger.log(
          `🎯 Target execution time (UTC): ${targetDate.toISOString()}`,
        );
        this.logger.log(
          `🕐 Current time (LOCAL): ${new Date().toLocaleString()}`,
        );
        this.logger.log(`🕐 Current time (UTC): ${new Date().toISOString()}`);

        // Check if the date is in the future (allow 30 seconds tolerance for testing)
        const now = new Date();
        const timeDiff = targetDate.getTime() - now.getTime();

        this.logger.log(
          `⏱️ Time difference: ${timeDiff}ms (${Math.round(timeDiff / 1000)}s)`,
        );

        if (timeDiff < -30000) {
          // More than 30 seconds in the past
          this.logger.warn(
            `⚠️ Schedule ${scheduleData.id} is set for a past date/time (${targetDate.toLocaleString()}), skipping job creation`,
          );
          return;
        }

        // For one-time schedules, use specific date format (using LOCAL date components)
        cronExpression = `${second} ${minute} ${hour} ${targetDate.getDate()} ${targetDate.getMonth() + 1} *`;
        this.logger.log(`📅 One-time schedule cron: ${cronExpression}`);
        this.logger.log(
          `📅 Will execute on: ${targetDate.getDate()}/${targetDate.getMonth() + 1} at ${hour}:${minute}:${second} LOCAL TIME`,
        );
      }

      // Create execution function
      const executeJob = async () => {
        this.logger.log(
          `🚀 EXECUTING scheduled ticket registration for user ${scheduleData.user.name} (Schedule ID: ${scheduleData.id})`,
        );
        this.logger.log(`⏰ Execution time: ${new Date().toISOString()}`);

        try {
          // Notify start of scheduled execution
          this.ticketsGateway.broadcastStatus(
            `🚀 Ejecutando programación para ${scheduleData.user.name}`,
            { scheduleId: scheduleData.id, userId: scheduleData.userId },
          );

          const results = await this.ticketsService.manualRegisterParallel(
            scheduleData.userId,
          );
          const successResults = results.filter((r) => r.code === 201);

          // Send detailed results to WebSocket clients
          this.ticketsGateway.broadcastStatus(
            `📊 Resultados de programación para ${scheduleData.user.name}`,
            {
              scheduleId: scheduleData.id,
              userId: scheduleData.userId,
              userName: scheduleData.user.name,
              totalAttempts: results.length,
              successfulAttempts: successResults.length,
              results: results,
              summary: results.map((r) => ({
                code: r.code,
                message: this.getCodeMessage(r.code),
              })),
            },
          );

          if (successResults.length > 0) {
            this.logger.log(
              `✅ Scheduled registration successful! ${successResults.length} tickets obtained for ${scheduleData.user.name}`,
            );

            this.ticketsGateway.broadcastStatus(
              `✅ ¡Programación exitosa! ${successResults.length} tickets obtenidos para ${scheduleData.user.name}`,
              {
                scheduleId: scheduleData.id,
                success: true,
                tickets: successResults,
              },
            );
          } else {
            this.logger.warn(
              `⚠️ Scheduled registration failed for ${scheduleData.user.name} - no tickets obtained`,
            );

            this.ticketsGateway.broadcastStatus(
              `⚠️ Programación falló para ${scheduleData.user.name} - ningún ticket obtenido`,
              {
                scheduleId: scheduleData.id,
                success: false,
                attempts: results.length,
                codes: results.map((r) => r.code),
              },
            );
          }

          // If it's a one-time schedule, mark it as inactive after execution
          if (!scheduleData.isRecurring) {
            await this.prisma.schedule.update({
              where: { id: scheduleData.id },
              data: { isActive: false },
            });
            await this.removeScheduledJob(scheduleData);
            this.logger.log(
              `✅ One-time schedule ${scheduleData.id} completed and deactivated`,
            );

            this.ticketsGateway.broadcastStatus(
              `📅 Programación única completada y desactivada (ID: ${scheduleData.id})`,
              { scheduleId: scheduleData.id, completed: true },
            );
          }
        } catch (error) {
          this.logger.error(
            `❌ Error in scheduled registration for ${scheduleData.user.name}: ${error.message}`,
            error.stack,
          );

          this.ticketsGateway.broadcastStatus(
            `❌ Error en programación para ${scheduleData.user.name}: ${error.message}`,
            {
              scheduleId: scheduleData.id,
              error: true,
              message: error.message,
            },
          );
        }
      };

      // Create the job using CronJob with proper timezone
      const job = new CronJob(
        cronExpression,
        executeJob,
        null, // onComplete
        false, // start immediately = false
        'America/Lima', // timezone - adjust as needed
      );

      // Verify job was created
      if (!job) {
        throw new Error('Failed to create scheduled job - job is null');
      }

      // Start the job
      job.start();

      this.logger.log(
        `✅ Successfully created and started scheduled job ${jobName} with cron: ${cronExpression}`,
      );

      // Store job reference for manual cleanup
      (this as any)[`job_${scheduleData.id}`] = job;

      // Log next execution time
      try {
        const nextDates = job.nextDates(1);
        if (nextDates && nextDates.length > 0) {
          const nextDate = nextDates[0];
          this.logger.log(
            `Next execution scheduled for: ${nextDate.toString()}`,
          );
        }
      } catch (error) {
        this.logger.debug(
          `Could not get next execution time: ${error.message}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ Failed to create scheduled job for schedule ${scheduleData.id}: ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw to let the caller handle it
    }
  }

  private async removeScheduledJob(scheduleData: any) {
    const jobName = `schedule_${scheduleData.id}`;
    const jobKey = `job_${scheduleData.id}`;

    try {
      // Try to remove from scheduler registry first
      try {
        this.schedulerRegistry.deleteCronJob(jobName);
        this.logger.log(`Removed scheduled job ${jobName} from registry`);
      } catch (error) {
        // Job not in registry, try manual cleanup
        this.logger.debug(`Job ${jobName} not found in registry`);
      }

      // Manual cleanup of stored job reference
      const job = (this as any)[jobKey];
      if (job) {
        job.stop();
        delete (this as any)[jobKey];
        this.logger.log(`Stopped and removed manual job reference ${jobKey}`);
      }
    } catch (error) {
      this.logger.debug(`Error removing job ${jobName}: ${error.message}`);
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

  // Debug methods
  getActiveJobs() {
    const jobs: any[] = [];
    const keys = Object.keys(this as any).filter((key) =>
      key.startsWith('job_'),
    );

    for (const key of keys) {
      const job = (this as any)[key];
      if (job) {
        const scheduleId = key.replace('job_', '');
        try {
          const nextDates = job.nextDates(3);
          jobs.push({
            scheduleId: parseInt(scheduleId),
            jobKey: key,
            running: job.running,
            nextExecutions: nextDates
              ? nextDates.map((d: any) => d.toString())
              : [],
          });
        } catch (error: any) {
          jobs.push({
            scheduleId: parseInt(scheduleId),
            jobKey: key,
            running: job.running,
            error: error.message,
          });
        }
      }
    }

    return {
      totalJobs: jobs.length,
      jobs,
    };
  }

  async testScheduleExecution(scheduleId: number) {
    const schedule = await this.findSchedule(scheduleId);

    this.logger.log(`🧪 Testing schedule execution for ID: ${scheduleId}`);

    try {
      const results = await this.ticketsService.manualRegisterParallel(
        schedule.userId,
      );
      const successResults = results.filter((r) => r.code === 201);

      return {
        message: 'Test execution completed',
        scheduleId,
        userName: schedule.user.name,
        totalAttempts: results.length,
        successfulAttempts: successResults.length,
        results: results.slice(0, 3), // Only return first 3 results for brevity
      };
    } catch (error) {
      this.logger.error(`❌ Test execution failed: ${error.message}`);
      throw error;
    }
  }

  // Helper method to get human-readable message for response codes
  private getCodeMessage(code: number): string {
    const codeMessages = {
      201: '✅ Ticket obtenido exitosamente',
      300: '⚠️ Múltiples opciones disponibles',
      400: '❌ Solicitud incorrecta',
      401: '🔒 No autorizado',
      403: '🚫 Acceso prohibido',
      404: '🔍 No encontrado',
      409: '⚡ Conflicto - posiblemente ya registrado',
      429: '🚦 Demasiadas solicitudes',
      500: '💥 Error interno del servidor',
      502: '🌐 Error de gateway',
      503: '⏳ Servicio no disponible',
      504: '⏰ Timeout del gateway',
    };

    return codeMessages[code] || `❓ Código desconocido: ${code}`;
  }
}
