
// ============================================================
// Code.gs
// ============================================================

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


// ============================================================
// Utils.gs
// ============================================================

const Util = {
  now: function(){ return new Date(); },
  iso: function(d){ return new Date(d || Date.now()).toISOString(); },
  id: function(prefix){ return (prefix || 'ID')+'-'+Date.now()+'-'+Math.floor(1000+Math.random()*9000); },
  cleanEmail: function(v){ return String(v || '').replace(/^mailto:/i,'').trim().toLowerCase(); },
  money: function(v){ return Math.round(Number(v || 0)*100)/100; },
  hash: function(value){ return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2)}).join(''); },
  passwordHash: function(password,salt){ return this.hash(String(salt)+':'+String(password)); },
  token: function(){ return Utilities.getUuid()+'-'+Utilities.getUuid(); },
  commission: function(amount){ return Math.max(this.money(amount)*0.15,5); },
  taskDto: function(t){
    if(!t) return null;
    const creator=DB.findById_('Users',t.createdByUserId), runner=t.acceptedByUserId?DB.findById_('Users',t.acceptedByUserId):null;
    return {
      id:Number(t.id), taskId:t.taskId, taskName:t.taskName, title:t.taskDescription, description:t.taskDescription,
      category:t.category, location:t.area, area:t.area, budget:Number(t.budget), payoutAmount:Number(t.payoutAmount),
      commissionAmount:Number(t.commissionAmount), status:String(t.taskStatus||'').toLowerCase(),
      taskStatus:t.taskStatus, paymentStatus:t.paymentStatus, escrowStatus:t.escrowStatus, payoutStatus:t.payoutStatus,
      priority:t.priority, createdAt:t.createdAt, dueDate:t.dateNeeded, dateNeeded:t.dateNeeded,
      creatorName:creator?creator.firstName+' '+creator.lastName:null, creatorContact:creator?(creator.phoneNumber||creator.email):null,
      runnerName:runner?runner.firstName+' '+runner.lastName:null, runnerContact:runner?(runner.phoneNumber||runner.email):null,
      runnerId:t.acceptedByUserId, createdByUserId:t.createdByUserId, completedAt:t.completedAt, notes:t.notes,
      helperName:t.helperName, helperContact:t.helperContact, payoutReference:t.payoutReference,
      payoutInitiatedAt:t.payoutInitiatedAt, payoutCompletedAt:t.payoutCompletedAt
    };
  },
  userDto: function(u){
    if(!u) return null;
    const profile=Auth.profileCompletion_(u);
    return {id:Number(u.id),firstName:u.firstName,lastName:u.lastName,email:u.email,phoneNumber:u.phoneNumber,
      profileCompleted:profile.complete,profileCompletion:profile.percent,missingProfileFields:profile.missing,
      canCreateTasks:Auth.canCreate_(u),canAcceptTasks:Auth.canAccept_(u),rating:Number(u.rating||0),
      completedTasks:Number(u.completedTasks||0),roles:u.roles,isAdmin:String(u.roles||'').split(',').indexOf('Admin')>=0,
      userType:u.userType,createdAt:u.createdAt,lastLoginAt:u.lastLoginAt,isVerified:u.isVerified===true||String(u.isVerified)==='true'};
  }
};


// ============================================================
// DB.gs
// ============================================================

