export class CurrencyUtil {
  static readonly KOBO_PER_NAIRA = 100;

  /**
   * Convert Naira to Kobo
   * @param amountInNaira - Amount in Naira (e.g., 5000)
   * @returns Amount in Kobo (e.g., 500000)
   */
  static toKobo(amountInNaira: number): number {
    return Math.round(amountInNaira * this.KOBO_PER_NAIRA);
  }

  /**
   * Convert Kobo to Naira
   * @param amountInKobo - Amount in Kobo (e.g., 500000)
   * @returns Amount in Naira (e.g., 5000)
   */
  static toNaira(amountInKobo: number): number {
    return amountInKobo / this.KOBO_PER_NAIRA;
  }

  /**
   * Format amount in Naira with currency symbol
   * @param amountInKobo - Amount in Kobo
   * @returns Formatted string (e.g., "₦5,000.00")
   */
  static formatNaira(amountInKobo: number): string {
    return `₦${(amountInKobo / this.KOBO_PER_NAIRA).toFixed(2)}`;
  }

  /**
   * Format amount in Naira with short representation
   * @param amountInKobo - Amount in Kobo
   * @returns Short formatted string (e.g., "₦5K", "₦1.5M")
   */
  static formatNairaShort(amountInKobo: number): string {
    const naira = amountInKobo / this.KOBO_PER_NAIRA;
    if (naira >= 1000000) {
      return `₦${(naira / 1000000).toFixed(1)}M`;
    }
    if (naira >= 1000) {
      return `₦${(naira / 1000).toFixed(1)}K`;
    }
    return `₦${naira.toFixed(2)}`;
  }

  /**
   * Parse a Naira string to Kobo
   * @param nairaString - String like "₦5,000" or "5000"
   * @returns Amount in Kobo
   */
  static parseNairaToKobo(nairaString: string): number {
    const cleaned = nairaString.replace(/[₦,]/g, '').trim();
    const amount = parseFloat(cleaned);
    if (isNaN(amount)) {
      throw new Error('Invalid Naira amount');
    }
    return this.toKobo(amount);
  }
}
