import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SystemEvents } from './event.types';

// Export SystemEvents so other modules can use it
export { SystemEvents };

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Emit an event
   */
  emit(event: SystemEvents, data: any): void {
    this.logger.debug(`Emitting event: ${event}`);
    this.eventEmitter.emit(event, data);
  }

  /**
   * Emit an async event
   */
  emitAsync(event: SystemEvents, data: any): Promise<any> {
    this.logger.debug(`Emitting async event: ${event}`);
    return this.eventEmitter.emitAsync(event, data);
  }

  /**
   * Listen to an event
   */
  on(event: SystemEvents, callback: (payload: any) => void): void {
    this.eventEmitter.on(event, callback);
  }

  /**
   * Listen to an event once
   */
  once(event: SystemEvents, callback: (payload: any) => void): void {
    this.eventEmitter.once(event, callback);
  }

  /**
   * Remove a listener
   */
  off(event: SystemEvents, callback: (payload: any) => void): void {
    this.eventEmitter.off(event, callback);
  }

  // ============================================
  // PAYMENT EVENTS
  // ============================================

  emitPaymentReceived(data: {
    paymentId: string;
    userId: string;
    organizationId: string;
    amount: number;
    reference: string;
    metadata?: any;
  }) {
    this.emit(SystemEvents.PAYMENT_RECEIVED, data);
  }

  emitPaymentFailed(data: {
    paymentId: string;
    userId: string;
    amount: number;
    reason: string;
    reference: string;
  }) {
    this.emit(SystemEvents.PAYMENT_FAILED, data);
  }

  emitPaymentRefunded(data: {
    paymentId: string;
    userId: string;
    amount: number;
    reference: string;
    reason?: string;
  }) {
    this.emit(SystemEvents.PAYMENT_REFUNDED, data);
  }

  // ============================================
  // WALLET EVENTS
  // ============================================

  emitWalletCredited(data: {
    walletId: string;
    userId: string;
    amount: number;
    balance: number;
    previousBalance: number;
    reference: string;
    description?: string;
  }) {
    this.emit(SystemEvents.WALLET_CREDITED, data);
  }

  emitWalletDebited(data: {
    walletId: string;
    userId: string;
    amount: number;
    balance: number;
    previousBalance: number;
    reference: string;
    description?: string;
  }) {
    this.emit(SystemEvents.WALLET_DEBITED, data);
  }

  emitWalletBalanceUpdated(data: {
    walletId: string;
    userId: string;
    balance: number;
    previousBalance: number;
    currency: string;
  }) {
    this.emit(SystemEvents.WALLET_BALANCE_UPDATED, data);
  }

  // ============================================
  // WITHDRAWAL EVENTS
  // ============================================

  emitWithdrawalRequested(data: {
    withdrawalId: string;
    userId: string;
    organizationId: string;
    amount: number;
    reference: string;
    bankName: string;
  }) {
    this.emit(SystemEvents.WITHDRAWAL_REQUESTED, data);
  }

  emitWithdrawalApproved(data: {
    withdrawalId: string;
    userId: string;
    amount: number;
    reference: string;
    processedAt: Date;
  }) {
    this.emit(SystemEvents.WITHDRAWAL_APPROVED, data);
  }

  emitWithdrawalRejected(data: {
    withdrawalId: string;
    userId: string;
    amount: number;
    reference: string;
    reason: string;
  }) {
    this.emit(SystemEvents.WITHDRAWAL_REJECTED, data);
  }

  // ============================================
  // DUE EVENTS
  // ============================================

  emitDuesAssigned(data: {
    dueId: string;
    organizationId: string;
    studentId: string;
    amount: number;
  }) {
    this.emit(SystemEvents.DUES_ASSIGNED, data);
  }

  emitDuesPaid(data: {
    dueId: string;
    studentId: string;
    amount: number;
    paymentId: string;
    paidAt: Date;
  }) {
    this.emit(SystemEvents.DUES_PAID, data);
  }

  // ============================================
  // SAVINGS EVENTS
  // ============================================

  emitSavingsGoalCompleted(data: {
    goalId: string;
    userId: string;
    title: string;
    targetAmount: number;
    currentAmount: number;
    completedAt: Date;
  }) {
    this.emit(SystemEvents.SAVINGS_GOAL_COMPLETED, data);
  }

  // ============================================
  // STUDENT EVENTS
  // ============================================

  emitStudentPromoted(data: {
    studentId: string;
    userId: string;
    fromLevelId: string;
    toLevelId: string;
    promotionDate: Date;
  }) {
    this.emit(SystemEvents.STUDENT_PROMOTED, data);
  }
}
