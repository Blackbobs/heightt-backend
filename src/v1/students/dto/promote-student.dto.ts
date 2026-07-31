import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, IsOptional, IsDateString } from 'class-validator';

export class PromoteStudentDto {
  @ApiProperty({ example: 'lvl_current_123', description: 'Current level ID' })
  @IsUUID()
  fromLevelId: string;

  @ApiProperty({ example: 'lvl_next_123', description: 'Next level ID' })
  @IsUUID()
  toLevelId: string;

  @ApiProperty({ example: 'sess_123', description: 'Academic session ID' })
  @IsUUID()
  sessionId: string;

  @ApiProperty({
    example: 'Promoted based on academic performance',
    description: 'Promotion notes',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    example: '2024-09-01T00:00:00.000Z',
    description: 'Promotion date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  promotionDate?: string;
}
