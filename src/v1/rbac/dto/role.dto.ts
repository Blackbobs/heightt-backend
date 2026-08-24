// src/v1/rbac/dto/role.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'org_123', description: 'Organization ID' })
  @IsString()
  organizationId: string;

  @ApiProperty({ example: 'Finance Manager', description: 'Role name' })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'Manages financial operations',
    description: 'Role description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: false,
    description: 'Is system role',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @ApiProperty({
    example: ['finance:read', 'finance:create'],
    description: 'Permission keys',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateRoleDto {
  @ApiProperty({
    example: 'Finance Manager',
    description: 'Role name',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: 'Manages financial operations',
    description: 'Role description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: ['finance:read', 'finance:create'],
    description: 'Permission keys',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class AssignRoleToUserDto {
  @ApiProperty({ example: 'user_123', description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 'role_123', description: 'Role ID' })
  @IsString()
  roleId: string;

  @ApiProperty({ example: 'org_123', description: 'Organization ID' })
  @IsString()
  organizationId: string;
}

export class AssignAdminRoleDto {
  @ApiProperty({ example: 'user_123', description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({
    enum: [
      'PLATFORM_ADMIN',
      'INSTITUTION_ADMIN',
      'FACULTY_ADMIN',
      'DEPARTMENT_ADMIN',
      'ORGANIZATION_ADMIN',
      'CLUB_ADMIN',
    ],
    description: 'Admin type',
  })
  @IsString()
  @IsIn([
    'PLATFORM_ADMIN',
    'INSTITUTION_ADMIN',
    'FACULTY_ADMIN',
    'DEPARTMENT_ADMIN',
    'ORGANIZATION_ADMIN',
    'CLUB_ADMIN',
  ])
  adminType: string;

  @ApiProperty({
    example: 'cmswz4nb500020ntv5m0tpq69',
    description: 'Institution ID (required for INSTITUTION_ADMIN)',
    required: false,
  })
  @IsOptional()
  @IsString()
  institutionId?: string;

  @ApiProperty({
    example: 'cmswz4nb500020ntv5m0tpq69',
    description: 'Faculty ID (required for FACULTY_ADMIN)',
    required: false,
  })
  @IsOptional()
  @IsString()
  facultyId?: string;

  @ApiProperty({
    example: 'cmswz4nb500020ntv5m0tpq69',
    description: 'Department ID (required for DEPARTMENT_ADMIN)',
    required: false,
  })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiProperty({
    example: 'cmswz4nb500020ntv5m0tpq69',
    description: 'Organization ID (required for ORGANIZATION_ADMIN)',
    required: false,
  })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiProperty({
    required: false,
    description: 'Academic session ID (for session-specific admin roles)',
  })
  @IsOptional()
  @IsString()
  academicSessionId?: string;
}

export class PermissionResponseDto {
  @ApiProperty({ example: 'perm_123' })
  id: string;

  @ApiProperty({ example: 'finance:read' })
  key: string;

  @ApiProperty({ example: 'Read Finance' })
  name: string;

  @ApiProperty({ example: 'Can read financial data' })
  description?: string;

  @ApiProperty({ example: 'FINANCE' })
  category?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;
}

export class RoleResponseDto {
  @ApiProperty({ example: 'role_123' })
  id: string;

  @ApiProperty({ example: 'Finance Manager' })
  name: string;

  @ApiProperty({ example: 'Manages financial operations' })
  description?: string;

  @ApiProperty({ example: false })
  isSystem: boolean;

  @ApiProperty({ type: [PermissionResponseDto] })
  permissions: PermissionResponseDto[];

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt: Date;
}

export class AdminResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({
    enum: [
      'PLATFORM_ADMIN',
      'INSTITUTION_ADMIN',
      'FACULTY_ADMIN',
      'DEPARTMENT_ADMIN',
      'ORGANIZATION_ADMIN',
      'CLUB_ADMIN',
    ],
  })
  adminType: string;

  @ApiProperty({ required: false })
  institutionId?: string;

  @ApiProperty({ required: false })
  facultyId?: string;

  @ApiProperty({ required: false })
  departmentId?: string;

  @ApiProperty({ required: false })
  organizationId?: string;

  @ApiProperty({ required: false })
  academicSessionId?: string;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'REVOKED'] })
  status: string;

  @ApiProperty({ required: false })
  assignedBy?: string;

  @ApiProperty()
  assignedAt: Date;

  @ApiProperty({ required: false })
  revokedAt?: Date;

  @ApiProperty({ required: false })
  revokedReason?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  user?: any;

  @ApiProperty({ required: false })
  institution?: any;

  @ApiProperty({ required: false })
  faculty?: any;

  @ApiProperty({ required: false })
  department?: any;

  @ApiProperty({ required: false })
  organization?: any;

  @ApiProperty({ required: false })
  academicSession?: any;

  @ApiProperty({ type: [Object], required: false })
  permissions?: any[];
}
