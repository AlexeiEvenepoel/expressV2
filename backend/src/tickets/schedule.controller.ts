import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@Controller('schedules')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Post()
  async create(@Body() createScheduleDto: CreateScheduleDto) {
    try {
      return await this.scheduleService.createSchedule(createScheduleDto);
    } catch (error) {
      throw error;
    }
  }

  @Get()
  findAll(@Query('userId') userId?: string) {
    const userIdNum = userId ? parseInt(userId, 10) : undefined;
    return this.scheduleService.findAllSchedules(userIdNum);
  }

  @Get('upcoming')
  getUpcoming(@Query('userId') userId?: string) {
    const userIdNum = userId ? parseInt(userId, 10) : undefined;
    return this.scheduleService.getUpcomingSchedules(userIdNum);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.scheduleService.findSchedule(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateScheduleDto: UpdateScheduleDto,
  ) {
    return this.scheduleService.updateSchedule(id, updateScheduleDto);
  }

  @Patch(':id/toggle')
  toggle(@Param('id', ParseIntPipe) id: number) {
    return this.scheduleService.toggleSchedule(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.scheduleService.deleteSchedule(id);
  }

  @Get('debug/jobs')
  getActiveJobs() {
    return this.scheduleService.getActiveJobs();
  }

  @Post('debug/test/:id')
  async testSchedule(@Param('id', ParseIntPipe) id: number) {
    return this.scheduleService.testScheduleExecution(id);
  }
}
