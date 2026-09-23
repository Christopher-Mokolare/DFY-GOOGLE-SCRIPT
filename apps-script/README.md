# DFY Google Apps Script Backend

This directory replaces DFY-BE for the Google Apps Script deployment.

Architecture:
- React frontend
- Google Apps Script Web App
- Google Sheets as the initial relational datastore
- Drive/Properties for configuration
- No DFY-BE runtime dependency
- No Ozow dependency

The script implements the DFY task, user, payment-ledger, escrow, payout-record,
refund, dispute, notification, messaging, banking, rating and admin workflows.

Important: this is an internal payment ledger. Apps Script does not itself move
money between South African bank accounts. Payouts are recorded as payable/released
until a future banking provider is integrated.

Setup:
1. Create a Google Apps Script project.
2. Add the files from this directory.
3. Run setup() once while authenticated.
4. Run seedCategories() and create an admin user with createAdminUser().
5. Deploy as Web app, execute as the deploying account, access "Anyone".
6. Put the deployment URL in VITE_GOOGLE_SCRIPT_URL.
7. Do not store secrets in source control. Use Script Properties.

The frontend can call the API using POST JSON envelopes:
{ "path": "/auth/login", "method": "POST", "body": {...}, "token": "..." }

GET requests may use ?path=/categories&token=...


## Ozow pay-in configuration

Set these Google Apps Script **Script Properties** (never commit their values):
- `OZOW_API_KEY`
- `OZOW_SITE_CODE`
- `OZOW_PRIVATE_KEY`
- `OZOW_IS_TEST` = `true` for test/staging or `false` for live
- `OZOW_API_URL` = `https://stagingapi.ozow.com/postpaymentrequest` for staging or `https://api.ozow.com/postpaymentrequest` for production
- `DFY_FRONTEND_URL`
- Optional: `DFY_PAYMENT_SUCCESS_URL`, `DFY_PAYMENT_CANCEL_URL`, `DFY_PAYMENT_ERROR_URL`

Flow: `Create task -> PendingPayment -> Ozow checkout -> verified Complete notification -> Posted + EscrowHeld`.
A redirect back to the frontend is not treated as proof of payment; the verified Ozow notification is authoritative.
