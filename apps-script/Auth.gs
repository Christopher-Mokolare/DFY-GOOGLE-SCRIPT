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
