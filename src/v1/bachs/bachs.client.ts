import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';

export interface BachsCustomer {
  id: string;
  email: string;
  name: string;
  phone_number?: string;
  created_at: string;
  updated_at: string;
}

export interface BachsCheckoutSession {
  checkout_id: string;
  checkout_url: string;
  status: 'OPEN' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  expires_at: string;
  created_at: string;
  reference?: string;
}

export interface BachsPayment {
  payment_id: string;
  checkout_id?: string;
  reference?: string;
  status: string;
  amount: string;
  currency: string;
  fee_usd?: string;
  customer?: {
    id: string;
    email: string;
    name: string;
  };
  created_at: string;
  completed_at?: string;
}

@Injectable()
export class BachsClient {
  private readonly logger = new Logger(BachsClient.name);
  private client: AxiosInstance;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('BACHS_API_KEY');
    const baseURL = this.configService.get<string>('BACHS_BASE_URL');

    if (!apiKey || !baseURL) {
      this.logger.error('Bachs API key or base URL not configured');
      throw new Error('Bachs API configuration missing');
    }

    this.client = axios.create({
      baseURL: `${baseURL}/v1`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30000,
    });

    // Log all requests in development
    if (process.env.NODE_ENV !== 'production') {
      this.client.interceptors.request.use((config) => {
        this.logger.debug(
          `Bachs API Request: ${config.method?.toUpperCase()} ${config.url}`,
        );
        return config;
      });

      this.client.interceptors.response.use(
        (response) => {
          this.logger.debug(
            `Bachs API Response: ${response.status} ${response.config.url}`,
          );
          return response;
        },
        (error) => {
          this.logger.error(`Bachs API Error: ${error.message}`);
          return Promise.reject(error);
        },
      );
    }
  }

  /**
   * Convert internal amount (in Kobo) to Bachs decimal string
   */
  toBachsAmount(amountInKobo: number): string {
    return (amountInKobo / 100).toFixed(2);
  }

  /**
   * Convert Bachs decimal string to internal amount (in Kobo)
   */
  fromBachsAmount(amountInBachs: string): number {
    return Math.round(parseFloat(amountInBachs) * 100);
  }

  /**
   * Handle Axios errors consistently
   */
  private handleAxiosError(error: any): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.response) {
        const bachsError = axiosError.response.data as any;
        const status = axiosError.response.status || HttpStatus.BAD_REQUEST;

        throw new HttpException(
          {
            status,
            message:
              bachsError.detail || bachsError.message || 'Bachs API error',
            error_code: bachsError.error_code,
            errors: bachsError.errors,
          },
          status,
        );
      } else if (axiosError.request) {
        throw new HttpException(
          {
            status: HttpStatus.SERVICE_UNAVAILABLE,
            message: 'No response from Bachs API',
            error_code: 'BACHS_SERVICE_UNAVAILABLE',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }

    throw new HttpException(
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Unexpected error calling Bachs API',
        error_code: 'BACHS_UNEXPECTED_ERROR',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  // ============================================
  // CUSTOMER ENDPOINTS
  // ============================================

  async createCustomer(data: {
    email: string;
    name: string;
    phone_number?: string;
  }): Promise<BachsCustomer> {
    try {
      const response = await this.client.post('/customers', data);
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async getOrCreateCustomer(
    email: string,
    name: string,
    phone_number?: string,
  ): Promise<BachsCustomer> {
    try {
      const response = await this.client.get('/customers', {
        params: { email, limit: 1 },
      });

      if (response.data.items && response.data.items.length > 0) {
        return response.data.items[0];
      }

      return this.createCustomer({ email, name, phone_number });
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async getCustomer(customerId: string): Promise<BachsCustomer> {
    try {
      const response = await this.client.get(`/customers/${customerId}`);
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async updateCustomer(
    customerId: string,
    data: {
      name?: string;
      email?: string;
      phone_number?: string;
    },
  ): Promise<BachsCustomer> {
    try {
      const response = await this.client.patch(
        `/customers/${customerId}`,
        data,
      );
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  // ============================================
  // CHECKOUT SESSION ENDPOINTS
  // ============================================

  async createCheckoutSession(data: {
    customer: { customer_id?: string; email?: string; name?: string };
    product_cart?: Array<{
      product_id: string;
      quantity?: number;
      amount?: string;
      pricing?: {
        price_type?: 'fixed' | 'custom' | 'free';
        amount?: string;
        preset_amount?: string;
        minimum_amount?: string;
        maximum_amount?: string;
      };
    }>;
    pricing?: {
      currency: string;
      amount?: string;
      price_type?: 'fixed' | 'custom' | 'free';
      preset_amount?: string;
      minimum_amount?: string;
      maximum_amount?: string;
    };
    success_url?: string;
    cancel_url?: string;
    reference?: string;
    metadata?: Record<string, any>;
    allowed_payment_method_types?: string[];
    expires_in_minutes?: number;
  }): Promise<BachsCheckoutSession> {
    try {
      const response = await this.client.post('/checkout-sessions', data);
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async getCheckoutSession(checkoutId: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/checkout-sessions/${checkoutId}`,
      );
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  // ============================================
  // PAYMENT ENDPOINTS
  // ============================================

  async getPayment(paymentId: string): Promise<BachsPayment> {
    try {
      const response = await this.client.get(`/payments/${paymentId}`);
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async listPayments(params?: {
    limit?: number;
    offset?: number;
    status_filter?: string;
  }): Promise<{ items: BachsPayment[]; pagination: any }> {
    try {
      const response = await this.client.get('/payments', { params });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  // ============================================
  // BALANCE ENDPOINTS
  // ============================================

  async getBalances(): Promise<any> {
    try {
      const response = await this.client.get('/accounts/balances');
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async listPayoutBanks(countryCode = 'NG'): Promise<any> {
    try {
      const response = await this.client.get('/payouts/banks', {
        params: { country_code: countryCode },
      });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async resolveBankAccount(data: {
    bank_code: string;
    account_number: string;
  }): Promise<any> {
    try {
      const response = await this.client.post('/payouts/resolve-account', data);
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async createPayoutDestination(
    data: {
      name: string;
      currency: string;
      type: 'bank_account';
      account_number: string;
      bank_code: string;
      metadata?: Record<string, any>;
    },
    idempotencyKey: string,
  ): Promise<any> {
    try {
      const response = await this.client.post('/payouts/destinations', data, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async getPayoutDestination(destinationId: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/payouts/destinations/${destinationId}`,
      );
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async createPayout(
    data: {
      destination: string;
      amount: string;
      reference: string;
      metadata?: Record<string, any>;
    },
    idempotencyKey: string,
  ): Promise<any> {
    try {
      const response = await this.client.post('/payouts', data, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  // ============================================
  // WEBHOOK VERIFICATION
  // ============================================

  verifyWebhookSignature(
    payload: Buffer | string,
    signature: string,
    timestamp: string,
  ): boolean {
    try {
      const secret = this.configService.get<string>('BACHS_WEBHOOK_SECRET');
      const isDev = process.env.NODE_ENV !== 'production';

      if (!secret) {
        if (isDev) {
          this.logger.warn(
            'BACHS_WEBHOOK_SECRET not configured; bypassing signature check in dev mode.',
          );
          return true;
        }
        this.logger.error('Bachs webhook secret not configured');
        return false;
      }

      if (!signature || !timestamp) {
        if (isDev) return true;
        return false;
      }

      const timestampSeconds = Number(timestamp);
      const toleranceSeconds = this.configService.get<number>(
        'BACHS_WEBHOOK_TOLERANCE',
        300,
      );
      if (
        !Number.isFinite(timestampSeconds) ||
        Math.abs(Date.now() / 1000 - timestampSeconds) > toleranceSeconds
      ) {
        this.logger.warn(
          'Bachs webhook timestamp is missing, invalid, or stale',
        );
        return false;
      }

      if (isDev && (signature === 'test_signature' || signature === 'skip')) {
        return true;
      }

      const rawBody = Buffer.isBuffer(payload)
        ? payload
        : Buffer.from(payload, 'utf8');
      const signedPayload = Buffer.concat([
        Buffer.from(`${timestamp}.`, 'utf8'),
        rawBody,
      ]);
      const secretCandidates = [Buffer.from(secret, 'utf8')];
      if (secret.startsWith('whsec_')) {
        try {
          secretCandidates.push(Buffer.from(secret.slice(6), 'base64'));
        } catch {
          // Some Bachs environments use the whsec_ prefix with an opaque key.
          // The original UTF-8 secret remains the first candidate.
        }
      }

      const suppliedSignatures = signature
        .split(/[ ,]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => !/^v\d+$/i.test(part))
        .map((part) => part.replace(/^(sha256=|v\d+=|v\d+,)/i, ''));

      const isMatch = secretCandidates.some((key) => {
        const digest = createHmac('sha256', key).update(signedPayload).digest();
        return suppliedSignatures.some((supplied) => {
          const encodings: Buffer[] = [];
          if (/^[a-f0-9]{64}$/i.test(supplied)) {
            encodings.push(Buffer.from(supplied, 'hex'));
          }
          try {
            encodings.push(Buffer.from(supplied, 'base64'));
          } catch {
            return false;
          }
          return encodings.some(
            (candidate) =>
              candidate.length === digest.length &&
              timingSafeEqual(candidate, digest),
          );
        });
      });

      if (!isMatch) {
        this.logger.warn('Webhook signature verification failed');
      }

      return isMatch;
    } catch (error: any) {
      this.logger.error(`Webhook verification error: ${error.message}`);
      return false;
    }
  }
}
