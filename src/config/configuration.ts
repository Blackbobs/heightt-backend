// src/config/configuration.ts

export default () => ({
  // ... existing config

  fees: {
    platform: {
      percentage: Number(process.env.PLATFORM_FEE_PERCENTAGE || 2),
      enabled: true,
    },
    paymentGateway: {
      percentage: 1.5, // 1.5% Bachs fee
      enabled: true,
    },
    vat: {
      rate: 7.5, // 7.5% VAT on platform fee
      enabled: true,
    },
  },

  // Bachs Configuration
  bachs: {
    apiKey: process.env.BACHS_API_KEY,
    baseUrl: process.env.BACHS_BASE_URL || 'https://api.bachs.io',
    webhookSecret: process.env.BACHS_WEBHOOK_SECRET,
  },
});
