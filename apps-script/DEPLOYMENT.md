# Deployment

## 1. Create the Apps Script project

Create a standalone Google Apps Script project and copy every file from apps-script/.

The repository manifest is apps-script/appsscript.json.

## 2. Initialize storage

Run `setup()`, `seedCategories()`, and `installTriggers()`. The script creates a Google Spreadsheet automatically and stores its ID in Script Properties.

## 3. Create the first administrator

Run `createAdminUser(email, password, firstName, lastName)` once from the Apps Script editor. Do not commit administrator credentials.

## 4. Configure manual payments

The task-payment flow is manual EFT; there is no Ozow integration.

Set these Script Properties:

- `DFY_BANK_NAME` = `Capitec – Business`
- `DFY_BANK_ACCOUNT_NAME` = `DoForYou Freelance`
- `DFY_BANK_ACCOUNT_NUMBER` = `2495858216`
- `DFY_BANK_ACCOUNT_TYPE` = `Business`
- `DFY_BANK_BRANCH_CODE` = optional
- `DFY_PAYMENT_WHATSAPP` = `0795258611`
- `DFY_PAYMENT_INSTRUCTIONS` = payment instructions shown to customers
- `DFY_TERMS_URL` = the DoForYou terms URL

The account number is also supplied as a safe default in code, but Script Properties are preferred so banking details can be changed without a code deployment.

## 5. Manual payment lifecycle

1. Customer creates a task.
2. The task is stored as `PendingPayment` / `Pending` / `pending`.
3. The API returns the bank details, amount and task payment reference.
4. Customer makes the EFT manually.
5. Customer submits the payment amount, bank reference, payment date and optional Proof of Payment through `POST /tasks/{taskId}/payment-submit`.
6. The payment becomes `AWAITING_VERIFICATION`; the task remains `PendingPayment` and remains invisible to helpers.
7. An administrator checks the actual Capitec business account.
8. Administrator calls `POST /admin/payments/{paymentId}/verify`.
9. Only successful admin verification changes the task to `Posted` + `EscrowHeld`.
10. Helpers can then see and claim the task.

A customer cannot publish a task simply by saying that they paid.

## 6. Admin endpoints

- `GET /admin/payments/pending` — manual payments awaiting verification.
- `POST /admin/payments/{paymentId}/verify` — verify a received EFT and post the task.
- `POST /admin/payments/{paymentId}/reject` — reject the submission; the task returns to `PendingPayment`.

All three require an authenticated Admin role.

## 7. Payment expiry

An unpaid or unverified task expires after 24 hours through `hourlyMaintenance()`. It is marked `Expired` rather than deleted, so the history remains available while it is removed from the active marketplace.

## 8. Deploy

Deploy as Execute as: Me, Who has access: Anyone. Copy the Web App /exec URL and set VITE_GOOGLE_SCRIPT_URL to it before redeploying the React frontend.

## 9. Frontend transport

The frontend adapter sends every request to Apps Script as a POST envelope containing path, method, body, token and query. The application method is routed inside Apps Script.

## Important browser constraint

Google Apps Script ContentService is not a normal configurable API gateway. Google documents ContentService as a service for serving text/JSON from web apps, and Apps Script does not provide the same normal CORS/header controls as a conventional backend. Cross-origin browser calls must therefore be tested against the exact deployed Web App URL. If the React frontend is hosted on a separate origin and the browser blocks the response, the production architecture must either serve the frontend from the Apps Script web app/origin or introduce a same-origin proxy.

Do not mark the migration production-ready until a real browser test proves login, task creation, manual payment submission, admin payment verification, task claiming, completion, confirmation and admin flows from the deployed frontend.

## Payment semantics

The task payment is an internal ledger entry representing money that has been received and verified manually. Apps Script does not itself move money between South African bank accounts. Runner payouts remain ledger records until a future banking provider is integrated.

## Security

Passwords are salted and hashed. Sessions use random opaque tokens with hashed token storage. Admin endpoints require an Admin role. Task claiming and payment verification use LockService. Sensitive bank account numbers should not be logged. Never put provider secrets or admin credentials in Git.
