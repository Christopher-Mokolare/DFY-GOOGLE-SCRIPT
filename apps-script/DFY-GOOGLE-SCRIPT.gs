
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
  if (!e || !e.postData || !e.postData.contents) return {};
  try { return JSON.parse(e.postData.contents); } catch (_) { return {}; }
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
  ],

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
  holdForTask_: function(task,user){
    if(!task) return fail_('Task not found');
    DB.update_('Tasks',task.id,{paymentStatus:'EscrowHeld',taskStatus:'Posted',escrowStatus:'held',updatedAt:Util.iso()});
    const payment=DB.where_('Payments',p=>String(p.taskId)===String(task.id)&&p.type==='TASK_PAYMENT')[0];
    if(payment) DB.update_('Payments',payment.id,{status:'HELD',updatedAt:Util.iso(),metadata:'internal-ledger'});
    return ok_(DB.findById_('Tasks',task.id),'Payment recorded in internal ledger');
  },
  createForTask_: function(task,user){
    const ref='DFY-PAY-'+task.taskId;
    const existing=DB.where_('Payments',p=>String(p.taskId)===String(task.id)&&p.type==='TASK_PAYMENT')[0];
    if(existing) return existing;
    return DB.insert_('Payments',{id:DB.nextId_('Payments'),taskId:task.id,type:'TASK_PAYMENT',amount:task.budget,status:'HELD',reference:ref,createdAt:Util.iso(),updatedAt:Util.iso(),metadata:'internal-ledger'});
  },
  release_: function(task,force){
    if(!task || !task.acceptedByUserId) return fail_('Task has no runner');
    if(task.escrowStatus!=='held' && task.paymentStatus!=='EscrowHeld') return fail_('Escrow is not held');
    if(!force && task.escrowHoldUntil && new Date(task.escrowHoldUntil)>new Date()) return fail_('Escrow hold period has not expired');
    const active=DB.where_('Payouts',p=>String(p.taskId)===String(task.id)&&['Pending','Processing','Completed'].indexOf(String(p.status))>=0)[0];
    if(active) return ok_(active,'Payment already released');
    const bank=DB.where_('BankAccounts',b=>String(b.userId)===String(task.acceptedByUserId)&&String(b.isActive)!=='false'&&(b.isVerified===true||String(b.isVerified)==='true'))[0];
    if(!bank) return fail_('Runner needs an active verified bank account');
    const ref='DFY-PAYOUT-'+task.taskId+'-'+Date.now();
    const payout=DB.insert_('Payouts',{id:DB.nextId_('Payouts'),taskId:task.id,runnerId:task.acceptedByUserId,bankAccountId:bank.id,amount:task.payoutAmount,status:'Pending',provider:'Internal',merchantReference:ref,createdAt:Util.iso(),updatedAt:Util.iso(),completedAt:''});
    DB.update_('Tasks',task.id,{escrowStatus:'released',paymentStatus:'EscrowReleased',taskStatus:'PayoutPending',payoutStatus:'Pending',payoutReference:ref,payoutInitiatedAt:Util.iso(),updatedAt:Util.iso()});
    DB.insert_('Payments',{id:DB.nextId_('Payments'),taskId:task.id,type:'PAYOUT',amount:task.payoutAmount,status:'RELEASED',reference:ref,createdAt:Util.iso(),updatedAt:Util.iso(),metadata:'internal-ledger'});
    return ok_(payout,'Payout recorded and ready for settlement');
  },
  autoRelease_: function(){
    DB.where_('Tasks',t=>t.escrowStatus==='held'&&t.escrowHoldUntil&&new Date(t.escrowHoldUntil)<=new Date()).forEach(t=>this.release_(t,false));
  }
};


// ============================================================
// Tasks.gs
// ============================================================

