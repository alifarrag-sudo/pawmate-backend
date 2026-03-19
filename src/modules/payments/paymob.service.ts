import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { validateHmac } from '../../common/utils/crypto.util';
import { RedisService } from '../../common/services/redis.service';

interface AuthorizationParams {
  amountCents: number;
  currency: string;
  orderId: string;
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string;
}

interface PaymobResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

@Injectable()
export class PaymobService {
  private readonly logger = new Logger(PaymobService.name);
  private readonly baseUrl = 'https://accept.paymob.com/api';

  constructor(
    private config: ConfigService,
    private redis: RedisService,
  ) {}

  private async getAuthToken(): Promise<string> {
    // Cache token in Redis (expires in 55 minutes)
    const cacheKey = 'paymob:auth_token';
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const response = await axios.post(`${this.baseUrl}/auth/tokens`, {
      api_key: this.config.get('PAYMOB_API_KEY'),
    });

    const token = response.data.token;
    await this.redis.setex(cacheKey, 55 * 60, token);
    return token;
  }

  async authorizePayment(params: AuthorizationParams): Promise<PaymobResult> {
    try {
      const token = await this.getAuthToken();

      // 1. Register order
      const orderResponse = await axios.post(`${this.baseUrl}/ecommerce/orders`, {
        auth_token: token,
        delivery_needed: false,
        amount_cents: params.amountCents,
        currency: params.currency,
        merchant_order_id: params.orderId,
        items: [
          {
            name: 'Pet Care Service',
            amount_cents: params.amountCents,
            description: 'PawMate pet sitting service',
            quantity: 1,
          },
        ],
      });

      const paymobOrderId = orderResponse.data.id;

      // 2. Get payment key
      const paymentKeyResponse = await axios.post(`${this.baseUrl}/payment_keys`, {
        auth_token: token,
        amount_cents: params.amountCents,
        currency: params.currency,
        order_id: paymobOrderId,
        billing_data: {
          first_name: params.customerFirstName,
          last_name: params.customerLastName,
          phone_number: params.customerPhone,
          email: 'customer@pawmate.eg',
          apartment: 'NA',
          floor: 'NA',
          street: 'NA',
          building: 'NA',
          city: 'Cairo',
          country: 'EG',
          state: 'Cairo',
          postal_code: 'NA',
        },
        integration_id: this.config.get('PAYMOB_INTEGRATION_ID_CARD'),
        lock_order_when_paid: false,
      });

      return {
        success: true,
        transactionId: paymentKeyResponse.data.token,
      };
    } catch (error: any) {
      this.logger.error(`Paymob authorization failed: ${error.response?.data?.message || error.message}`);
      return { success: false, error: error.message };
    }
  }

  async capturePayment(transactionId: string, amountCents: number): Promise<PaymobResult> {
    try {
      const token = await this.getAuthToken();
      const response = await axios.post(
        `${this.baseUrl}/acceptance/capture`,
        {
          auth_token: token,
          transaction_id: transactionId,
          amount_cents: amountCents,
        },
      );
      return { success: response.data.success, transactionId: response.data.id?.toString() };
    } catch (error: any) {
      this.logger.error(`Paymob capture failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async voidAuthorization(transactionId: string): Promise<PaymobResult> {
    try {
      const token = await this.getAuthToken();
      const response = await axios.post(
        `${this.baseUrl}/acceptance/void_refund/void`,
        { auth_token: token, transaction_id: transactionId },
      );
      return { success: response.data.success };
    } catch (error: any) {
      this.logger.error(`Paymob void failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async refund(transactionId: string, amountCents: number): Promise<PaymobResult> {
    try {
      const token = await this.getAuthToken();
      const response = await axios.post(
        `${this.baseUrl}/acceptance/void_refund/refund`,
        {
          auth_token: token,
          transaction_id: transactionId,
          amount_cents: amountCents,
        },
      );
      return { success: response.data.success };
    } catch (error: any) {
      this.logger.error(`Paymob refund failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async disburseMobileWallet(phone: string, amountCents: number, reference: string): Promise<PaymobResult> {
    // Paymob disbursement to mobile wallet
    try {
      const token = await this.getAuthToken();
      const response = await axios.post(
        `${this.baseUrl}/disbursement/`,
        {
          auth_token: token,
          amount: amountCents,
          currency: 'EGP',
          msisdn: phone.replace('+', ''),
          issuer: 'wallet',
          merchant_order_id: reference,
        },
      );
      return { success: response.data.success, transactionId: response.data.id?.toString() };
    } catch (error: any) {
      this.logger.error(`Paymob mobile wallet disbursement failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  validateWebhook(body: any, signature: string): boolean {
    const hmacSecret = this.config.get('PAYMOB_HMAC_SECRET');
    if (!hmacSecret) return false;

    // Paymob HMAC validation — concatenate specific fields in specific order
    const { obj } = body;
    const hmacPayload = [
      obj?.amount_cents,
      obj?.created_at,
      obj?.currency,
      obj?.error_occured,
      obj?.has_parent_transaction,
      obj?.id,
      obj?.integration_id,
      obj?.is_3d_secure,
      obj?.is_auth,
      obj?.is_capture,
      obj?.is_refunded,
      obj?.is_standalone_payment,
      obj?.is_voided,
      obj?.order?.id,
      obj?.owner,
      obj?.pending,
      obj?.source_data?.pan,
      obj?.source_data?.sub_type,
      obj?.source_data?.type,
      obj?.success,
    ]
      .map((v) => (v === undefined || v === null ? '' : String(v)))
      .join('');

    return validateHmac(hmacPayload, hmacSecret, signature);
  }
}
