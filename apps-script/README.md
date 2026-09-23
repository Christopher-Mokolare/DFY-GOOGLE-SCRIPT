# DFY Google Apps Script Backend

This directory replaces DFY-BE for the Google Apps Script deployment.

Architecture:
- React frontend
- Google Apps Script Web App
- Google Sheets as the initial relational datastore
- Drive/Properties for configuration
- No DFY-BE runtime dependency
- No Ozow dependency

The script implements the DFY task, user, manual payment-ledger, escrow, payout-record,
refund, dispute, notification, messaging, banking, rating and admin workflows.

Setup:
1. Create a Google Apps Script project.
2. Add the files from this directory.
3. Run `setup()` once while authenticated.
4. Run `seedCategories()` and create an admin user with `createAdminUser()`.
5. Set the manual-payment Script Properties described in DEPLOYMENT.md.
6. Deploy as Web app, execute as the deploying account, access "Anyone".
7. Put the deployment URL in VITE_GOOGLE_SCRIPT_URL.
8. Do not store secrets in source control.

The frontend can call the API using POST JSON envelopes:
`{ "path": "/auth/login", "method": "POST", "body": {...}, "token": "..." }`

GET requests may use `?path=/categories&token=...`

## Manual task payment flow

`Create task -> PendingPayment -> customer EFT -> payment submission -> AwaitingVerification -> admin bank check -> Verified -> Posted + EscrowHeld`.

The customer payment is made manually to:

- Bank: Capitec – Business
- Account name: DoForYou Freelance
- Account number: 2495858216
- Reference: the customer's full name
- Proof of Payment: WhatsApp 0795258611

The backend also creates an internal task payment reference such as `DFY-123` so the payment can be tied to the task record. This internal reference does not replace the bank reference requested from the customer.

Submitting a Proof of Payment does not prove that money has cleared. Only an Admin verification action can move the task to `Posted` / `EscrowHeld`.

## API

Customer:
- `GET /tasks/{taskId}/payment-url` — retained for compatibility; now returns manual EFT instructions instead of a payment URL.
- `POST /tasks/{taskId}/payment-submit` — submit amount, bank reference, payment date and optional Proof of Payment.

Admin:
- `GET /admin/payments/pending`
- `POST /admin/payments/{paymentId}/verify`
- `POST /admin/payments/{paymentId}/reject`

## Expiry

Tasks that remain unpaid or unverified for 24 hours are marked `Expired` by the hourly maintenance trigger. They remain in the datastore for history and are not returned by the helper availability query.

## Payments after task completion

The existing escrow and runner payout ledger remains in place. This change only replaces the task pay-in mechanism; it does not claim to move bank money automatically.

## Security

Admin verification is required before a task can enter `Posted`. Helpers can only claim tasks where `taskStatus=Posted` and `paymentStatus=EscrowHeld`.
