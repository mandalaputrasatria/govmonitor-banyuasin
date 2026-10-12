/** GovMonitor Banyuasin · 2026-10-06
 * Paket mandiri untuk proyek baru: UI Apps Script + API Sites v1.
 * Fungsi berakhiran _ bersifat privat dan tidak dapat dipanggil dari browser.
 */
const GM = { idleMilliseconds: 300000, sessionSeconds: 21600, maxCells: 200000, maxJSON: 4000000 };

function db_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || !ss.getSheetByName('Users')) throw new Error('Database belum siap. Jalankan fungsi setupDatabase dari editor Apps Script.');
  return ss;
}
function locked_(fn) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function sheet_(ss, name, headers) {
  var s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(headers); s.setFrozenRows(1); s.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff'); }
  return s;
}

function digest_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s))); }
function hashPassword_(password, salt) {
  salt = salt || Utilities.getUuid();
  var secret = PropertiesService.getScriptProperties().getProperty('PASSWORD_SECRET');
  if (!secret) throw new Error('Jalankan fungsi setupDatabase dari editor Apps Script untuk menyiapkan keamanan login.');
  return 'hmac$' + salt + '$' + Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(salt + ':' + password, secret));
}
function verifyPassword_(password, stored) {
  var parts = String(stored).split('$');
  return parts.length === 3 && hashPassword_(password,parts[1]) === stored;
}
function user_(row) { return {user_id:String(row[0]),username:String(row[1]),nama:String(row[3]),nip:String(row[4]),jabatan:String(row[5]),role:String(row[6]),status:String(row[7]),foto:String(row[8]||''),timer_seconds:0,active_task:'',device:'',ip_address:'Tidak tersedia'}; }
function allUsers_() { return db_().getSheetByName('Users').getDataRange().getValues().slice(1).filter(function(r){return r[0];}); }

// Migrasi tambahan; tidak menghapus akun, password, atau lembar kerja.
function upgradeMonitoring_() { return locked_(function(){sessionStore_();sheet_(db_(),'Worksheet_Bindings',['User ID','Tab Name','Sheet ID']);sheet_(db_(),'Staff_Session_Logs',['Session Hash','User ID','Login At','Exit At','Reason','Save Status']);return {success:true,monitoring_version:2};}); }
function sessionStore_(){var s=sheet_(db_(),'Sessions',['Token Hash','User ID','Expires','Last Activity','Login At']);s.getRange(1,4,1,2).setValues([['Last Activity','Login At']]);return s;}
function sessionInfo_(token){var rows=sessionStore_().getDataRange().getValues(),hash=digest_(String(token||''));for(var i=1;i<rows.length;i++)if(rows[i][0]===hash)return {row:rows[i],index:i+1};return null;}
function sessionActivity_(info){return Number(info.row[3])||Number(info.row[4])||Math.max(0,Number(info.row[2])-GM.sessionSeconds*1000);}
function closeSession_(info,reason,when,saveStatus){
 timeAccount_(info,when);
 var events=sheet_(db_(),'Staff_Session_Logs',['Session Hash','User ID','Login At','Exit At','Reason','Save Status']);
 if(!events.getDataRange().getValues().slice(1).some(function(r){return r[0]===info.row[0];}))events.appendRow([info.row[0],String(info.row[1]),Number(info.row[4])||Number(info.row[2])-GM.sessionSeconds*1000,when,reason,saveStatus||'Tidak diketahui']);
 var current=sessionInfoByHash_(info.row[0]);if(current)sessionStore_().deleteRow(current.index);
}
function sessionInfoByHash_(hash){var rows=sessionStore_().getDataRange().getValues();for(var i=1;i<rows.length;i++)if(rows[i][0]===hash)return {row:rows[i],index:i+1};return null;}
function sweepSessions_(){
 var now=Date.now(),roles={};allUsers_().forEach(function(r){roles[String(r[0])]=r[6];});
 var rows=sessionStore_().getDataRange().getValues();for(var i=rows.length-1;i>=1;i--){var info={row:rows[i],index:i+1},deadline=sessionActivity_(info)+GM.idleMilliseconds;
 if(roles[String(rows[i][1])]==='Staf'&&now>=deadline)closeSession_(info,'idle',deadline,'Tidak diketahui');else if(now>=Number(rows[i][2]))closeSession_(info,'expired',Number(rows[i][2]),'Tidak diketahui');}
}
function endStaffSession(data,token){
 if(!token)throw new Error('Sesi belum tersedia.');
 return locked_(function(){var info=sessionInfo_(token);if(!info){var old=sheet_(db_(),'Staff_Session_Logs',['Session Hash','User ID','Login At','Exit At','Reason','Save Status']).getDataRange().getValues().slice(1).find(function(r){return r[0]===digest_(token);});if(old){if(data&&['pending','saved'].includes(data.save_status)&&old[5]==='Tidak diketahui'){var events=db_().getSheetByName('Staff_Session_Logs'),index=events.getDataRange().getValues().findIndex(function(r){return r[0]===digest_(token);});if(index>0)events.getRange(index+1,6).setValue(data.save_status==='pending'?'Belum tersinkron':'Tersimpan terakhir di server');}return {success:true,ended_at:Number(old[3]),reason:old[4]};}throw new Error('Sesi berakhir. Silakan login ulang.');}
 var user=allUsers_().find(function(r){return String(r[0])===String(info.row[1]);});if(!user)throw new Error('Akses ditolak.');
 var now=Date.now(),idle=user[6]==='Staf'&&now>=sessionActivity_(info)+GM.idleMilliseconds;
 if(data&&data.reason==='idle'&&!idle)throw new Error('Batas tidak aktif belum tercapai.');
 var status=data&&data.save_status==='pending'?'Belum tersinkron':data&&data.save_status==='saved'?'Tersimpan terakhir di server':'Tidak diketahui';
 var reason=idle?'idle':'manual',when=idle?sessionActivity_(info)+GM.idleMilliseconds:now;closeSession_(info,reason,when,status);return {success:true,ended_at:when,reason:reason};});
}

