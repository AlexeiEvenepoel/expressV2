import { Injectable, Logger } from '@nestjs/common';
import { RegisterTicketDto } from './dto/register-ticket.dto';
import { TicketResponse } from './interfaces/ticket-responde.interface';
import * as FormData from 'form-data';
import axios from 'axios';

@Injectable()
export class TicketWorkerService {
  private readonly logger = new Logger(TicketWorkerService.name);
  private readonly API_URL = 'https://comensales.uncp.edu.pe/api/registros';
  private workerPool: Array<Promise<any>> = [];
  private readonly MAX_CONCURRENT_REQUESTS = 10;

  async addToQueue(task: () => Promise<any>): Promise<any> {
    // Esperar si la cola está llena
    while (this.workerPool.length >= this.MAX_CONCURRENT_REQUESTS) {
      await Promise.race(this.workerPool);
      // Limpiar promesas completadas
      this.workerPool = this.workerPool.filter(
        (p: any) => p.status !== 'fulfilled' && p.status !== 'rejected',
      );
    }

    // Añadir tarea a la cola
    const promise = task();
    this.workerPool.push(promise);

    // Limpiar promesa cuando se complete
    promise.finally(() => {
      const index = this.workerPool.indexOf(promise);
      if (index > -1) this.workerPool.splice(index, 1);
    });

    return promise;
  }

  async registerTicket(dto: RegisterTicketDto): Promise<TicketResponse> {
    return this.addToQueue(async () => {
      try {
        this.logger.debug(`Worker enviando solicitud para DNI: ${dto.dni}`);

        const payload = {
          t1_id: null,
          t1_dni: dto.dni,
          t1_codigo: dto.code,
          t1_nombres: '',
          t1_escuela: '',
          t1_estado: null,
          t3_periodos_t3_id: null,
        };

        const form = new FormData();
        form.append('data', JSON.stringify(payload));

        const response = await axios.post(this.API_URL, form, {
          headers: {
            ...form.getHeaders(),
            Referer: 'https://comensales.uncp.edu.pe/',
          },
          timeout: 10000, // 10 segundos de timeout
        });

        this.logger.debug(`Worker respuesta: ${response.data.code}`);
        return response.data;
      } catch (error) {
        this.logger.error(`Error en worker: ${error.message}`);
        return { code: 500 };
      }
    });
  }

  getQueueStatus() {
    return {
      currentJobs: this.workerPool.length,
      maxConcurrent: this.MAX_CONCURRENT_REQUESTS,
      availableSlots: this.MAX_CONCURRENT_REQUESTS - this.workerPool.length,
    };
  }
}