const DB = {
  sheets_: {
    Users: ['id','firstName','lastName','email','phoneNumber','passwordHash','salt','userType','roles','idNumber','address','dateOfBirth','profileCompleted','emailVerified','phoneVerified','isVerified','rating','completedTasks','createdAt','lastLoginAt','preferences'],
    Sessions: ['id','tokenHash','userId','expiresAt','createdAt','revoked'],
    Tasks: ['id','taskId','taskName','taskDescription','category','area','dateNeeded','budget','commissionAmount','payoutAmount','notes','priority','createdByUserId','acceptedByUserId','helperName','helperContact','paymentStatus','taskStatus','escrowStatus','escrowHoldUntil','payoutStatus','payoutReference','payoutInitiatedAt','payoutCompletedAt','completedAt','createdAt','updatedAt','isDeleted','deletedAt'],
    Payments: ['id','taskId','type','amount','status','reference','createdAt','updatedAt','metadata'],
    Payouts: ['id','taskId','runnerId','bankAccountId','amount','status','provider','merchantReference','createdAt','updatedAt','completedAt'],
    Refunds: ['id','taskId','amount','reason','status','reference','createdAt','updatedAt','completedAt'],
    BankAccounts: ['id','userId','bankName','bankGroupId','accountNumber','accountHolderName','branchCode','accountType','isVerified','isActive','createdAt','verifiedAt'],
    Messages: ['id','taskId','senderId','content','isRead','createdAt'],
    Progress: ['id','taskId','userId','message','createdAt'],
    Notifications: ['id','userId','type','title','message','isRead','relatedTaskId','createdAt'],
    Disputes: ['id','taskId','raisedByUserId','issue','category','status','resolution','action','reason','createdAt','resolvedAt'],
    Ratings: ['id','taskId','ratedByUserId','ratedUserId','ratingValue','review','createdAt'],
    Categories: ['id','name','active'],
    SupportTickets: ['id','userId','name','email','subject','message','category','priority','status','createdAt'],
    AuditLogs: ['id','userId','action','entityType','entityId','oldValues','newValues','createdAt'],
    Idempotency: ['id','key','operation','result','createdAt']
  },
  open_: function() {
    const p = PropertiesService.getScriptProperties();
    let id = p.getProperty('DFY_SPREADSHEET_ID');
    if (id) {
      try { return SpreadsheetApp.openById(id); } catch (_) {}
    }
    const ss = SpreadsheetApp.create('DFY Google Script Data');
    p.setProperty('DFY_SPREADSHEET_ID', ss.getId());
    return ss;
  },

  ensureSheets_: function() {
    const ss = this.open_();
    Object.keys(this.sheets_).forEach(function(name) {
      let sh = ss.getSheetByName(name);
      if (!sh) sh = ss.insertSheet(name);
      const headers = DB.sheets_[name];
      if (sh.getLastRow() === 0) sh.getRange(1,1,1,headers.length).setValues([headers]);
      else {
        const current = sh.getRange(1,1,1,Math.max(sh.getLastColumn(), headers.length)).getValues()[0];
        headers.forEach(function(h,i){ if (current[i] !== h) sh.getRange(1,i+1).setValue(h); });
      }
    });
    return ss;
  },

  sheet_: function(name) {
    this.ensureSheets_();
    const sh = this.open_().getSheetByName(name);
    if (!sh) throw new Error('Missing sheet ' + name);
    return sh;
  },

  rows_: function(name) {
    const sh = this.sheet_(name);
    const last = sh.getLastRow();
    if (last < 2) return [];
    const headers = this.sheets_[name];
    return sh.getRange(2,1,last-1,headers.length).getValues().map(function(row){
      const o = {};
      headers.forEach(function(h,i){ o[h] = row[i]; });
      return o;
    });
  },

  findOne_: function(name, field, value) {
    const target = String(value == null ? '' : value).toLowerCase();
    return this.rows_(name).find(function(r){ return String(r[field] == null ? '' : r[field]).toLowerCase() === target; }) || null;
  },

  findById_: function(name, id) {
    return this.rows_(name).find(function(r){ return String(r.id) === String(id); }) || null;
  },

  where_: function(name, predicate) { return this.rows_(name).filter(predicate); },

  insert_: function(name, obj) {
    const sh = this.sheet_(name);
    const headers = this.sheets_[name];
    const row = headers.map(function(h){ return obj[h] === undefined ? '' : obj[h]; });
    sh.appendRow(row);
    const result = {};
    headers.forEach(function(h,i){ result[h] = row[i]; });
    return result;
  },

  update_: function(name, id, patch) {
    const sh = this.sheet_(name);
    const headers = this.sheets_[name];
    const rows = sh.getDataRange().getValues();
    for (let r=1;r<rows.length;r++) {
      if (String(rows[r][headers.indexOf('id')]) === String(id)) {
        Object.keys(patch).forEach(function(k){
          const c=headers.indexOf(k); if(c>=0) sh.getRange(r+1,c+1).setValue(patch[k]);
        });
        return DB.findById_(name,id);
      }
    }
    return null;
  },

  delete_: function(name, id) {
    const sh=this.sheet_(name), headers=this.sheets_[name], rows=sh.getDataRange().getValues(), c=headers.indexOf('id');
    for(let r=1;r<rows.length;r++) if(String(rows[r][c])===String(id)){sh.deleteRow(r+1);return true;}
    return false;
  },

  nextId_: function(name) {
    const rows=this.rows_(name);
    return rows.reduce(function(m,r){return Math.max(m,Number(r.id)||0)},0)+1;
  }
};


// ============================================================
// Audit.gs
// ============================================================

const Audit = { log_:function(userId,action,entityType,entityId,oldValues,newValues){return DB.insert_('AuditLogs',{id:DB.nextId_('AuditLogs'),userId:userId||'',action:action,entityType:entityType,entityId:entityId||'',oldValues:oldValues||'',newValues:newValues||'',createdAt:Util.iso()});} };


// ============================================================
// Auth.gs
// ============================================================

const Auth = {
  createUser_: function(req){
    const email=Util.cleanEmail(req.email);
    if(!email || !req.password) throw new Error('Email and password are required');
    if(DB.findOne_('Users','email',email)) throw new Error('Email already exists');
    const salt=Util.token();
    const user=DB.insert_('Users',{id:DB.nextId_('Users'),firstName:req.firstName||'',lastName:req.lastName||'',email:email,
      phoneNumber:req.phoneNumber||'',passwordHash:Util.passwordHash(req.password,salt),salt:salt,userType:req.userType||'Both',
      roles:req.roles||'User',idNumber:req.idNumber||'',address:req.address||'',dateOfBirth:req.dateOfBirth||'',
      profileCompleted:false,emailVerified:false,phoneVerified:false,isVerified:req.isVerified===true,rating:0,completedTasks:0,
      createdAt:Util.iso(),lastLoginAt:'',preferences:'{}'});
    return user;
  },
  login: function(body){
    const email=Util.cleanEmail(body.email), user=DB.findOne_('Users','email',email);
    if(!user || Util.passwordHash(body.password,user.salt)!==user.passwordHash) return fail_('Invalid email or password');
    DB.update_('Users',user.id,{lastLoginAt:Util.iso()});
    const token=Util.token(), expires=new Date(Date.now()+7*86400000);
    DB.insert_('Sessions',{id:DB.nextId_('Sessions'),tokenHash:Util.hash(token),userId:user.id,expiresAt:expires.toISOString(),createdAt:Util.iso(),revoked:false});
    return {success:true,token:token,user:Util.userDto(Object.assign({},user,{lastLoginAt:Util.iso()})),message:'Login successful'};
  },
  user: function(token, required){
    if(!token) return null;
    const s=DB.findOne_('Sessions','tokenHash',Util.hash(token));
    if(!s || String(s.revoked)==='true' || new Date(s.expiresAt)<new Date()) return null;
    return DB.findById_('Users',s.userId);
  },
  require: function(token){ const u=this.user(token); if(!u) throw new Error('Unauthorized'); return u; },
  requireAdmin: function(token){ const u=this.require(token); if(String(u.roles||'').split(',').indexOf('Admin')<0) throw new Error('Forbidden'); return u; },
  profileCompletion_: function(u){
    const fields=[['firstName',u.firstName],['lastName',u.lastName],['email',u.email],['phoneNumber',u.phoneNumber],['idNumber',u.idNumber],['address',u.address],['dateOfBirth',u.dateOfBirth]];
    const missing=fields.filter(function(x){return !String(x[1]||'').trim()}).map(function(x){return x[0]});
    return {complete:missing.length===0,percent:Math.round((fields.length-missing.length)*100/fields.length),missing:missing};
  },
  canCreate_: function(u){ return ['Creator','Both','Admin'].indexOf(String(u.userType))>=0 && String(u.roles||'').split(',').indexOf('Admin')<0; },
  canAccept_: function(u){ return ['Runner','Both','Admin'].indexOf(String(u.userType))>=0 && String(u.roles||'').split(',').indexOf('Admin')<0; }
};