const Tasks = {
  create: function(body,user){
    if(!Auth.profileCompletion_(user).complete) return fail_('Please complete your profile before creating tasks');
    if(!Auth.canCreate_(user)) return fail_('Only Creators and Both accounts can post tasks.');
    const budget=Util.money(body.budget);
    if(budget<50) return fail_('validation failed: minimum budget is R50');
    const commission=Util.commission(budget), task=DB.insert_('Tasks',{id:DB.nextId_('Tasks'),taskId:'DFY-'+Math.floor(Date.now()/1000)+'-'+Math.floor(1000+Math.random()*9000),
      taskName:String(body.taskName||body.title||'Task').trim(),taskDescription:String(body.taskDescription||body.description||'').trim(),category:body.category||'Other',
      area:body.area||body.location||'',dateNeeded:body.dateNeeded||'',budget:budget,commissionAmount:commission,payoutAmount:Util.money(budget-commission),
      notes:body.notes||'',priority:body.priority||'Normal',createdByUserId:user.id,acceptedByUserId:'',helperName:'',helperContact:'',
      paymentStatus:'Pending',taskStatus:'PendingPayment',escrowStatus:'pending',escrowHoldUntil:'',payoutStatus:'',payoutReference:'',
      payoutInitiatedAt:'',payoutCompletedAt:'',completedAt:'',createdAt:Util.iso(),updatedAt:Util.iso(),isDeleted:false,deletedAt:''});
    Payments.createForTask_(task,user);
    Payments.holdForTask_(task,user);
    task=DB.findById_('Tasks',task.id);
    Audit.log_(user.id,'CreateTask','Task',task.id,'',JSON.stringify(task));
    return ok_(Object.assign({paymentUrl:null},Util.taskDto(task)),'Task created');
  },
  get: function(taskId,user){ const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(taskId)||String(x.id)===String(taskId)); return t?ok_(Util.taskDto(t),'Task retrieved successfully'):fail_('Task not found'); },
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
    const patch={updatedAt:Util.iso()};
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
  cleanup: function(user){Auth.requireAdmin(currentToken_); const cutoff=Date.now()-24*3600000; DB.rows_('Tasks').filter(t=>t.taskStatus==='PendingPayment'&&new Date(t.createdAt).getTime()<cutoff).forEach(t=>DB.update_('Tasks',t.id,{isDeleted:true,deletedAt:Util.iso(),taskStatus:'Cancelled',updatedAt:Util.iso()})); return ok_(true,'Expired tasks cleaned up');}
};


// ============================================================
// Disputes.gs
// ============================================================

const Disputes = {
  raise:function(body,user){const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(body.taskId));if(!t)return fail_('Task not found');if(String(t.createdByUserId)!==String(user.id)&&String(t.acceptedByUserId)!==String(user.id))return fail_('Not authorized');const d=DB.insert_('Disputes',{id:DB.nextId_('Disputes'),taskId:t.id,raisedByUserId:user.id,issue:body.issue||'',category:body.category||'Other',status:'Open',resolution:'',action:'',reason:'',createdAt:Util.iso(),resolvedAt:''});Notify.allAdmins('dispute_raised','New Dispute','A dispute was raised for '+t.taskId,t.id);return ok_(d,'Dispute raised');},
  mine:function(user){return ok_(DB.where_('Disputes',d=>String(d.raisedByUserId)===String(user.id)));},
  all:function(user){Auth.requireAdmin(currentToken_);return ok_(DB.rows_('Disputes'));},
  resolve:function(id,body,user){Auth.requireAdmin(currentToken_);const d=DB.findById_('Disputes',id);if(!d)return fail_('Dispute not found');const t=DB.findById_('Tasks',d.taskId);const action=body.action||'';if(action==='release_to_runner'){const r=Payments.release_(t,true);if(!r.success)return r;}else if(action==='refund_creator'){DB.insert_('Refunds',{id:DB.nextId_('Refunds'),taskId:t.id,amount:t.budget,reason:body.reason||'Dispute refund',status:'Approved',reference:'DFY-REFUND-'+t.taskId,createdAt:Util.iso(),updatedAt:Util.iso(),completedAt:''});DB.update_('Tasks',t.id,{paymentStatus:'Refunded',taskStatus:'Refunded',escrowStatus:'refunded',updatedAt:Util.iso()});}else if(action!=='close'){return fail_('Unsupported dispute resolution action');}DB.update_('Disputes',id,{status:'Resolved',resolution:body.resolution||'',action:action,reason:body.reason||'',resolvedAt:Util.iso()});Audit.log_(user.id,'ResolveDispute','Dispute',id,'',JSON.stringify(body));return ok_(true,'Dispute resolved');}
};


// ============================================================
// Messages.gs
// ============================================================

