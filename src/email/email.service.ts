import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { renderHeighttEmail } from './heightt-email.template';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Send an email using SendLib service
   */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    attachments?: Array<{
      filename: string;
      contentType?: string;
      base64Content: string;
    }>,
  ): Promise<boolean> {
    if (attachments && attachments.length > 0) {
      const sent = await this.trySend(to, subject, html, attachments);
      if (sent) {
        return true;
      }
      this.logger.warn(
        `Retrying email to ${to} without attachments after failure`,
      );
      return this.trySend(to, subject, html);
    }
    return this.trySend(to, subject, html);
  }

  private async trySend(
    to: string,
    subject: string,
    html: string,
    attachments?: Array<{
      filename: string;
      contentType?: string;
      base64Content: string;
    }>,
  ): Promise<boolean> {
    try {
      const apiKey = this.configService.get<string>('SENDLIB_API_KEY');
      const fromEmail = this.configService.get<string>('SENDLIB_FROM_EMAIL');

      this.logger.debug(
        `Email configuration: API Key set: ${!!apiKey}, From: ${fromEmail || 'noreply@heightt.com'}`,
      );

      if (!apiKey) {
        this.logger.warn(
          'SendLib API key not configured. Falling back to development mode.',
        );
        if (process.env.NODE_ENV === 'development') {
          this.logger.log(`[DEV MODE] 📧 Email would be sent to ${to}`);
          this.logger.log(`[DEV MODE] 📧 Subject: ${subject}`);
          return true;
        }
        return false;
      }

      this.logger.log(`📧 Attempting to send email to ${to}`);

      const cleanApiKey = apiKey.trim().replace(/^["']|["']$/g, '');

      const requestBody: Record<string, any> = {
        from: fromEmail?.trim() || 'noreply@heightt.com',
        to: to.trim(),
        subject: subject.trim(),
        html: html,
      };

      if (attachments && attachments.length > 0) {
        requestBody.attachments = attachments.map((a) => ({
          filename: a.filename,
          content_type: a.contentType || 'application/pdf',
          content: a.base64Content,
        }));
      }

      this.logger.debug(`Sending to SendLib with from: ${requestBody.from}`);

      const response = await axios.post(
        'https://sendlib.samueltuoyo.com/api/send',
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${cleanApiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 30000,
        },
      );

      this.logger.debug(`SendLib response: ${JSON.stringify(response.data)}`);

      if (response.status !== 200) {
        this.logger.error(
          `SendLib error (${response.status}): ${JSON.stringify(response.data)}`,
        );
        return false;
      }

      this.logger.log(`✅ Email sent successfully to ${to}`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Error sending email to ${to}: ${error.message}`);

      if (process.env.NODE_ENV === 'development') {
        this.logger.warn(`[DEV MODE] 📧 Email would have been sent to ${to}`);
        this.logger.warn(`[DEV MODE] 📧 Subject: ${subject}`);
        return true;
      }
      return false;
    }
  }

  /**
   * Send verification email with a pre-generated link
   */
  async sendVerificationEmailWithLink(
    email: string,
    username: string,
    verificationLink: string,
  ): Promise<boolean> {
    const html = this.getVerificationEmailTemplate(username, verificationLink);

    const result = await this.sendEmail(
      email,
      'Verify Your Email - Heightt',
      html,
    );

    if (result) {
      this.logger.log(`Verification email with link sent to ${email}`);
    } else {
      this.logger.error(`Failed to send verification email to ${email}`);
    }

    return result;
  }

  /**
   * Send welcome email after successful verification
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
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    username: string,
    token: string,
  ): Promise<boolean> {
    const frontendUrl = this.getFrontendUrl();
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

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

  async sendPasswordChangedEmail(
    email: string,
    username: string,
  ): Promise<boolean> {
    const html = renderHeighttEmail({
      preheader: 'Your Heightt password was changed successfully.',
      category: 'Account security',
      headline: 'Your password has been changed',
      recipientName: username,
      intro:
        'Your Heightt account password was changed successfully, and all existing sessions have been signed out.',
      notice:
        'If you did not make this change, contact Heightt Support immediately.',
      tone: 'success',
      reason:
        'You received this email because the password for your Heightt account was changed.',
    });

    return this.sendEmail(email, 'Your Heightt password was changed', html);
  }

  /**
   * Send OTP email
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

  /**
   * Send new device login notification
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

  // ========== EMAIL TEMPLATES ==========

  private getVerificationEmailTemplate(
    username: string,
    verificationLink: string,
  ): string {
    return renderHeighttEmail({
      preheader: 'Verify your email address to activate your Heightt account.',
      category: 'Account verification',
      headline: 'Verify your email address',
      recipientName: username,
      intro:
        'Please confirm this email address to activate and secure your Heightt account.',
      actionLabel: 'Verify email address',
      actionUrl: verificationLink,
      notice:
        'This link expires in 24 hours. If you did not create this account, you can ignore this email. Heightt will never ask you to send your password or verification code by email.',
      reason:
        'You received this email because a Heightt account was created with this address.',
    });
    /* Legacy template retained temporarily for reference.
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
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0; font-size: 32px;">Heightt</h1>
            <p style="color: #6B7280; margin: 5px 0 0;">Financial Management for Students</p>
          </div>
          
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
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;" />
          
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} Heightt. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `; */
  }

  private getWelcomeEmailTemplate(username: string): string {
    const frontendUrl = this.getFrontendUrl();
    return renderHeighttEmail({
      preheader: 'Your Heightt account is ready.',
      category: 'Welcome to Heightt',
      headline: 'Your account is ready',
      recipientName: username,
      intro: 'Your email address has been verified successfully.',
      body: 'Heightt helps students and student organisations manage payments and financial records clearly. Complete your profile to get started.',
      actionLabel: 'Complete your profile',
      actionUrl: `${frontendUrl}/onboarding`,
      tone: 'success',
      reason:
        'You received this email because you verified your Heightt account.',
    });
    /* Legacy template retained temporarily for reference.
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
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;" />
          
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} Heightt. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `; */
  }

  private getPasswordResetEmailTemplate(
    username: string,
    resetLink: string,
  ): string {
    return renderHeighttEmail({
      preheader: 'Use this secure link to reset your Heightt password.',
      category: 'Account security',
      headline: 'Reset your password',
      recipientName: username,
      intro:
        'We received a request to reset the password for your Heightt account.',
      actionLabel: 'Reset password',
      actionUrl: resetLink,
      notice:
        'This single-use link expires in 1 hour. If you did not request a password reset, ignore this email and your password will remain unchanged.',
      reason:
        'You received this email because a password reset was requested for your account.',
    });
    /* Legacy template retained temporarily for reference.
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
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4F46E5; margin: 0; font-size: 32px;">Heightt</h1>
          </div>
          
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
          </div>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;" />
          
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} Heightt. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `; */
  }

  private getOTPEmailTemplate(
    username: string,
    otp: string,
    expiresInMinutes: number,
  ): string {
    return renderHeighttEmail({
      preheader: 'Your single-use Heightt verification code.',
      category: 'Security code',
      headline: 'Your verification code',
      recipientName: username,
      intro: 'Use the code below to complete your authentication.',
      details: [{ label: 'Verification code', value: otp }],
      notice: `This code expires in ${expiresInMinutes} minutes. Do not share it with anyone. If you did not request this code, you can ignore this email.`,
      reason:
        'You received this email because a verification code was requested for your account.',
    });
    /* Legacy template retained temporarily for reference.
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
          </div>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;" />
          
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} Heightt. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `; */
  }

  private getNewDeviceLoginTemplate(
    username: string,
    deviceName: string,
    location: string,
    ipAddress: string,
    time: string,
  ): string {
    return renderHeighttEmail({
      preheader: 'A new sign-in to your Heightt account was detected.',
      category: 'Security alert',
      headline: 'New sign-in detected',
      recipientName: username,
      intro:
        'We noticed a sign-in to your Heightt account from a new device or location.',
      details: [
        { label: 'Device', value: deviceName },
        { label: 'Approximate location', value: location },
        { label: 'IP address', value: ipAddress },
        { label: 'Time', value: time },
      ],
      notice:
        'If this was not you, change your password immediately and contact Heightt Support.',
      tone: 'danger',
      reason:
        'You received this email as a security notification for your Heightt account.',
    });
    /* Legacy template retained temporarily for reference.
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
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;" />
          
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            &copy; ${new Date().getFullYear()} Heightt. All rights reserved.
          </p>
        </div>
      </body>
      </html>
    `; */
  }

  private getFrontendUrl(): string {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    return frontendUrl.replace(/\/+$/, '');
  }
}
