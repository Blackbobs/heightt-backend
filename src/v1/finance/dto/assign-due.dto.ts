import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsArray, IsOptional } from 'class-validator';

export class AssignDueDto {
  @ApiProperty({
    example: ['stud_123', 'stud_456'],
    description: 'Student IDs',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  studentIds?: string[];

  @ApiProperty({
    example: 'dept_123',
    description: 'Department ID (assign all students in department)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({
    example: 'lvl_123',
    description: 'Level ID (assign all students in level)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  levelId?: string;
}
