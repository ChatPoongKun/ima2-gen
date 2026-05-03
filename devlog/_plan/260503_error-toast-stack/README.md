# Error Toast Stack Plan

## Context

The screenshot shows the current error popup occupying the lower-center work area over the image canvas. That placement blocks normal editing and makes repeated errors hard to clear. The requested behavior is a compact bottom-right log stack matching the hand-drawn direction in the screenshot.

## Requirements

- Render toast/error messages as one-line blocks stacked at the bottom-right of the app.
- Keep accumulating messages while the browser tab is inactive.
- When the tab is active, dismiss each toast after a 30 second timeout.
- Add a close button at the far right of every toast row.
- Avoid central overlays for this error-log style.
- Keep existing call sites using `showToast(message, error?)` and `showErrorCard(code, params?)` working.

## Implementation Plan

### MODIFY `ui/src/store/useAppStore.ts`

- Introduce a `ToastEntry` object with `message`, `error`, `id`, and `createdAt`.
- Keep `toast` as the latest toast for compatibility.
- Add `toastLog: ToastEntry[]` for the visible stack.
- Add `dismissToast(id)` to remove one row from the stack.
- Update `showToast` to append a new row instead of replacing the only visible popup.
- Add `errorCardLog` and `dismissErrorCard(id)` so formerly centered error cards can join the same compact stack.

### MODIFY `ui/src/components/Toast.tsx`

- Render `toastLog` as a stack instead of a single toast.
- Render `errorCardLog` in the same stack with localized one-line messages.
- Add `TOAST_VISIBLE_TIMEOUT_MS = 30_000`.
- Track `document.visibilityState`, `focus`, and `blur`.
- Start auto-dismiss timers only when the tab is active.
- Clear timers while inactive so notifications remain accumulated until the user returns.
- Add a per-row `x` button wired to `dismissToast`.
- Add a per-row `x` button wired to either `dismissToast` or `dismissErrorCard`.

### MODIFY `ui/src/components/ErrorCard.tsx`

- Stop rendering the central blocking backdrop.
- Keep the component as an App compatibility boundary while the actual error card rows are rendered through `Toast`.

### MODIFY `ui/src/index.css`

- Add `.toast-stack` fixed to bottom-right.
- Make `.toast` a compact one-line grid row with message overflow ellipsis.
- Place `.toast__dismiss` at the far right of the row.
- Keep error rows visually distinct with the existing red token.

### ADD `tests/toast-stack-contract.test.js`

- Source-level contract test for the store and UI behavior:
  - `toastLog` state exists.
  - `dismissToast` exists.
  - `showToast` appends rows.
  - component uses 30 seconds and visibility state.
  - CSS is bottom-right, one-line, and ellipsized.

## Verification Plan

- Run `npm test`.
- Run `cd ui && npx tsc -b --noEmit`.
- Run `cd ui && npm run build`.

If local dependencies are missing, install project dependencies first, then run the same verification commands.
