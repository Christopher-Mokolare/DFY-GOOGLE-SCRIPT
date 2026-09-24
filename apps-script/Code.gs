function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function doPut(e) {
  return handleRequest_(e, 'PUT');
}

function doPatch(e) {
  return handleRequest_(e, 'PATCH');
}

function doDelete(e) {
  return handleRequest_(e, 'DELETE');
}

function handleRequest_(e, method) {
  try {
    const input = parseRequest_(e);
    const path = normalizePath_(input.path || (e && e.parameter && e.parameter.path) || '/');
    const token = input.token || (e && e.parameter && e.parameter.token) || '';
    const body = input.body || (method === 'GET' ? {} : input);
    const result = Router.handle(path, method, body, token, input.query || (e && e.parameter) || {});
    return json_(result);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ success: false, message: err.message || 'Internal server error' });
  }
}

function parseRequest_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) { try { return JSON.parse(e.postData.contents); } catch (_) {} }
  if (e.parameter) return { path:e.parameter.path||'', body:e.parameter, query:e.parameter };
  return {};
}

function normalizePath_(path) {
  path = String(path || '/').replace(/^https?:\/\/[^/]+/i, '');
  path = path.replace(/^\/api\/v1/i, '');
  if (!path.startsWith('/')) path = '/' + path;
  return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_(data, message) { return { success: true, data: data === undefined ? null : data, message: message || '' }; }
function fail_(message, data) { return { success: false, data: data === undefined ? null : data, message: message || 'Request failed' }; }
function unauthorized_() { return fail_('Unauthorized'); }
function forbidden_() { return fail_('Forbidden'); }

function setup() {
  const ss = DB.open_();
  DB.ensureSheets_();
  PropertiesService.getScriptProperties().setProperty('DFY_SPREADSHEET_ID', ss.getId());
  return 'DFY Google Apps Script datastore ready: ' + ss.getUrl();
}

function seedCategories() {
  const rows = ['Home','Cleaning','Errands','Shopping','Transport','Delivery','Gardening','Repairs','Other'];
  rows.forEach(function(name) {
    if (!DB.findOne_('Categories', 'name', name)) DB.insert_('Categories', {name:name, active:true});
  });
  return 'Categories seeded';
}

function createAdminUser(email, password, firstName, lastName) {
  const existing = DB.findOne_('Users','email',String(email).toLowerCase());
  if (existing) throw new Error('User already exists');
  return Auth.createUser_({
    email: String(email).toLowerCase(),
    password: password,
    firstName: firstName || 'Admin',
    lastName: lastName || 'User',
    userType: 'Admin',
    roles: 'User,Admin',
    isVerified: true
  });
}


/**
 * TEST-ONLY full lifecycle E2E.
 * Run from the Apps Script editor after setting DFY_E2E_MODE=true.
 * This intentionally bypasses the real bank-account verification step and
 * performs the admin payment verification directly. It never runs unless the
 * explicit test-mode Script Property is enabled.
 */
function runE2ETest() {
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty('DFY_E2E_MODE') || '').toLowerCase() !== 'true') {
    throw new Error('E2E test mode is disabled. Set DFY_E2E_MODE=true in Script Properties.');
  }

  const stamp = String(Date.now());
  const password = 'E2E-Test@1234';
  const creatorEmail = 'e2e.creator.' + stamp + '@example.test';
  const runnerEmail = 'e2e.runner.' + stamp + '@example.test';

  const creator = Auth.createUser_({
    email: creatorEmail,
    password: password,
    firstName: 'E2E',
    lastName: 'Creator',
    phoneNumber: '0790000001',
    idNumber: '9001010000001',
    address: 'E2E Test Address',
    dateOfBirth: '1990-01-01',
    userType: 'Creator',
    roles: 'User',
    isVerified: true
  });
  const runner = Auth.createUser_({
    email: runnerEmail,
    password: password,
    firstName: 'E2E',
    lastName: 'Runner',
    phoneNumber: '0790000002',
    idNumber: '9001010000002',
    address: 'E2E Test Address',
    dateOfBirth: '1990-01-02',
    userType: 'Runner',
    roles: 'User',
    isVerified: true
  });

  const adminEmail = String(props.getProperty('DFY_E2E_ADMIN_EMAIL') || '').trim();
  if (!adminEmail) throw new Error('Set DFY_E2E_ADMIN_EMAIL to an existing Admin email before running E2E.');
  const admin = DB.findOne_('Users', 'email', adminEmail);
  if (!admin || String(admin.roles || '').split(',').indexOf('Admin') < 0) {
    throw new Error('DFY_E2E_ADMIN_EMAIL must belong to an existing Admin user.');
  }

  const taskResult = Tasks.create({
    taskName: 'E2E test task ' + stamp,
    taskDescription: 'Automated end-to-end test task',
    category: 'Other',
    area: 'E2E',
    dateNeeded: new Date(Date.now() + 86400000).toISOString(),
    budget: 100,
    priority: 'Normal',
    notes: 'Automated test only'
  }, creator);
  if (!taskResult.success) throw new Error('Create task failed: ' + taskResult.message);
  const task = DB.rows_('Tasks').find(function(t) { return String(t.taskId) === String(taskResult.data.taskId); });
  if (!task) throw new Error('Created task could not be loaded.');

  const initialPayment = DB.where_('Payments', function(p) {
    return String(p.taskId) === String(task.id) && p.type === 'TASK_PAYMENT';
  })[0];
  if (!initialPayment || initialPayment.status !== 'PENDING' || task.taskStatus !== 'PendingPayment') {
    throw new Error('Initial payment state failed.');
  }

  const submitResult = Payments.submitManual_(task.taskId, {
    paidAmount: 100,
    senderReference: 'E2E-' + stamp,
    paidAt: new Date().toISOString(),
    proofOfPayment: 'E2E-TEST'
  }, creator);
  if (!submitResult.success) throw new Error('Payment submission failed: ' + submitResult.message);

  const hiddenTask = DB.findById_('Tasks', task.id);
  const submittedPayment = DB.findById_('Payments', initialPayment.id);
  if (hiddenTask.taskStatus !== 'PendingPayment' ||
      hiddenTask.paymentStatus !== 'AwaitingVerification' ||
      submittedPayment.status !== 'AWAITING_VERIFICATION') {
    throw new Error('Payment submission did not remain private.');
  }

  const verifyResult = Payments.verifyManual_(initialPayment.id, {amount: 100, note: 'E2E test bypass'}, admin);
  if (!verifyResult.success) throw new Error('Admin payment verification failed: ' + verifyResult.message);

  const postedTask = DB.findById_('Tasks', task.id);
  if (postedTask.taskStatus !== 'Posted' || postedTask.paymentStatus !== 'EscrowHeld' || postedTask.escrowStatus !== 'held') {
    throw new Error('Verified task was not posted into escrow.');
  }

  const bank = DB.insert_('BankAccounts', {
    id: DB.nextId_('BankAccounts'),
    userId: runner.id,
    bankName: 'E2E Bank',
    bankGroupId: 'E2E',
    accountNumber: '1234567890',
    accountHolderName: 'E2E Runner',
    branchCode: '000000',
    accountType: 'Cheque',
    isVerified: true,
    isActive: true,
    createdAt: Util.iso(),
    verifiedAt: Util.iso()
  });

  const claimResult = Tasks.claim(task.taskId, {}, runner);
  if (!claimResult.success) throw new Error('Runner claim failed: ' + claimResult.message);

  const completeResult = Tasks.complete(task.taskId, runner);
  if (!completeResult.success) throw new Error('Runner completion failed: ' + completeResult.message);

  const confirmResult = Tasks.confirm(task.taskId, creator);
  if (!confirmResult.success) throw new Error('Creator confirmation failed: ' + confirmResult.message);

  const finalTask = DB.findById_('Tasks', task.id);
  const payout = DB.where_('Payouts', function(p) { return String(p.taskId) === String(task.id); })[0];
  if (finalTask.taskStatus !== 'PayoutPending' || finalTask.paymentStatus !== 'EscrowReleased' ||
      finalTask.escrowStatus !== 'released' || !payout || payout.status !== 'Pending') {
    throw new Error('Payout ledger state failed.');
  }

  const creatorRating = Ratings.submit({
    taskId: task.taskId,
    ratingValue: 5,
    review: 'E2E creator rating'
  }, creator);
  if (!creatorRating.success) throw new Error('Creator rating failed: ' + creatorRating.message);

  const runnerRating = Ratings.submit({
    taskId: task.taskId,
    ratingValue: 5,
    review: 'E2E runner rating'
  }, runner);
  if (!runnerRating.success) throw new Error('Runner rating failed: ' + runnerRating.message);

  const creatorRatings = DB.where_('Ratings', function(r) {
    return String(r.taskId) === String(task.id) && String(r.ratedByUserId) === String(creator.id);
  });
  const runnerRatings = DB.where_('Ratings', function(r) {
    return String(r.taskId) === String(task.id) && String(r.ratedByUserId) === String(runner.id);
  });

  return {
    passed: true,
    testId: stamp,
    creatorEmail: creatorEmail,
    runnerEmail: runnerEmail,
    taskId: task.taskId,
    payment: {submitted: true, verified: true},
    task: {
      afterCreation: 'PendingPayment',
      afterSubmission: 'PendingPayment/AwaitingVerification',
      afterVerification: 'Posted/EscrowHeld',
      afterClaim: 'Claimed',
      afterCompletion: 'Completed',
      final: finalTask.taskStatus + '/' + finalTask.paymentStatus + '/' + finalTask.escrowStatus
    },
    payout: {created: !!payout, status: payout ? payout.status : null, bankAccountId: bank.id},
    ratings: {creatorSubmitted: creatorRatings.length === 1, runnerSubmitted: runnerRatings.length === 1},
    note: 'E2E mode directly verifies the test payment and uses a pre-verified test runner bank account. No real money moves.'
  };
}
