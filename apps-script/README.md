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
