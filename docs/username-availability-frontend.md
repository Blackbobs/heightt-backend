# Username availability: frontend integration

Use this endpoint to check whether a username is already used:

```http
GET /api/v1/users/check-username?username=<username>
```

The endpoint is public and can be called from the registration screen. It does not require an access token or authenticated cookie.

## Username rules

For registration, a valid username:

- is 3 to 30 characters long;
- contains letters, numbers, and underscores only;
- is unique without regard to letter casing.

Examples:

| Username   | Locally valid? | Reason                                              |
| ---------- | -------------- | --------------------------------------------------- |
| `john_doe` | Yes            | Letters and underscore, correct length              |
| `JohnDoe7` | Yes            | Uppercase letters are accepted                      |
| `ab`       | No             | Fewer than 3 characters                             |
| `john doe` | No             | Spaces are not accepted                             |
| `john@doe` | No             | `@` is not accepted                                 |
| `john.doe` | No             | Only letters, numbers, and underscores are accepted |
| `john-doe` | No             | Only letters, numbers, and underscores are accepted |

The availability lookup is case-insensitive. For example, if `john_doe` exists, checking `JOHN_DOE` returns `available: false`. Registration stores the username in lowercase, so the frontend should lowercase it before checking and submitting for a consistent display.

## Request

Encode the query parameter instead of joining raw input into a URL:

```ts
const params = new URLSearchParams({ username: username.trim().toLowerCase() });

const response = await fetch(
  `${API_BASE_URL}/api/v1/users/check-username?${params}`,
  {
    method: 'GET',
  },
);
```

This is a `GET` request, so it has no JSON body and does not require a CSRF token.

## Successful responses

The endpoint returns HTTP `200` for available, taken, missing, and invalid usernames. Read the `available` field rather than using the HTTP status to decide availability.

Available username:

```json
{
  "available": true,
  "username": "john_doe",
  "message": "Username \"john_doe\" is available",
  "suggestions": []
}
```

Taken username:

```json
{
  "available": false,
  "username": "john_doe",
  "message": "Username \"john_doe\" is already taken",
  "suggestions": ["johndoe1", "johndoe2", "johndoe3"]
}
```

Suggestions are generated when the username is taken. The array can be empty, so the UI must not assume suggestions always exist.

Missing username:

```json
{
  "available": false,
  "message": "Username is required",
  "suggestions": []
}
```

Invalid username:

```json
{
  "available": false,
  "username": "ab",
  "message": "Username must be 3-30 characters and can only contain letters, numbers, and underscores",
  "suggestions": []
}
```

The availability endpoint and registration now use the same character and length rules.

## Recommended form behavior

Validate format locally first. If the value is locally valid, wait about 400–500 ms after the user stops typing before making the request. Cancel or ignore older requests so a slow response for an earlier value cannot replace the state for the current value.

```ts
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;

type UsernameAvailability = {
  available: boolean;
  username?: string;
  message: string;
  suggestions: string[];
};

async function checkUsername(
  rawUsername: string,
  signal?: AbortSignal,
): Promise<UsernameAvailability> {
  const username = rawUsername.trim().toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    return {
      available: false,
      username,
      message: 'Use 3–30 letters, numbers, or underscores.',
      suggestions: [],
    };
  }

  const query = new URLSearchParams({ username });
  const response = await apiFetch(`/api/v1/users/check-username?${query}`, {
    method: 'GET',
    signal,
  });

  if (!response.ok) {
    throw new Error('Could not check username availability');
  }

  return response.json();
}
```

Suggested UI states:

- Empty: show no availability message.
- Invalid locally: show the validation message and do not call the API.
- Checking: show a small progress indicator and disable final submission if the screen changes a username.
- Available: show `message` or “Username is available.”
- Taken: show `message`, render any returned suggestions as selectable options, and prevent submission.
- Request failed: show “Could not check username right now” and allow retry.

When a suggestion is selected, put it in the username field and check it again. Suggestions are checked when generated, but availability can change before the user selects one.

## React Query example

```ts
function useUsernameAvailability(username: string) {
  const normalized = username.trim().toLowerCase();
  const valid = USERNAME_PATTERN.test(normalized);

  return useQuery({
    queryKey: ['username-availability', normalized],
    queryFn: ({ signal }) => checkUsername(normalized, signal),
    enabled: valid,
    staleTime: 0,
    retry: 1,
  });
}
```

Debounce `normalized` before passing it to the hook. Include the normalized username in the query key. Do not cache an “available” result indefinitely.

## Final registration and update handling

An availability result is advisory. Another user can claim the username between the check and the final write. The backend remains the source of truth.

For registration, `POST /api/v1/auth/register` can return HTTP `409`:

```json
{
  "statusCode": 409,
  "message": "Username is already taken",
  "error": "Conflict"
}
```

Map that response back to the username field, clear the previous available state, and let the user choose another username. The username update flow can produce the same conflict and should be handled in the same way.

The availability endpoint is cached by the server for 60 seconds per normalized username. A recently claimed username may briefly appear available from cache, which is another reason to always handle the final `409` response.

## Frontend acceptance checks

1. A valid unused username displays an available state.
2. A taken username displays unavailable and shows returned suggestions when present.
3. The check is case-insensitive.
4. Values shorter than 3 or longer than 30 characters do not trigger a request.
5. Spaces, dots, hyphens, and special characters fail local registration validation.
6. Rapid typing does not let an older response replace the current field state.
7. Selecting a suggestion triggers a fresh check.
8. The endpoint works without an access token or authenticated cookie.
9. HTTP `409` from the final registration or update is attached to the username field.
