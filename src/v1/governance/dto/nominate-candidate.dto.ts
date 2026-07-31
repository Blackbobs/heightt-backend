import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, IsOptional } from 'class-validator';

export class NominateCandidateDto {
  @ApiProperty({ example: 'pos_123', description: 'Position ID' })
  @IsUUID()
  positionId: string;

  @ApiProperty({ example: 'user_123', description: 'Candidate user ID' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    example: 'I promise to serve the students...',
    description: 'Manifesto',
    required: false,
  })
  @IsOptional()
  @IsString()
  manifesto?: string;

  @ApiProperty({
    example: 'https://cloudinary.com/photo.jpg',
    description: 'Photo URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  photo?: string;
}
