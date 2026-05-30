# `@field-iq/glasses-webapp`

The HUD Web App that runs **on the Meta Ray-Ban Display**. Renders the active
LOTO step card, listens for Neural Band gestures, and reacts to verdicts the
backend pushes over WebSocket.

## URL contract

```
https://glasses.field-iq.eonreality.com/?session=<id>#token=<jwt>
```

The JWT lives in the **URL fragment** (`#token=…`) so it never appears in
server logs. The session id is a normal query parameter so the URL can be
shared/bookmarked safely between sessions.

## Dev

```bash
pnpm install
pnpm --filter @field-iq/glasses-webapp dev    # http://localhost:3001
```

The dev server expects the backend (M3) on `http://localhost:3000`; override with
`VITE_API_HOST` / `VITE_WS_HOST` if needed.

For development the input layer maps:

| Gesture       | Neural Band         | Keyboard |
| ------------- | ------------------- | -------- |
| advance/pinch | index-finger pinch  | `Enter`  |
| cancel        | middle-finger pinch | `Esc`    |
| swipes        | wrist swipes        | arrows   |

## Adding to the glasses

In the Meta AI app: **App Settings → App connections → Add a Web App** and
paste the deployed (password-protected) URL. Onboarding via QR is also
supported by the Web Apps platform.

## Bundle budget

Target: **< 200 KB gzipped**. `pnpm --filter @field-iq/glasses-webapp build`
prints the gzip column; tighten if it grows.
