import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  MaxLength,
} from 'class-validator';

export class CreateCommitteeDto {
  @ApiProperty({ example: 'org_123', description: 'Organization ID' })
  @IsUUID()
  organizationId: string;

  @ApiProperty({ example: 'Finance Committee', description: 'Committee name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: 'Oversees financial matters',
    description: 'Committee description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'To manage and oversee financial decisions',
    description: 'Committee purpose',
    required: false,
  })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiProperty({
    enum: ['ACTIVE', 'INACTIVE', 'DISSOLVED'],
    description: 'Committee status',
    required: false,
    default: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'DISSOLVED'])
  status?: string;
}
