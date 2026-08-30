export enum SystemEvents {
  // Auth Events
  USER_REGISTERED = 'user.registered',
  USER_LOGGED_IN = 'user.logged_in',
  USER_LOGGED_OUT = 'user.logged_out',
  USER_VERIFIED = 'user.verified',
  USER_SUSPENDED = 'user.suspended',

  // Payment Events
  PAYMENT_INITIATED = 'payment.initiated',
  PAYMENT_RECEIVED = 'payment.received',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_REFUNDED = 'payment.refunded',
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_COMPLETED_VIA_BACHS = 'payment.completed.via.bachs',

  // Wallet Events
  WALLET_CREATED = 'wallet.created',
  WALLET_CREDITED = 'wallet.credited',
  WALLET_DEBITED = 'wallet.debited',
  WALLET_BALANCE_UPDATED = 'wallet.balance.updated',
  WALLET_HELD = 'wallet.held',
  WALLET_RELEASED = 'wallet.released',

  // Withdrawal Events
  WITHDRAWAL_REQUESTED = 'withdrawal.requested',
  WITHDRAWAL_APPROVED = 'withdrawal.approved',
  WITHDRAWAL_REJECTED = 'withdrawal.rejected',
  WITHDRAWAL_COMPLETED = 'withdrawal.completed',
  WITHDRAWAL_FAILED = 'withdrawal.failed',

  // Due Events
  DUES_ASSIGNED = 'dues.assigned',
  DUES_PAID = 'dues.paid',

  // Savings Events
  SAVINGS_GOAL_CREATED = 'savings.goal_created',
  SAVINGS_GOAL_UPDATED = 'savings.goal_updated',
  SAVINGS_GOAL_COMPLETED = 'savings.goal_completed',
  SAVINGS_DEPOSIT = 'savings.deposit',

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
  SYSTEM_UPDATE = 'system.update',

  // File Events
  FILE_UPLOADED = 'file.uploaded',
  FILE_DELETED = 'file.deleted',
  FILE_UPDATED = 'file.updated',
}
