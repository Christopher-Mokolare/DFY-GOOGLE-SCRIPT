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