// ============================================================
// Banking.gs
// ============================================================

const Banking = {
  accounts:function(user){return ok_(DB.where_('BankAccounts',b=>String(b.userId)===String(user.id)&&String(b.isActive)!=='false').map(function(b){return Object.assign({},b,{accountNumber:'****'+String(b.accountNumber).slice(-4)});}));},
  banks:function(){return ok_([{bankGroupId:'STD',bankGroupName:'Standard Bank',universalBranchCode:'051001'},{bankGroupId:'FNB',bankGroupName:'FNB',universalBranchCode:'250655'},{bankGroupId:'ABSA',bankGroupName:'ABSA',universalBranchCode:'632005'},{bankGroupId:'NED',bankGroupName:'Nedbank',universalBranchCode:'198765'},{bankGroupId:'CAP',bankGroupName:'Capitec',universalBranchCode:'470010'}]);},
  add:function(body,user){const account=String(body.accountNumber||'').replace(/\D/g,'');if(account.length<6)return fail_('Invalid bank account details.');if(DB.where_('BankAccounts',b=>String(b.userId)===String(user.id)&&String(b.accountNumber)===account&&String(b.isActive)!=='false').length)return fail_('Bank account already exists.');const a=DB.insert_('BankAccounts',{id:DB.nextId_('BankAccounts'),userId:user.id,bankName:body.bankName||'',bankGroupId:body.bankGroupId||'',accountNumber:account,accountHolderName:body.accountHolderName||'',branchCode:body.branchCode||'',accountType:body.accountType||'Cheque',isVerified:false,isActive:true,createdAt:Util.iso(),verifiedAt:''});return ok_({bankAccountId:a.id,isVerified:false},'Bank account added and awaiting verification');},
  verify:function(id,user){const a=DB.findById_('BankAccounts',id);if(!a||String(a.userId)!==String(user.id))return fail_('Bank account not found');DB.update_('BankAccounts',id,{isVerified:true,verifiedAt:Util.iso()});return ok_({bankAccountId:id,isVerified:true},'Bank account verified');}
};


// ============================================================
// Payments.gs
// ============================================================

