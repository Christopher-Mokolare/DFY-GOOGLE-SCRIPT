function hourlyMaintenance() {
  Payments.autoRelease_();
  const cutoff=Date.now()-24*3600000;
  DB.rows_('Tasks').filter(t=>t.taskStatus==='PendingPayment'&&new Date(t.createdAt).getTime()<cutoff).forEach(t=>DB.update_('Tasks',t.id,{isDeleted:true,deletedAt:Util.iso(),taskStatus:'Cancelled',updatedAt:Util.iso()}));
}

function installTriggers() {
  ScriptApp.newTrigger('hourlyMaintenance').timeBased().everyHours(1).create();
}
