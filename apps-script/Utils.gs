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
