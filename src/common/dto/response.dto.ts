export class ApiResponseDto<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  timestamp: string;
  path?: string;
  statusCode: number;
}

export class ApiSuccessResponseDto<T> {
  success: true;
  message: string;
  data: T;
  timestamp: string;
  statusCode: number;
}

export class ApiErrorResponseDto {
  success: false;
  message: string;
  error: string;
  timestamp: string;
  statusCode: number;
  path?: string;
}