const Payments = {
  config_: function(){
    const p=PropertiesService.getScriptProperties();
    return {
      bankName:String(p.getProperty('DFY_BANK_NAME')||'Capitec – Business').trim(),
      accountName:String(p.getProperty('DFY_BANK_ACCOUNT_NAME')||'DoForYou Freelance').trim(),
      accountNumber:String(p.getProperty('DFY_BANK_ACCOUNT_NUMBER')||'2495858216').trim(),
      branchCode:String(p.getProperty('DFY_BANK_BRANCH_CODE')||'').trim(),
      accountType:String(p.getProperty('DFY_BANK_ACCOUNT_TYPE')||'Business').trim(),
      instructions:String(p.getProperty('DFY_PAYMENT_INSTRUCTIONS')||'Make an EFT and use your full name as the bank reference. Send your Proof of Payment to WhatsApp 0795258611.').trim(),
      whatsapp:String(p.getProperty('DFY_PAYMENT_WHATSAPP')||'0795258611').trim(),
      termsUrl:String(p.getProperty('DFY_TERMS_URL')||'https://docs.google.com/document/d/1PnAK2JTIHw4th92ZS-wjsEokBgc4l14XZnH-UVnYvsM/edit?usp=sharing').trim()
    };
  },
  createForTask_: function(task,user){
    if(!task)return fail_('Task not found');
    const existing=DB.where_('Payments',function(p){return String(p.taskId)===String(task.id)&&p.type==='TASK_PAYMENT';})[0];
    if(existing)return existing;
    const ref='DFY-'+String(task.id);
    return DB.insert_('Payments',{
      id:DB.nextId_('Payments'),taskId:task.id,type:'TASK_PAYMENT',amount:task.budget,status:'PENDING',
      reference:ref,createdAt:Util.iso(),updatedAt:Util.iso(),
      metadata:JSON.stringify({provider:'MANUAL',status:'PENDING',bankReference:'',paidAt:'',proofOfPayment:'',senderReference:''})
    });
  },
  manualDetails_: function(task,user){
    if(!task)return fail_('Task not found');
    if(String(task.createdByUserId)!==String(user.id))return forbidden_();
    if(['PendingPayment','AwaitingVerification'].indexOf(String(task.taskStatus))>=0 && new Date(task.createdAt).getTime() < Date.now()-24*3600000){ this.expirePending_(); return fail_('This task payment window has expired'); }
    const c=this.config_();
    if(!c.accountNumber)return fail_('DoForYou payment account is not configured');
    let payment=DB.where_('Payments',function(p){return String(p.taskId)===String(task.id)&&p.type==='TASK_PAYMENT';})[0];
    if(!payment)payment=this.createForTask_(task,user);
    let meta={};try{meta=payment.metadata?JSON.parse(payment.metadata):{};}catch(_){}
    return ok_({
      taskId:task.taskId,paymentId:payment.id,amount:Number(task.budget),
      paymentStatus:task.paymentStatus,taskStatus:task.taskStatus,
      paymentReference:payment.reference,bankReference:meta.bankReference||'Your full name',
      bank:{name:c.bankName,accountName:c.accountName,accountNumber:c.accountNumber,branchCode:c.branchCode,accountType:c.accountType},
      instructions:c.instructions,whatsapp:c.whatsapp,termsUrl:c.termsUrl
    },'Manual payment instructions');
  },
  submitManual_: function(taskId,body,user){
    const task=DB.rows_('Tasks').find(function(t){return String(t.taskId)===String(taskId)||String(t.id)===String(taskId);});
    if(!task)return fail_('Task not found');
    if(String(task.createdByUserId)!==String(user.id))return forbidden_();
    if(['PendingPayment','AwaitingVerification'].indexOf(String(task.taskStatus))<0)return fail_('This task is no longer awaiting payment');
    if(new Date(task.createdAt).getTime() < Date.now()-24*3600000){ this.expirePending_(); return fail_('This task payment window has expired'); }
    const amount=Util.money(body.paidAmount!==undefined?body.paidAmount:body.amount);
    if(amount<=0)return fail_('Paid amount is required');
    if(Math.abs(amount-Number(task.budget||0))>0.009)return fail_('Paid amount must match the task budget');
    const senderReference=String(body.senderReference||body.paymentReference||body.reference||'').trim();
    const paidAt=String(body.paidAt||body.paymentDate||'').trim();
    const proof=String(body.proofOfPayment||body.proof||body.pop||'').trim();
    if(!senderReference)return fail_('Your bank payment reference is required');
    if(!paidAt)return fail_('Payment date is required');
    const payment=DB.where_('Payments',function(p){return String(p.taskId)===String(task.id)&&p.type==='TASK_PAYMENT';})[0]||this.createForTask_(task,user);
    const now=Util.iso(),meta={};
    try{Object.assign(meta,payment.metadata?JSON.parse(payment.metadata):{});}catch(_){}
    Object.assign(meta,{provider:'MANUAL',status:'AWAITING_VERIFICATION',senderReference:senderReference,paidAt:paidAt,proofOfPayment:proof,submittedBy:user.id,submittedAt:now});
    DB.update_('Payments',payment.id,{amount:amount,status:'AWAITING_VERIFICATION',updatedAt:now,metadata:JSON.stringify(meta)});
    DB.update_('Tasks',task.id,{paymentStatus:'AwaitingVerification',taskStatus:'PendingPayment',escrowStatus:'pending',updatedAt:now});
    Audit.log_(user.id,'SubmitManualPayment','Payment',payment.id,'',JSON.stringify({taskId:task.id,amount:amount,senderReference:senderReference,paidAt:paidAt,hasProof:!!proof}));
    Notify.allAdmins('payment_verification_required','Payment Awaiting Verification','A customer submitted payment for task '+task.taskId,task.id);
    return ok_({taskId:task.taskId,paymentId:payment.id,paymentStatus:'AwaitingVerification',taskStatus:'AwaitingVerification'},'Payment submitted for verification');
  },
  pendingManual_: function(){
    const rows=DB.where_('Payments',function(p){return p.type==='TASK_PAYMENT'&&['PENDING','AWAITING_VERIFICATION'].indexOf(String(p.status))>=0;});
    return ok_(rows.map(function(p){
      const t=DB.findById_('Tasks',p.taskId),u=t?DB.findById_('Users',t.createdByUserId):null,meta={};
      try{Object.assign(meta,p.metadata?JSON.parse(p.metadata):{});}catch(_){}
      return {paymentId:p.id,taskId:t?t.taskId:null,amount:Number(p.amount||0),status:p.status,reference:p.reference,
        taskName:t?t.taskName:'',customerName:u?String(u.firstName||'')+' '+String(u.lastName||''):'',customerEmail:u?u.email:'',
        senderReference:meta.senderReference||'',paidAt:meta.paidAt||'',proofOfPayment:meta.proofOfPayment||'',submittedAt:meta.submittedAt||''};
    }));
  },
  verifyManual_: function(paymentId,body,admin){
    const lock=LockService.getScriptLock();lock.waitLock(10000);
    try{
      const payment=DB.findById_('Payments',Number(paymentId));
      if(!payment||payment.type!=='TASK_PAYMENT')return fail_('Payment not found');
      const task=DB.findById_('Tasks',payment.taskId);if(!task)return fail_('Task not found');
      if(String(payment.status)==='VERIFIED'&&task.taskStatus==='Posted')return ok_({taskId:task.taskId,paymentStatus:'EscrowHeld',taskStatus:'Posted'},'Payment already verified');
      if(['PENDING','AWAITING_VERIFICATION'].indexOf(String(payment.status))<0)return fail_('Payment is not awaiting verification');
      const amount=Number(body.amount!==undefined?body.amount:payment.amount);
      if(Math.abs(amount-Number(task.budget||0))>0.009)return fail_('Verified amount must match the task budget');
      const now=Util.iso();
      let meta={};try{meta=payment.metadata?JSON.parse(payment.metadata):{};}catch(_){}
      Object.assign(meta,{provider:'MANUAL',status:'VERIFIED',verifiedBy:admin.id,verifiedAt:now,verifiedAmount:amount,adminNote:String(body.note||'').trim()});
      DB.update_('Payments',payment.id,{status:'VERIFIED',amount:amount,updatedAt:now,metadata:JSON.stringify(meta)});
      DB.update_('Tasks',task.id,{paymentStatus:'EscrowHeld',taskStatus:'Posted',escrowStatus:'held',updatedAt:now});
      Audit.log_(admin.id,'VerifyManualPayment','Task',task.id,'',JSON.stringify({paymentId:payment.id,amount:amount}));
      Notify.task_(task.createdByUserId,'payment_verified','Payment Received','Your payment was verified and your task has been posted.',task.id);
      return ok_({taskId:task.taskId,paymentId:payment.id,paymentStatus:'EscrowHeld',taskStatus:'Posted'},'Payment verified and task posted');
    }finally{lock.releaseLock();}
  },
  rejectManual_: function(paymentId,body,admin){
    const payment=DB.findById_('Payments',Number(paymentId));if(!payment||payment.type!=='TASK_PAYMENT')return fail_('Payment not found');
    const task=DB.findById_('Tasks',payment.taskId);if(!task)return fail_('Task not found');
    if(String(payment.status)!=='AWAITING_VERIFICATION')return fail_('Payment is not awaiting verification');
    const now=Util.iso(),reason=String(body.reason||'Payment could not be verified').trim();
    let meta={};try{meta=payment.metadata?JSON.parse(payment.metadata):{};}catch(_){}
    Object.assign(meta,{provider:'MANUAL',status:'REJECTED',rejectedBy:admin.id,rejectedAt:now,rejectionReason:reason});
    DB.update_('Payments',payment.id,{status:'REJECTED',updatedAt:now,metadata:JSON.stringify(meta)});
    DB.update_('Tasks',task.id,{paymentStatus:'Pending',taskStatus:'PendingPayment',escrowStatus:'pending',updatedAt:now});
    Audit.log_(admin.id,'RejectManualPayment','Task',task.id,'',JSON.stringify({paymentId:payment.id,reason:reason}));
    Notify.task_(task.createdByUserId,'payment_rejected','Payment Needs Attention',reason,task.id);
    return ok_({taskId:task.taskId,paymentId:payment.id,paymentStatus:'Pending',taskStatus:'PendingPayment',reason:reason},'Payment submission rejected; task remains pending');
  },
  expirePending_: function(){
    const cutoff=Date.now()-24*3600000,now=Util.iso();
    DB.rows_('Tasks').filter(function(t){return ['PendingPayment','AwaitingVerification'].indexOf(String(t.taskStatus))>=0&&new Date(t.createdAt).getTime()<cutoff&&String(t.taskStatus)!=='Posted';}).forEach(function(t){
      DB.update_('Tasks',t.id,{taskStatus:'Expired',paymentStatus:'Expired',escrowStatus:'pending',updatedAt:now});
      DB.where_('Payments',function(p){return String(p.taskId)===String(t.id)&&p.type==='TASK_PAYMENT'&&['PENDING','AWAITING_VERIFICATION'].indexOf(String(p.status))>=0;}).forEach(function(p){DB.update_('Payments',p.id,{status:'EXPIRED',updatedAt:now});});
      Audit.log_(null,'ExpireUnpaidTask','Task',t.id,'','Payment window expired');
    });
  },
  release_: function(task,force){
    if(!task||!task.acceptedByUserId)return fail_('Task has no runner');
    if(task.escrowStatus!=='held'&&task.paymentStatus!=='EscrowHeld')return fail_('Escrow is not held');
    if(!force&&task.escrowHoldUntil&&new Date(task.escrowHoldUntil)>new Date())return fail_('Escrow hold period has not expired');
    const active=DB.where_('Payouts',p=>String(p.taskId)===String(task.id)&&['Pending','Processing','Completed'].indexOf(String(p.status))>=0)[0];if(active)return ok_(active,'Payment already released');
    const bank=DB.where_('BankAccounts',b=>String(b.userId)===String(task.acceptedByUserId)&&String(b.isActive)!=='false'&&(b.isVerified===true||String(b.isVerified)==='true'))[0];if(!bank)return fail_('Runner needs an active verified bank account');
    const ref='DFY-PAYOUT-'+task.taskId+'-'+Date.now();
    const payout=DB.insert_('Payouts',{id:DB.nextId_('Payouts'),taskId:task.id,runnerId:task.acceptedByUserId,bankAccountId:bank.id,amount:task.payoutAmount,status:'Pending',provider:'Internal',merchantReference:ref,createdAt:Util.iso(),updatedAt:Util.iso(),completedAt:''});
    DB.update_('Tasks',task.id,{escrowStatus:'released',paymentStatus:'EscrowReleased',taskStatus:'PayoutPending',payoutStatus:'Pending',payoutReference:ref,payoutInitiatedAt:Util.iso(),updatedAt:Util.iso()});
    DB.insert_('Payments',{id:DB.nextId_('Payments'),taskId:task.id,type:'PAYOUT',amount:task.payoutAmount,status:'RELEASED',reference:ref,createdAt:Util.iso(),updatedAt:Util.iso(),metadata:'internal-ledger'});
    return ok_(payout,'Payout recorded and ready for settlement');
  },
  autoRelease_: function(){DB.where_('Tasks',t=>t.escrowStatus==='held'&&t.escrowHoldUntil&&new Date(t.escrowHoldUntil)<=new Date()).forEach(t=>this.release_(t,false));}
};

