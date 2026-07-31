import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'org_123', description: 'Organization ID' })
  @IsUUID()
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
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'role_123', description: 'Role ID' })
  @IsUUID()
  roleId: string;

  @ApiProperty({ example: 'org_123', description: 'Organization ID' })
  @IsUUID()
  organizationId: string;
}

export class AssignAdminRoleDto {
  @ApiProperty({ example: 'user_123', description: 'User ID' })
  @IsUUID()
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
  adminType: string;

  @ApiProperty({
    example: 'inst_123',
    description: 'Institution ID (required for INSTITUTION_ADMIN)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @ApiProperty({
    example: 'fac_123',
    description: 'Faculty ID (required for FACULTY_ADMIN)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  facultyId?: string;

  @ApiProperty({
    example: 'dept_123',
    description: 'Department ID (required for DEPARTMENT_ADMIN)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({
    example: 'org_123',
    description: 'Organization ID (required for ORGANIZATION_ADMIN)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
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
