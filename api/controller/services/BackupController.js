const connection = require('../../../config/connection');
const cron = require('node-cron'), spawn = require('child_process').spawn;
module.exports={
  mongodbBackup:async ()=>{
    let date=new Date();
    let database='--uri='+connection.dbUrl;
    let archive='--archive='+connection.backup.db.path+'/'+date.getDate()+'-'+(date.getMonth()+1)+'-'+date.getFullYear()+'.gz';

      let backupProcess = spawn('mongodump', [
           database,
           archive,
          '--gzip'
        ]);

      backupProcess.on('exit', (code, signal) => {
          if(code)
              console.log('Backup process exited with code ', code);
          else if (signal)
              console.error('Backup process was killed with singal ', signal);
          else
              console.log('Successfully backedup the database')
      });

      // do the weekly dump here, based on date check it.
      if (date.getDay()===0) {// every sunday night, take a backup, it's overall week data
         module.exports.weeklyMongodbBackup();
      }
  },
weeklyMongodbBackup:async()=>{
  try {
    let date=new Date();
    let database='--uri='+connection.dbUrl;
    let archive='--archive='+connection.backup.db.path+'/'+date.getDate()+'-'+(date.getMonth()+1)+'-'+date.getFullYear()+'-Weekly'+'.gz';

      let backupProcess = spawn('mongodump', [
           database,
           archive,
          '--gzip'
        ]);

      backupProcess.on('exit', (code, signal) => {
          if(code)
              console.log('Backup process exited with code ', code);
          else if (signal)
              console.error('Backup process was killed with singal ', signal);
          else
              console.log('Successfully backedup the database')
      });

  } catch (err) {
    console.error(err);
  }
}

}
