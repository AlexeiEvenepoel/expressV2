import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as schedule from 'node-schedule';
import * as FormData from 'form-data';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterTicketDto } from './dto/register-ticket.dto';
import { TicketResponse } from './interfaces/ticket-responde.interface';
import { TicketWorkerService } from './tickets.worker';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);
  private readonly API_URL = 'https://comensales.uncp.edu.pe/api/registros';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private schedulerRegistry: SchedulerRegistry,
    private readonly ticketWorker: TicketWorkerService,
  ) {}

  async registerTicket(
    registerTicketDto: RegisterTicketDto,
  ): Promise<TicketResponse> {
    try {
      this.logger.log(
        `Enviando solicitud para DNI: ${registerTicketDto.dni}, Código: ${registerTicketDto.code}`,
      );

      const payload = {
        t1_id: null,
        t1_dni: registerTicketDto.dni,
        t1_codigo: registerTicketDto.code,
        t1_nombres: '',
        t1_escuela: '',
        t1_estado: null,
        t3_periodos_t3_id: null,
      };

      this.logger.log(`Payload: ${JSON.stringify(payload)}`);

      // Crear FormData y añadir el JSON como campo "data" - CLAVE DEL ÉXITO
      const form = new FormData();
      form.append('data', JSON.stringify(payload));

      const startTime = Date.now();
      const response = await axios.post(this.API_URL, form, {
        headers: {
          ...form.getHeaders(),
          Referer: 'https://comensales.uncp.edu.pe/', // Importante: añadir el referer
        },
        timeout: 10000, // 10 segundos timeout
      });
      const endTime = Date.now();

      this.logger.log(`Respuesta recibida (${endTime - startTime}ms)`);
      this.logger.log(`Código de estado: ${response.status}`);
      this.logger.log(`Datos: ${JSON.stringify(response.data)}`);

      if (response.data.code === 201) {
        this.logger.log(
          `¡REGISTRO EXITOSO! Ticket obtenido: ${response.data.t2_codigo}`,
        );
        this.logger.log(`Estudiante: ${response.data.t1_nombres}`);
        this.logger.log(`Escuela: ${response.data.t1_escuela}`);
      } else {
        this.logger.log(`Registro fallido con código: ${response.data.code}`);
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`Error de API: ${error.message}`);
        if (error.response) {
          this.logger.error(`Estado de respuesta: ${error.response.status}`);
          this.logger.error(
            `Datos de respuesta: ${JSON.stringify(error.response.data)}`,
          );
        } else if (error.request) {
          this.logger.error('No se recibió respuesta del servidor');
        }
      } else {
        this.logger.error(`Error inesperado: ${error.message}`);
      }

      // Devolver objeto de respuesta estándar para errores
      return { code: 500 };
    }
  }

  async registerTicketWithRetry(
    registerTicketDto: RegisterTicketDto,
    maxRetries = 3,
  ): Promise<TicketResponse> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.registerTicket(registerTicketDto);
        if (result.code !== 500) {
          return result;
        }
        // Si obtenemos código 500, intentamos de nuevo
        this.logger.warn(
          `Intento ${attempt}/${maxRetries} falló con código 500, reintentando...`,
        );
      } catch (error) {
        this.logger.error(
          `Error en intento ${attempt}/${maxRetries}: ${error.message}`,
        );
      }

      // Esperar antes del siguiente intento (backoff exponencial)
      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, etc.
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Si llegamos aquí, todos los intentos fallaron
    return { code: 500 };
  }

  // NUEVO: Registro paralelo para máxima velocidad
  async manualRegisterParallel(userId: number): Promise<TicketResponse[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Determinar el número de solicitudes paralelas
    const defaultRequests = this.configService.get<string>('DEFAULT_REQUESTS');
    const numRequests = defaultRequests ? parseInt(defaultRequests, 10) : 10;

    this.logger.log(
      `Iniciando ${numRequests} solicitudes paralelas para usuario ${user.name}`,
    );

    // Crear array de promesas para solicitudes paralelas
    const requestPromises: Promise<TicketResponse>[] = [];

    for (let i = 0; i < numRequests; i++) {
      // Crear una pequeña variación en el tiempo para no enviar todas exactamente al mismo tiempo
      const delay = Math.floor(Math.random() * 50); // 0-50ms variación

      const promise = new Promise<TicketResponse>((resolve) =>
        setTimeout(() => {
          this.ticketWorker
            .registerTicket({
              dni: user.dni,
              code: user.code,
            })
            .then(resolve);
        }, delay),
      );

      requestPromises.push(promise);
    }

    // Ejecutar todas las solicitudes en paralelo y esperar a que todas terminen
    const results = await Promise.all(requestPromises);

    // Verificar si alguna fue exitosa
    const successResults = results.filter((r) => r.code === 201);
    if (successResults.length > 0) {
      this.logger.log(
        `¡${successResults.length} registros exitosos! Primero: ${successResults[0].t2_codigo}`,
      );
    }

    return results;
  }

  // NUEVO: Sistema de carrera - finaliza tan pronto como una solicitud tenga éxito
  async fastRegister(userId: number): Promise<TicketResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Número de solicitudes simultáneas para la carrera
    const parallelAttempts = 8;

    this.logger.log(
      `Iniciando carrera de ${parallelAttempts} solicitudes para usuario ${user.name}`,
    );

    // Promise.race se resolverá tan pronto como una de las promesas se complete exitosamente
    const racePromises = Array(parallelAttempts)
      .fill(0)
      .map(
        (_, index) =>
          new Promise<TicketResponse>((resolve) => {
            // Pequeña variación para evitar envío exactamente simultáneo
            const delay = index * 10; // 0ms, 10ms, 20ms, etc.
            setTimeout(() => {
              this.ticketWorker
                .registerTicket({
                  dni: user.dni,
                  code: user.code,
                })
                .then(resolve);
            }, delay);
          }),
      );

    // Ejecutar carrera y devolver el primer resultado
    const result = await Promise.race(racePromises);

    if (result.code === 201) {
      this.logger.log(`¡Carrera ganada! Ticket obtenido: ${result.t2_codigo}`);
    }

    return result;
  }

  // NUEVO: Registro masivo para múltiples usuarios
  async batchRegister(
    userIds: number[],
  ): Promise<Record<number, TicketResponse>> {
    const results: Record<number, TicketResponse> = {};

    this.logger.log(
      `Iniciando registro masivo para ${userIds.length} usuarios`,
    );

    // Obtener todos los usuarios de una vez para evitar múltiples consultas a la BD
    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Crear promesas para todos los registros
    const promises = userIds.map(async (userId) => {
      const user = userMap.get(userId);
      if (!user) {
        results[userId] = { code: 404 }; // Usuario no encontrado
        return;
      }

      try {
        results[userId] = await this.ticketWorker.registerTicket({
          dni: user.dni,
          code: user.code,
        });
      } catch (error) {
        this.logger.error(
          `Error registrando usuario ${userId}: ${error.message}`,
        );
        results[userId] = { code: 500 };
      }
    });

    // Ejecutar todas las solicitudes en paralelo
    await Promise.all(promises);

    const successCount = Object.values(results).filter(
      (r) => r.code === 201,
    ).length;
    this.logger.log(
      `Registro masivo completado: ${successCount}/${userIds.length} exitosos`,
    );

    return results;
  }

  async manualRegister(userId: number): Promise<TicketResponse[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Get default number of requests from .env or fallback to 10
    const defaultRequests = this.configService.get<string>('DEFAULT_REQUESTS');
    const numRequests = defaultRequests ? parseInt(defaultRequests, 10) : 5; // Reducido para secuencial

    // Get interval between requests from .env or fallback to 50ms
    const defaultInterval = this.configService.get<string>(
      'DEFAULT_INTERVAL_MS',
    );
    const intervalMs = defaultInterval ? parseInt(defaultInterval, 10) : 50;

    const results: TicketResponse[] = [];

    for (let i = 0; i < numRequests; i++) {
      try {
        // Usar el método con reintentos para mayor fiabilidad
        const result = await this.registerTicketWithRetry({
          dni: user.dni,
          code: user.code,
        });

        results.push(result);

        if (result.code === 201) {
          // Éxito - parar de enviar solicitudes
          this.logger.log(
            `Registro exitoso conseguido en el intento ${i + 1}. Deteniendo proceso.`,
          );
          break;
        }

        // Pequeño retraso entre solicitudes
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } catch (error) {
        this.logger.error(`Intento ${i + 1} falló: ${error.message}`);
      }
    }

    return results;
  }

  // NUEVO: Obtener estado del sistema
  getSystemStatus() {
    return {
      workerPool: this.ticketWorker.getQueueStatus(),
      apiUrl: this.API_URL,
      configuration: {
        defaultRequests: this.configService.get('DEFAULT_REQUESTS'),
        defaultInterval: this.configService.get('DEFAULT_INTERVAL_MS'),
      },
    };
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

      // Usar el método paralelo para máxima eficiencia en horarios programados
      try {
        const results = await this.manualRegisterParallel(userId);
        const successResults = results.filter((r) => r.code === 201);

        if (successResults.length > 0) {
          this.logger.log(
            `¡Programación exitosa! ${successResults.length} tickets obtenidos para ${user.name}`,
          );
        } else {
          this.logger.warn(
            `Programación falló para ${user.name} - ningún ticket obtenido`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error en programación para ${user.name}: ${error.message}`,
        );
      }
    });

    // Add job to registry so we can manage it later
    this.schedulerRegistry.addCronJob(jobName, job);

    return {
      message: `Scheduled parallel ticket registration for user ${user.name} at ${time}`,
      method: 'parallel',
      jobName,
    };
  }

  async cancelScheduledRegistration(userId: number) {
    const jobName = `ticket_registration_${userId}`;

    try {
      this.schedulerRegistry.deleteCronJob(jobName);
      return {
        message: `Scheduled registration cancelled for user ${userId}`,
        jobName,
      };
    } catch (error) {
      throw new Error(`No scheduled job found for user ${userId}`);
    }
  }
}
