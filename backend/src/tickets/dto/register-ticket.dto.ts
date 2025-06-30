import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterTicketDto {
  @IsNotEmpty()
  @IsString()
  dni: string;

  @IsNotEmpty()
  @IsString()
  code: string;
}
