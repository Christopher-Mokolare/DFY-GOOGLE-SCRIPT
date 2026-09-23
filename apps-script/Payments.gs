const Payments = {
  config_: function(){
    const p=PropertiesService.getScriptProperties();
    return {apiKey:String(p.getProperty('OZOW_API_KEY')||'').trim(),siteCode:String(p.getProperty('OZOW_SITE_CODE')||'').trim(),
      privateKey:String(p.getProperty('OZOW_PRIVATE_KEY')||'').trim(),isTest:String(p.getProperty('OZOW_IS_TEST')||'false').toLowerCase()==='true',
      apiUrl:String(p.getProperty('OZOW_API_URL')||'https://api.ozow.com/postpaymentrequest').trim(),
      frontendUrl:String(p.getProperty('DFY_FRONTEND_URL')||'').trim(),successUrl:String(p.getProperty('DFY_PAYMENT_SUCCESS_URL')||'').trim(),
      cancelUrl:String(p.getProperty('DFY_PAYMENT_CANCEL_URL')||'').trim(),errorUrl:String(p.getProperty('DFY_PAYMENT_ERROR_URL')||'').trim()};
  },
  requireConfig_: function(){const c=this.config_(),m=[];if(!c.apiKey)m.push('OZOW_API_KEY');if(!c.siteCode)m.push('OZOW_SITE_CODE');if(!c.privateKey)m.push('OZOW_PRIVATE_KEY');return m.length?fail_('Ozow payment configuration is incomplete: '+m.join(', ')):ok_(c);},
  sha512_: function(v){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_512,String(v),Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');},
  hashRequest_: function(fields,key){return this.sha512_(fields.filter(function(v){return v!==undefined&&v!==null&&String(v)!=='';}).join('').toLowerCase()+key.toLowerCase());},
  hashNotification_: function(d,key){return this.sha512_([d.SiteCode,d.TransactionId,d.TransactionReference,Number(d.Amount||0).toFixed(2),d.Status,d.Optional1,d.Optional2,d.Optional3,d.Optional4,d.Optional5,d.CurrencyCode,d.IsTest,d.StatusMessage,key].filter(function(v){return v!==undefined&&v!==null&&String(v)!=='';}).join('').toLowerCase());},
  createForTask_: function(task,user){
    if(!task)return fail_('Task not found');
    const existing=DB.where_('Payments',function(p){return String(p.taskId)===String(task.id)&&p.type==='TASK_PAYMENT';})[0];
    if(existing)return existing;
    return DB.insert_('Payments',{id:DB.nextId_('Payments'),taskId:task.id,type:'TASK_PAYMENT',amount:task.budget,status:'PENDING',
      reference:'DFY-PAY-'+task.id+'-'+Date.now(),createdAt:Util.iso(),updatedAt:Util.iso(),metadata:JSON.stringify({provider:'Ozow',status:'PENDING'})});
  },
  createPaymentRequest_: function(task,user){
    if(!task)return fail_('Task not found');
    const cr=this.requireConfig_();if(!cr.success)return cr;
    let payment=DB.where_('Payments',function(p){return String(p.taskId)===String(task.id)&&p.type==='TASK_PAYMENT';})[0];
    if(!payment)payment=this.createForTask_(task,user);
    let meta={};try{meta=payment.metadata?JSON.parse(payment.metadata):{};}catch(_){}
    if(meta.paymentUrl)return ok_({taskId:task.taskId,paymentId:payment.id,paymentUrl:meta.paymentUrl,transactionReference:payment.reference},'Payment request already created');
    const c=cr.data,appUrl=ScriptApp.getService().getUrl()||'',frontend=c.frontendUrl;
    const success=c.successUrl||frontend||appUrl,cancel=c.cancelUrl||frontend||appUrl,error=c.errorUrl||frontend||appUrl;
    const notify=appUrl?appUrl+'?path=/payments/ozow/notify':'';
    if(!notify)return fail_('Apps Script web app URL is unavailable. Deploy the web app before creating payments.');
    const amount=Number(task.budget).toFixed(2),transactionReference=String(payment.reference).slice(0,19),
      bankReference=('DFY '+String(task.taskId)).replace(/[^A-Za-z0-9 _-]/g,'').slice(0,20),isTest=c.isTest?'true':'false';
    const payload={siteCode:c.siteCode,countryCode:'ZA',currencyCode:'ZAR',amount:amount,transactionReference:transactionReference,bankReference:bankReference,
      cancelUrl:cancel,errorUrl:error,successUrl:success,notifyUrl:notify,isTest:c.isTest,
      hashCheck:this.hashRequest_([c.siteCode,'ZA','ZAR',amount,transactionReference,bankReference,cancel,error,success,notify,isTest],c.privateKey)};
    let response;try{response=UrlFetchApp.fetch(c.apiUrl,{method:'post',contentType:'application/json',headers:{Accept:'application/json',ApiKey:c.apiKey},payload:JSON.stringify(payload),muteHttpExceptions:true});}
    catch(e){return fail_('Unable to reach Ozow: '+e.message);}
    const http=response.getResponseCode();let result={};try{result=JSON.parse(response.getContentText()||'{}');}catch(e){return fail_('Ozow returned an invalid response.');}
    if(http<200||http>=300||!result.url||result.errorMessage)return fail_('Ozow rejected the payment request: '+(result.errorMessage||('HTTP '+http)),{taskId:task.taskId,transactionReference:transactionReference});
    DB.update_('Payments',payment.id,{reference:transactionReference,status:'PENDING',updatedAt:Util.iso(),metadata:JSON.stringify({provider:'Ozow',paymentRequestId:result.paymentRequestId||'',paymentUrl:result.url,transactionReference:transactionReference,status:'PENDING',isTest:c.isTest})});
    DB.update_('Tasks',task.id,{paymentStatus:'Pending',taskStatus:'PendingPayment',escrowStatus:'pending',updatedAt:Util.iso()});
    Audit.log_(user.id,'CreateOzowPayment','Payment',payment.id,'',JSON.stringify({taskId:task.id,transactionReference:transactionReference,isTest:c.isTest}));
    return ok_({taskId:task.taskId,paymentId:payment.id,paymentUrl:result.url,paymentRequestId:result.paymentRequestId||null,transactionReference:transactionReference,amount:Number(task.budget)},'Payment request created');
  },
  handleOzowNotification_: function(data){
    const c=this.config_();if(!c.privateKey)return fail_('Ozow private key is not configured');
    const supplied=String(data.Hash||'').toLowerCase(),expected=this.hashNotification_(data,c.privateKey).toLowerCase();
    if(!supplied||supplied!==expected){Audit.log_(null,'OzowNotificationRejected','Payment','','',JSON.stringify({reason:'invalid_hash'}));return fail_('Invalid Ozow notification hash');}
    if(c.siteCode&&String(data.SiteCode||'')!==c.siteCode)return fail_('Invalid Ozow site code');
    const ref=String(data.TransactionReference||''),payment=DB.where_('Payments',function(p){return p.type==='TASK_PAYMENT'&&String(p.reference)===ref;})[0];
    if(!payment)return fail_('Payment reference not found');
    const task=DB.findById_('Tasks',payment.taskId);if(!task)return fail_('Task not found for payment');
    const amount=Number(data.Amount||0);if(Math.abs(amount-Number(task.budget||0))>0.009)return fail_('Ozow amount does not match task amount');
    if(String(data.CurrencyCode||'ZAR')!=='ZAR')return fail_('Unsupported payment currency');
    const status=String(data.Status||'').toLowerCase(),now=Util.iso();
    if(status==='complete'){
      if(String(payment.status)!=='COMPLETE')DB.update_('Payments',payment.id,{status:'COMPLETE',updatedAt:now,metadata:JSON.stringify({provider:'Ozow',transactionId:data.TransactionId||'',transactionReference:ref,status:data.Status,subStatus:data.SubStatus||'',statusMessage:data.StatusMessage||'',isTest:String(data.IsTest||'').toLowerCase()==='true'})});
      DB.update_('Tasks',task.id,{paymentStatus:'EscrowHeld',taskStatus:'Posted',escrowStatus:'held',updatedAt:now});
      Audit.log_(task.createdByUserId,'OzowPaymentComplete','Task',task.id,'',JSON.stringify({transactionId:data.TransactionId||'',transactionReference:ref,amount:amount}));
      return ok_({taskId:task.taskId,paymentStatus:'EscrowHeld',taskStatus:'Posted'},'Payment confirmed and task posted');
    }
    const mapped=status==='cancelled'?'CANCELLED':status==='error'?'ERROR':status==='pendinginvestigation'?'PENDING_INVESTIGATION':'PENDING';
    DB.update_('Payments',payment.id,{status:mapped,updatedAt:now,metadata:JSON.stringify({provider:'Ozow',transactionId:data.TransactionId||'',transactionReference:ref,status:data.Status,subStatus:data.SubStatus||'',statusMessage:data.StatusMessage||''})});
    DB.update_('Tasks',task.id,{paymentStatus:mapped==='CANCELLED'?'Cancelled':'Pending',taskStatus:mapped==='CANCELLED'?'Cancelled':'PendingPayment',escrowStatus:'pending',updatedAt:now});
    Audit.log_(task.createdByUserId,'OzowPaymentStatus','Task',task.id,'',JSON.stringify({status:data.Status,subStatus:data.SubStatus||''}));
    return ok_({taskId:task.taskId,paymentStatus:mapped,taskStatus:mapped==='CANCELLED'?'Cancelled':'PendingPayment'},'Payment status recorded');
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