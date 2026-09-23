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
