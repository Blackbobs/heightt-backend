# Student dues across academic sessions

Use `GET /api/v1/finance/dues/student` as the source of truth for the authenticated student's current dues and unpaid historical obligations.

Closing an academic session does not erase an existing unpaid assignment. Assigned dues from previous sessions remain visible even if the student's old organisation membership is no longer active. Only current-session and cross-session dues can be newly auto-assigned.

## Response additions

Each item includes the existing assignment and due fields plus:

```ts
export type DueSessionCategory = 'CURRENT' | 'PREVIOUS' | 'ALL_SESSIONS';

export type StudentDueItem = {
  id: string;
  dueId: string;
  studentId: string;
  amount: number;
  isPaid: boolean;
  paidAt: string | null;
  isAutoAssigned: boolean;
  sessionCategory: DueSessionCategory;
  isOutstanding: boolean;
  isArrear: boolean;
  canPay: boolean;
  due: {
    id: string;
    name: string;
    description?: string | null;
    amount: number;
    status: 'ACTIVE' | 'INACTIVE' | 'COMPLETED' | 'CANCELLED';
    sessionId?: string | null;
    session?: {
      id: string;
      name: string;
      status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
      isCurrent: boolean;
    } | null;
    organization: {
      id: string;
      name: string;
    };
  };
};
```

## Presentation

Group results rather than displaying one mixed list:

```ts
export function groupStudentDues(items: StudentDueItem[]) {
  return {
    arrears: items.filter((item) => item.isArrear),
    current: items.filter((item) => item.sessionCategory === 'CURRENT'),
    allSessions: items.filter(
      (item) => item.sessionCategory === 'ALL_SESSIONS',
    ),
  };
}
```

Recommended labels:

- `PREVIOUS`: “Outstanding from {due.session.name}”
- `CURRENT`: the session name, such as “2027/2028”
- `ALL_SESSIONS`: “All sessions”

Show the arrears section first with the session name clearly visible. Use “Outstanding” as text; do not rely only on warning colours.

## Payment button

Render the Pay button only when `canPay` is true. Submit `id` as `dueAssignmentId` when `isAutoAssigned` is false. For a current or all-session due without an assignment, submit `dueId` and the backend will create the assignment safely.

```ts
const paymentInput = due.isAutoAssigned
  ? { dueId: due.dueId }
  : { dueAssignmentId: due.id };
```

An assigned previous-session due remains payable through `dueAssignmentId`. Do not block it merely because `due.session.status` is `COMPLETED`; `canPay` already expresses the backend collection rule.

If `canPay` is false, show “Payment closed” and retain the item for the student's records. The backend rejects direct payment attempts for inactive, completed, or cancelled dues.

After payment completes, invalidate:

```ts
queryClient.invalidateQueries({ queryKey: ['student-dues'] });
queryClient.invalidateQueries({ queryKey: ['payments'] });
queryClient.invalidateQueries({ queryKey: ['receipts'] });
queryClient.invalidateQueries({ queryKey: ['student-dashboard'] });
```

Never infer arrears by comparing dates or organisation names. Use `sessionCategory` and `isArrear` from the backend.
