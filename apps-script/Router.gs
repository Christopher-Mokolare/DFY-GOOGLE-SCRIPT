const Router = {
  handle:function(path,method,body,token,query){
    currentToken_=token||'';
    const publicPaths=['/auth/login','/auth/register','/public/stats','/categories'];
    let user=null;
    if(publicPaths.indexOf(path)<0) user=Auth.require(token);

    if(path==='/public/stats') return ok_({availableTasks:DB.where_('Tasks',t=>t.taskStatus==='Posted'&&t.paymentStatus==='EscrowHeld').length,completedTasks:DB.where_('Tasks',t=>t.taskStatus==='RunnerPaid').length});
    if(path==='/auth/login'&&method==='POST') return Auth.login(body);
    if(path==='/auth/register'&&method==='POST') return (function(){const u=Auth.createUser_(body);return Auth.login({email:u.email,password:body.password});})();
    if(path==='/auth/change-password'&&method==='POST') return fail_('Password change endpoint is available after session validation; use /user/profile for profile updates');

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
    if(path==='/banking/bank-accounts/'+String(body.id||'')+'/verify'&&method==='POST')return Banking.verify(body.id,user);
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
    const av=path.match(/^\/admin\/tasks\/([^/]+)\/(verify|unverify|force-release-escrow)$/);if(av&&method==='PATCH'){const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(av[1]));if(!t)return fail_('Task not found');Auth.requireAdmin(token);if(av[2]==='force-release-escrow')return Payments.release_(t,true);DB.update_('Tasks',t.id,{paymentStatus:av[2]==='verify'?'EscrowHeld':'Pending',escrowStatus:av[2]==='verify'?'held':'pending',taskStatus:av[2]==='verify'?'Posted':'PendingPayment',updatedAt:Util.iso()});return ok_(true,'Payment status updated');}
    const ar=path.match(/^\/admin\/users\/(\d+)\/(status|role)$/);if(ar&&method==='PATCH'){Auth.requireAdmin(token);const uid=Number(ar[1]);DB.update_('Users',uid,ar[2]==='status'?{isVerified:body.isVerified}:{userType:body.role});Audit.log_(user.id,'AdminUserUpdate','User',uid,'',JSON.stringify(body));return ok_(true,'User updated');}
    const del=path.match(/^\/admin\/(tasks|users)\/(.+)$/);if(del&&method==='DELETE'){Auth.requireAdmin(token);const id=del[2];if(del[1]==='tasks'){const t=DB.rows_('Tasks').find(x=>String(x.taskId)===String(id));if(t)DB.update_('Tasks',t.id,{isDeleted:true,deletedAt:Util.iso(),taskStatus:'Cancelled'});}else DB.delete_('Users',Number(id));return ok_(true,'Deleted');}

    return fail_('Endpoint not implemented: '+method+' '+path);
  }
};

var currentToken_='';
