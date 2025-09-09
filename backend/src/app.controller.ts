import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot(@Res() res: Response) {
    return res.sendFile(
      join(process.cwd(), 'backend', 'public', 'test-client.html'),
    );
  }

  @Get('dashboard')
  getDashboard(@Res() res: Response) {
    return res.sendFile(
      join(process.cwd(), 'backend', 'public', 'schedule-dashboard.html'),
    );
  }

  @Get('api')
  getHello(): string {
    return this.appService.getHello();
  }
}
