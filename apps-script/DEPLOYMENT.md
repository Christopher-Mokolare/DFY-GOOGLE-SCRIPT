# Deployment

## 1. Create the Apps Script project

Create a standalone Google Apps Script project and copy every file from apps-script/.

The repository manifest is apps-script/appsscript.json.

## 2. Initialize storage

Run setup(), seedCategories(), and installTriggers(). The script creates a Google Spreadsheet automatically and stores its ID in Script Properties.

## 3. Create the first administrator

Run createAdminUser(email, password, firstName, lastName) once from the Apps Script editor. Do not commit administrator credentials.

## 4. Deploy

Deploy as Execute as: Me, Who has access: Anyone. Copy the Web App /exec URL and set VITE_GOOGLE_SCRIPT_URL to it before redeploying the React frontend.

## 5. Frontend transport

The frontend adapter sends every request to Apps Script as a POST envelope containing path, method, body, token and query. The application method is routed inside Apps Script.

## Important browser constraint

Google Apps Script ContentService is not a normal configurable API gateway. Google documents ContentService as a service for serving text/JSON from web apps, and Apps Script does not provide the same normal CORS/header controls as a conventional backend. Cross-origin browser calls must therefore be tested against the exact deployed Web App URL. If the React frontend is hosted on a separate origin and the browser blocks the response, the production architecture must either serve the frontend from the Apps Script web app/origin or introduce a same-origin proxy.

Do not mark the migration production-ready until a real browser test proves login, task creation, task claiming, completion, confirmation and admin flows from the deployed frontend.

## Payment semantics

There is no Ozow integration. The script maintains an internal payment ledger: task payment HELD, escrow held, confirmation release, payout Pending/Completed, refund Approved/Completed, and auditable transitions.

This does not itself transfer money to a bank. A future bank/payment provider can consume the payout ledger without changing the task/escrow state machine.

## Security

Passwords are salted and hashed. Sessions use random opaque tokens with hashed token storage. Admin endpoints require an Admin role. Task claiming uses LockService. Sensitive bank account numbers are masked in user responses. Never put provider secrets or admin credentials in Git.