function authenticateUser(username,password) {
  return locked_(function() {
    username=String(username||'').trim(); password=String(password||'');
    if (!username || username.length>120 || password.length>512) return {success:false,message:'Username atau password salah.'};
    var cache=CacheService.getScriptCache(), key='login:'+digest_(username), count=Number(cache.get(key)||0);
    if (count>=8) return {success:false,message:'Terlalu banyak percobaan. Tunggu 10 menit.'};
    var row=allUsers_().find(function(r){return String(r[1])===username && r[7]==='Aktif' && verifyPassword_(password,String(r[2]));});
    if (!row) { cache.put(key,String(count+1),600); return {success:false,message:'Username atau password salah atau akun tidak aktif.'}; }
    cache.remove(key);
    var token=Utilities.getUuid()+Utilities.getUuid(), expires=Date.now()+GM.sessionSeconds*1000;
    sweepSessions_();var sessions=sessionStore_(),now=Date.now();
    sessions.appendRow([digest_(token),String(row[0]),expires,now,now]);if(row[6]==='Staf')timeInit_({row:[digest_(token),String(row[0]),expires,now,now]},now,true);
    return {success:true,user:user_(row),token:token,expires:expires,idle_ms:0,monitoring_version:2};
  });
}
function auth_(token,admin) {
  if (!token) throw new Error('Sesi belum tersedia. Silakan login.');
  var info=sessionInfo_(token),now=Date.now();if(!info||Number(info.row[2])<=now)throw new Error('Sesi berakhir. Silakan login ulang.');
  var row=allUsers_().find(function(r){return String(r[0])===String(info.row[1])&&r[7]==='Aktif';});
  if(!row||(admin&&row[6]!=='Admin'))throw new Error('Akses ditolak.');
  if(row[6]==='Staf'&&now-sessionActivity_(info)>=GM.idleMilliseconds)throw new Error('Sesi berakhir karena tidak aktif 5 menit. Silakan login ulang.');
  return user_(row);
}
function validateSession(token){var u=auth_(token),info=sessionInfo_(token);return {success:true,user:u,idle_ms:Math.max(0,Date.now()-sessionActivity_(info)),monitoring_version:2};}
function logoutSession(token){return endStaffSession({reason:'manual'},token);}
function getUsersFromGAS(token) {
  var u=auth_(token);locked_(sweepSessions_);var users=allUsers_().map(user_),now=Date.now();
  var presence=db_().getSheetByName('Staff_Presence'),today=stamp_().slice(0,10),records=presence?presence.getDataRange().getValues().slice(1):[];
  var sessions=sessionStore_().getDataRange().getValues().slice(1),logs=sheet_(db_(),'Staff_Session_Logs',['Session Hash','User ID','Login At','Exit At','Reason','Save Status']).getDataRange().getValues().slice(1);
  var bindingSheet=db_().getSheetByName('Worksheet_Bindings'),bindings=bindingSheet?bindingSheet.getDataRange().getValues().slice(1):[],nativeSheets=bindings.length?db_().getSheets():[];
  users.forEach(function(x){x.worksheet_names=bindings.filter(function(b){return String(b[0])===x.user_id;}).map(function(b){var native=nativeSheets.find(function(sh){return sh.getSheetId()===Number(b[2]);});return native?native.getName():String(b[1]);});var r=records.find(function(r){return r[0]===x.user_id;});if(r){x.timer_seconds=r[1]===today?Number(r[2])||0:0;x.last_seen=Number(r[3])||0;x.device=String(r[4]||'');x.active_task=String(r[5]||'');}
    var active=sessions.filter(function(r){return String(r[1])===x.user_id&&Number(r[2])>now;}).sort(function(a,b){return Number(b[3])-Number(a[3]);}),last=logs.filter(function(r){return String(r[1])===x.user_id;}).sort(function(a,b){return Number(b[3])-Number(a[3]);})[0];
    x.last_activity_at=active.length?sessionActivity_({row:active[0]}):0;x.online=active.length>0&&now-(x.last_seen||0)<70000;x.work_status=!active.length?'Keluar':!x.online?'Koneksi terputus':now-x.last_activity_at>=120000?'Tidak aktif':'Aktif';
    x.last_logout_at=last?Number(last[3]):0;x.logout_reason=last?String(last[4]):'';x.logout_save_status=last?String(last[5]):'';
  });
  if(u.role!=='Admin')users=users.filter(function(x){return x.user_id===u.user_id||x.role==='Admin';});
  return {success:true,users:users,monitoring_version:2};
}
function saveUserToGAS(data,token) {
  var actor=auth_(token,true);
  return locked_(function() {
    if(!data || !String(data.username||'').trim() || !String(data.nama||'').trim() || !['Admin','Staf'].includes(data.role) || !['Aktif','Nonaktif'].includes(data.status||'Aktif')) throw new Error('Lengkapi nama, username, dan role.');
    var s=db_().getSheetByName('Users'), rows=s.getDataRange().getValues(), idx=rows.findIndex(function(r){return String(r[0])===String(data.user_id);});
    if(rows.slice(1).some(function(r){return String(r[1])===String(data.username).trim() && String(r[0])!==String(data.user_id);})) throw new Error('Username sudah digunakan.');
    if(actor.user_id===data.user_id && (data.role!=='Admin'||data.status==='Nonaktif')) throw new Error('Admin tidak dapat menonaktifkan atau menurunkan role sendiri.');
    if(data.user_id && !/^[A-Za-z0-9_-]{1,100}$/.test(data.user_id)) throw new Error('User ID tidak valid.');
    var password=String(data.password||'');
    if((idx<1 || password) && password.length<10) throw new Error('Password baru minimal 10 karakter.');
    var hash=password?hashPassword_(password):String(rows[idx][2]);
    if (String(data.nama).length>150 || String(data.username).length>120 || String(data.nip||'').length>100 || String(data.jabatan||'').length>150 || password.length>512) throw new Error('Data akun terlalu panjang.');
    var vals=[[String(data.user_id||('USR-'+Utilities.getUuid())),literal_(String(data.username).trim()),hash,literal_(data.nama),literal_(data.nip||''),literal_(data.jabatan||''),data.role,data.status||'Aktif',photo_(data.foto)]];
    s.getRange(idx>0?idx+1:s.getLastRow()+1,1,1,9).setNumberFormat('@').setValues(vals);
    return {success:true};
  });
}
function photo_(s) { s=String(s||''); if(s.length>45000) throw new Error('Foto terlalu besar untuk sel Google Sheets. Gunakan URL HTTPS foto.'); if(s && !/^https:\/\//.test(s) && !/^data:image\/(png|jpeg|webp);base64,/.test(s)) throw new Error('Format URL foto tidak diizinkan.'); return s; }
function deleteUserFromGAS(id,token) {
  var actor=auth_(token,true); if(String(id)===actor.user_id) throw new Error('Admin tidak dapat menghapus akun sendiri.');
  return locked_(function(){var s=db_().getSheetByName('Users'),rows=s.getDataRange().getValues();for(var i=1;i<rows.length;i++) if(String(rows[i][0])===String(id)){s.deleteRow(i+1);return {success:true};}throw new Error('Akun tidak ditemukan.');});
}
function literal_(v) { var s=String(v==null?'':v); return /^[=+@-]/.test(s)?"'"+s:s; }
function stamp_() { return Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd HH:mm:ss'); }
function saveChatMessageToGAS(item,token) {
  var u=auth_(token), target=allUsers_().map(user_).find(function(x){return x.user_id===String(item.receiver_id) && x.status==='Aktif';});
  if(!target || (u.role!=='Admin' && target.role!=='Admin')) throw new Error('Penerima tidak diizinkan.');
  var text=String(item.text||'').trim();if(!text || text.length>10000) throw new Error('Pesan kosong atau terlalu panjang.');
  return locked_(function(){db_().getSheetByName('Chat_Logs').appendRow(['CHAT-'+Utilities.getUuid(),stamp_(),u.user_id,u.nama,target.user_id,target.nama,literal_(text),'unread']);return {success:true};});
}
function getChatLogsFromGAS(token) {
  var u=auth_(token),userRoles={};allUsers_().forEach(function(r){userRoles[r[0]]=r[6];});var rows=db_().getSheetByName('Chat_Logs').getDataRange().getDisplayValues().slice(1);
  return {success:true,chats:rows.filter(function(r){return u.role==='Admin'||r[2]===u.user_id||r[4]===u.user_id;}).slice(-1000).map(function(r){return {chat_id:r[0],time:r[1],sender_id:r[2],sender_nama:r[3],receiver_id:r[4],receiver_nama:r[5],text:r[6],status:r[7],sender_role:userRoles[r[2]]||'Staf'};})};
}
function markChatAsReadGAS(staffKey,ignoredId,token) {
  var u=auth_(token);return locked_(function(){var s=db_().getSheetByName('Chat_Logs'),rows=s.getDataRange().getValues();for(var i=1;i<rows.length;i++)if(String(rows[i][4])===u.user_id && String(rows[i][2])===String(staffKey))s.getRange(i+1,8).setValue('read');return {success:true};});
}
function appendAuditBatch_(items,u,token) {
  if(!Array.isArray(items)||items.length>500)throw new Error('Batch audit maksimal 500 aktivitas.');
  var s=db_().getSheetByName('Audit_Logs'),seen=Object.create(null);s.getDataRange().getValues().slice(1).forEach(function(r){seen[r[0]]=true;});
  var values=[],ids=[];
  items.forEach(function(item){
    if(!item||!/^[A-Za-z0-9_-]{1,100}$/.test(String(item.log_id||''))||!/^[A-Z]+[1-9]\d*$/.test(String(item.cell||'')))throw new Error('ID log atau alamat sel audit tidak valid.');
    if(String(item.prev_val||'').length>45000||String(item.new_val||'').length>45000)throw new Error('Isi audit terlalu panjang.');
    var id=String(item.log_id);ids.push(id);if(seen[id])return;seen[id]=true;
    var time=stamp_();if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(item.timestamp||'')){var ms=Date.parse(item.timestamp.replace(' ','T')+'+07:00');if(isFinite(ms)&&ms<=Date.now()+60000&&ms>Date.now()-370*86400000)time=item.timestamp;}
    var context=auditContext_(item,token);
    values.push([id,time,u.user_id,literal_(u.nama),literal_(u.nip),String(item.cell),literal_(item.prev_val),literal_(item.new_val),context&&context.ip?context.ip:'Tidak tersedia',literal_(String(item.device||'Browser').slice(0,1000)),literal_(String(item.method||'Manual').slice(0,100)),context?JSON.stringify(context):'',literal_(String(item.sheet_name||'').slice(0,200))]);
  });
  if(values.length){ensureGrid_(s,s.getLastRow()+values.length,13);s.getRange(1,12,1,2).setValues([['Konteks Sistem JSON','Nama Lembar']]);s.getRange(s.getLastRow()+1,1,values.length,13).setValues(values);}return ids;
}
function saveAuditLogToGAS(item,token) {
  var u=auth_(token);if(u.role!=='Staf')throw new Error('Audit input hanya untuk staf.');
  if(!item.log_id)item.log_id='LOG-'+Utilities.getUuid();return locked_(function(){return {success:true,saved_log_ids:appendAuditBatch_([item],u,token)};});
}
function getAuditLogsFromGAS(token) {
  var u=auth_(token), rows=db_().getSheetByName('Audit_Logs').getDataRange().getDisplayValues().slice(1);
  var keys=['log_id','timestamp','user_id','nama_staf','nip','cell','prev_val','new_val','ip','device','method'];
  return {success:true,logs:rows.filter(function(r){return u.role==='Admin'||r[2]===u.user_id;}).slice(-2000).reverse().map(auditObject_)};
}
function tabName_(u,name) {
  var raw=u.nama+' - '+u.nip+' - '+String(name||'lembar_kerja 1')+' - '+u.user_id;
  raw=raw.replace(/[\[\]:*?\/\\]/g,'_');
  return raw.length<=100?raw:raw.slice(0,86)+'-'+digest_(raw).slice(0,12);
}
function worksheetTab_(ss,u,name,create){
 var map=sheet_(ss,'Worksheet_Bindings',['User ID','Tab Name','Sheet ID']),rows=map.getDataRange().getValues(),entry=rows.slice(1).find(function(r){return String(r[0])===u.user_id&&String(r[1])===String(name);}),native=entry?ss.getSheets().find(function(sh){return sh.getSheetId()===Number(entry[2]);}):ss.getSheetByName(tabName_(u,name));
 if(!native&&!entry){var suffix=' - '+String(name)+' - '+u.user_id;native=ss.getSheets().find(function(sh){return sh.getName().endsWith(suffix);});}
 if(!native&&create)native=ss.insertSheet(tabName_(u,name));
 if(native&&!entry)map.appendRow([u.user_id,literal_(String(name)),native.getSheetId()]);
 return native;
}
function ensureGrid_(s,r,c) { if(r>s.getMaxRows())s.insertRowsAfter(s.getMaxRows(),r-s.getMaxRows());if(c>s.getMaxColumns())s.insertColumnsAfter(s.getMaxColumns(),c-s.getMaxColumns()); }
function saveWorksheetCellToGAS(p,token){auth_(token);throw new Error('Muat ulang aplikasi dan gunakan sinkronisasi workbook yang memeriksa versi.');}
function prepareWorksheets_(sheets) {
  if(!Array.isArray(sheets)||!sheets.length||sheets.length>20)throw new Error('Gunakan 1 sampai 20 tab lembar kerja.');
  var json=JSON.stringify(sheets);if(json.length>GM.maxJSON)throw new Error('Data terlalu besar, maksimal 4 juta karakter per pengguna.');
  var prepared=[],total=0,names=Object.create(null);
  sheets.forEach(function(obj){
    if(!obj||typeof obj!=='object')throw new Error('Format tab tidak valid.');
    var name=String(obj.name||'lembar_kerja 1');if(names[name])throw new Error('Nama tab duplikat.');names[name]=true;
    var cells=[];
    if(Array.isArray(obj.data)&&obj.data.length) obj.data.forEach(function(row,r){if(Array.isArray(row))row.forEach(function(cell,c){if(cell!==null&&cell!==undefined)cells.push({r:r,c:c,v:cell});});});
    else if(Array.isArray(obj.celldata))cells=obj.celldata;
    var nr=1,nc=1;
    cells.forEach(function(cell){if(!cell||!Number.isInteger(cell.r)||!Number.isInteger(cell.c)||cell.r<0||cell.c<0||cell.r>=10000||cell.c>=200)throw new Error('Koordinat sel di luar batas 10000 baris × 200 kolom.');nr=Math.max(nr,cell.r+1);nc=Math.max(nc,cell.c+1);});
    total+=nr*nc;if(total>GM.maxCells)throw new Error('Melebihi batas 200000 sel terpakai per pengguna.');
    var grid=Array.from({length:nr},function(){return Array(nc).fill('');});
    cells.forEach(function(cell){var v=cell.v;if(v===null||v===undefined)return;var raw=typeof v==='object'?(v.f|| (v.v!==undefined?v.v:v.m)):v;
      if(typeof v==='object'&&v.f){if(typeof v.f!=='string'||v.f[0]!=='=')throw new Error('Formula tidak valid.');grid[cell.r][cell.c]=v.f;}
      else if(typeof raw==='number'||typeof raw==='boolean')grid[cell.r][cell.c]=raw;
      else {raw=String(raw==null?'':raw);if(raw.length>45000)throw new Error('Isi satu sel maksimal 45000 karakter.');grid[cell.r][cell.c]=literal_(raw);}
    });
    prepared.push({name:name,grid:grid,nr:nr,nc:nc});
  });return {json:json,tabs:prepared,total:total};
}
function syncFullSheetToGAS(p,token){var u=auth_(token);if(u.role!=='Staf')throw new Error('Lembar kerja hanya untuk staf.');var prep=prepareWorksheets_(p&&p.sheets_data);return locked_(function(){editVerifyStaff_(u,token,p);writeWorkbook_(u,prep);var saved=appendAuditBatch_(p.audit_logs||[],u,token),fresh=editWorkbook_(u.user_id);return {success:true,synced_cells:prep.total,synced_tabs:prep.tabs.length,updated_at:fresh.updated_at,saved_log_ids:saved,revision:fresh.revision};});}
function worksheetsForUser_(id) {
  var all=db_().getSheetByName('Worksheets_State').getDataRange().getValues().slice(1).filter(function(r){return String(r[0])===id;});
  if(!all.length)return {sheets:[],updated_at:''};
  var last=String(all[all.length-1][1]),generation=last.includes(':')?last.split(':')[0]:null;
  var rows=all.filter(function(r){return generation?String(r[1]).split(':')[0]===generation:!String(r[1]).includes(':');});
  rows.sort(function(a,b){return Number(String(a[1]).split(':').pop())-Number(String(b[1]).split(':').pop());});
  var json=rows.map(function(r){var v=String(r[2]);return v.startsWith('json:')?v.slice(5):v;}).join('');
  try{return {sheets:JSON.parse(json),updated_at:String(rows[0][3]||'')};}catch(e){throw new Error('Salinan lembar kerja tidak lengkap. Pulihkan backup JSON atau sinkronkan ulang dari browser staf.');}
}
function workbookForStaff_(id){var data=worksheetsForUser_(String(id)),ss=db_(),u=editStaff_(id);data.sheets=data.sheets.map(function(original){var sh=JSON.parse(JSON.stringify(original)),name=tabName_(u,sh.name),native=worksheetTab_(ss,u,sh.name,false);sh.google_sheet_name=native?native.getName():name;sh.source=native?'google-sheet':'saved-state';if(!native)return sh;
 var nr=Math.max(1,native.getLastRow()),nc=Math.max(1,native.getLastColumn());if(nr>10000||nc>200||nr*nc>GM.maxCells)throw new Error('Lembar kerja melebihi batas tampilan 200000 sel.');var range=native.getRange(1,1,nr,nc),values=range.getValues(),display=range.getDisplayValues(),formulas=range.getFormulas();
 var old=new Map();(sh.celldata||[]).forEach(function(c){old.set(c.r+':'+c.c,c.v);});sh.data=values.map(function(line,r){return line.map(function(v,c){var prior=sh.data&&sh.data[r]&&sh.data[r][c]||old.get(r+':'+c)||{},cell=typeof prior==='object'?Object.assign({},prior):{};cell.v=v instanceof Date?v.toISOString():v;cell.m=display[r][c];if(formulas[r][c])cell.f=formulas[r][c];else delete cell.f;return cell;});});sh.celldata=[];return sh;});return data;}
function getStaffWorksheetsFromGAS(token){var u=auth_(token);return locked_(function(){var data=editWorkbook_(u.user_id);data.success=true;return data;});}
function getAdminStaffWorksheet(id,token){auth_(token,true);return locked_(function(){var data=editWorkbook_(String(id));data.success=true;data.monitoring_version=2;data.fetched_at=Date.now();return data;});}
function heartbeatStaff(data,token) {
  var u=auth_(token),today=stamp_().slice(0,10),now=Date.now();
  if(u.role!=='Staf')return {success:true};
  var result=locked_(function(){var info=sessionInfo_(token);var idle=Number(data&&data.idle_ms);if(info&&Number.isFinite(idle)&&idle>=0&&idle<GM.idleMilliseconds){var activity=now-idle;if(activity>sessionActivity_(info))sessionStore_().getRange(info.index,4).setValue(activity);}if(info)timeHeartbeat_(info,now,sessionActivity_(sessionInfo_(token)));var s=sheet_(db_(),'Staff_Presence',['User ID','Tanggal','Detik Aktif','Terakhir Terlihat','Perangkat','Sel Aktif']),rows=s.getDataRange().getValues(),idx=rows.findIndex(function(r){return r[0]===u.user_id;}),old=idx>0?rows[idx]:null;
    var seconds=old&&old[1]===today?Number(old[2])||0:0;
    var delta=old&&old[1]===today?Math.min(35,Math.max(0,Math.floor((now-Number(old[3]))/1000))):0;
    if(data&&data.active===true&&old&&now-Number(old[3])<70000)seconds+=delta;
    s.getRange(idx>0?idx+1:s.getLastRow()+1,1,1,6).setValues([[u.user_id,today,seconds,now,literal_(String(data&&data.device||'Browser').slice(0,300)),literal_(String(data&&data.cell||'').slice(0,30))]]);
    return {success:true,timer_seconds:seconds,monitoring_version:2};
  });
  if(data&&data.broadcast===true)result.broadcast=broadcastState_(u,broadcastReadSheets_());return result;
}
function getReportDataFromGAS(start,end,staffId,token) {
  auth_(token,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw new Error('Periode tanggal laporan tidak valid.');
  var keys=['log_id','timestamp','user_id','nama_staf','nip','cell','prev_val','new_val','ip','device','method'];
  var rows=db_().getSheetByName('Audit_Logs').getDataRange().getDisplayValues().slice(1).filter(function(r){var date=r[1].slice(0,10);return date>=start&&date<=end&&(staffId==='ALL'||r[2]===staffId);});
  if(rows.length>25000)throw new Error('Periode terlalu besar (lebih dari 25000 log). Persempit tanggal laporan.');
  return {success:true,logs:rows.reverse().map(auditObject_)};
}
function getSupervisorNotes(id,token) {
  var actor=auth_(token);if(actor.role!=='Admin'&&actor.user_id!==String(id))throw new Error('Akses catatan ditolak.');
  var s=db_().getSheetByName('Supervisor_Notes');return {success:true,notes:s?s.getDataRange().getDisplayValues().slice(1).filter(function(r){return r[4]===String(id);}).slice(-100).reverse().map(function(r){return {id:r[0],time:r[1],admin:r[3],text:r[5]};}):[]};
}
function saveSupervisorNote(id,text,token) {
  var actor=auth_(token,true);text=String(text||'').trim();if(!text||text.length>10000)throw new Error('Catatan kosong atau lebih dari 10000 karakter.');
  if(!allUsers_().some(function(r){return r[0]===String(id)&&r[6]==='Staf';}))throw new Error('Staf tidak ditemukan.');
  return locked_(function(){sheet_(db_(),'Supervisor_Notes',['Note ID','Waktu','Admin ID','Admin Nama','Staf ID','Catatan']).appendRow(['NOTE-'+Utilities.getUuid(),stamp_(),actor.user_id,actor.nama,String(id),literal_(text)]);return {success:true};});
}
/** Jalankan hanya dari editor jika perlu mereset password akun. */
function resetUserPassword_() {
  var p=PropertiesService.getScriptProperties();
  var name=p.getProperty('RESET_USERNAME')||'admin_banyuasin';
  var pw=p.getProperty('RESET_PASSWORD')||'Admin@Banyuasin2026!';
  if(pw.length<10)throw new Error('Password minimal 10 karakter.');
  return locked_(function(){
    var s=db_().getSheetByName('Users'),rows=s.getDataRange().getValues(),idx=rows.findIndex(function(r){return String(r[1])===name;});
    if(idx<1)throw new Error('Username '+name+' tidak ditemukan.');
    s.getRange(idx+1,3).setValue(hashPassword_(pw));
    p.deleteProperty('RESET_USERNAME');
    p.deleteProperty('RESET_PASSWORD');
    Logger.log('Password berhasil direset untuk '+name+' menjadi: '+pw);
    return {success:true,username:name,password:pw};
  });
}
/** Pemeriksaan dari editor; tidak mencetak hash password atau token. */
function checkInstallation_() {
  var ss=db_(),required=['Users','Audit_Logs','Chat_Logs','Worksheets_State','Sessions','Staff_Presence','Supervisor_Notes'];
  required.forEach(function(name){if(!ss.getSheetByName(name))throw new Error('Sheet '+name+' belum ada. Jalankan fungsi setupDatabase.');});
  // Mode API tidak memerlukan Index.html. Tampilan dikelola di Sites.
  var result={success:true,database_url:ss.getUrl(),users:allUsers_().length,api_ready:true,favicon_ready:!!PropertiesService.getScriptProperties().getProperty('FAVICON_URL')};Logger.log(JSON.stringify(result));return result;
}

function getGovAzanConfig(token) {
  auth_(token);var p=PropertiesService.getScriptProperties();
  return {success:true,standard:p.getProperty('AZAN_STANDARD_URL')||'',subuh:p.getProperty('AZAN_SUBUH_URL')||''};
}
function getGovAzanSchedule(latitude,longitude,timezone,date,token) {
  auth_(token);latitude=Number(latitude);longitude=Number(longitude);
  if(!isFinite(latitude)||!isFinite(longitude)||latitude< -12||latitude>8||longitude<90||longitude>142)throw new Error('Koordinat lokasi Indonesia tidak valid.');
  if(!['Asia/Jakarta','Asia/Makassar','Asia/Jayapura'].includes(timezone))throw new Error('Zona waktu tidak didukung.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))throw new Error('Tanggal jadwal tidak valid.');
  var parsed=new Date(date+'T00:00:00Z');if(isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||Math.abs(parsed.getTime()-Date.now())>370*86400000)throw new Error('Pilih tanggal dalam rentang satu tahun.');
  var cache=CacheService.getScriptCache(),key='govazan:'+date+':'+latitude.toFixed(4)+':'+longitude.toFixed(4)+':'+timezone;
  var found=cache.get(key);if(found){var saved=JSON.parse(found);saved.cached=true;return saved;}
  var parts=date.split('-'),apiDate=parts[2]+'-'+parts[1]+'-'+parts[0];
  var url='https://api.aladhan.com/v1/timings/'+apiDate+'?latitude='+latitude+'&longitude='+longitude+'&method=20&timezonestring='+encodeURIComponent(timezone);
  var r=UrlFetchApp.fetch(url,{muteHttpExceptions:true});if(r.getResponseCode()!==200)throw new Error('Jadwal belum tersedia (HTTP '+r.getResponseCode()+').');
  var json=JSON.parse(r.getContentText()),d=json.data,keys=['Fajr','Dhuhr','Asr','Maghrib','Isha'],times={};
  if(json.code!==200||!d||d.date.gregorian.date!==apiDate||d.meta.timezone!==timezone||Number(d.meta.method.id)!==20)throw new Error('Sumber mengembalikan tanggal atau metode yang berbeda.');
  keys.forEach(function(k){var m=String(d.timings[k]||'').match(/^(\d{2}):(\d{2})/);if(!m||Number(m[1])>23||Number(m[2])>59)throw new Error('Waktu salat dari sumber tidak valid.');times[k]=m[1]+':'+m[2];});
  var result={success:true,date:date,timezone:timezone,times:times,source:'Aladhan — perhitungan metode Kemenag (20)',updated_at:new Date().toISOString(),cached:false};
  cache.put(key,JSON.stringify(result),21600);return result;
}

/** Tambahan API GovMonitor v1. Gabungkan dengan backend GovMonitor asli. */
function gmApiJSON_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function gmApiHealth_() {
  var ready=false;
  try {
    var ss=db_(), p=PropertiesService.getScriptProperties();
    ready=!!p.getProperty('PASSWORD_SECRET')&&ss.getSheetByName('Users').getLastRow()>1&&['Audit_Logs','Chat_Logs','Worksheets_State','Sessions','Staff_Presence','Supervisor_Notes'].every(function(n){return !!ss.getSheetByName(n);});
  } catch(e) {}
  return {success:true,protocol:'govmonitor-sites-api-v1',database_ready:ready,monitoring_version:2,editing_version:1,activity_time_version:1,system_logs_version:1,broadcast_version:1,package_version:GM_NEW_VERSION,native_ui:true,report_archive_version:1};
}
function doPost(e) {
  try {
    var raw=e&&e.postData&&e.postData.contents;
    if(!raw||raw.length>8000000)throw new Error('Permintaan kosong atau terlalu besar.');
    var body=JSON.parse(raw);
    if(body.protocol!=='govmonitor-sites-api-v1'||!Array.isArray(body.args))throw new Error('Protokol API tidak cocok.');
    if(body.method==='ping')return gmApiJSON_(gmApiHealth_());
    var methods={
      getRuntimeConfigGAS:[getRuntimeConfigGAS,0],getOCRConfigGAS:[getOCRConfigGAS,1],saveOCRConfigGAS:[saveOCRConfigGAS,2],testOCRConfigGAS:[testOCRConfigGAS,1],getEnvironmentFromGAS:[getEnvironmentFromGAS,2],getClientAuditContext:[getClientAuditContext,2],reportArchiveGAS:[reportArchiveGAS,2],getLatestBroadcastGAS:[getLatestBroadcastGAS,1],saveBroadcastAnnouncementGAS:[saveBroadcastAnnouncementGAS,2],acknowledgeBroadcastGAS:[acknowledgeBroadcastGAS,2],cancelBroadcastAnnouncementGAS:[cancelBroadcastAnnouncementGAS,2],recordDailyAttendanceGAS:[recordDailyAttendanceGAS,1],getDailyAttendanceHistoryGAS:[getDailyAttendanceHistoryGAS,2],
      requestAdminWorksheetEdit:[requestAdminWorksheetEdit,2],getAdminWorksheetEdit:[getAdminWorksheetEdit,2],saveAdminStaffWorksheet:[saveAdminStaffWorksheet,2],finishAdminWorksheetEdit:[finishAdminWorksheetEdit,2],respondStaffWorksheetEdit:[respondStaffWorksheetEdit,2],getStaffEditStatus:[getStaffEditStatus,1],endStaffSession:[endStaffSession,2],authenticateUser:[authenticateUser,2],validateSession:[validateSession,1],logoutSession:[logoutSession,1],
      getUsersFromGAS:[getUsersFromGAS,1],saveUserToGAS:[saveUserToGAS,2],deleteUserFromGAS:[deleteUserFromGAS,2],
      getStaffWorksheetsFromGAS:[getStaffWorksheetsFromGAS,1],getAdminStaffWorksheet:[getAdminStaffWorksheet,2],
      syncFullSheetToGAS:[syncFullSheetToGAS,2],saveWorksheetCellToGAS:[saveWorksheetCellToGAS,2],
      saveAuditLogToGAS:[saveAuditLogToGAS,2],getAuditLogsFromGAS:[getAuditLogsFromGAS,1],getReportDataFromGAS:[getReportDataFromGAS,4],
      getActivityTimeData:[getActivityTimeData,2],heartbeatStaff:[heartbeatStaff,2],saveChatMessageToGAS:[saveChatMessageToGAS,2],getChatLogsFromGAS:[getChatLogsFromGAS,1],markChatAsReadGAS:[markChatAsReadGAS,3],
      saveSupervisorNote:[saveSupervisorNote,3],getSupervisorNotes:[getSupervisorNotes,2],
      getGovAzanConfig:[getGovAzanConfig,1],getGovAzanSchedule:[getGovAzanSchedule,5],processGovLensOCR:[processGovLensOCR,2]
    };
    if(!Object.prototype.hasOwnProperty.call(methods,body.method))throw new Error('Fungsi API tidak diizinkan.');
    var spec=methods[body.method];
    if(body.args.length!==spec[1])throw new Error('Jumlah parameter API tidak cocok.');
    // Semua fungsi data asli memverifikasi sesi, peran, dan izin pengguna.
    return gmApiJSON_(spec[0].apply(null,body.args));
  } catch(err) { return gmApiJSON_({success:false,error:String(err.message||err)}); }
}

/** Pengambilalihan lembar kerja v1: semua perubahan diverifikasi di server. */
function upgradeWorksheetEditing_(){return locked_(function(){sessionStore_();editTable_();sheet_(db_(),'Admin_Worksheet_Audit',['Log ID','Waktu','Admin ID','Admin Nama','Staf ID','Staf Nama','Tab','Sel','Nilai Lama','Nilai Baru','Tindakan','Status']);sheet_(db_(),'Admin_Workbook_Backups',['Request ID','Staf ID','Chunk','JSON','Waktu']);return {success:true,editing_version:1};});}
function editTable_(){return sheet_(db_(),'Worksheet_Edit_Locks',['Staf ID','JSON']);}
function editRaw_(id){var s=editTable_(),rows=s.getDataRange().getValues();for(var i=1;i<rows.length;i++)if(String(rows[i][0])===String(id))return {index:i+1,value:JSON.parse(String(rows[i][1]))};return null;}
function editPut_(id,value){timePause_(id,value);var old=editRaw_(id);if(old)editTable_().getRange(old.index,2).setValue(JSON.stringify(value));else editTable_().appendRow([String(id),JSON.stringify(value)]);}
function editDelete_(id){timePause_(id,null);var old=editRaw_(id);if(old)editTable_().deleteRow(old.index);}
function editLock_(id){var old=editRaw_(id);if(!old)return null;var l=old.value,now=Date.now(),admin=sessionInfoByHash_(l.admin_session);
 if(now>=l.expires||!admin||Number(admin.row[2])<=now){editDelete_(id);return null;}
 if(l.state==='pending'){var fresh=sessionStore_().getDataRange().getValues().slice(1).filter(function(r){return String(r[1])===String(id)&&Number(r[2])>now&&now-sessionActivity_({row:r})<GM.idleMilliseconds;}).map(function(r){return r[0];});fresh.forEach(function(hash){if(!l.acknowledged.includes(hash)&&!l.waiting.includes(hash))l.waiting.push(hash);});l.waiting=l.waiting.filter(function(hash){var s=sessionInfoByHash_(hash);return s&&Number(s.row[2])>now&&now-sessionActivity_(s)<GM.idleMilliseconds;});if(!l.waiting.length){l.state='active';l.expires=now+90000;}editPut_(id,l);}
 return l;
}
function editPublic_(l){return l?{request_id:l.request_id,state:l.state,admin_name:l.admin_name,expires:l.expires,waiting_count:l.waiting.length}:null;}
function editStaff_(id){var r=allUsers_().find(function(r){return String(r[0])===String(id)&&r[6]==='Staf'&&r[7]==='Aktif';});if(!r)throw new Error('Staf aktif tidak ditemukan.');return user_(r);}
function editOwned_(data,actor,token){var l=editLock_(data&&data.staff_id);if(!l||l.request_id!==data.request_id||l.admin_id!==actor.user_id||l.admin_session!==digest_(token))throw new Error('Kendali editor berakhir atau dimiliki admin lain.');return l;}
function editCanonical_(value){if(Array.isArray(value))return value.map(editCanonical_);if(value&&typeof value==='object'){var o={};Object.keys(value).sort().forEach(function(k){if(value[k]!==undefined)o[k]=editCanonical_(value[k]);});return o;}return value;}
function editSemanticCell_(v){if(v===undefined||v===null||v==='')return {v:''};if(typeof v!=='object')return {v:v};var o={};if(v.f)o.f=v.f;else o.v=v.v??'';['bg','fc','bl','it','un','ff','fs','ht','vt','tb','tr','ct','mc'].forEach(function(k){if(v[k]!==undefined)o[k]=v[k];});return editCanonical_(o);}
function editRevision_(sheets){return digest_(JSON.stringify(sheets.map(function(sh){return {name:sh.name,config:editCanonical_(sh.config||{}),cells:[...editCellMap_([sh])].sort(function(a,b){return a[0].localeCompare(b[0]);}).map(function(pair){return [pair[0],editSemanticCell_(pair[1])];})};})));}
function editWorkbook_(id){var d=workbookForStaff_(String(id));d.revision=editRevision_(d.sheets);d.editing_version=1;return d;}
function editVerifyStaff_(u,token,p){var l=editLock_(u.user_id);if(l&&(l.state==='active'||l.acknowledged.includes(digest_(token))))throw new Error('Lembar kerja sedang diperbarui admin. Simpan salinan lokal dan muat versi terbaru setelah kendali dikembalikan.');var current=editWorkbook_(u.user_id);if(!p||!p.expected_revision||p.expected_revision!==current.revision)throw new Error('Versi lembar kerja berubah. Muat data terbaru dan periksa konflik sebelum menyimpan.');return current;}
function requestAdminWorksheetEdit(id,token){var actor=auth_(token,true);return locked_(function(){var staff=editStaff_(id),existing=editLock_(staff.user_id);if(existing){if(existing.admin_session!==digest_(token))throw new Error('Lembar kerja sedang diminta atau diedit admin lain.');return {success:true,lock:editPublic_(existing),editing_version:1};}
 var now=Date.now(),waiting=sessionStore_().getDataRange().getValues().slice(1).filter(function(r){return String(r[1])===staff.user_id&&Number(r[2])>now&&now-sessionActivity_({row:r})<GM.idleMilliseconds;}).map(function(r){return r[0];});
 var l={request_id:Utilities.getUuid(),staff_id:staff.user_id,admin_id:actor.user_id,admin_name:actor.nama,admin_session:digest_(token),state:waiting.length?'pending':'active',waiting:waiting,acknowledged:[],requested_at:now,expires:now+(waiting.length?600000:90000)};editPut_(staff.user_id,l);return {success:true,lock:editPublic_(l),editing_version:1};});}
function getAdminWorksheetEdit(data,token){var actor=auth_(token,true);return locked_(function(){var l=editOwned_(data,actor,token);if(l.state==='active'){l.expires=Date.now()+90000;editPut_(data.staff_id,l);}return {success:true,lock:editPublic_(l),workbook:l.state==='active'&&data.include_workbook!==false?editWorkbook_(String(data.staff_id)):null,editing_version:1};});}
function respondStaffWorksheetEdit(data,token){var u=auth_(token);if(u.role!=='Staf')throw new Error('Akses staf diperlukan.');return locked_(function(){var l=editLock_(u.user_id),hash=digest_(token);if(!l||l.request_id!==data.request_id)throw new Error('Permintaan kendali sudah berakhir.');if(l.acknowledged.includes(hash)&&data.decision==='accept')return {success:true,lock:editPublic_(l)};if(l.state!=='pending'||!l.waiting.includes(hash)||l.acknowledged.includes(hash))throw new Error('Permintaan tidak dapat diubah setelah kendali diserahkan.');if(data.decision==='reject'){editDelete_(u.user_id);return {success:true,lock:null};}if(data.decision!=='accept'||(!l.waiting.includes(hash)&&!l.acknowledged.includes(hash)))throw new Error('Akses penyerahan kendali ditolak.');l.waiting=l.waiting.filter(function(h){return h!==hash;});if(!l.acknowledged.includes(hash))l.acknowledged.push(hash);if(!l.waiting.length){l.state='active';l.expires=Date.now()+90000;}editPut_(u.user_id,l);return {success:true,lock:editPublic_(l)};});}
function getStaffEditStatus(token){var u=auth_(token);return locked_(function(){var l=editLock_(u.user_id);return {success:true,lock:editPublic_(l),acknowledged:!!l&&l.acknowledged.includes(digest_(token)),revision:editWorkbook_(u.user_id).revision,editing_version:1};});}
function editCellMap_(sheets){var out=new Map();sheets.forEach(function(sh){var put=function(r,c,v){if(v!==null&&v!==undefined&&v!=='')out.set(sh.name+'\u0001'+r+'\u0001'+c,v);};if(sh.data&&sh.data.length)sh.data.forEach(function(row,r){(row||[]).forEach(function(v,c){put(r,c,v);});});else(sh.celldata||[]).forEach(function(x){put(x.r,x.c,x.v);});});return out;}
function editCellSummary_(v){return JSON.stringify(editSemanticCell_(v));}
function editChanges_(before,after,actor,staff,batch){var a=editCellMap_(before),b=editCellMap_(after),keys=new Set([...a.keys(),...b.keys()]),rows=[];keys.forEach(function(k){if(editCellSummary_(a.get(k))===editCellSummary_(b.get(k)))return;var parts=k.split('\u0001'),r=Number(parts[1]),c=Number(parts[2]),col='';for(var n=c+1;n>0;n=Math.floor((n-1)/26))col=String.fromCharCode(65+(n-1)%26)+col;rows.push([batch+'-'+rows.length,stamp_(),actor.user_id,literal_(actor.nama),staff.user_id,literal_(staff.nama),literal_(parts[0]),col+(r+1),literal_(editCellSummary_(a.get(k)).slice(0,4000)),literal_(editCellSummary_(b.get(k)).slice(0,4000)),'Edit admin','Menunggu hasil']);});
 if(JSON.stringify(before.map(function(s){return {name:s.name,config:s.config};}))!==JSON.stringify(after.map(function(s){return {name:s.name,config:s.config};})))rows.push([batch+'-structure',stamp_(),actor.user_id,literal_(actor.nama),staff.user_id,literal_(staff.nama),'Workbook','-',literal_(before.map(function(s){return s.name;}).join(', ')),literal_(after.map(function(s){return s.name;}).join(', ')),'Susunan atau format tab','Menunggu hasil']);if(rows.length>5000)throw new Error('Maksimal 5000 perubahan sel per penyimpanan admin. Simpan bertahap.');return rows;}
function writeWorkbook_(u,prep){var ss=db_();prep.tabs.forEach(function(t){var s=worksheetTab_(ss,u,t.name,true);ensureGrid_(s,t.nr,t.nc);s.clearContents();s.getRange(1,1,t.nr,t.nc).setValues(t.grid);});var state=ss.getSheetByName('Worksheets_State'),rows=state.getDataRange().getValues(),generation=Utilities.getUuid(),chunks=[];for(var start=0;start<prep.json.length;){var end=Math.min(start+35000,prep.json.length);if(end<prep.json.length&&/[\uD800-\uDBFF]/.test(prep.json.charAt(end-1)))end--;chunks.push([u.user_id,generation+':'+chunks.length,'json:'+prep.json.slice(start,end),stamp_()]);start=end;}state.getRange(state.getLastRow()+1,1,chunks.length,4).setValues(chunks);for(var i=rows.length-1;i>=1;i--)if(String(rows[i][0])===u.user_id)state.deleteRow(i+1);SpreadsheetApp.flush();}
function saveAdminStaffWorksheet(data,token){var actor=auth_(token,true),prep=prepareWorksheets_(data&&data.sheets_data);return locked_(function(){var l=editOwned_(data,actor,token);if(l.state!=='active')throw new Error('Menunggu staf menyimpan dan menyerahkan kendali.');var staff=editStaff_(data.staff_id),current=editWorkbook_(staff.user_id);if(!data.expected_revision||data.expected_revision!==current.revision)throw new Error('Versi lembar kerja berubah. Muat ulang sebelum menyimpan.');
 var batch=Utilities.getUuid(),audit=sheet_(db_(),'Admin_Worksheet_Audit',['Log ID','Waktu','Admin ID','Admin Nama','Staf ID','Staf Nama','Tab','Sel','Nilai Lama','Nilai Baru','Tindakan','Status']),changes=editChanges_(current.sheets,data.sheets_data,actor,staff,batch),index=audit.getLastRow()+1;
 var backup=sheet_(db_(),'Admin_Workbook_Backups',['Request ID','Staf ID','Chunk','JSON','Waktu']),json=JSON.stringify(current.sheets);for(var at=0,chunk=0;at<json.length;chunk++){var end=Math.min(at+30000,json.length);if(end<json.length&&/[\uD800-\uDBFF]/.test(json.charAt(end-1)))end--;backup.appendRow([batch,staff.user_id,chunk,'json:'+json.slice(at,end),stamp_()]);at=end;}
 if(changes.length)audit.getRange(index,1,changes.length,12).setValues(changes);
 try{writeWorkbook_(staff,prep);if(changes.length)audit.getRange(index,12,changes.length,1).setValues(changes.map(function(){return ['Tersimpan'];}));}catch(e){if(changes.length)audit.getRange(index,12,changes.length,1).setValues(changes.map(function(){return ['Penyimpanan gagal; periksa backup'];}));throw e;}
 l.expires=Date.now()+90000;editPut_(staff.user_id,l);var updated=editWorkbook_(staff.user_id);return {success:true,revision:updated.revision,updated_at:updated.updated_at,changes:changes.length};});}
function finishAdminWorksheetEdit(data,token){var actor=auth_(token,true);return locked_(function(){editOwned_(data,actor,token);editDelete_(data.staff_id);return {success:true};});}

// Referensi saja: seluruh fungsi ini juga digabung dalam Code.gs. Pasang hanya Code.gs.
function timeTables_(){var ss=db_();return {state:sheet_(ss,'Staff_Time_State',['Session Hash','User ID','JSON']),intervals:sheet_(ss,'Staff_Work_Intervals',['Session Hash','User ID','Mulai','Selesai','Jenis']),events:sheet_(ss,'Staff_Activity_Events',['Event ID','Waktu','User ID','Jenis','Keterangan'])};}
function timeEvent_(hash,id,type,at,detail){var s=timeTables_().events,key=digest_(hash+':'+type+':'+at);if(!s.getDataRange().getValues().slice(1).some(function(r){return r[0]===key;}))s.appendRow([key,at,String(id),type,literal_(detail||'')]);}
function timeState_(hash){var s=timeTables_().state,rows=s.getDataRange().getValues();for(var i=1;i<rows.length;i++)if(rows[i][0]===hash)return {index:i+1,value:JSON.parse(rows[i][2])};return null;}
function timePut_(hash,id,value){var old=timeState_(hash),s=timeTables_().state;s.getRange(old?old.index:s.getLastRow()+1,1,1,3).setValues([[hash,String(id),JSON.stringify(value)]]);}
function timeInit_(info,at,login){var hash=info.row[0];if(timeState_(hash))return;var l=editRaw_(String(info.row[1])),pause=l&&l.value.expires>at&&(l.value.state==='active'||l.value.acknowledged.includes(hash))?l.value.expires:0;timePut_(hash,info.row[1],{cursor:at,activity:sessionActivity_(info),pause:pause,mode:pause?'admin':'active'});if(login)timeEvent_(hash,info.row[1],'login',at,'Masuk dan membuka sesi kerja');}
function timeSegments_(state,to){var out=[],cursor=state.cursor;if(to<=cursor)return out;var paused=Math.min(to,Number(state.pause)||0);if(paused>cursor){out.push([cursor,paused,'admin']);cursor=paused;}var activeEnd=Math.min(to,state.activity+120000);if(activeEnd>cursor){out.push([cursor,activeEnd,'active']);cursor=activeEnd;}if(to>cursor)out.push([cursor,to,'idle']);return out;}
function timeAppend_(hash,id,start,end,kind){if(end<=start)return;var s=timeTables_().intervals,rows=s.getDataRange().getValues();for(var i=rows.length-1;i>=1;i--)if(rows[i][0]===hash){if(rows[i][4]===kind&&Number(rows[i][3])===start){s.getRange(i+1,4).setValue(end);return;}break;}s.appendRow([hash,String(id),start,end,kind]);}
function timeAccount_(info,to){var old=timeState_(info.row[0]);if(!old)return;var state=old.value,end=Math.min(to,Number(info.row[2]),sessionActivity_(info)+GM.idleMilliseconds);if(state.pause>state.cursor&&state.pause<=end)timeEvent_(info.row[0],info.row[1],'release',state.pause,'Batas kendali admin berakhir');timeSegments_(state,end).forEach(function(p){if(p[2]!==state.mode){timeEvent_(info.row[0],info.row[1],p[2],p[0],p[2]==='idle'?'Tidak ada aktivitas selama dua menit':p[2]==='admin'?'Kendali diserahkan kepada admin':'Melanjutkan aktivitas');state.mode=p[2];}timeAppend_(info.row[0],info.row[1],p[0],p[1],p[2]);});state.cursor=Math.max(state.cursor,end);timePut_(info.row[0],info.row[1],state);}
function timeHeartbeat_(info,at,activity){timeInit_(info,at,false);timeAccount_(info,at);var state=timeState_(info.row[0]).value;state.activity=Math.max(state.activity,activity);var mode=state.pause>at?'admin':at-state.activity<120000?'active':'idle';if(mode!==state.mode){timeEvent_(info.row[0],info.row[1],mode,at,mode==='active'?'Melanjutkan aktivitas':mode==='idle'?'Tidak aktif':'Kendali admin');state.mode=mode;}timePut_(info.row[0],info.row[1],state);}
function timePause_(id,lock){var now=Date.now();sessionStore_().getDataRange().getValues().slice(1).filter(function(r){return String(r[1])===String(id)&&Number(r[2])>now;}).forEach(function(r){var info={row:r};timeInit_(info,now,false);timeAccount_(info,now);var state=timeState_(r[0]).value,paused=!!lock&&(lock.state==='active'||lock.acknowledged.includes(r[0]));var until=paused?lock.expires:0;if(paused&&state.pause<=now)timeEvent_(r[0],id,'admin',now,'Kendali diserahkan kepada '+lock.admin_name);if(!paused&&state.pause>now)timeEvent_(r[0],id,'release',now,'Kendali dikembalikan kepada staf');state.pause=until;state.mode=paused?'admin':now-state.activity<120000?'active':'idle';timePut_(r[0],id,state);});}
function upgradeActivityTime_(){return locked_(function(){timeTables_();var now=Date.now(),roles={};allUsers_().forEach(function(r){roles[r[0]]=r[6];});sessionStore_().getDataRange().getValues().slice(1).filter(function(r){return roles[r[1]]==='Staf';}).forEach(function(r){timeInit_({row:r},now,false);});return {success:true,activity_time_version:1};});}
function timeWindow_(start,end){if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw new Error('Pilih tanggal awal dan akhir yang valid.');var a=Date.parse(start+'T00:00:00+07:00'),b=Date.parse(end+'T00:00:00+07:00');if(!Number.isFinite(a)||!Number.isFinite(b)||new Date(a+25200000).toISOString().slice(0,10)!==start||new Date(b+25200000).toISOString().slice(0,10)!==end||b-a>30*86400000)throw new Error('Rentang maksimal 31 hari dan tanggal harus valid.');return {start:a,end:b+86400000};}
// Prioritas kendali admin, aktif, tidak aktif, lalu belum terukur; setiap detik dihitung sekali.
function timeUnion_(ranges,start,end){var points=[],ranks={unknown:0,idle:1,active:2,admin:3};ranges.forEach(function(r){var a=Math.max(start,r[0]),b=Math.min(end,r[1]);if(b>a){points.push([a,ranks[r[2]],1]);points.push([b,ranks[r[2]],-1]);}});points.sort(function(a,b){return a[0]-b[0];});var counts=[0,0,0,0],total=[0,0,0,0],last=start;points.forEach(function(p){for(var i=3;i>=0;i--)if(counts[i]>0){total[i]+=p[0]-last;break;}counts[p[1]]+=p[2];last=p[0];});return {unknown_ms:total[0],idle_ms:total[1],active_ms:total[2],admin_ms:total[3],total_ms:total.reduce(function(a,b){return a+b;},0)};}
function timeAuditMillis_(value){if(value instanceof Date)return value.getTime();var s=String(value||'').replace(' ','T');if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s))s+='+07:00';return Date.parse(s);}
function getActivityTimeData(data,token){auth_(token,true);var w=timeWindow_(String(data&&data.start||''),String(data&&data.end||'')),wanted=String(data&&data.staff_id||'ALL');return locked_(function(){sweepSessions_();var now=Date.now(),t=timeTables_(),users=allUsers_().map(user_).filter(function(u){return u.role==='Staf'&&(wanted==='ALL'||wanted===u.user_id);}),sessions=sessionStore_().getDataRange().getValues().slice(1),closed=sheet_(db_(),'Staff_Session_Logs',['Session Hash','User ID','Login At','Exit At','Reason','Save Status']).getDataRange().getValues().slice(1),names={};users.forEach(function(u){names[u.user_id]=u.nama;});sessions.filter(function(r){return names[r[1]];}).forEach(function(r){timeAccount_({row:r},now);});var intervals=t.intervals.getDataRange().getValues().slice(1),states=t.state.getDataRange().getValues().slice(1),events=t.events.getDataRange().getValues().slice(1),audit=db_().getSheetByName('Audit_Logs');
 var timeline=events.filter(function(r){return names[r[2]]&&Number(r[1])>=w.start&&Number(r[1])<w.end;}).map(function(r){return {id:r[0],at:Number(r[1]),user_id:r[2],name:names[r[2]],type:r[3],detail:String(r[4])};});
 sessions.forEach(function(r){var at=Number(r[4])||Number(r[2])-GM.sessionSeconds*1000,key=digest_(r[0]+':login:'+at);if(names[r[1]]&&at>=w.start&&at<w.end&&!timeline.some(function(e){return e.id===key;}))timeline.push({id:key,at:at,user_id:r[1],name:names[r[1]],type:'login',detail:'Masuk ke sesi kerja'});});
 closed.forEach(function(r){if(!names[r[1]])return;[[Number(r[2]),'login','Masuk ke sesi kerja'],[Number(r[3]),'logout',r[4]==='idle'?'Keluar otomatis: tidak aktif lima menit':r[4]==='expired'?'Batas sesi berakhir':'Keluar manual']].forEach(function(e){if(e[0]>=w.start&&e[0]<w.end&&!timeline.some(function(v){return v.id===digest_(r[0]+':'+e[1]+':'+e[0]);}))timeline.push({id:digest_(r[0]+':'+e[1]+':'+e[0]),at:e[0],user_id:r[1],name:names[r[1]],type:e[1],detail:e[2]});});});
 if(audit)audit.getDataRange().getValues().slice(1).forEach(function(r){var at=timeAuditMillis_(r[1]);if(names[r[2]]&&at>=w.start&&at<w.end)timeline.push({id:r[0],at:at,user_id:r[2],name:names[r[2]],type:r[10]==='Speech-to-Text'?'dictation':r[10]==='GovLens OCR'?'ocr':'edit',detail:'Tersimpan · '+String(r[5])+' · '+String(r[7]).slice(0,240)});});
 var staff=users.map(function(u){var live=sessions.filter(function(r){return String(r[1])===u.user_id;}),ranges=[],future=[];closed.filter(function(r){return String(r[1])===u.user_id;}).forEach(function(r){ranges.push([Number(r[2]),Number(r[3]),'unknown']);});live.forEach(function(r){var stop=Math.min(Number(r[2]),sessionActivity_({row:r})+GM.idleMilliseconds),begin=Number(r[4])||Number(r[2])-GM.sessionSeconds*1000;ranges.push([begin,Math.min(now,stop),'unknown']);var found=states.find(function(s){return s[0]===r[0];}),state=found?JSON.parse(found[2]):null;if(state)future.push.apply(future,timeSegments_(state,Math.min(stop,now+40000,w.end)));});intervals.filter(function(r){return String(r[1])===u.user_id;}).forEach(function(r){ranges.push([Number(r[2]),Number(r[3]),r[4]]);});var total=timeUnion_(ranges,w.start,Math.min(w.end,now)),last=closed.filter(function(r){return String(r[1])===u.user_id;}).sort(function(a,b){return b[3]-a[3];})[0],lastActivity=live.reduce(function(a,r){return Math.max(a,sessionActivity_({row:r}));},0),presence=db_().getSheetByName('Staff_Presence'),seen=presence&&presence.getDataRange().getValues().slice(1).find(function(r){return r[0]===u.user_id;}),paused=live.some(function(r){var s=states.find(function(s){return s[0]===r[0];});return s&&JSON.parse(s[2]).pause>now;});return {user_id:u.user_id,name:u.nama,nip:u.nip,totals:total,future:future,status:!live.length?'Keluar':paused?'Kendali Admin':!seen||now-Number(seen[3])>=70000?'Koneksi terputus':now-lastActivity>=120000?'Tidak Aktif':'Aktif',last_logout_at:last?Number(last[3]):0,logout_reason:last?last[4]:'',idle_exits:closed.filter(function(r){return String(r[1])===u.user_id&&r[4]==='idle'&&r[3]>=w.start&&r[3]<w.end;}).length};});timeline.sort(function(a,b){return b.at-a.at;});return {success:true,activity_time_version:1,server_now:now,window:w,staff:staff,events:timeline.slice(0,2000),event_count:timeline.length};});}

// Referensi; semua fungsi juga digabung dalam Code.gs. Jangan pasang file referensi ini terpisah.
function upgradeSystemLogs_(){return locked_(function(){var key=PropertiesService.getScriptProperties().getProperty('AUDIT_CONTEXT_SECRET');if(!key||key.length<32)throw new Error('Jalankan installSystemLogs_ dari SetupLogSistem.gs paket terbaru.');var s=db_().getSheetByName('Audit_Logs');ensureGrid_(s,Math.max(2,s.getLastRow()),13);s.getRange(1,12,1,2).setValues([['Konteks Sistem JSON','Nama Lembar']]);return {success:true,system_logs_version:1};});}
function auditContext_(item,token){var key=PropertiesService.getScriptProperties().getProperty('AUDIT_CONTEXT_SECRET'),c=item&&item.audit_context;if(!key||!c||typeof c.json!=='string'||c.json.length>5000||!/^[0-9a-f]{64}$/.test(String(c.signature||'')))return null;var bytes=Utilities.computeHmacSha256Signature(String(token)+'.'+c.json,key),expected=bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join(''),difference=0;for(var i=0;i<64;i++)difference|=expected.charCodeAt(i)^c.signature.charCodeAt(i);if(difference)return null;try{var v=JSON.parse(c.json),now=Date.now(),at=timeAuditMillis_(item.timestamp);if(v.version!==1||!Number.isFinite(v.observed_at)||v.observed_at>now+60000||v.observed_at<now-370*86400000||!['observed','received'].includes(v.mode))return null;if(v.mode==='observed'&&(!Number.isFinite(at)||Math.abs(at-v.observed_at)>60000))return null;if(v.mode==='received'&&Math.abs(now-v.observed_at)>120000)return null;return v;}catch(e){return null;}}
function auditObject_(r){var keys=['log_id','timestamp','user_id','nama_staf','nip','cell','prev_val','new_val','ip','device','method'],o={};keys.forEach(function(k,i){o[k]=r[i]||'';});o.sheet_name=r[12]||'';try{o.system_context=r[11]?JSON.parse(r[11]):null;}catch(e){o.system_context=null;}return o;}

// Pengumuman dan absen harian. Waktu resmi menggunakan Asia/Jakarta.
function broadcastSheets_(ss) {
  ss=ss||db_();
  return {broadcasts:sheet_(ss,'Broadcasts',['Broadcast ID','Waktu WIB','Admin ID','Admin Nama','Kategori','Pesan','Dibuat ms','Berlaku hingga ms','Status']),reads:sheet_(ss,'BroadcastReads',['Broadcast ID','User ID','Nama','Waktu WIB','Dikonfirmasi ms']),attendance:sheet_(ss,'DailyAttendance',['Kunci','Tanggal WIB','User ID','Nama','NIP','Waktu WIB','Tercatat ms','Sumber'])};
}
function upgradeBroadcastDatabase(){var result=locked_(function(){var s=broadcastSheets_();s.attendance.getRange(1,1,s.attendance.getLastRow(),8).setNumberFormat('@');return {success:true,broadcast_version:1,attendance_revision:2,database_url:db_().getUrl()};});Logger.log(JSON.stringify(result));return result;}
function broadcastClock_(){var now=Date.now(),date=new Date(now);return {server_now:now,date:Utilities.formatDate(date,'Asia/Jakarta','yyyy-MM-dd'),time:Utilities.formatDate(date,'Asia/Jakarta','HH:mm:ss')};}
function broadcastObject_(r){return {id:String(r[0]),timestamp:String(r[1]),issuer_id:String(r[2]),issuer_name:String(r[3]),category:String(r[4]),message:String(r[5]),created_at:Number(r[6]),expires_at:Number(r[7]),status:String(r[8])};}
function attendanceDate_(r){
  var key=String(r[0]||'').match(/^(\d{4}-\d{2}-\d{2})\|/);
  if(key)return key[1];
  if(r[1] instanceof Date&&!isNaN(r[1].getTime()))return Utilities.formatDate(r[1],'Asia/Jakarta','yyyy-MM-dd');
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(r[1])))return String(r[1]);
  return Number(r[6])>0?Utilities.formatDate(new Date(Number(r[6])),'Asia/Jakarta','yyyy-MM-dd'):'';
}
function attendanceObject_(r){return {id:String(r[0]),date:attendanceDate_(r),user_id:String(r[2]),nama:String(r[3]),nip:String(r[4]),timestamp:Number(r[6])>0?Utilities.formatDate(new Date(Number(r[6])),'Asia/Jakarta','yyyy-MM-dd HH:mm:ss'):String(r[5]),at:Number(r[6])};}
function broadcastState_(u,s){
  var clock=broadcastClock_(),rows=s.broadcasts.getDataRange().getValues().slice(1).filter(function(r){return r[0];}),reads=s.reads.getDataRange().getValues().slice(1),attendance=s.attendance.getDataRange().getValues().slice(1),now=clock.server_now;
  rows.sort(function(a,b){return Number(b[6])-Number(a[6]);});
  var active=rows.find(function(r){return r[8]==='Aktif'&&Number(r[6])<=now&&Number(r[7])>now;}),announcement=active?broadcastObject_(active):null;
  if(announcement)announcement.acknowledged=reads.some(function(r){return String(r[0])===announcement.id&&String(r[1])===u.user_id;});
  var mine=attendance.find(function(r){return attendanceDate_(r)===clock.date&&String(r[2])===u.user_id;});
  var result={success:true,broadcast_version:1,server_now:now,date:clock.date,attendance_open:clock.time>='07:30:00',announcement:announcement,attendance:mine?attendanceObject_(mine):null};
  if(u.role==='Admin'){
    var staff=allUsers_().filter(function(r){return r[6]==='Staf'&&r[7]==='Aktif';}),ids=staff.map(function(r){return String(r[0]);});
    result.today_attendance=attendance.filter(function(r){return attendanceDate_(r)===clock.date;}).map(attendanceObject_);
    result.broadcasts=rows.slice(0,20).map(function(r){var a=broadcastObject_(r),ack=reads.filter(function(x){return String(x[0])===a.id;});a.readers=ack.map(function(x){return {user_id:String(x[1]),nama:String(x[2]),timestamp:String(x[3]),at:Number(x[4])};});a.staff_total=ids.length;a.staff_acknowledged=ack.filter(function(x){return ids.indexOf(String(x[1]))>=0;}).length;if(a.status==='Aktif'&&a.expires_at<=now)a.status='Berakhir';return a;});
  }
  return result;
}
function broadcastReadSheets_(){var ss=db_(),broadcasts=ss.getSheetByName('Broadcasts'),reads=ss.getSheetByName('BroadcastReads'),attendance=ss.getSheetByName('DailyAttendance');if(broadcasts&&reads&&attendance)return {broadcasts:broadcasts,reads:reads,attendance:attendance};return locked_(function(){return broadcastSheets_(ss);});}
function getLatestBroadcastGAS(token){var u=auth_(token);return broadcastState_(u,broadcastReadSheets_());}
function saveBroadcastAnnouncementGAS(data,token){
  auth_(token,true);data=data||{};var category=String(data.category||''),message=String(data.message||'').trim(),hours=Number(data.hours),id=String(data.id||'');
  if(['Penting','Pengingat Jam Kerja','Informasi','Instruksi'].indexOf(category)<0||!message||message.length>1000||[1,4,8,24,72,168].indexOf(hours)<0||!/^BR-[A-Za-z0-9-]{8,100}$/.test(id))throw new Error('Isi kategori, pesan maksimal 1.000 karakter, dan masa berlaku yang tersedia.');
  return locked_(function(){var u=auth_(token,true),s=broadcastSheets_(),old=s.broadcasts.getDataRange().getValues().slice(1).find(function(r){return String(r[0])===id;});
    if(old){if(String(old[2])!==u.user_id||String(old[4])!==category||String(old[5])!==message&&String(old[5])!==literal_(message))throw new Error('ID siaran sudah digunakan.');return broadcastState_(u,s);}
    var now=Date.now();s.broadcasts.appendRow([id,stamp_(),u.user_id,literal_(u.nama),category,literal_(message),now,now+hours*3600000,'Aktif']);return broadcastState_(u,s);
  });
}
function acknowledgeBroadcastGAS(id,token){var u=auth_(token);id=String(id||'');return locked_(function(){u=auth_(token);var s=broadcastSheets_(),rows=s.broadcasts.getDataRange().getValues().slice(1),row=rows.find(function(r){return String(r[0])===id;}),now=Date.now();if(!row||row[8]!=='Aktif'||Number(row[7])<=now)throw new Error('Pengumuman sudah berakhir. Muat ulang pengumuman.');if(!s.reads.getDataRange().getValues().slice(1).some(function(r){return String(r[0])===id&&String(r[1])===u.user_id;}))s.reads.appendRow([id,u.user_id,literal_(u.nama),stamp_(),now]);return broadcastState_(u,s);});}
function cancelBroadcastAnnouncementGAS(id,token){auth_(token,true);return locked_(function(){var u=auth_(token,true),s=broadcastSheets_(),rows=s.broadcasts.getDataRange().getValues(),index=rows.findIndex(function(r){return String(r[0])===String(id);});if(index<1)throw new Error('Siaran tidak ditemukan.');s.broadcasts.getRange(index+1,9).setValue('Dibatalkan');return broadcastState_(u,s);});}
function recordDailyAttendanceGAS(token){var u=auth_(token);if(u.role!=='Staf')throw new Error('Absen harian hanya untuk staf.');return locked_(function(){u=auth_(token);if(u.role!=='Staf')throw new Error('Absen harian hanya untuk staf.');var clock=broadcastClock_();if(clock.time<'07:30:00')throw new Error('Absen harian dibuka mulai pukul 07.30 WIB.');var s=broadcastSheets_(),key=clock.date+'|'+u.user_id;var old=s.attendance.getDataRange().getValues().slice(1).find(function(r){return String(r[0])===key||(attendanceDate_(r)===clock.date&&String(r[2])===u.user_id);});if(!old){var range=s.attendance.getRange(s.attendance.getLastRow()+1,1,1,8);range.setNumberFormat('@').setValues([[key,clock.date,u.user_id,literal_(u.nama),literal_(u.nip),Utilities.formatDate(new Date(clock.server_now),'Asia/Jakarta','yyyy-MM-dd HH:mm:ss'),clock.server_now,'Gov Monitor Apps Script']]);SpreadsheetApp.flush();}var state=broadcastState_(u,s);if(!state.attendance)throw new Error('Absen belum dapat dikonfirmasi. Periksa riwayat lalu coba lagi.');return state;});}
function getDailyAttendanceHistoryGAS(date,token){var u=auth_(token);date=String(date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Tanggal tidak valid.');var s=broadcastReadSheets_(),rows=s.attendance.getDataRange().getValues().slice(1).filter(function(r){return attendanceDate_(r)===date&&(u.role==='Admin'||String(r[2])===u.user_id);}).sort(function(a,b){return Number(b[6])-Number(a[6]);});return {success:true,date:date,attendance:rows.map(attendanceObject_)};}


function doGet(e) {
  var params = e && e.parameter || {};
  if (params.api === 'health') return gmApiJSON_(gmApiHealth_());
  if (params.verify) return HtmlService.createHtmlOutput(archivePublicHTML_(params.verify)).setTitle('Verifikasi Laporan Gov Monitor Diskoperindag Banyuasin').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Gov Monitor Diskoperindag Banyuasin')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Gov Monitor — paket proyek baru. Pengaturan rahasia hanya di server.
const GM_NEW_VERSION='2026.10.07-new-2';
function ownerOnly_(){
 var effective=Session.getEffectiveUser().getEmail();
 var active=Session.getActiveUser().getEmail();
 var email=active||effective;
 var owner=PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
 if(owner&&email&&email!==owner&&effective!==owner)throw new Error('Fungsi ini hanya boleh dijalankan pemilik proyek dari editor Apps Script.');
 return email||'owner';
}
function newSchema_(ss){
 var definitions={Users:['User ID','Username','Password','Nama','NIP','Jabatan','Role','Status','Foto'],Audit_Logs:['Log ID','Waktu','User ID','Nama Staf','NIP','Sel','Nilai Lama','Nilai Baru','IP Address','Perangkat','Metode','System Context','Nama Tab'],Chat_Logs:['Chat ID','Waktu','Pengirim ID','Pengirim Nama','Penerima ID','Penerima Nama','Pesan','Status Read'],Worksheets_State:['User ID','Chunk','JSON','Updated'],Sessions:['Token Hash','User ID','Expires','Last Activity','Login At'],Staff_Presence:['User ID','Tanggal','Detik Aktif','Terakhir Terlihat','Perangkat','Sel Aktif'],Supervisor_Notes:['Note ID','Waktu','Admin ID','Admin Nama','Staf ID','Catatan'],Worksheet_Bindings:['User ID','Tab Name','Sheet ID'],Staff_Session_Logs:['Session Hash','User ID','Login At','Exit At','Reason','Save Status'],Worksheet_Edit_Locks:['Staf ID','JSON'],Admin_Worksheet_Audit:['Log ID','Waktu','Admin ID','Admin Nama','Staf ID','Staf Nama','Tab','Sel','Nilai Lama','Nilai Baru','Tindakan','Status'],Admin_Workbook_Backups:['Request ID','Staf ID','Chunk','JSON','Waktu'],Staff_Time_State:['Session Hash','User ID','JSON'],Staff_Work_Intervals:['Session Hash','User ID','Mulai','Selesai','Jenis'],Staff_Activity_Events:['Event ID','Waktu','User ID','Jenis','Keterangan'],Report_Archives:['ID','Public Token','JSON'],Report_Archive_Events:['Event ID','Report ID','Actor ID','Actor Nama','Action','Detail','At'],Report_Series:['Series','Versi'],System_Settings:['Nama','Nilai']};
 Object.keys(definitions).forEach(function(name){sheet_(ss,name,definitions[name]);});broadcastSheets_(ss);return definitions;
}
function setupDatabase(){
 var owner=ownerOnly_();return locked_(function(){
  var p=PropertiesService.getScriptProperties(),id=p.getProperty('SPREADSHEET_ID');
  var activeSS=null;
  try{activeSS=SpreadsheetApp.getActiveSpreadsheet();}catch(e){}
  var ss=id?SpreadsheetApp.openById(id):(activeSS||SpreadsheetApp.create('Gov Monitor Diskoperindag Banyuasin — Database Baru'));
  p.setProperty('SPREADSHEET_ID',ss.getId());
  if(owner&&owner!=='owner')p.setProperty('OWNER_EMAIL',owner);
  ss.setSpreadsheetTimeZone('Asia/Jakarta');
  if(!p.getProperty('PASSWORD_SECRET'))p.setProperty('PASSWORD_SECRET',Utilities.getUuid()+Utilities.getUuid());
  if(!p.getProperty('AUDIT_CONTEXT_SECRET'))p.setProperty('AUDIT_CONTEXT_SECRET',Utilities.getUuid()+Utilities.getUuid());
  newSchema_(ss);
  var folder=p.getProperty('REPORT_FOLDER_ID');
  if(folder){try{DriveApp.getFolderById(folder).getName();}catch(e){folder=null;}}
  if(!folder){try{p.setProperty('REPORT_FOLDER_ID',DriveApp.createFolder('Gov Monitor — Arsip Laporan Baru').getId());}catch(e){Logger.log('Folder Drive catatan: '+e.message);}}
  var u=ss.getSheetByName('Users'),created=[];
  if(u.getLastRow()<2){
   var accounts=[
    ['USR-001','admin_banyuasin','Admin@Banyuasin2026!','Admin Diskoperindag Banyuasin','198501012010011001','Administrator Sistem','Admin','Aktif',''],
    ['USR-002','staf_uji1','Staf@Banyuasin2026!','Ahmad Fauzi, S.E. (DEMO)','199002152015031002','Pengelola Koperasi dan UMKM','Staf','Aktif',''],
    ['USR-003','staf_uji2','Staf@Banyuasin2026!','Siti Rahmawati, S.Kom. (DEMO)','199407222019022005','Analis Perdagangan & Pasar','Staf','Aktif','']
   ];
   accounts.forEach(function(a){
    u.appendRow([a[0],a[1],hashPassword_(a[2]),a[3],a[4],a[5],a[6],a[7],a[8]]);
    created.push({username:a[1],password:a[2],role:a[6],nama:a[3]});
   });
  }
  var users=allUsers_().map(user_);
  users.filter(function(x){return x.role==='Staf';}).forEach(function(x){
   var saved=ss.getSheetByName('Worksheets_State').getDataRange().getValues().slice(1).some(function(r){return String(r[0])===x.user_id;});
   if(!saved)writeWorkbook_(x,prepareWorksheets_([{name:'Lembar Kerja',status:1,order:0,row:100,column:26,data:[[{v:'Kegiatan',m:'Kegiatan'},{v:'Output',m:'Output'},{v:'Keterangan',m:'Keterangan'}]],config:{}}]));
  });
  p.setProperty('PACKAGE_VERSION',GM_NEW_VERSION);
  if(!p.getProperty('OCR_DAILY_LIMIT'))p.setProperty('OCR_DAILY_LIMIT','100');
  var result={success:true,version:GM_NEW_VERSION,database_url:ss.getUrl(),created_accounts:created};
  Logger.log('==================================================');
  Logger.log('SETUP DATABASE SELESAI');
  Logger.log('Database URL: '+ss.getUrl());
  if(created.length){
   Logger.log('AKUN GOVMONITOR DIBUAT:');
   created.forEach(function(acc){Logger.log('- Role: '+acc.role+' | Username: '+acc.username+' | Password: '+acc.password);});
  }else{
   Logger.log('Setup ulang: Data dan akun yang ada tetap dipertahankan.');
  }
  Logger.log('==================================================');
  return result;
 });
}
function setupDatabase_(){return setupDatabase();}
function setupDatabaseSheet(){return setupDatabase();}
function checkSystem(){
 ownerOnly_();var p=PropertiesService.getScriptProperties(),checks=[],ss;function check(name,fn){try{var value=fn();checks.push({name:name,status:'OK',detail:value||'Siap'});}catch(e){checks.push({name:name,status:'GAGAL',detail:String(e.message)});}}
 check('Database',function(){ss=db_();return ss.getUrl();});if(ss){check('Seluruh tab database',function(){var required=['Users','Audit_Logs','Chat_Logs','Worksheets_State','Sessions','Staff_Presence','Supervisor_Notes','Worksheet_Bindings','Staff_Session_Logs','Worksheet_Edit_Locks','Admin_Worksheet_Audit','Admin_Workbook_Backups','Staff_Time_State','Staff_Work_Intervals','Staff_Activity_Events','Broadcasts','BroadcastReads','DailyAttendance','Report_Archives','Report_Archive_Events','Report_Series','System_Settings'];var missing=required.filter(function(n){return !ss.getSheetByName(n);});if(missing.length)throw Error('Belum ada: '+missing.join(', '));return required.length+' tab siap';});check('Admin aktif',function(){if(!allUsers_().some(function(r){return r[6]==='Admin'&&r[7]==='Aktif';}))throw Error('Belum ada admin aktif.');});check('Password tersimpan aman',function(){if(!p.getProperty('PASSWORD_SECRET')||allUsers_().some(function(r){return !String(r[2]).startsWith('hmac$');}))throw Error('Konfigurasi password belum siap.');});check('Zona waktu database',function(){if(ss.getSpreadsheetTimeZone()!=='Asia/Jakarta')throw Error('Harus Asia/Jakarta.');return 'Asia/Jakarta (WIB)';});}
 check('Zona waktu proyek',function(){if(Session.getScriptTimeZone()!=='Asia/Jakarta')throw Error('Periksa appsscript.json: timeZone harus Asia/Jakarta.');return 'Asia/Jakarta (WIB)';});
 check('Index.html dan bootstrap',function(){var t=HtmlService.createHtmlOutputFromFile('Index');var html=t.getContent();if(!html.includes('gm-broadcast-form')||!html.includes('GM_NATIVE_APPS_SCRIPT'))throw Error('Index.html bukan pasangan paket ini.');return 'Tampilan dan template siap';});
 check('Folder arsip laporan',function(){return DriveApp.getFolderById(p.getProperty('REPORT_FOLDER_ID')).getName();});
 var key=p.getProperty('OCR_API_KEY');checks.push({name:'OCR Google Cloud Vision',status:key?'DIKONFIGURASI':'OPSIONAL',detail:key?'API key tersedia. Jalankan testOCR atau Uji OCR pada Dashboard.':'Belum diisi; fitur lain tetap berjalan.'});
 var url=ScriptApp.getService().getUrl();checks.push({name:'Deployment',status:url?'PERLU UJI':'BELUM DEPLOY',detail:url||'Lakukan Deploy → New deployment → Web app sesudah pemeriksaan inti lulus.'});
 var result={success:checks.every(function(c){return c.status!=='GAGAL';}),version:GM_NEW_VERSION,checks:checks};Logger.log(JSON.stringify(result,null,2));return result;
}
function getRuntimeConfigGAS(){return {success:true,version:GM_NEW_VERSION,deployment_url:ScriptApp.getService().getUrl()||'',timezone:'Asia/Jakarta'};}
function getOCRConfigGAS(token){auth_(token,true);var p=PropertiesService.getScriptProperties();return {success:true,provider:'Google Cloud Vision',configured:!!p.getProperty('OCR_API_KEY'),daily_limit:Number(p.getProperty('OCR_DAILY_LIMIT'))||100};}
function saveOCRConfigGAS(data,token){auth_(token,true);return locked_(function(){auth_(token,true);var p=PropertiesService.getScriptProperties(),limit=Number(data&&data.daily_limit),key=String(data&&data.api_key||'').trim();if(!Number.isInteger(limit)||limit<1||limit>10000)throw Error('Batas OCR 1–10000 gambar per hari.');if(key&&(key.length<20||key.length>200||!/^[A-Za-z0-9_-]+$/.test(key)))throw Error('API key Google Cloud Vision tidak valid.');if(data&&data.clear_key)p.deleteProperty('OCR_API_KEY');else if(key)p.setProperty('OCR_API_KEY',key);p.setProperty('OCR_DAILY_LIMIT',String(limit));return {success:true,configured:!!p.getProperty('OCR_API_KEY'),daily_limit:limit};});}
function ocrBudget_(){return locked_(function(){var p=PropertiesService.getScriptProperties(),date=Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd'),stored=p.getProperty('OCR_COUNTER_DATE'),count=stored===date?Number(p.getProperty('OCR_COUNTER'))||0:0,limit=Number(p.getProperty('OCR_DAILY_LIMIT'))||100;if(count>=limit)throw Error('Batas OCR harian aplikasi tercapai.');p.setProperty('OCR_COUNTER_DATE',date);p.setProperty('OCR_COUNTER',String(count+1));});}
function visionOCR_(dataUrl){
 var key=PropertiesService.getScriptProperties().getProperty('OCR_API_KEY');if(!key)throw Error('API key OCR belum diatur. Admin dapat mengaturnya pada Dashboard.');var match=String(dataUrl||'').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);if(!match||match[2].length>7000000)throw Error('Gunakan PNG/JPEG/WebP maksimal sekitar 5 MB.');ocrBudget_();var response=UrlFetchApp.fetch('https://vision.googleapis.com/v1/images:annotate',{method:'post',contentType:'application/json',headers:{'X-Goog-Api-Key':key},muteHttpExceptions:true,payload:JSON.stringify({requests:[{image:{content:match[2]},features:[{type:'DOCUMENT_TEXT_DETECTION'}],imageContext:{languageHints:['id','en']}}]})});var status=response.getResponseCode(),body;try{body=JSON.parse(response.getContentText());}catch(e){throw Error('Layanan OCR mengembalikan balasan tidak valid.');}if(status!==200||body.error){throw Error('OCR gagal (HTTP '+status+'). Periksa API key, aktivasi Cloud Vision API, billing, pembatasan key dan kuota.');}var first=body.responses&&body.responses[0];if(!first||first.error)throw Error('Gambar belum dapat diproses oleh layanan OCR.');return {success:true,text:first.fullTextAnnotation&&first.fullTextAnnotation.text||first.textAnnotations&&first.textAnnotations[0]&&first.textAnnotations[0].description||'',provider:'Google Cloud Vision'};
}
function processGovLensOCR(dataUrl,token){auth_(token);var result=visionOCR_(dataUrl);if(!result.text.trim())throw Error('Tidak ada teks terbaca. Coba gambar lebih jelas.');return result;}
function testOCRConfigGAS(token){auth_(token,true);return visionOCR_(OCR_TEST_IMAGE_);}
function testOCR(){ownerOnly_();var result=visionOCR_(OCR_TEST_IMAGE_);Logger.log('Koneksi OCR berhasil; HTTP diterima dan gambar uji diproses.');return {success:true,provider:result.provider,text_detected:!!result.text};}
function getClientAuditContext(data,token){auth_(token);if(JSON.stringify(data||{}).length>5000)throw Error('Konteks perangkat terlalu besar.');var json=JSON.stringify({version:1,mode:'observed',observed_at:Date.now(),ip:'Tidak tersedia',network:data&&data.network||{},source:'Apps Script langsung — IP tidak tersedia pada request ini'}),key=PropertiesService.getScriptProperties().getProperty('AUDIT_CONTEXT_SECRET'),bytes=Utilities.computeHmacSha256Signature(String(token)+'.'+json,key);return {success:true,context:{json:json,signature:bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('')}};}
function weatherNativePart_(kind,lat,lng){
 var cache=CacheService.getScriptCache(),key='weather:'+kind+':'+lat+':'+lng,raw=cache.get(key),saved=null,now=Date.now(),ttl=kind==='weather'?900000:3600000;
 try{saved=raw?JSON.parse(raw):null;}catch(e){}
 if(saved&&now-saved.fetched_at<ttl)return Object.assign({},saved,{stale:false});
 function last(){return saved&&now-saved.fetched_at<21600000?Object.assign({},saved,{stale:true}):null;}
 if(cache.get(key+':cooldown'))return last();
 var url=kind==='weather'?'https://api.open-meteo.com/v1/forecast':'https://air-quality-api.open-meteo.com/v1/air-quality',args={latitude:lat,longitude:lng,timezone:'auto',timeformat:'unixtime',forecast_days:1};
 if(kind==='weather'){args.current='temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m';args.daily='temperature_2m_min,temperature_2m_max,precipitation_probability_max';}else{args.current='us_aqi,pm2_5';args.domains='cams_global';}
 try{
 var query=Object.keys(args).map(function(k){return k+'='+encodeURIComponent(args[k]);}).join('&'),r=UrlFetchApp.fetch(url+'?'+query,{muteHttpExceptions:true});
 if(r.getResponseCode()!==200){cache.put(key+':cooldown','1',300);return last();}
 var j=JSON.parse(r.getContentText()),c=j.current,n=function(v){return typeof v==='number'&&Number.isFinite(v)?v:null;};if(!c||!Number.isFinite(c.time))throw Error('Data sumber tidak lengkap.');
 var d=kind==='weather'?{temperature:n(c.temperature_2m),feels_like:n(c.apparent_temperature),humidity:n(c.relative_humidity_2m),code:n(c.weather_code),wind:n(c.wind_speed_10m),minimum:n(j.daily&&j.daily.temperature_2m_min&&j.daily.temperature_2m_min[0]),maximum:n(j.daily&&j.daily.temperature_2m_max&&j.daily.temperature_2m_max[0]),rain_probability:n(j.daily&&j.daily.precipitation_probability_max&&j.daily.precipitation_probability_max[0])}:{aqi:n(c.us_aqi),pm25:n(c.pm2_5)};
 if(kind==='weather'?d.temperature===null:d.aqi===null)throw Error('Nilai sumber tidak tersedia.');
 d.time=c.time*1000;d.fetched_at=now;d.timezone=j.timezone||'Asia/Jakarta';d.stale=false;cache.put(key,JSON.stringify(d),21600);cache.remove(key+':cooldown');return d;
 }catch(e){cache.put(key+':cooldown','1',300);return last();}
}
function getEnvironmentFromGAS(data,token){auth_(token);var lat=Number(data&&data.lat),lng=Number(data&&data.lng);if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -90||lat>90||lng< -180||lng>180)throw Error('Koordinat tidak valid.');lat=Math.round(lat*100)/100;lng=Math.round(lng*100)/100;var weather=weatherNativePart_('weather',lat,lng),air=weatherNativePart_('air',lat,lng);if(!weather&&!air)throw Error('Informasi cuaca dan udara belum tersedia.');return {success:true,weather:weather,air:air,timezone:'Asia/Jakarta'};}
/** Pemulihan password dari editor, hanya pemilik; tidak tersedia melalui dispatcher API. */
function resetUserPassword(){ownerOnly_();return resetUserPassword_();}

const OCR_TEST_IMAGE_='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAABQCAIAAAC4QrSbAAAF+0lEQVR4nO3aT2yLfxzA8Wd/MimJsoTQ3SRMiIk1RLW6p1ZPFiMimGSpGMGJEAcODptEbC67iEQmDAcctsyJma6UbBOHogc77ER322FCYlT1+zt883vS9M8z0YN8fr/36/Ss/fSzb8ne2dOsQillAIAElX/7AADwuwgWADEIFgAxCBYAMQgWADEIFgAxCBYAMQgWADEIFgAxCBYAMQgWADEIFgAxCBYAMQgWADEIFgAxCBYAMQgWADEIFgAxCBYAMQgWADEIFgAxCBYAMQgWADEIFgAxCBYAMQgWADHKDVZfX9+WLVu2bdu2a9eu6elp/WB/f7/X6/X5fF6v9+7du4ZhnD9//tatW/arLMt6//69vna5XG1tbfZTkUjE5XKV2qPnQ6GQPb9kyZLci6GhIdM0TdOsrq7WFwMDA0X3LFy40DTNpqamxsbGeDxuLyw6fPPmzcbGxqamptbW1lQq5bCh6AH0pNbb22sYRiKRsCwrFArt3LkzlUoVfVVZ/zHAf5Iqw8jISEtLSzqdVkr19PRYlqWUGh4e9vv9s7OzSqnZ2Vm/3//s2bN4PL5//379qq9fv9bX19tL3G53Q0NDJpNRSmWz2a1bt7rd7lJ79HwgEHj+/Ln98ryLvC8d9uiBZDK5YcMGh+GRkZFQKPTt2zel1OPHj3fs2JH3LXI3FB6g8GxKqY0bN6ZSKaXUwMBAW1ubwyQAW1nBsizrzZs3+vrLly979+7NZDLNzc3j4+P2zNjYWDgczmQyq1at+vnzp1JqaGjozJkz9oDb7e7o6JiYmFBKJRKJkydP6h/aonv0/OjoaDAYtF+ed5H3pcMe/Ug2m62trXUYtixLH087ceKEbnTRDYUHKDybUmrlypVTU1NKqXQ6/fLlS4dJALayglVXV/f9+/e8Bz0ez9zcnP3l3Nycx+NRSrW3t7969Uopdfz48VgsZg+43e4HDx50dXUppbq7uwcHB/UPbak9+tlgMKiXzBss5z1KqeHh4QMHDjgMF32bpTYUPlt4NqVUf3//ihUrjh07lvtPUXQSgK2sz7AymYy+6O3tNU1z7dq1RW85KyoqDMPYs2fPkydPDMN4/fr19u3bc2csy4pGo4ZhxGKxcDhc6tZV79EuXbrU2dn5B2e296TTadM0/X5/e3v7tWvXHIZ//fpV9Nnf2ZA7qU1MTBiG0dHR8eHDh0AgcPbs2a6urj94I8D/UFnBWr16dTKZNAzj3Llzjx49+vjxo2EY69atSyQS9kwikVi/fr1hGC0tLaOjo2/fvt20aVN1dXXuntra2srKSv1h9uLFi/WDpfZopmlWVVXFYrF5D1lqT01NzYsXL8bGxi5cuHDnzh2H4TVr1rx7904/opQ6cuSIvi66oSg9qfl8vpmZmfHx8aVLlx49ejQajd64cWPedwHAMMr70P3evXv2h+6XL19etGiRUurp06d+v//z58/q38+to9Gong+FQqdOnRocHMxdom+Crly5cvjw4atXr9qPlNpj3zTF4/FAIDDvLeG8exKJxL59+xyGHz58GA6H9V3h/fv3Dx06lPctcjcUHqDwbDMzM3V1dZ8+fVJKTU5Obt68udQkgFzV8yettEgkMjk52dDQ4PF4IpGI/r3Jsqzp6elQKLRgwYJ0On369Onm5mY9v3v37s7Ozp6ensJVra2tFy9e1L+vaQ57tGAwWFNT8+PHD+dDzrunvr4+mUxms9nKyspSw1NTU16vd9myZcuXL79+/Xret8jdUPQM+pZQX/t8vu7u7r6+voMHD7pcrqqqqtu3bzu/BQBahVLqb58BAH4Lf+kOQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUAMggVADIIFQAyCBUCMfwCnl41sk9fpyAAAAABJRU5ErkJggg==';

function archiveHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value)).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function archiveSource_(logs,users,staffId,supervisor){var staff=users.filter(function(u){return u.role==='Staf'&&(staffId==='ALL'||u.user_id===staffId);}).map(function(u){return [u.user_id,u.nama,u.nip,u.jabatan];}).sort(function(a,b){return a[0].localeCompare(b[0]);});return JSON.stringify({staff:staff,supervisor:[supervisor.user_id,supervisor.nama,supervisor.nip],logs:logs.map(function(l){return [l.log_id,l.timestamp,l.user_id,l.nama_staf,l.nip,l.cell,l.prev_val,l.new_val,l.method];})});}
function archiveTable_(){return db_().getSheetByName('Report_Archives');}
function archiveRows_(){return archiveTable_().getDataRange().getValues().slice(1).filter(function(r){return r[0];}).map(function(r){return JSON.parse(r[2]);});}
function archivePut_(a){var s=archiveTable_(),rows=s.getDataRange().getValues(),index=rows.findIndex(function(r){return String(r[0])===a.id;}),json=JSON.stringify(a);if(json.length>45000)throw Error('Metadata arsip terlalu besar.');s.getRange(index>0?index+1:s.getLastRow()+1,1,1,3).setValues([[a.id,a.public_token,json]]);}
function archiveURL_(){var url=ScriptApp.getService().getUrl();if(!url)throw Error('Deploy Web App terlebih dahulu untuk menerbitkan QR.');return url;}
function archiveView_(a){var copy={};['id','public_token','number','version','start','end','staff_id','status','approval','issuer_id','issuer_name','supervisor_id','supervisor_name','employee_name','content_hash','source_hash','created_at','published_at'].forEach(function(k){copy[k]=a[k];});copy.verify_url=archiveURL_()+'?verify='+a.public_token;var qr=qrcode(0,'M');qr.addData(copy.verify_url);qr.make();copy.qr_url=qr.createDataURL(4,16);return copy;}
function archiveCounter_(key){var s=db_().getSheetByName('Report_Series'),rows=s.getDataRange().getValues(),index=rows.findIndex(function(r){return String(r[0])===key;}),version=index>0?Number(rows[index][1])+1:1;s.getRange(index>0?index+1:s.getLastRow()+1,1,1,2).setValues([[key,version]]);return version;}
function archiveEvent_(a,u,action,detail){var e={actor_id:u.user_id,actor_name:u.nama,action:action,detail:detail||'',at:Date.now()};a.events=a.events||[];a.events.push(e);return e;}
function archiveEventMirror_(a,e){try{db_().getSheetByName('Report_Archive_Events').appendRow([Utilities.getUuid(),a.id,e.actor_id,literal_(e.actor_name),e.action,literal_(e.detail),e.at]);}catch(err){Logger.log('Riwayat utama tersimpan pada metadata arsip; salinan tabel belum diperbarui.');}}
function reportArchiveGAS(body,token){
 var u=auth_(token,body&&body.action!=='document'),action=String(body&&body.action||'');if(!body||JSON.stringify(body).length>2000000)throw Error('Permintaan arsip tidak valid.');
 if(action==='list')return {success:true,archives:archiveRows_().filter(function(a){return a.status!=='draft'&&a.start===body.start&&a.end===body.end&&a.staff_id===(body.staff_id||'ALL');}).sort(function(a,b){return b.created_at-a.created_at;}).slice(0,100).map(archiveView_)};
 if(action==='document'){var document=archiveRows_().find(function(a){return a.public_token===body.public_token&&a.status!=='draft';});if(!document||u.role!=='Admin'&&document.staff_id!==u.user_id)throw Error('Dokumen hanya tersedia bagi admin atau staf yang bersangkutan.');var html=DriveApp.getFileById(document.file_id).getBlob().getDataAsString('UTF-8');if(archiveHash_(html)!==document.content_hash)throw Error('Pemeriksaan integritas arsip gagal.');return {success:true,html:html};}
 if(action==='reserve'){var start=String(body.start||''),end=String(body.end||''),staffId=String(body.staff_id||'ALL'),supervisorId=String(body.supervisor_id||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)throw Error('Periode tidak valid.');var users=allUsers_().map(user_),supervisor=users.find(function(x){return x.user_id===supervisorId&&x.role==='Admin'&&x.status==='Aktif';}),staff=users.find(function(x){return x.user_id===staffId&&x.role==='Staf';});if(!supervisor||staffId!=='ALL'&&!staff)throw Error('Staf atau supervisor tidak tersedia.');var logs=getReportDataFromGAS(start,end,staffId,token).logs,source=archiveHash_(archiveSource_(logs,users,staffId,supervisor));if(source!==body.source_hash)throw Error('Data laporan berubah. Tampilkan ulang sebelum menerbitkan.');archiveURL_();return locked_(function(){auth_(token,true);var series=[start,end,staffId].join('|'),day=Utilities.formatDate(new Date(),'Asia/Jakarta','yyyyMMdd'),a={id:Utilities.getUuid(),public_token:(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''),number:'GM-EK-'+day+'-'+String(archiveCounter_('number:'+day)).padStart(3,'0'),version:archiveCounter_(series),start:start,end:end,staff_id:staffId,status:'draft',approval:'pending',issuer_id:u.user_id,issuer_name:u.nama,supervisor_id:supervisor.user_id,supervisor_name:supervisor.nama,employee_name:staff?staff.nama:'Semua pegawai / staf',source_hash:source,created_at:Date.now(),events:[]};archivePut_(a);return {success:true,archive:archiveView_(a)};});}
 return locked_(function(){u=auth_(token,true);var a=archiveRows_().find(function(x){return x.id===String(body.id||'');});if(!a)throw Error('Arsip tidak ditemukan.');var e;
 if(action==='get')return {success:true,archive:archiveView_(a),events:a.events||[]};
 if(action==='publish'){if(a.issuer_id!==u.user_id)throw Error('Hanya penerbit yang dapat menyelesaikan penerbitan.');if(a.status!=='draft')return {success:true,archive:archiveView_(a)};var html=String(body.html||'');if(html.length<200||html.length>1500000||/<(?:script|iframe|object|embed|base|meta|link|form|svg|math|audio|video)\b/i.test(html)||/javascript:|@import|expression\s*\(/i.test(html))throw Error('Salinan laporan tidak valid.');var folder=DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('REPORT_FOLDER_ID')),file=folder.createFile(Utilities.newBlob(html,'text/html',a.number+'.html'));try{file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);a.file_id=file.getId();a.content_hash=archiveHash_(html);a.status='published';a.published_at=Date.now();e=archiveEvent_(a,u,'published');archivePut_(a);}catch(error){file.setTrashed(true);throw error;}archiveEventMirror_(a,e);return {success:true,archive:archiveView_(a)};}
 if(action==='approve'||action==='revoke'){if(a.status!=='published')throw Error('Dokumen tidak dalam status diterbitkan.');if(action==='approve'){if(a.supervisor_id!==u.user_id)throw Error('Hanya supervisor terpilih yang dapat menyetujui.');if(a.approval==='approved')return {success:true,archive:archiveView_(a)};a.approval='approved';e=archiveEvent_(a,u,'approved');}else{if([a.issuer_id,a.supervisor_id].indexOf(u.user_id)<0)throw Error('Akun tidak berwenang membatalkan.');var reason=String(body.reason||'').trim();if(!reason||reason.length>1000)throw Error('Isi alasan pembatalan, maksimal 1.000 karakter.');a.status='revoked';e=archiveEvent_(a,u,'revoked',reason);}archivePut_(a);archiveEventMirror_(a,e);return {success:true,archive:archiveView_(a)};}
 throw Error('Tindakan arsip tidak diizinkan.');
 });
}
function archiveEscape_(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function archivePublicHTML_(token){if(!/^[a-f0-9]{64}$/.test(String(token||'')))return '<p>Dokumen tidak ditemukan.</p>';var a=archiveRows_().find(function(x){return x.public_token===token&&x.status!=='draft';});if(!a)return '<p>Dokumen belum diterbitkan atau tidak ditemukan.</p>';var approved=(a.events||[]).find(function(e){return e.action==='approved';}),date=function(n){return Utilities.formatDate(new Date(n),'Asia/Jakarta','dd MMM yyyy HH:mm:ss')+' WIB';},fields=[['Nomor',a.number],['Penerbit','Diskoperindag Banyuasin'],['Pegawai',a.employee_name],['Periode',a.start+' s/d '+a.end],['Diterbitkan',date(a.published_at)],['Versi',a.version],['Status',a.status==='revoked'?'Dibatalkan':'Diterbitkan oleh Diskoperindag Banyuasin'],['Persetujuan internal',a.approval==='approved'?'Disetujui':'Menunggu'],['Supervisor',a.supervisor_name],...(approved?[['Disetujui oleh',approved.actor_name],['Waktu persetujuan',date(approved.at)]]:[]),['Sidik arsip HTML (SHA-256)',a.content_hash]];return '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><style>body{font:16px/1.6 Arial;background:#edf3f8;color:#17324d;margin:0;padding:20px}main{background:white;max-width:760px;padding:28px;margin:auto;border-radius:20px;border-top:6px solid #08756a}h1{font-size:26px}dl{display:grid;grid-template-columns:180px 1fr;gap:12px}dt{font-weight:bold}dd{margin:0;overflow-wrap:anywhere}a{display:inline-block;padding:12px 20px;background:#08756a;color:white;border-radius:10px;text-decoration:none}@media(max-width:600px){dl{grid-template-columns:1fr}}</style></head><body><main><h1>Verifikasi Laporan Gov Monitor Diskoperindag Banyuasin</h1><dl>'+fields.map(function(f){return '<dt>'+archiveEscape_(f[0])+'</dt><dd>'+archiveEscape_(f[1])+'</dd>';}).join('')+'</dl><a target="_top" href="'+archiveEscape_(archiveURL_()+'?arsip='+a.public_token)+'">Lihat dokumen yang tercatat</a><p>Login Gov Monitor diperlukan untuk dokumen lengkap. Persetujuan internal bukan tanda tangan elektronik tersertifikasi.</p></main></body></html>';}

// QR generator, MIT license, bundled to keep installation at four files.
//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        '██': '█',
        '█ ': '▀',
        ' █': '▄',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        '██': '▀',
        '█ ': '▀',
        ' █': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = '█';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += '█';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('▀');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('██');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));