const Messages = {
  list:function(taskId,user){const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(taskId)||String(x.id)===String(taskId));if(!t)return fail_('Task not found');if(String(t.createdByUserId)!==String(user.id)&&String(t.acceptedByUserId)!==String(user.id))return fail_('Not authorized');return ok_(DB.where_('Messages',m=>String(m.taskId)===String(t.id)).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)));},
  send:function(taskId,body,user){const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(taskId));if(!t)return fail_('Task not found');if(String(t.createdByUserId)!==String(user.id)&&String(t.acceptedByUserId)!==String(user.id))return fail_('Not authorized');const m=DB.insert_('Messages',{id:DB.nextId_('Messages'),taskId:t.id,senderId:user.id,content:String(body.content||'').trim(),isRead:false,createdAt:Util.iso()});return ok_(m,'Message sent');},
  read:function(taskId,user){const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(taskId));if(t)DB.where_('Messages',m=>String(m.taskId)===String(t.id)&&String(m.senderId)!==String(user.id)&&String(m.isRead)!=='true').forEach(m=>DB.update_('Messages',m.id,{isRead:true}));return ok_(true);},
  system:function(taskId,userId,content){DB.insert_('Messages',{id:DB.nextId_('Messages'),taskId:taskId,senderId:userId,content:content,isRead:false,createdAt:Util.iso()});}
};


// ============================================================
// Notifications.gs
// ============================================================

const Notifications = {
  list:function(user,q){let a=DB.where_('Notifications',n=>String(n.userId)===String(user.id));if(q.type)a=a.filter(n=>n.type===q.type);if(String(q.unreadOnly)==='true')a=a.filter(n=>String(n.isRead)!=='true');const size=Number(q.pageSize||20),page=Number(q.page||1);return ok_(a.slice((page-1)*size,page*size));},
  read:function(id,user){const n=DB.findById_('Notifications',id);if(!n||String(n.userId)!==String(user.id))return fail_('Notification not found');DB.update_('Notifications',id,{isRead:true});return ok_(true);},
  markAll:function(user){DB.where_('Notifications',n=>String(n.userId)===String(user.id)).forEach(n=>DB.update_('Notifications',n.id,{isRead:true}));return ok_(true);},
  markTask:function(user,body){DB.where_('Notifications',n=>String(n.userId)===String(user.id)&&String(n.relatedTaskId)===String(body.taskId)).forEach(n=>DB.update_('Notifications',n.id,{isRead:true}));return ok_(true);},
  remove:function(id,user){const n=DB.findById_('Notifications',id);if(n&&String(n.userId)===String(user.id))DB.delete_('Notifications',id);return ok_(true);},
  clear:function(user){DB.where_('Notifications',n=>String(n.userId)===String(user.id)&&String(n.isRead)==='true').forEach(n=>DB.delete_('Notifications',n.id));return ok_(true);}
};


// ============================================================
// Ratings.gs
// ============================================================

const Ratings = {
  submit:function(body,user){const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(body.taskId));if(!t)return fail_('Task not found');if(['RunnerPaid','Completed'].indexOf(t.taskStatus)<0)return fail_('Task must be completed before rating');let rated;if(String(t.createdByUserId)===String(user.id)&&t.acceptedByUserId)rated=t.acceptedByUserId;else if(String(t.acceptedByUserId)===String(user.id))rated=t.createdByUserId;else return fail_('Not authorized to rate this task');if(DB.where_('Ratings',r=>String(r.taskId)===String(t.id)&&String(r.ratedByUserId)===String(user.id)).length)return fail_('Already rated this task');const r=DB.insert_('Ratings',{id:DB.nextId_('Ratings'),taskId:t.id,ratedByUserId:user.id,ratedUserId:rated,ratingValue:Number(body.ratingValue),review:body.review||'',createdAt:Util.iso()});const vals=DB.where_('Ratings',x=>String(x.ratedUserId)===String(rated)).map(x=>Number(x.ratingValue));const avg=vals.reduce((a,b)=>a+b,0)/vals.length;DB.update_('Users',rated,{rating:avg});return ok_({id:r.id},'Rating submitted');},
  forUser:function(userId,q){const all=DB.where_('Ratings',r=>String(r.ratedUserId)===String(userId));const size=Number(q.pageSize||5),page=Number(q.page||1);return ok_({ratings:all.slice((page-1)*size,page*size),count:all.length,totalPages:Math.ceil(all.length/size),page:page,pageSize:size,average:all.length?all.reduce((s,r)=>s+Number(r.ratingValue),0)/all.length:0});},
  canRate:function(taskId,user){const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(taskId));if(!t)return ok_(false);return ok_((String(t.createdByUserId)===String(user.id)||String(t.acceptedByUserId)===String(user.id))&&['RunnerPaid','Completed'].indexOf(t.taskStatus)>=0&&!DB.where_('Ratings',r=>String(r.taskId)===String(t.id)&&String(r.ratedByUserId)===String(user.id)).length);}
};


