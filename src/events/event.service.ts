import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export enum SystemEvents {
  // Auth Events
  USER_REGISTERED = 'user.registered',
  USER_LOGGED_IN = 'user.logged_in',
  USER_LOGGED_OUT = 'user.logged_out',
  USER_VERIFIED = 'user.verified',
  USER_SUSPENDED = 'user.suspended',

  // Finance Events
  PAYMENT_RECEIVED = 'payment.received',
  WITHDRAWAL_REQUESTED = 'withdrawal.requested',
  WITHDRAWAL_APPROVED = 'withdrawal.approved',
  WITHDRAWAL_REJECTED = 'withdrawal.rejected',
  DUES_ASSIGNED = 'dues.assigned',
  DUES_DUE_SOON = 'dues.due_soon',
  DUES_OVERDUE = 'dues.overdue',
  SAVINGS_GOAL_COMPLETED = 'savings.goal_completed',

  // Organization Events
  ORGANIZATION_CREATED = 'organization.created',
  ORGANIZATION_ACTIVATED = 'organization.activated',
  ORGANIZATION_MEMBER_ADDED = 'organization.member_added',
  ORGANIZATION_MEMBER_REMOVED = 'organization.member_removed',

  // Student Events
  STUDENT_ENROLLED = 'student.enrolled',
  STUDENT_PROMOTED = 'student.promoted',
  STUDENT_VERIFIED = 'student.verified',

  // Announcement Events
  ANNOUNCEMENT_CREATED = 'announcement.created',
  ANNOUNCEMENT_PUBLISHED = 'announcement.published',
  ANNOUNCEMENT_READ = 'announcement.read',

  // Notification Events
  NOTIFICATION_SENT = 'notification.sent',

  // System Events
  SYSTEM_ERROR = 'system.error',
  SYSTEM_MAINTENANCE = 'system.maintenance',
}

@Injectable()
export class EventService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  emit(event: SystemEvents, data: any): void {
    this.eventEmitter.emit(event, data);
  }

  emitAsync(event: SystemEvents, data: any): Promise<any> {
    return this.eventEmitter.emitAsync(event, data);
  }
}
