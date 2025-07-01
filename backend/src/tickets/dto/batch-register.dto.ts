import { IsArray, IsNotEmpty } from 'class-validator';

export class BatchRegisterDto {
  @IsNotEmpty()
  @IsArray()
  userIds: number[];
}

export class ParallelRegisterDto {
  @IsNotEmpty()
  userId: number;

  parallelAttempts?: number = 5;
}
