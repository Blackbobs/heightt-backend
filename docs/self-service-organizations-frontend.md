# User-created organization requests

> **Status: implemented in the backend.**
> This document is the frontend and admin-dashboard integration contract for organization requests after onboarding.

## Final product rule

Academic directory records are platform-owned:

- only platform or appropriately authorized administrators create institutions;
- only administrators create faculties;
- only administrators create departments and academic levels;
- onboarding can select existing active academic records but cannot create missing ones.

After completing onboarding, any verified active user can request a new community organization. The organization may be tied to the user's institution hierarchy or may be independent.

The submitted organization remains unavailable in normal organization directories and its creator cannot use organization-admin authentication until a platform administrator approves it. After approval, the backend emails the creator a link to the correct admin dashboard.

## Why this matches onboarding

Onboarding automatically joins a student to the active academic organizations that correspond to their institution, faculty, department, level, and current academic session. Those memberships remain unchanged.

Creating a community organization does not replace or leave those memberships:

- the new organization membership uses `membershipType: ADMIN`;
- it uses `isPrimary: false`;
- the user's existing primary academic membership remains primary;
- users may administer a community organization while remaining members of their onboarding organizations.

## Academic directory behavior

The frontend must not show **Create institution**, **Create faculty**, **Create department**, or **Create level** during onboarding.

Use the existing active-only directory endpoints for dependent selectors:

1. Select an institution.
2. Load faculties belonging to that institution.
3. Select a faculty.
4. Load departments belonging to that faculty.
5. Select an academic level.
6. Complete onboarding and let the backend auto-join the matching academic organizations.

If an academic record is missing, show a support or platform-admin contact state. Do not send free-text names to create it.

Both onboarding paths now enforce this rule:

- the ID-based institution step accepts only active records;
- the legacy `POST /api/v1/onboarding/complete` path resolves submitted names against existing active records and returns `400` instead of creating missing records.

Recommended missing-record copy:

> Your institution or academic unit is not listed yet. Contact Heightt support or your platform administrator to have it added.

## User eligibility

`POST /api/v1/self-service/organizations` uses `JwtGuard` and requires the current user to have:

- an active account;
- a verified email;
- completed onboarding.

Use the normal authenticated API client so access cookies or bearer tokens and CSRF handling remain consistent with the rest of the application.

## Organization request endpoint

### Request

`POST /api/v1/self-service/organizations`

```ts
export type CreateOrganizationRequest = {
  name: string; // 2 to 255 characters
  description?: string;
  logo?: string; // absolute URL
  type: 'ASSOCIATION' | 'CLUB' | 'RELIGIOUS' | 'SPORTS' | 'SPECIAL';
  scope: 'CUSTOM' | 'CROSS_DEPARTMENT' | 'CROSS_LEVEL';
  institutionId?: string;
  facultyId?: string;
  departmentId?: string;
};
```

The client must not send:

- `slug`;
- `status`;
- `createdBy`;
- `academicSessionId`;
- `academicLevelId`;
- `parentOrganizationId`;
- academic organization types such as `INSTITUTION`, `FACULTY`, `DEPARTMENT`, or `LEVEL`.

The server generates the slug and ownership records.

### Independent organization example

```json
{
  "name": "Lagos Student Builders",
  "description": "A community for students building technology products.",
  "type": "ASSOCIATION",
  "scope": "CUSTOM"
}
```

### Institution-based organization example

```json
{
  "name": "FUTA Robotics Club",
  "description": "Robotics and embedded systems community.",
  "type": "CLUB",
  "scope": "CROSS_DEPARTMENT",
  "institutionId": "institution_id"
}
```

### Department-based organization example

```json
{
  "name": "Computer Science Developers Association",
  "type": "ASSOCIATION",
  "scope": "CUSTOM",
  "institutionId": "institution_id",
  "facultyId": "faculty_id",
  "departmentId": "department_id"
}
```

## Hierarchy validation

The backend enforces the following relationships:

- `CUSTOM` organizations may be independent.
- `CROSS_DEPARTMENT` and `CROSS_LEVEL` require an institution.
- A selected institution must be active and not deleted.
- A selected faculty must be active and belong to the selected institution.
- A selected department must be active and belong to the selected faculty.

Frontend behavior should mirror these rules:

- clear `facultyId` and `departmentId` when the institution changes;
- clear `departmentId` when the faculty changes;
- disable dependent selectors until their parent is selected;
- omit empty optional IDs instead of sending empty strings.

## Successful response

The endpoint returns HTTP `201`:

```ts
export type OrganizationRequestResponse = {
  entity: {
    id: string;
    name: string;
    nameNormalized: string | null;
    slug: string;
    description: string | null;
    logo: string | null;
    type: 'ASSOCIATION' | 'CLUB' | 'RELIGIOUS' | 'SPORTS' | 'SPECIAL';
    scope: 'CUSTOM' | 'CROSS_DEPARTMENT' | 'CROSS_LEVEL';
    status: 'DRAFT';
    institutionId: string | null;
    facultyId: string | null;
    departmentId: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  };
  approval: {
    id: string;
    entityType: 'ORGANIZATION';
    entityId: string;
    entityName: string;
    submittedBy: string;
    status: 'PENDING';
    reviewedBy: null;
    reviewedAt: null;
    rejectionReason: null;
    createdAt: string;
    updatedAt: string;
  };
};
```

After success, show a pending confirmation page. Do not route the user into the admin dashboard yet.

Recommended confirmation copy:

> Your organization request has been submitted. A Heightt platform administrator will review it. We will email you with the admin dashboard link after approval.

## What the backend provisions

Creation runs in a database transaction and creates:

- the organization with `DRAFT` status;
- an `ADMIN` organization membership for the creator;
- an `ORGANIZATION_ADMIN` assignment with `INACTIVE` status;
- the default organization-admin permissions;
- the organization wallet;
- the wallet ledger account.

The membership is non-primary, so it does not interfere with the user's primary onboarding membership.

The admin assignment remains inactive until platform approval. Possessing the membership alone does not grant early dashboard access.

## Duplicate protection

The backend normalizes names by:

1. decomposing accented characters;
2. removing combining accent marks;
3. converting to lowercase;
4. removing punctuation and whitespace.

Duplicate namespaces are:

| Organization      | Namespace            |
| ----------------- | -------------------- |
| Independent       | Global               |
| Institution-based | Selected institution |

The database has scoped unique indexes for normalized names and an additional slug index for institution organizations without an academic session. The service also catches concurrent Prisma `P2002` conflicts.

A conflict returns HTTP `409`:

```json
{
  "statusCode": 409,
  "message": {
    "message": "Organization already exists",
    "existingEntityId": "organization_id",
    "existingOrganizationSlug": "futa-robotics-club"
  },
  "error": "Conflict"
}
```

Use `existingEntityId` to offer **View organization** or **Join organization** if those flows are available. Do not automatically retry the create request.

There is no check-name, fuzzy-match, claim, or merge endpoint in this implementation. The `POST` response is authoritative.

## Frontend request helper

```ts
async function createOrganizationRequest(
  payload: CreateOrganizationRequest,
): Promise<OrganizationRequestResponse> {
  const response = await apiFetch('/api/v1/self-service/organizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body;
}
```

Disable submission while the request is in flight. Do not retry automatically.

## Error handling

| Status | Meaning                                                                           | Frontend behavior                                       |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `400`  | Invalid fields, unsupported hierarchy, incomplete onboarding, or unverified email | Show the backend message near the relevant field        |
| `401`  | Authentication missing or expired                                                 | Route to login and preserve the return URL              |
| `404`  | Selected approved institution was not found                                       | Refresh directory data and ask the user to select again |
| `409`  | An exact normalized organization already exists                                   | Show the existing organization action                   |
| `429`  | Request was throttled                                                             | Show the retry window and do not auto-retry             |

## Platform-admin approval dashboard

Only `PLATFORM_ADMIN` users can access approval endpoints.

### List approval requests

`GET /api/v1/approvals?status=PENDING`

Supported statuses:

- `PENDING`
- `APPROVED`
- `REJECTED`

The default is `PENDING`. The response is a plain array ordered oldest first.

```ts
export type ApprovalRequest = {
  id: string;
  entityType: 'ORGANIZATION';
  entityId: string;
  entityName: string;
  submittedBy: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### Dashboard page

Add **Organization approvals** to the platform-admin navigation.

Recommended layout:

- Pending, Approved, and Rejected tabs.
- Organization name.
- Submission time.
- Creator user ID.
- Approve action.
- Reject action.
- Rejection reason in rejected history.

The current approval record does not embed the full organization or creator profile. Use `entityId` and `submittedBy` with existing admin data endpoints if the review page needs more details.

### Approve an organization

`PATCH /api/v1/approvals/{approvalId}/review`

```json
{
  "status": "APPROVED"
}
```

Approval is transactional:

- organization becomes `ACTIVE`;
- `activatedAt` is set;
- creator's scoped admin assignment becomes `ACTIVE`;
- approval request becomes `APPROVED`.

After commit, the backend sends the creator an approval email containing **Open admin dashboard**.

Dashboard URLs:

- staging: `https://admin-preview.heightt.app`
- production: `https://admin.heightt.app`
- optional deployment override: `ADMIN_APP_URL`