// ============================================================
// ContentModeration.gs
// Server-side moderation for task names and descriptions.
// ============================================================

const ContentModeration = {
  VERSION: '1.0',
  blockedWords_: [
    'fuck','fucker','fucking','motherfucker','shit','bullshit','bitch','bitches',
    'asshole','arsehole','dickhead','prick','cunt','bastard','wanker','twat',
    'piss','pissed','damn','douchebag','dumbass','jackass','sonofabitch',
    'porn','porno','pornography','xxx','nudes','nude','naked','sexcam','sexchat',
    'blowjob','handjob','deepthroat','masturbate','masturbation','orgasm',
    'vibrator','dildo','hooker','prostitute','prostitution','escort',
    'onlyfans','sexwork','sexworker','sexting','sext','horny','cum','ejaculate',
    'anal','vagina','penis','genitals','boobs','tits','titjob','pussy',
    'nigger','nigga','faggot','fag','dyke','kike','spic','chink','gook',
    'wetback','retard','retarded'
  ],
  blockedPhrases_: [
    'send nudes','send me nudes','nudes please','sex for money',
    'sex in exchange','sexual services','sexual service','explicit photos',
    'explicit pictures','porn videos','porn video','porn pictures','porn photos'
  ],
  normalize_: function(value) {
    let s=String(value==null?'':value).toLowerCase();
    s=s.replace(/[4@]/g,'a').replace(/[3]/g,'e').replace(/[1!|]/g,'i')
      .replace(/[0]/g,'o').replace(/[$5]/g,'s').replace(/[7]/g,'t');
    s=s.replace(/[\\u200b-\\u200f\\u202a-\\u202e\\ufeff]/g,'');
    s=s.replace(/([a-z])[^a-z0-9]+(?=[a-z])/g,'$1');
    s=s.replace(/(.)\\1{3,}/g,'$1$1$1');
    return s.replace(/\\s+/g,' ').trim();
  },
  check_: function(value,fieldName) {
    const original=String(value==null?'':value).trim();
    if(!original)return {allowed:true,field:fieldName||'',category:'',match:''};
    const normalized=this.normalize_(original);
    for(let i=0;i<this.blockedPhrases_.length;i++){
      const phrase=this.normalize_(this.blockedPhrases_[i]);
      if(normalized.indexOf(phrase)>=0)return {allowed:false,field:fieldName||'',category:'explicit',match:this.blockedPhrases_[i]};
    }
    const padded=' '+normalized.replace(/[^a-z0-9]+/g,' ')+' ';
    for(let i=0;i<this.blockedWords_.length;i++){
      const word=this.normalize_(this.blockedWords_[i]);
      if(padded.indexOf(' '+word+' ')>=0){
        const category=['porn','porno','pornography','xxx','nudes','nude','naked','sexcam','sexchat',
          'blowjob','handjob','deepthroat','masturbate','masturbation','orgasm','vibrator','dildo',
          'hooker','prostitute','prostitution','escort','onlyfans','sexwork','sexworker','sexting',
          'sext','horny','cum','ejaculate','anal','vagina','penis','genitals','boobs','tits','titjob',
          'pussy'].indexOf(word)>=0?'explicit':
          ['nigger','nigga','faggot','fag','dyke','kike','spic','chink','gook','wetback','retard',
           'retarded'].indexOf(word)>=0?'hate_or_slur':'profanity';
        return {allowed:false,field:fieldName||'',category:category,match:this.blockedWords_[i]};
      }
    }
    return {allowed:true,field:fieldName||'',category:'',match:''};
  },
  validateTask_: function(body) {
    const checks=[
      this.check_(body&&(body.taskName!==undefined?body.taskName:body.title),'taskName'),
      this.check_(body&&(body.taskDescription!==undefined?body.taskDescription:body.description),'taskDescription')
    ];
    const blocked=checks.find(function(x){return !x.allowed;});
    if(!blocked)return {allowed:true};
    return {allowed:false,field:blocked.field,category:blocked.category,match:blocked.match,
      message:'Your task contains language that is not allowed. Please edit the task name or description and try again.'};
  },
  validateTaskValues_: function(taskName,taskDescription) {
    return this.validateTask_({taskName:taskName,taskDescription:taskDescription});
  }
};

