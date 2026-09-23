const Tasks = {
  create: function(body,user){
    if(!Auth.profileCompletion_(user).complete) return fail_('Please complete your profile before creating tasks');
    if(!Auth.canCreate_(user)) return fail_('Only Creators and Both accounts can post tasks.');
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
