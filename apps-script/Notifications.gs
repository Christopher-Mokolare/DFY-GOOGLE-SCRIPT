const Notifications = {
  list:function(user,q){let a=DB.where_('Notifications',n=>String(n.userId)===String(user.id));if(q.type)a=a.filter(n=>n.type===q.type);if(String(q.unreadOnly)==='true')a=a.filter(n=>String(n.isRead)!=='true');const size=Number(q.pageSize||20),page=Number(q.page||1);return ok_(a.slice((page-1)*size,page*size));},
  read:function(id,user){const n=DB.findById_('Notifications',id);if(!n||String(n.userId)!==String(user.id))return fail_('Notification not found');DB.update_('Notifications',id,{isRead:true});return ok_(true);},
  markAll:function(user){DB.where_('Notifications',n=>String(n.userId)===String(user.id)).forEach(n=>DB.update_('Notifications',n.id,{isRead:true}));return ok_(true);},
  markTask:function(user,body){DB.where_('Notifications',n=>String(n.userId)===String(user.id)&&String(n.relatedTaskId)===String(body.taskId)).forEach(n=>DB.update_('Notifications',n.id,{isRead:true}));return ok_(true);},
  remove:function(id,user){const n=DB.findById_('Notifications',id);if(n&&String(n.userId)===String(user.id))DB.delete_('Notifications',id);return ok_(true);},
  clear:function(user){DB.where_('Notifications',n=>String(n.userId)===String(user.id)&&String(n.isRead)==='true').forEach(n=>DB.delete_('Notifications',n.id));return ok_(true);}
};