import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as schedule from 'node-schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterTicketDto } from './dto/register-ticket.dto';
import { TicketResponse } from './interfaces/ticket-responde.interface';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);
  private readonly API_URL = 'https://comensales.uncp.edu.pe/api/registros';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  async registerTicket(
    registerTicketDto: RegisterTicketDto,
  ): Promise<TicketResponse> {
    try {
      const payload = {
        t1_id: null,
        t1_dni: registerTicketDto.dni,
        t1_codigo: registerTicketDto.code,
        t1_nombres: '',
        t1_escuela: '',
        t1_estado: null,
        t3_periodos_t3_id: null,
      };

      const headers = {
        'Content-Type': 'application/json',
      };

      const requestConfig: AxiosRequestConfig = {
        headers,
      };

      const response = await axios.post(this.API_URL, payload, requestConfig);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to register ticket: ${error.message}`);
      // Return a standard error response to avoid type issues
      return { code: 500 };
    }
  }

  async scheduleTicketRegistration(userId: number, time: string = '10:00') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Parse schedule time (format: HH:MM)
    const [hour, minute] = time.split(':').map(Number);

    // Create a job name based on user
    const jobName = `ticket_registration_${user.id}`;

    // Schedule the job - run Monday to Friday at the specified time
    const job = schedule.scheduleJob(`${minute} ${hour} * * 1-5`, async () => {
      this.logger.log(
        `Running scheduled ticket registration for user ${user.name}`,
      );

      // Get default number of requests from .env or fallback to 10
      const defaultRequests =
        this.configService.get<string>('DEFAULT_REQUESTS');
      const numRequests = defaultRequests ? parseInt(defaultRequests, 10) : 10;

      // Get interval between requests from .env or fallback to 50ms
      const defaultInterval = this.configService.get<string>(
        'DEFAULT_INTERVAL_MS',
      );
      const intervalMs = defaultInterval ? parseInt(defaultInterval, 10) : 50;

      // Send multiple requests with short intervals to maximize chances
      for (let i = 0; i < numRequests; i++) {
        try {
          const result = await this.registerTicket({
            dni: user.dni,
            code: user.code,
          });

          if (result.code === 201) {
            this.logger.log(
              `Successfully registered ticket for ${user.name}: ${JSON.stringify(result)}`,
            );
            // Stop sending requests if one succeeds
            break;
          }

          // Small delay between requests
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        } catch (error) {
          this.logger.error(`Attempt ${i + 1} failed: ${error.message}`);
        }
      }
    });

    // Add job to registry so we can manage it later
    this.schedulerRegistry.addCronJob(jobName, job);

    return {
      message: `Scheduled ticket registration for user ${user.name} at ${time}`,
    };
  }

  async manualRegister(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Get default number of requests from .env or fallback to 10
    const defaultRequests = this.configService.get<string>('DEFAULT_REQUESTS');
    const numRequests = defaultRequests ? parseInt(defaultRequests, 10) : 10;

    // Get interval between requests from .env or fallback to 50ms
    const defaultInterval = this.configService.get<string>(
      'DEFAULT_INTERVAL_MS',
    );
    const intervalMs = defaultInterval ? parseInt(defaultInterval, 10) : 50;

    const results: TicketResponse[] = [];

    for (let i = 0; i < numRequests; i++) {
      try {
        const result = await this.registerTicket({
          dni: user.dni,
          code: user.code,
        });

        results.push(result);

        if (result.code === 201) {
          // Success - stop sending requests
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } catch (error) {
        this.logger.error(`Attempt ${i + 1} failed: ${error.message}`);
      }
    }

    return results;
  }
}
