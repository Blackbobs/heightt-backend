# Department Academic Levels Frontend Integration

## Create a department

Use the existing authenticated endpoint:

```http
POST /api/v1/institutions/departments
Content-Type: application/json
Authorization: Bearer <access-token>
```

The request body supports the following fields:

```json
{
  "name": "Computer Science",
  "code": "CSC",
  "facultyId": "faculty-id",
  "promotionType": "AUTOMATIC",
  "numberOfLevels": 5,
  "customLevelNames": [
    "100 Level",
    "200 Level",
    "300 Level",
    "400 Level",
    "500 Level"
  ]
}
```

### `numberOfLevels`

- Optional when the default behavior is acceptable.
- Supported values are `4`, `5`, `6`, and `7`.
- The value must be an integer. Numeric form values such as `"5"` are transformed to `5` by the API.
- The frontend should send this value explicitly whenever the institution or department requires a specific number of levels, especially for 7-level departments.
- Values below `4`, above `7`, or non-integer values return `400 Bad Request`.

When omitted, the backend uses its current defaults:

- Departments whose names contain engineering, law, architecture, pharmacy, veterinary, or agriculture default to `5`.
- Departments whose names contain medicine, surgery, or dentistry default to `6`.
- Other departments default to `4`.

The frontend should not rely on name-based defaults when the institution has a known academic structure. Send `numberOfLevels` explicitly instead.

### `customLevelNames`

- Optional. If omitted, levels are generated as `100 Level`, `200 Level`, and so on.
- If supplied, it must contain exactly `numberOfLevels` labels.
- Labels are assigned in array order to numeric levels `100`, `200`, `300`, and so on.
- For example, a 5-level department must send exactly 5 labels.
- A mismatched array returns `400 Bad Request`.

## Response and generated records

On success, the response is the created department with its `academicLevels` ordered by `order` ascending. For each configured level, the backend creates:

1. An `AcademicLevel` record linked to the department.
2. A level organization linked to the institution, faculty, department, academic level, and default academic session.

Therefore, a department configured with `4`, `5`, `6`, or `7` levels produces the same number of academic levels and level organizations. The frontend should render the returned `academicLevels` array rather than assuming only 4 levels.

## Frontend form behavior

Recommended controls:

- Present a required selector with options `4`, `5`, `6`, and `7`.
- Show one level-name input for each selected level.
- Keep the inputs ordered from 100 level upward.
- Send `numberOfLevels` as a number and `customLevelNames` only when the user has supplied names.
- Before submission, verify `customLevelNames.length === numberOfLevels`.

Example 7-level payload:

```json
{
  "name": "Medicine",
  "code": "MED",
  "facultyId": "faculty-id",
  "numberOfLevels": 7,
  "customLevelNames": [
    "100 Level",
    "200 Level",
    "300 Level",
    "400 Level",
    "500 Level",
    "600 Level",
    "700 Level"
  ]
}
```

# Student Onboarding Frontend Integration

Onboarding no longer collects gender, country, phone, date of birth, address,
or other personal details. The required student information is:

- First name
- Last name
- Matric number
- Institution
- Faculty
- Department
- Academic level
- Student category: fresher or staylite

## Recommended onboarding flow

Use the two-step flow below. Both endpoints require an authenticated user:

1. Save the student name with `PATCH /api/v1/onboarding/personal-info`.
2. Save the institution and academic details with `PATCH /api/v1/onboarding/institution`.

The backend completes onboarding after the institution request succeeds.

## Step 1: Personal information

```http
PATCH /api/v1/onboarding/personal-info
Content-Type: application/json
Authorization: Bearer <access-token>
```

Request body:

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace"
}
```

Both fields are required strings. Do not send `gender` or `country`; they are
not part of the onboarding contract.

Successful response shape:

```json
{
  "message": "Personal information updated successfully",
  "onboardingStep": "INSTITUTION",
  "profile": {}
}
```

## Step 2: Institution and student details

```http
PATCH /api/v1/onboarding/institution
Content-Type: application/json
Authorization: Bearer <access-token>
```

Request body:

```json
{
  "institutionId": "institution-uuid",
  "facultyId": "faculty-uuid",
  "departmentId": "department-uuid",
  "levelId": "academic-level-uuid",
  "matricNumber": "MAT/2024/001",
  "isFresher": true
}
```

Field rules:

| Field           | Required | Frontend behavior                                                                          |
| --------------- | -------- | ------------------------------------------------------------------------------------------ |
| `institutionId` | Yes      | Send the selected institution UUID.                                                        |
| `facultyId`     | Yes      | Load faculties for the selected institution and send the selected faculty UUID.            |
| `departmentId`  | Yes      | Load departments for the selected faculty and send the selected department UUID.           |
| `levelId`       | Yes      | Load academic levels for the selected department and send the selected level UUID.         |
| `matricNumber`  | Yes      | Send the student matric number as a string. It must not already belong to another student. |
| `isFresher`     | Yes      | Send `true` for a fresher or `false` for a staylite.                                       |

The frontend should load levels from the selected department instead of
assuming that every department has four levels. A department can have 4, 5,
6, or 7 levels.

## Fresher and staylite rules

The `isFresher` value must match the selected academic level:

- `isFresher: true`: the selected level must be exactly `100 Level` (`numericLevel === 100`).
- `isFresher: false`: the selected level must be `200 Level` or higher (`numericLevel >= 200`).

Suggested frontend labels:

```json
[
  { "label": "Fresher", "value": true, "description": "100 Level" },
  { "label": "Staylite", "value": false, "description": "200 Level and above" }
]
```

The backend rejects mismatches with `400 Bad Request`, for example:

- Fresher selected with `200 Level`.
- Staylite selected with `100 Level`.
- A level belonging to another department.
- A faculty belonging to another institution.
- A department belonging to another faculty.
- A duplicate matric number.

## Successful completion

Successful institution onboarding returns:

```json
{
  "message": "Onboarding completed successfully! Welcome to Heightt",
  "onboardingStep": "COMPLETED",
  "onboardingCompleted": true,
  "profile": {},
  "studentProfile": {}
}
```

After completion, the student is automatically added to the matching active
institution, faculty, department, and academic-level organizations. The
frontend does not need a separate organization-join request.

## Onboarding status

Use either status endpoint when restoring onboarding state:

```http
GET /api/v1/onboarding/check
GET /api/v1/onboarding/status
Authorization: Bearer <access-token>
```

`check` provides the redirect decision. Its response includes:

```json
{
  "needsOnboarding": true,
  "onboardingCompleted": false,
  "onboardingStep": "INSTITUTION",
  "redirectTo": "/onboarding"
}
```

`status` provides progress and missing fields. The personal information
requirements are `firstName` and `lastName`. The institution requirements are
`institution`, `faculty`, `department`, `level`, and `matricNumber`.

## Combined endpoint compatibility

The existing endpoint remains available:

```http
POST /api/v1/onboarding/complete
Content-Type: application/json
Authorization: Bearer <access-token>
```

Use the same concepts when calling it:

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "matricNumber": "MAT/2024/001",
  "institution": "Heightt University",
  "faculty": "Faculty of Computing",
  "department": "Computer Science",
  "academicLevelId": "academic-level-uuid",
  "isFresher": true,
  "sessionId": "academic-session-uuid"
}
```

Prefer the structured two-step flow because it uses IDs and validates the
institution hierarchy directly. Do not send gender or country to either flow.
