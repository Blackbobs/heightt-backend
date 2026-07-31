import { ApiProperty } from "@nestjs/swagger";

export class ChargesResponseDto {
  @ApiProperty()
  amount: number;

  @ApiProperty()
  amountFormatted: string;

  @ApiProperty()
  charges: {
    platformFee: { amount: number; formatted: string; percentage: string };
    paystackFee: { amount: number; formatted: string; percentage: string };
    vat: { amount: number; formatted: string; percentage: string };
    totalCharges: { amount: number; formatted: string };
    netAmount: { amount: number; formatted: string };
  };
}