function getEnvironmentFromGAS(params) {
  params = params || {};
  var lat = Number(params.lat || -2.88).toFixed(2);
  var lng = Number(params.lng || 104.38).toFixed(2);
  var result = { success: true, weather: null, air: null, timezone: 'Asia/Jakarta' };
  try {
    var wRes = UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng + '&timezone=auto&timeformat=unixtime&forecast_days=1&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max', { muteHttpExceptions: true });
    if (wRes.getResponseCode() === 200) {
      var wJson = JSON.parse(wRes.getContentText()), wc = wJson.current;
      result.weather = {
        temperature: wc.temperature_2m,
        feels_like: wc.apparent_temperature,
        humidity: wc.relative_humidity_2m,
        code: wc.weather_code,
        wind: wc.wind_speed_10m,
        minimum: wJson.daily && wJson.daily.temperature_2m_min && wJson.daily.temperature_2m_min[0],
        maximum: wJson.daily && wJson.daily.temperature_2m_max && wJson.daily.temperature_2m_max[0],
        rain_probability: wJson.daily && wJson.daily.precipitation_probability_max && wJson.daily.precipitation_probability_max[0],
        timezone: wJson.timezone || 'Asia/Jakarta',
        time: wc.time * 1000,
        fetched_at: Date.now(),
        stale: false
      };
      result.timezone = wJson.timezone || 'Asia/Jakarta';
    }
  } catch(e) {}
  try {
    var aRes = UrlFetchApp.fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat + '&longitude=' + lng + '&current=us_aqi,pm2_5', { muteHttpExceptions: true });
    if (aRes.getResponseCode() === 200) {
      var aJson = JSON.parse(aRes.getContentText()), ac = aJson.current;
      result.air = {
        aqi: Math.round(ac.us_aqi),
        pm25: ac.pm2_5,
        time: Date.now(),
        fetched_at: Date.now(),
        stale: false
      };
    }
  } catch(e) {}
  return result;
}
