import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsArray } from 'class-validator';

export class CastVoteDto {
  @ApiProperty({ example: 'election_123', description: 'Election ID' })
  @IsUUID()
  electionId: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    example: [
      { positionId: 'pos_123', candidateId: 'cand_123' },
      { positionId: 'pos_456', candidateId: 'cand_456' },
    ],
    description: 'Votes for each position',
  })
  @IsArray()
  votes: Array<{
    positionId: string;
    candidateId: string;
  }>;
}
