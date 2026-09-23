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