The creator can use the admin login after approval because their admin assignment is now active.

### Reject an organization

```json
{
  "status": "REJECTED",
  "rejectionReason": "The organization could not be verified."
}
```

The rejection reason is required and must contain at least three characters.

Rejection is transactional:

- organization becomes `ARCHIVED`;
- `archivedAt` and `deletedAt` are set;
- creator's admin assignment becomes `REVOKED`;
- approval request becomes `REJECTED`.

The creator receives an email containing the rejection reason. No dashboard action is included.

## Submission and review emails

When a request is submitted, every active platform admin receives a branded email with:

- organization name;
- entity type;
- link to the platform dashboard.

Email delivery uses `Promise.allSettled`, so one failed recipient does not block other recipients or undo creation.

Approval and rejection emails are sent after the database transaction. Email-provider failure does not roll back the decision. The dashboard must use the API response as the source of truth.

## Organization administrator management

After approval, an organization admin can appoint another Heightt user without platform-admin involvement.

`POST /api/v1/rbac/organizations/{organizationId}/admins`

```json
{
  "userId": "target_user_id"
}
```

Requirements:

- caller is an active `ORGANIZATION_ADMIN` for the exact organization;
- caller has `organization:manage`;
- organization is `ACTIVE`;
- target user exists.

The backend creates or updates the target membership to active `ADMIN`, creates or reactivates the scoped admin assignment, and assigns default organization-admin permissions.

Recommended page:

`Organization settings > Administrators`

Hide the action for draft, inactive, suspended, archived, or rejected organizations. Treat `409` as “This user is already an organization administrator.”

## Platform academic management

Keep institution, faculty, department, and academic-level creation in the existing admin dashboard. Do not call self-service routes for them.

Existing administrator creation routes remain unchanged:

- `POST /api/v1/institutions`
- `POST /api/v1/institutions/faculties`
- `POST /api/v1/institutions/departments`
- `POST /api/v1/institutions/academic-levels`

Their existing admin guards and permissions remain authoritative.

## Frontend implementation checklist

1. Remove academic creation actions from onboarding.
2. Keep onboarding selectors limited to active directory records.
3. Add a missing-academic-record support state.
4. Add a post-onboarding **Create organization** entry point.
5. Build one organization form using the implemented payload.
6. Never send a slug or academic organization type.
7. Reset dependent hierarchy fields when parents change.
8. Show a pending confirmation instead of opening the admin dashboard.
9. Handle nested `409` conflict details.
10. Add organization approval history to the platform dashboard.
11. Activate dashboard navigation only after the user has active admin authorization.
12. Add organization administrator management for approved organizations.

## Deployment order

1. Run a duplicate report for normalized organization names within each namespace.
2. Resolve conflicting existing organizations before migration deployment.
3. Deploy `20260924090000_add_self_service_approvals`.
4. Deploy the backend.
5. Configure `ADMIN_APP_URL` when the built-in environment defaults are not appropriate.
6. Deploy the platform-admin approval queue.
7. Deploy the organization request form.
8. Remove academic creation controls from onboarding.
9. Verify the complete staging flow before production rollout.

Do not enable the frontend request form before the migration and backend are deployed.

## End-to-end acceptance checks

1. Onboarding cannot create an institution, faculty, department, or academic level.
2. Onboarding accepts only active academic records with valid parent relationships.
3. A user retains their onboarding academic memberships after requesting an organization.
4. An unverified user cannot request an organization.
5. A user who has not completed onboarding cannot request an organization.
6. A submitted organization is `DRAFT` and absent from active organization lists.
7. The creator's new organization membership is not primary.
8. The creator cannot use organization-admin authentication before approval.
9. Every active platform admin receives the submission email attempt.
10. A normal user cannot access the approval queue.
11. Approval activates the organization and creator admin assignment atomically.
12. Approval email contains the correct staging or production dashboard URL.
13. Rejection archives and soft deletes the organization and revokes admin access.
14. Exact normalized duplicates return `409` without creating a second organization.
15. An approved organization admin can appoint another admin only within their organization.
16. Existing platform-admin academic creation routes continue working unchanged.