// ============================================================
// Triggers.gs
// ============================================================

function hourlyMaintenance() {
  Payments.autoRelease_();
  const cutoff=Date.now()-24*3600000;
  DB.rows_('Tasks').filter(t=>t.taskStatus==='PendingPayment'&&new Date(t.createdAt).getTime()<cutoff).forEach(t=>DB.update_('Tasks',t.id,{isDeleted:true,deletedAt:Util.iso(),taskStatus:'Cancelled',updatedAt:Util.iso()}));
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'hourlyMaintenance') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('hourlyMaintenance').timeBased().everyHours(1).create();
}


// ============================================================
// Router.gs
// ============================================================

const Router = {
  handle:function(path,method,body,token,query){
    currentToken_=token||'';
    const publicPaths=['/auth/login','/auth/register','/public/stats','/categories'];
    let user=null;
    if(publicPaths.indexOf(path)<0) user=Auth.require(token);

    if(path==='/public/stats') return ok_({availableTasks:DB.where_('Tasks',t=>t.taskStatus==='Posted'&&t.paymentStatus==='EscrowHeld').length,completedTasks:DB.where_('Tasks',t=>t.taskStatus==='RunnerPaid').length});
    if(path==='/auth/login'&&method==='POST') return Auth.login(body);
    if(path==='/auth/register'&&method==='POST') return (function(){const u=Auth.createUser_(body);return Auth.login({email:u.email,password:body.password});})();
    if(path==='/auth/change-password'&&method==='POST'){const current=String(body.currentPassword||'');const next=String(body.newPassword||'');if(!current||!next)return fail_('Current and new passwords are required');if(current===next)return fail_('New password must be different from the current password');const stored=DB.findById_('Users',user.id);if(!stored||Util.passwordHash(current,stored.salt)!==stored.passwordHash)return fail_('Current password is incorrect');const salt=Util.token();DB.update_('Users',user.id,{salt:salt,passwordHash:Util.passwordHash(next,salt)});return ok_(true,'Password changed successfully');}

    if(path==='/user/profile'&&method==='GET') return ok_(Util.userDto(user));
    if(path==='/user/profile'&&method==='PUT'){DB.update_('Users',user.id,body);return ok_(Util.userDto(DB.findById_('Users',user.id)),'Profile updated');}
    if(path==='/user/validate-id'&&method==='POST') return ok_({valid:/^\d{13}$/.test(String(body.idNumber||''))});
    if(path==='/user/preferences'&&method==='GET') return ok_(JSON.parse(user.preferences||'{}'));
    if(path==='/user/preferences'&&method==='PUT'){DB.update_('Users',user.id,{preferences:JSON.stringify(body)});return ok_(body);}

    if(path==='/categories'&&method==='GET') return ok_(DB.where_('Categories',c=>String(c.active)!=='false'));
    if(path==='/tasks'&&method==='POST') return Tasks.create(body,user);
    if(path==='/tasks/available'&&method==='GET') return Tasks.available(query,user);
    if(path==='/tasks/my-posted'&&method==='GET') return Tasks.myPosted(user);
    if(path==='/tasks/my-active'&&method==='GET') return Tasks.myActive(user);
    if(path==='/tasks/my-completed'&&method==='GET') return Tasks.myCompleted(user);
    if(path==='/tasks/dashboard/stats'&&method==='GET') return Tasks.stats(user);
    if(path==='/tasks/payment-history'&&method==='GET') return Tasks.paymentHistory(user);
    if(path==='/tasks/cleanup'&&method==='POST') return Tasks.cleanup(user);
    const taskMatch=path.match(/^\/tasks\/([^/]+)(?:\/(.*))?$/);
    if(taskMatch){const id=taskMatch[1],action=taskMatch[2]||'';if(!action&&method==='GET')return Tasks.get(id,user);if(!action&&method==='PUT')return Tasks.update(id,body,user);if(action==='claim'&&method==='POST')return Tasks.claim(id,body,user);if(action==='complete'&&method==='POST')return Tasks.complete(id,user);if(action==='confirm'&&method==='POST')return Tasks.confirm(id,user);if(action==='cancel'&&method==='POST')return Tasks.cancel(id,body,user);if(action==='messages'&&method==='GET')return Messages.list(id,user);if(action==='messages'&&method==='POST')return Messages.send(id,body,user);if(action==='messages/read'&&method==='PUT')return Messages.read(id,user);if(action==='progress'&&method==='POST'){const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(id));const p=DB.insert_('Progress',{id:DB.nextId_('Progress'),taskId:t.id,userId:user.id,message:body.progressNote||body.message||'',createdAt:Util.iso()});return ok_(p);}if(action==='payment-url'&&method==='GET')return ok_({paymentUrl:null,message:'No external payment provider is configured; payment is managed by the internal ledger.'});}
    if(path==='/banking/accounts'&&method==='GET')return Banking.accounts(user);
    if(path==='/banking/accounts'&&method==='POST')return Banking.add(body,user);
    const bv=path.match(/^\/banking\/bank-accounts\/(\d+)\/verify$/);if(bv&&method==='POST')return Banking.verify(Number(bv[1]),user);
    if(path==='/banking/banks'&&method==='GET')return Banking.banks();

    if(path==='/messages/conversations'&&method==='GET') return ok_([]);
    if(path==='/disputes'&&method==='POST')return Disputes.raise(body,user);
    if(path==='/disputes/my'&&method==='GET')return Disputes.mine(user);
    if(path==='/disputes'&&method==='GET')return Disputes.all(user);
    const dr=path.match(/^\/disputes\/(\d+)\/resolve$/);if(dr&&method==='PATCH')return Disputes.resolve(Number(dr[1]),body,user);

    if(path==='/ratings'&&method==='POST')return Ratings.submit(body,user);
    const rr=path.match(/^\/ratings\/user\/(\d+)$/);if(rr&&method==='GET')return Ratings.forUser(Number(rr[1]),query);
    const cr=path.match(/^\/ratings\/can-rate\/(.+)$/);if(cr&&method==='GET')return Ratings.canRate(cr[1],user);

    if(path==='/notifications'&&method==='GET')return Notifications.list(user,query);
    if(path==='/notifications/mark-all-read'&&method==='POST')return Notifications.markAll(user);
    if(path==='/notifications/mark-task-read'&&method==='POST')return Notifications.markTask(user,body);
    const nr=path.match(/^\/notifications\/(\d+)\/mark-read$/);if(nr&&method==='POST')return Notifications.read(Number(nr[1]),user);
    const nd=path.match(/^\/notifications\/(\d+)$/);if(nd&&method==='DELETE')return Notifications.remove(Number(nd[1]),user);
    if(path==='/notifications/clear-read'&&method==='DELETE')return Notifications.clear(user);

    if(path==='/support/tickets'&&method==='POST'){const t=DB.insert_('SupportTickets',{id:DB.nextId_('SupportTickets'),userId:user.id,name:body.name||user.firstName+' '+user.lastName,email:body.email||user.email,subject:body.subject||'',message:body.message||'',category:body.category||'General',priority:body.priority||'Normal',status:'Open',createdAt:Util.iso()});Notify.allAdmins('support_ticket','New Support Ticket',t.subject,t.id);return ok_(t,'Ticket created');}
    if(path==='/support/tickets'&&method==='GET')return ok_(DB.where_('SupportTickets',t=>String(t.userId)===String(user.id)));
    const st=path.match(/^\/support\/tickets\/(\d+)$/);if(st&&method==='GET'){const t=DB.findById_('SupportTickets',Number(st[1]));return t&&String(t.userId)===String(user.id)?ok_(t):fail_('Ticket not found');}

    if(path==='/admin/dashboard'&&method==='GET'){Auth.requireAdmin(token);return ok_({users:DB.rows_('Users').length,tasks:DB.rows_('Tasks').length,payments:DB.rows_('Payments').length,pendingPayouts:DB.where_('Payouts',p=>['Pending','Processing'].indexOf(p.status)>=0).length,openDisputes:DB.where_('Disputes',d=>d.status==='Open').length});}
    if(path==='/admin/payments'&&method==='GET'){Auth.requireAdmin(token);return ok_(DB.rows_('Payments'));}
    if(path==='/admin/audit-logs'&&method==='GET'){Auth.requireAdmin(token);return ok_(DB.rows_('AuditLogs').slice(-Number(query.pageSize||20)).reverse());}
    if(path==='/admin/users'&&method==='GET'){Auth.requireAdmin(token);return ok_(DB.rows_('Users').map(Util.userDto));}
    if(path==='/admin/bank-accounts'&&method==='GET'){Auth.requireAdmin(token);return ok_(DB.rows_('BankAccounts'));}
    if(path==='/admin/tasks'&&method==='GET'){Auth.requireAdmin(token);return ok_(DB.rows_('Tasks').map(Util.taskDto));}
    const ah=path.match(/^\/admin\/users\/(\d+)\/tasks$/);if(ah&&method==='GET'){Auth.requireAdmin(token);return ok_(DB.where_('Tasks',t=>String(t.createdByUserId)===ah[1]||String(t.acceptedByUserId)===ah[1]).map(Util.taskDto));}
    const am=path.match(/^\/admin\/tasks\/([^/]+)\/messages$/);if(am&&method==='GET'){Auth.requireAdmin(token);return ok_(DB.where_('Messages',m=>{const t=DB.findById_('Tasks',m.taskId);return t&&String(t.taskId)===am[1];}));}
    const ab=path.match(/^\/admin\/bank-accounts\/(\d+)\/verify$/);if(ab&&method==='PATCH'){Auth.requireAdmin(token);const ba=DB.findById_('BankAccounts',Number(ab[1]));if(!ba)return fail_('Bank account not found');DB.update_('BankAccounts',ba.id,{isVerified:true,verifiedAt:Util.iso()});Audit.log_(user.id,'AdminVerifyBankAccount','BankAccount',ba.id,'','verified=true');return ok_(true,'Bank account verified');}
    const av=path.match(/^\/admin\/tasks\/([^/]+)\/(verify|unverify|force-release-escrow)$/);if(av&&method==='PATCH'){const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(av[1]));if(!t)return fail_('Task not found');Auth.requireAdmin(token);if(av[2]==='force-release-escrow')return Payments.release_(t,true);DB.update_('Tasks',t.id,{paymentStatus:av[2]==='verify'?'EscrowHeld':'Pending',escrowStatus:av[2]==='verify'?'held':'pending',taskStatus:av[2]==='verify'?'Posted':'PendingPayment',updatedAt:Util.iso()});return ok_(true,'Payment status updated');}
    const ar=path.match(/^\/admin\/users\/(\d+)\/(status|role)$/);if(ar&&method==='PATCH'){Auth.requireAdmin(token);const uid=Number(ar[1]);DB.update_('Users',uid,ar[2]==='status'?{isVerified:body.isVerified}:{userType:body.role});Audit.log_(user.id,'AdminUserUpdate','User',uid,'',JSON.stringify(body));return ok_(true,'User updated');}
    const del=path.match(/^\/admin\/(tasks|users)\/(.+)$/);if(del&&method==='DELETE'){Auth.requireAdmin(token);const id=del[2];if(del[1]==='tasks'){const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(id));if(t)DB.update_('Tasks',t.id,{isDeleted:true,deletedAt:Util.iso(),taskStatus:'Cancelled'});}else DB.delete_('Users',Number(id));return ok_(true,'Deleted');}

    return fail_('Endpoint not implemented: '+method+' '+path);
  }
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
  let creator=null, runner=null, bank=null, task=null;
  const cleanup=function(name,id){
    try { if(id!==null && id!==undefined) DB.delete_(name,id); } catch(e) {}
  };
  try {
    creator=Auth.createUser_({
      email:'selftest.creator.'+suffix+'@doforyou.local', password:'SelfTest!123',
      firstName:'Self', lastName:'Creator', userType:'Creator', roles:'User',
      phoneNumber:'0000000000', idNumber:'9001015009087', address:'Test Address',
      dateOfBirth:'1990-01-01', isVerified:true
    });
    runner=Auth.createUser_({
      email:'selftest.runner.'+suffix+'@doforyou.local', password:'SelfTest!123',
      firstName:'Self', lastName:'Runner', userType:'Runner', roles:'User',
      phoneNumber:'0000000001', idNumber:'9001015009088', address:'Test Address',
      dateOfBirth:'1990-01-01', isVerified:true
    });
    bank=DB.insert_('BankAccounts',{
      id:DB.nextId_('BankAccounts'),userId:runner.id,bankName:'Test Bank',
      bankGroupId:'TEST',accountNumber:'1234567890',accountHolderName:'Self Runner',
      branchCode:'000000',accountType:'Cheque',isVerified:true,isActive:true,
      createdAt:Util.iso(),verifiedAt:Util.iso()
    });
    const creatorUser=DB.findById_('Users',creator.id);
    task=Tasks.create({
      taskName:'Self Test Task',taskDescription:'Internal payment flow test',
      category:'Other',area:'Test',dateNeeded:Util.iso(),budget:400,
      notes:'',priority:'Normal'
    },creatorUser);
    if(!task.success) throw new Error('Create failed: '+task.message);
    const taskId=task.data.taskId;
    const rawTask=DB.rows_('Tasks').find(function(t){return String(t.taskId)===String(taskId);});
    if(rawTask.taskStatus!=='Posted'||rawTask.paymentStatus!=='EscrowHeld'||rawTask.escrowStatus!=='held')
      throw new Error('Payment hold state was not established');
    const claimed=Tasks.claim(taskId,{},DB.findById_('Users',runner.id));
    if(!claimed.success) throw new Error('Claim failed: '+claimed.message);
    const completed=Tasks.complete(taskId,DB.findById_('Users',runner.id));
    if(!completed.success) throw new Error('Complete failed: '+completed.message);
    const confirmed=Tasks.confirm(taskId,DB.findById_('Users',creator.id));
    if(!confirmed.success) throw new Error('Confirm failed: '+confirmed.message);
    const finalTask=DB.findById_('Tasks',rawTask.id);
    const payouts=DB.where_('Payouts',function(p){return String(p.taskId)===String(rawTask.id);});
    if(finalTask.taskStatus!=='PayoutPending') throw new Error('Unexpected final task status: '+finalTask.taskStatus);
    if(finalTask.paymentStatus!=='EscrowReleased') throw new Error('Unexpected payment status: '+finalTask.paymentStatus);
    if(payouts.length!==1) throw new Error('Expected one payout, found '+payouts.length);
    return {passed:true,taskId:taskId,budget:Number(finalTask.budget),commission:Number(finalTask.commissionAmount),
      payout:Number(payouts[0].amount),finalTaskStatus:finalTask.taskStatus,
      paymentStatus:finalTask.paymentStatus,message:'Self-test passed'};
  } finally {
    if(task && task.data && task.data.id) {
      const tid=task.data.id;
      DB.where_('Payments',function(p){return String(p.taskId)===String(tid);}).forEach(function(p){cleanup('Payments',p.id);});
      DB.where_('Payouts',function(p){return String(p.taskId)===String(tid);}).forEach(function(p){cleanup('Payouts',p.id);});
      DB.where_('Messages',function(m){return String(m.taskId)===String(tid);}).forEach(function(m){cleanup('Messages',m.id);});
      DB.where_('Notifications',function(n){return String(n.relatedTaskId)===String(tid);}).forEach(function(n){cleanup('Notifications',n.id);});
      DB.where_('AuditLogs',function(a){return String(a.entityId)===String(tid);}).forEach(function(a){cleanup('AuditLogs',a.id);});
      cleanup('Tasks',tid);
    }
    if(bank) cleanup('BankAccounts',bank.id);
    if(runner) {
      DB.where_('Sessions',function(x){return String(x.userId)===String(runner.id);}).forEach(function(x){cleanup('Sessions',x.id);});
      cleanup('Users',runner.id);
    }
    if(creator) {
      DB.where_('Sessions',function(x){return String(x.userId)===String(creator.id);}).forEach(function(x){cleanup('Sessions',x.id);});
      cleanup('Users',creator.id);
    }
  }
}
