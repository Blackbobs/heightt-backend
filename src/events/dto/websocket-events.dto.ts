// src/events/dto/websocket-events.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class WebSocketEventDto {
  @ApiProperty()
  event: string;

  @ApiProperty()
  data: any;

  @ApiProperty()
  timestamp: Date;

  @ApiProperty()
  userId?: string;

  @ApiProperty()
  room?: string;
}

export class PaymentEventDto {
  @ApiProperty()
  paymentId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  organizationId?: string;

  @ApiProperty()
  reference: string;

  @ApiProperty()
  timestamp: Date;
}

export class WalletEventDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  balance: number;

  @ApiProperty()
  previousBalance: number;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  type: 'CREDIT' | 'DEBIT';

  @ApiProperty()
  currency: string;

  @ApiProperty()
  timestamp: Date;
}
