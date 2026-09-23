# Production Verification Checklist

This repository contains the complete manual EFT task-pay-in implementation for DoForYou.

## Code complete

- [x] Task creation starts at `PendingPayment` / `Pending`.
- [x] Capitec Business manual EFT details are configurable through Script Properties.
- [x] Customer payment submission moves the payment to `AWAITING_VERIFICATION`.
- [x] Customer submission never publishes the task.
- [x] Admin-only payment verification moves the payment to `VERIFIED`.
- [x] Verified payment moves the task to `Posted` / `EscrowHeld` / `held`.
- [x] Helpers can only browse and claim `Posted` + `EscrowHeld` tasks.
- [x] Direct access to unpublished pending tasks is blocked for other users.
- [x] Rejected manual submissions return the task to `PendingPayment`.
- [x] Pending/unverified payment requests expire after 24 hours without deleting history.
- [x] Expiry is enforced by the hourly trigger and at payment-instruction/submission time.
- [x] Duplicate hourly maintenance triggers are removed before installing a new one.
- [x] Server-side profanity, explicit-content and hate/slur moderation runs on task creation and pending-task edits.
- [x] Common character substitutions and separator/spaced obfuscation are checked.
- [x] Compiled `DFY-GOOGLE-SCRIPT.gs` is synchronized with the modular Apps Script implementation.
- [x] React task creation uses the manual EFT flow.
- [x] React payment page displays the bank instructions and submits payment details.
- [x] React admin payments page verifies/rejects manual EFT submissions.

## Required deployed-runtime verification

These checks require the actual Google Apps Script Web App and its Google Sheet:

1. Run `setup()`.
2. Run `seedCategories()`.
3. Run `installTriggers()`.
4. Create the production Admin with `createAdminUser()`.
5. Set the production Script Properties for bank/payment configuration.
6. Run `selfTest()` and confirm `passed: true`.
7. From the deployed frontend, register/login as a creator.
8. Create a clean task and confirm it becomes `PendingPayment`.
9. Confirm the bank details and task reference are displayed.
10. Submit a manual payment and confirm the task remains hidden.
11. Log in as Admin and verify the EFT against the real Capitec business account.
12. Confirm the task becomes `Posted` and `EscrowHeld`.
13. Log in as a runner and confirm the task becomes visible/claimable only after verification.
14. Complete and confirm a task and verify the payout ledger state.
15. Test rejection and confirm the task remains private.
16. Test a profanity/explicit task name and description and confirm server-side rejection.
17. Test an obfuscated profanity variant and confirm server-side rejection.
18. Verify a payment older than 24 hours expires and is retained in history.
19. Confirm the deployed browser can communicate with the Apps Script Web App from the actual frontend origin.

The repository cannot truthfully mark the final runtime checks as passed until the deployed Apps Script URL and Google Sheet are exercised.
