import {
  IsNotEmpty,
  IsString,
  IsDateString,
  IsBoolean,
  IsOptional,
  IsArray,
  Matches,
} from 'class-validator';

export class CreateScheduleDto {
  @IsNotEmpty()
  userId: number;

  @IsNotEmpty()
  @IsDateString()
  scheduledDate: string; // Format: YYYY-MM-DD

  @IsNotEmpty()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, {
    message: 'Time must be in format HH:MM or HH:MM:SS',
  })
  scheduledTime: string; // Format: HH:MM:SS

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recurringDays?: string[]; // ["monday", "tuesday", "wednesday", "thursday", "friday"]

  @IsOptional()
  @IsString()
  description?: string;
}