// ============================================================
// Tasks.gs
// ============================================================

const Tasks = {
  create: function(body,user){
    if(!Auth.profileCompletion_(user).complete) return fail_('Please complete your profile before creating tasks');
    if(!Auth.canCreate_(user)) return fail_('Only Creators and Both accounts can post tasks.');
    const moderation=ContentModeration.validateTask_(body);
    if(!moderation.allowed) return fail_(moderation.message,{field:moderation.field,category:moderation.category});
    const budget=Util.money(body.budget);
    if(budget<50) return fail_('validation failed: minimum budget is R50');
    const commission=Util.commission(budget);
    let task=DB.insert_('Tasks',{id:DB.nextId_('Tasks'),taskId:'DFY-'+Math.floor(Date.now()/1000)+'-'+Math.floor(1000+Math.random()*9000),
      taskName:String(body.taskName||body.title||'Task').trim(),taskDescription:String(body.taskDescription||body.description||'').trim(),category:body.category||'Other',
      area:body.area||body.location||'',dateNeeded:body.dateNeeded||'',budget:budget,commissionAmount:commission,payoutAmount:Util.money(budget-commission),
      notes:body.notes||'',priority:body.priority||'Normal',createdByUserId:user.id,acceptedByUserId:'',helperName:'',helperContact:'',
      paymentStatus:'Pending',taskStatus:'PendingPayment',escrowStatus:'pending',escrowHoldUntil:'',payoutStatus:'',payoutReference:'',
      payoutInitiatedAt:'',payoutCompletedAt:'',completedAt:'',createdAt:Util.iso(),updatedAt:Util.iso(),isDeleted:false,deletedAt:''});
    const payment=Payments.createForTask_(task,user);
    if(!payment || !payment.id){Audit.log_(user.id,'CreateTaskPaymentFailed','Task',task.id,'','Unable to create manual payment record');return fail_('Unable to create payment record',{taskId:task.taskId,task:Util.taskDto(task)});}
    task=DB.findById_('Tasks',task.id);
    const details=Payments.manualDetails_(task,user);
    if(!details.success)return fail_(details.message,{taskId:task.taskId,task:Util.taskDto(task)});
    Audit.log_(user.id,'CreateTask','Task',task.id,'',JSON.stringify(task));
    return ok_(Object.assign({payment:details.data,paymentUrl:null},Util.taskDto(task)),'Task created. Complete the manual EFT payment and submit your Proof of Payment.');
  },
  get: function(taskId,user){ const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(taskId)||String(x.id)===String(taskId)); if(!t)return fail_('Task not found'); const admin=String(user.roles||'').split(',').indexOf('Admin')>=0; const owner=String(t.createdByUserId)===String(user.id); const runner=String(t.acceptedByUserId)===String(user.id); if(!admin&&!owner&&!runner&&t.taskStatus!=='Posted')return fail_('Task not found'); return ok_(Util.taskDto(t),'Task retrieved successfully'); },
  available: function(query,user){
    const page=Math.max(1,Number(query.page||1)), size=Math.min(100,Math.max(1,Number(query.pageSize||10))), filters=query||{};
    const all=DB.where_('Tasks',t=>String(t.isDeleted)!=='true'&&t.taskStatus==='Posted'&&t.paymentStatus==='EscrowHeld'&&String(t.createdByUserId)!==String(user.id)&&(!filters.category||t.category===filters.category)&&(!filters.area||String(t.area).toLowerCase().indexOf(String(filters.area).toLowerCase())>=0));
    return {success:true,data:all.slice((page-1)*size,page*size).map(Util.taskDto),count:all.length,page:page,pageSize:size,totalPages:Math.ceil(all.length/size),message:'Available tasks retrieved'};
  },
  myPosted: function(user){return ok_(DB.where_('Tasks',t=>String(t.createdByUserId)===String(user.id)&&String(t.isDeleted)!=='true').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(Util.taskDto));},
  myActive: function(user){return ok_(DB.where_('Tasks',t=>String(t.acceptedByUserId)===String(user.id)&&t.taskStatus==='Claimed').map(Util.taskDto));},
  myCompleted: function(user){return ok_(DB.where_('Tasks',t=>String(t.acceptedByUserId)===String(user.id)&&['Completed','PayoutPending','RunnerPaid'].indexOf(t.taskStatus)>=0).sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt)).map(Util.taskDto));},
  claim: function(taskId,body,user){
    const lock=LockService.getScriptLock(); lock.waitLock(10000);
    try{
      const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(taskId));
      if(!t) return fail_('Task not found');
      if(!Auth.canAccept_(user)) return fail_('Your account cannot accept tasks');
      if(t.taskStatus!=='Posted'||t.paymentStatus!=='EscrowHeld') return fail_('Task is no longer available');
      if(String(t.createdByUserId)===String(user.id)) return fail_('You cannot accept your own task');
      DB.update_('Tasks',t.id,{acceptedByUserId:user.id,helperName:body.HelperName||body.helperName||user.firstName+' '+user.lastName,helperContact:body.HelperContact||body.helperContact||user.phoneNumber||user.email,taskStatus:'Claimed',updatedAt:Util.iso()});
      Audit.log_(user.id,'ClaimTask','Task',t.id,'',JSON.stringify({runner:user.id}));
      return ok_(Util.taskDto(DB.findById_('Tasks',t.id)),'Task accepted');
    } finally { lock.releaseLock(); }
  },
  complete: function(taskId,user){
    const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(taskId));
    if(!t||String(t.acceptedByUserId)!==String(user.id)||t.taskStatus!=='Claimed') return fail_('Cannot complete task');
    const now=Util.iso();
    DB.update_('Tasks',t.id,{taskStatus:'Completed',paymentStatus:'EscrowHeld',escrowStatus:'held',completedAt:now,escrowHoldUntil:new Date(Date.now()+48*3600000).toISOString(),updatedAt:now});
    Messages.system_(t.id,user.id,'[SYSTEM] The runner marked this task as completed. Please review the work and confirm the task.');
    Notify.task_(t.createdByUserId,'task_completed','Task Completed','A runner marked your task complete.',t.id);
    return ok_(true,'Task completed! Payment will be released after confirmation.');
  },
  confirm: function(taskId,user){
    const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(taskId));
    if(!t||String(t.createdByUserId)!==String(user.id)||['Completed','RunnerPaid'].indexOf(t.taskStatus)<0) return fail_('Cannot confirm task');
    if(t.taskStatus==='RunnerPaid') return ok_(true,'Payment already released');
    const r=Payments.release_(t,true); if(!r.success) return r;
    Messages.system_(t.id,user.id,'[SYSTEM] This task has been confirmed complete. The conversation is now closed.');
    Notify.user_(t.acceptedByUserId,'payment_released','Payment Released','Your task payout has been released to the internal settlement ledger.',t.id);
    return ok_(true,'Task confirmed and payout recorded!');
  },
  cancel: function(taskId,body,user){
    const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(taskId));
    if(!t||String(t.createdByUserId)!==String(user.id)&&String(t.acceptedByUserId)!==String(user.id)) return fail_('Not authorized');
    if(t.taskStatus!=='PendingPayment') return fail_('Paid tasks cannot be cancelled through this endpoint. Raise a dispute for admin review.');
    DB.update_('Tasks',t.id,{taskStatus:'Cancelled',updatedAt:Util.iso()}); return ok_(true,'Task cancelled');
  },
  update: function(taskId,body,user){
    const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(taskId)&&String(x.createdByUserId)===String(user.id));
    if(!t) return fail_('Task not found'); if(t.taskStatus!=='PendingPayment') return fail_('Only pending payment tasks can be edited');
    const nextTaskName=body.taskName!==undefined?String(body.taskName).trim():t.taskName;
    const nextTaskDescription=body.taskDescription!==undefined?String(body.taskDescription).trim():t.taskDescription;
    const moderation=ContentModeration.validateTaskValues_(nextTaskName,nextTaskDescription);
    if(!moderation.allowed) return fail_(moderation.message,{field:moderation.field,category:moderation.category});
    const patch={updatedAt:Util.iso()};
    if(body.taskName!==undefined) patch.taskName=nextTaskName;
    ['taskDescription','category','area','priority','notes','dateNeeded'].forEach(k=>{if(body[k]!==undefined)patch[k]=body[k]});
    if(body.budget!==undefined&&Number(body.budget)>=50){patch.budget=Util.money(body.budget);patch.commissionAmount=Util.commission(patch.budget);patch.payoutAmount=Util.money(patch.budget-patch.commissionAmount);}
    DB.update_('Tasks',t.id,patch); return ok_({taskId:t.taskId},'Task updated successfully');
  },
  paymentHistory: function(user){return ok_(DB.where_('Payments',p=>DB.findById_('Tasks',p.taskId)&&String(DB.findById_('Tasks',p.taskId).createdByUserId)===String(user.id)).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)));},
  stats: function(user){
    const all=DB.rows_('Tasks'), mine=all.filter(t=>String(t.createdByUserId)===String(user.id)), runner=all.filter(t=>String(t.acceptedByUserId)===String(user.id));
    const paid=mine.filter(t=>t.taskStatus==='RunnerPaid'), payouts=DB.where_('Payouts',p=>String(p.runnerId)===String(user.id)&&p.status==='Completed');
    return ok_({postedTasks:mine.length,pendingPayment:mine.filter(t=>t.taskStatus==='PendingPayment').length,activeTasks:mine.filter(t=>['Claimed','PayoutPending'].indexOf(t.taskStatus)>=0).length,awaitingConfirmation:mine.filter(t=>t.taskStatus==='Completed').length,completedTasks:paid.length,totalSpent:paid.reduce((s,t)=>s+Number(t.budget||0),0),availableTasks:all.filter(t=>t.taskStatus==='Posted'&&t.paymentStatus==='EscrowHeld').length,myActiveTasks:runner.filter(t=>t.taskStatus==='Claimed').length,runnerCompletedTasks:runner.filter(t=>['Completed','PayoutPending','RunnerPaid'].indexOf(t.taskStatus)>=0).length,totalEarnings:payouts.reduce((s,p)=>s+Number(p.amount||0),0),pendingPayouts:DB.where_('Payouts',p=>String(p.runnerId)===String(user.id)&&['Pending','Processing'].indexOf(p.status)>=0).reduce((s,p)=>s+Number(p.amount||0),0),myRating:Number(user.rating||0)}); 
  },
  cleanup: function(user){Auth.requireAdmin(currentToken_); Payments.expirePending_(); return ok_(true,'Expired payment requests cleaned up');}
};

