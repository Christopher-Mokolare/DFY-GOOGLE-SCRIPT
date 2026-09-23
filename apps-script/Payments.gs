const Payments = {
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
