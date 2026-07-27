import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Send an email using SendLib service
   * @param to - Recipient email address
   * @param subject - Email subject
   * @param html - HTML content of the email
   * @returns Promise<boolean> - True if sent successfully, false otherwise
   */
  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const apiKey = this.configService.get('SENDLIB_API_KEY');
      const fromEmail = this.configService.get('SENDLIB_FROM_EMAIL');

      // Check if API key is configured
      if (!apiKey) {
        this.logger.error(
          'SendLib API key not configured. Please set SENDLIB_API_KEY in .env',
        );
        // In development, log the email instead of failing
        if (process.env.NODE_ENV === 'development') {
          this.logger.warn(`[DEV MODE] Email would be sent to ${to}`);
          this.logger.debug(`[DEV MODE] Subject: ${subject}`);
          this.logger.debug(
            `[DEV MODE] From: ${fromEmail || 'noreply@heightt.com'}`,
          );
          return true;
        }
        return false;
      }

      this.logger.log(`Attempting to send email to ${to}`);
      this.logger.debug(`Using from: ${fromEmail || 'noreply@heightt.com'}`);

      const response = await fetch('https://sendlib.samueltuoyo.com/api/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail || 'noreply@heightt.com',
          to,
          subject,
          html,
        }),
      });

      const responseText = await response.text();
      this.logger.debug(`SendLib response: ${responseText}`);

      if (!response.ok) {
        this.logger.error(
          `SendLib error (${response.status}): ${responseText}`,
        );
        return false;
      }

      this.logger.log(`✅ Email sent successfully to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Error sending email: ${error.message}`);
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn(`[DEV MODE] Email would have been sent to ${to}`);
        return true; // Don't fail in development
      }
      return false;
    }
  }

  /**
   * Send email verification link to user
   * @param email - User's email address
   * @param username - User's username
   * @returns Promise<boolean> - True if sent successfully
   */
  async sendVerificationEmail(
    email: string,
    username: string,
  ): Promise<boolean> {
    const verificationLink = `${this.configService.get('FRONTEND_URL')}/verify-email?email=${encodeURIComponent(email)}`;

    const html = this.getVerificationEmailTemplate(username, verificationLink);

    const result = await this.sendEmail(
      email,
      'Verify Your Email - Heightt',
      html,
    );

    if (result) {
      this.logger.log(`Verification email sent to ${email}`);
    } else {
      this.logger.error(`Failed to send verification email to ${email}`);
    }

    return result;
  }

  /**
   * Send password reset link to user
   * @param email - User's email address
   * @param username - User's username
   * @param token - Password reset token
   * @returns Promise<boolean> - True if sent successfully
   */
  async sendPasswordResetEmail(
    email: string,
    username: string,
    token: string,
  ): Promise<boolean> {
    const resetLink = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${token}`;

    const html = this.getPasswordResetEmailTemplate(username, resetLink);

    const result = await this.sendEmail(
      email,
      'Reset Your Password - Heightt',
      html,
    );

    if (result) {
      this.logger.log(`Password reset email sent to ${email}`);
    } else {
      this.logger.error(`Failed to send password reset email to ${email}`);
    }

    return result;
  }

  /**
   * Send welcome email after successful verification
   * @param email - User's email address
   * @param username - User's username
   * @returns Promise<boolean> - True if sent successfully
   */
  async sendWelcomeEmail(email: string, username: string): Promise<boolean> {
    const html = this.getWelcomeEmailTemplate(username);

    const result = await this.sendEmail(email, 'Welcome to Heightt! 🎉', html);

    if (result) {
      this.logger.log(`Welcome email sent to ${email}`);
    } else {
      this.logger.error(`Failed to send welcome email to ${email}`);
    }

    return result;
  }

  /**
   * Send email notification for new device login
   * @param email - User's email address
   * @param username - User's username
   * @param deviceName - Name of the device
   * @param location - Location of the login
   * @param ipAddress - IP address of the login
   * @param time - Time of login
   * @returns Promise<boolean> - True if sent successfully
   */
  async sendNewDeviceLoginEmail(
    email: string,
    username: string,
    deviceName: string,
    location: string,
    ipAddress: string,
    time: string,
  ): Promise<boolean> {
    const html = this.getNewDeviceLoginTemplate(
      username,
      deviceName,
      location,
      ipAddress,
      time,
    );

    const result = await this.sendEmail(
      email,
      'New Device Login to Your Heightt Account',
      html,
    );

    if (result) {
      this.logger.log(`New device login email sent to ${email}`);
    } else {
      this.logger.error(`Failed to send new device login email to ${email}`);
    }

    return result;
  }

  /**
   * Send OTP for two-factor authentication
   * @param email - User's email address
   * @param otp - One-time password
   * @param username - User's username
   * @param expiresInMinutes - Expiry time in minutes
   * @returns Promise<boolean> - True if sent successfully
   */
  async sendOTPEmail(
    email: string,
    otp: string,
    username: string,
    expiresInMinutes: number = 10,
  ): Promise<boolean> {
    const html = this.getOTPEmailTemplate(username, otp, expiresInMinutes);

    const result = await this.sendEmail(
      email,
      'Your Heightt Verification Code',
      html,
    );

    if (result) {
      this.logger.log(`OTP email sent to ${email}`);
    } else {
      this.logger.error(`Failed to send OTP email to ${email}`);
    }

    return result;
  }

  // ========== EMAIL TEMPLATES ==========

  /**
   * Verification email template
   */
  private getVerificationEmailTemplate(
    username: string,
    verificationLink: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; line-height: 1.6;">
        <div style="background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0; font-size: 32px;">Heightt</h1>
            <p style="color: #6B7280; margin: 5px 0 0;">Financial Management for Students</p>
          </div>
          
          <!-- Content -->
          <h2 style="color: #1F2937; font-size: 24px; margin-top: 0;">Welcome to Heightt!</h2>
          
          <p style="color: #374151; font-size: 16px;">
            Hello <strong>${username}</strong>,
          </p>
          
          <p style="color: #374151; font-size: 16px;">
            Thank you for registering with Heightt. Please verify your email address to get started with managing your finances.
          </p>
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="${verificationLink}" 
               style="display: inline-block; padding: 14px 32px; background-color: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Verify Email Address
            </a>
          </div>
          
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="color: #6B7280; font-size: 14px; margin: 0;">
              ⏰ This verification link will expire in <strong>24 hours</strong>.
            </p>
            <p style="color: #6B7280; font-size: 14px; margin: 5px 0 0;">
              If you didn't create an account with Heightt, you can safely ignore this email.
            </p>
          </div>
          
          <!-- Footer -->
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;" />
          
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} Heightt. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Password reset email template
   */
  private getPasswordResetEmailTemplate(
    username: string,
    resetLink: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; line-height: 1.6;">
        <div style="background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0; font-size: 32px;">Heightt</h1>
            <p style="color: #6B7280; margin: 5px 0 0;">Financial Management for Students</p>
          </div>
          
          <!-- Content -->
          <h2 style="color: #1F2937; font-size: 24px; margin-top: 0;">Reset Your Password</h2>
          
          <p style="color: #374151; font-size: 16px;">
            Hello <strong>${username}</strong>,
          </p>
          
          <p style="color: #374151; font-size: 16px;">
            We received a request to reset your password. Click the button below to create a new password:
          </p>
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="${resetLink}" 
               style="display: inline-block; padding: 14px 32px; background-color: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Reset Password
            </a>
          </div>
          
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="color: #6B7280; font-size: 14px; margin: 0;">
              ⏰ This reset link will expire in <strong>1 hour</strong>.
            </p>
            <p style="color: #6B7280; font-size: 14px; margin: 5px 0 0;">
              If you didn't request a password reset, you can safely ignore this email.
            </p>
          </div>
          
          <!-- Footer -->
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;" />
          
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} Heightt. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Welcome email template
   */
  private getWelcomeEmailTemplate(username: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Heightt</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; line-height: 1.6;">
        <div style="background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0; font-size: 32px;">Heightt</h1>
          </div>
          
          <h2 style="color: #1F2937; font-size: 24px; margin-top: 0;">Welcome to Heightt, ${username}! 🎉</h2>
          
          <p style="color: #374151; font-size: 16px;">
            Your email has been successfully verified.
          </p>
          
          <p style="color: #374151; font-size: 16px;">
            You're now ready to start managing your finances with Heightt. Here's what you can do next:
          </p>
          
          <ul style="color: #374151; font-size: 16px; padding-left: 20px;">
            <li style="margin-bottom: 10px;">💰 <strong>Complete your profile</strong> - Tell us more about yourself</li>
            <li style="margin-bottom: 10px;">🏫 <strong>Add your institution</strong> - Connect your school account</li>
            <li style="margin-bottom: 10px;">💳 <strong>Set up your wallet</strong> - Start saving and managing money</li>
            <li style="margin-bottom: 10px;">📊 <strong>Track your finances</strong> - Monitor your spending and savings</li>
          </ul>
          
          <p style="color: #374151; font-size: 16px;">
            If you have any questions, feel free to reach out to our support team.
          </p>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;" />
          
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} Heightt. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * New device login email template
   */
  private getNewDeviceLoginTemplate(
    username: string,
    deviceName: string,
    location: string,
    ipAddress: string,
    time: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Device Login</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; line-height: 1.6;">
        <div style="background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0; font-size: 32px;">Heightt</h1>
          </div>
          
          <h2 style="color: #1F2937; font-size: 24px; margin-top: 0;">New Device Login Detected</h2>
          
          <p style="color: #374151; font-size: 16px;">
            Hello <strong>${username}</strong>,
          </p>
          
          <p style="color: #374151; font-size: 16px;">
            We noticed a new login to your Heightt account from an unfamiliar device or location.
          </p>
          
          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1F2937; font-size: 16px; margin-top: 0;">Login Details:</h3>
            <p style="color: #6B7280; font-size: 14px; margin: 5px 0;">
              <strong>Device:</strong> ${deviceName}
            </p>
            <p style="color: #6B7280; font-size: 14px; margin: 5px 0;">
              <strong>Location:</strong> ${location}
            </p>
            <p style="color: #6B7280; font-size: 14px; margin: 5px 0;">
              <strong>IP Address:</strong> ${ipAddress}
            </p>
            <p style="color: #6B7280; font-size: 14px; margin: 5px 0;">
              <strong>Time:</strong> ${time}
            </p>
          </div>
          
          <div style="background-color: #FEE2E2; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="color: #991B1B; font-size: 14px; margin: 0;">
              ⚠️ If this was not you, please secure your account immediately by changing your password.
            </p>
          </div>
          
          <p style="color: #374151; font-size: 16px;">
            If this was you, no further action is needed.
          </p>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;" />
          
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} Heightt. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * OTP email template
   */
  private getOTPEmailTemplate(
    username: string,
    otp: string,
    expiresInMinutes: number,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Verification Code</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; line-height: 1.6;">
        <div style="background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0; font-size: 32px;">Heightt</h1>
          </div>
          
          <h2 style="color: #1F2937; font-size: 24px; margin-top: 0;">Verification Code</h2>
          
          <p style="color: #374151; font-size: 16px;">
            Hello <strong>${username}</strong>,
          </p>
          
          <p style="color: #374151; font-size: 16px;">
            Use the following code to complete your authentication:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; background-color: #F3F4F6; padding: 20px 40px; border-radius: 8px; font-size: 36px; font-weight: 700; color: #4F46E5; letter-spacing: 8px;">
              ${otp}
            </div>
          </div>
          
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="color: #6B7280; font-size: 14px; margin: 0;">
              ⏰ This code will expire in <strong>${expiresInMinutes} minutes</strong>.
            </p>
            <p style="color: #6B7280; font-size: 14px; margin: 5px 0 0;">
              If you didn't request this code, you can safely ignore this email.
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;" />
          
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} Heightt. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `;
  }
}