var currentToken_='';

// ============================================================
// Notification helpers
// ============================================================

const Notify = {
  user_: function(userId,type,title,message,relatedTaskId) {
    return DB.insert_('Notifications',{
      id:DB.nextId_('Notifications'), userId:userId, type:type, title:title,
      message:message, isRead:false, relatedTaskId:relatedTaskId||'', createdAt:Util.iso()
    });
  },
  task_: function(userId,type,title,message,taskId) {
    return this.user_(userId,type,title,message,taskId);
  },
  allAdmins: function(type,title,message,relatedTaskId) {
    DB.where_('Users',function(u){
      return String(u.roles||'').split(',').indexOf('Admin') >= 0;
    }).forEach(function(admin){
      Notify.user_(admin.id,type,title,message,relatedTaskId);
    });
  }
};

// ============================================================
// Self-test
// ============================================================

function selfTest() {
  DB.ensureSheets_();
  const suffix=Date.now();
  let creator=null,admin=null,task=null;
  try {
    creator=Auth.createUser_({email:'selftest.creator.'+suffix+'@doforyou.local',password:'SelfTest!123',firstName:'Self',lastName:'Creator',userType:'Creator',roles:'User',phoneNumber:'0000000000',idNumber:'9001015009087',address:'Test Address',dateOfBirth:'1990-01-01',isVerified:true});
    admin=Auth.createUser_({email:'selftest.admin.'+suffix+'@doforyou.local',password:'SelfTest!123',firstName:'Self',lastName:'Admin',userType:'Admin',roles:'User,Admin',isVerified:true});
    const creatorUser=DB.findById_('Users',creator.id),adminUser=DB.findById_('Users',admin.id);
    const blocked=Tasks.create({taskName:'Send nudes please',taskDescription:'Manual payment test',category:'Other',area:'Test',dateNeeded:Util.iso(),budget:400,notes:'',priority:'Normal'},creatorUser);
    if(blocked.success)throw new Error('Content moderation failed to block explicit task content');
    const obfuscated=Tasks.create({taskName:'f.u.c.k this',taskDescription:'Manual payment test',category:'Other',area:'Test',dateNeeded:Util.iso(),budget:400,notes:'',priority:'Normal'},creatorUser);
    if(obfuscated.success)throw new Error('Content moderation failed to block obfuscated profanity');
    const blockedDescription=Tasks.create({taskName:'Clean task',taskDescription:'This is a porn request for explicit content',category:'Other',area:'Test',dateNeeded:Util.iso(),budget:400,notes:'',priority:'Normal'},creatorUser);
    if(blockedDescription.success)throw new Error('Content moderation failed to block explicit description');
    task=Tasks.create({taskName:'Self Test Task',taskDescription:'Manual payment test',category:'Other',area:'Test',dateNeeded:Util.iso(),budget:400,notes:'',priority:'Normal'},creatorUser);
    if(!task.success)throw new Error('Task creation failed: '+task.message);
    let raw=DB.rows_('Tasks').find(t=>String(t.taskId)===String(task.data.taskId));
    if(!raw||raw.taskStatus!=='PendingPayment'||raw.paymentStatus!=='Pending')throw new Error('Task did not enter PendingPayment');
    const submit=Payments.submitManual_(raw.taskId,{paidAmount:400,senderReference:'Self Creator',paidAt:Util.iso(),proofOfPayment:'SELFTEST-POP'},creatorUser);
    if(!submit.success)throw new Error('Manual payment submission failed: '+submit.message);
    raw=DB.findById_('Tasks',raw.id);
    if(raw.taskStatus!=='PendingPayment'||raw.paymentStatus!=='AwaitingVerification')throw new Error('Task did not remain hidden while awaiting verification');
    const verify=Payments.verifyManual_(DB.where_('Payments',p=>String(p.taskId)===String(raw.id))[0].id,{amount:400,note:'Self test'},adminUser);
    if(!verify.success)throw new Error('Manual payment verification failed: '+verify.message);
    raw=DB.findById_('Tasks',raw.id);
    if(raw.taskStatus!=='Posted'||raw.paymentStatus!=='EscrowHeld'||raw.escrowStatus!=='held')throw new Error('Task was not posted after verified payment');
    return {passed:true,taskId:raw.taskId,taskStatus:raw.taskStatus,paymentStatus:raw.paymentStatus,escrowStatus:raw.escrowStatus,message:'Manual payment lifecycle self-test passed.'};
  } finally {
    if(task&&task.data&&task.data.id){const tid=task.data.id;DB.where_('Payments',p=>String(p.taskId)===String(tid)).forEach(p=>DB.delete_('Payments',p.id));DB.delete_('Tasks',tid);}
    if(creator){DB.where_('Sessions',x=>String(x.userId)===String(creator.id)).forEach(x=>DB.delete_('Sessions',x.id));DB.delete_('Users',creator.id);}
    if(admin){DB.where_('Sessions',x=>String(x.userId)===String(admin.id)).forEach(x=>DB.delete_('Sessions',x.id));DB.delete_('Users',admin.id);}
  }
}