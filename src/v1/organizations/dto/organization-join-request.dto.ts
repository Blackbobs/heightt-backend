// Add to src/v1/organizations/dto/organization-join-request.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MembershipType, JoinRequestStatus } from '../../generated/prisma/enums';

export class RequestToJoinDto {
  @ApiProperty({
    enum: MembershipType,
    default: MembershipType.STUDENT,
    description: 'Type of membership being requested',
  })
  @IsEnum(MembershipType)
  @IsOptional()
  membershipType?: MembershipType;

  @ApiProperty({
    required: false,
    description: 'Optional message to the organization admins',
  })
  @IsString()
  @IsOptional()
  message?: string;
}

export class ReviewJoinRequestDto {
  @ApiProperty({
    enum: ['APPROVED', 'REJECTED'],
    description: 'Decision on the join request',
  })
  @IsEnum(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @ApiProperty({
    required: false,
    description: 'Reason for rejection (required if status is REJECTED)',
  })
  @IsString()
  @IsOptional()
  rejectionReason?: string;
}

export class JoinRequestResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organizationId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: JoinRequestStatus })
  status: JoinRequestStatus;

  @ApiProperty({ enum: MembershipType })
  membershipType: MembershipType;

  @ApiProperty({ required: false })
  message?: string;

  @ApiProperty({ required: false })
  reviewedBy?: string;

  @ApiProperty({ required: false })
  reviewedAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
