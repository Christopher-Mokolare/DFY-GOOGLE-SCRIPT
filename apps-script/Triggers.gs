function hourlyMaintenance() {
  Payments.autoRelease_();
  Payments.expirePending_();
}

function installTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'hourlyMaintenance') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('hourlyMaintenance').timeBased().everyHours(1).create();
}
