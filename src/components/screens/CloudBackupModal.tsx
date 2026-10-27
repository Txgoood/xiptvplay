import React, { useEffect, useState } from 'react';
import { Cloud, LockKeyhole, ShieldCheck, X, RefreshCcw } from 'lucide-react';
import { CloudDriveService, GoogleDriveSession } from '../../services/cloudDrive';
import { CloudSyncController } from '../../services/cloudSync';

interface Props { onClose:()=>void; onRestored:()=>void; }
export const CloudBackupModal:React.FC<Props>=({onClose,onRestored})=>{
 const [session,setSession]=useState<GoogleDriveSession|null>(CloudSyncController.session());
 const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [confirmRestore,setConfirmRestore]=useState(false);
 const [remoteExists,setRemoteExists]=useState<boolean|null>(null);
 const [syncStatus,setSyncStatus]=useState(CloudSyncController.status());
 useEffect(()=>{
  const update=()=>{setSyncStatus(CloudSyncController.status());const active=CloudSyncController.session();if(active)setSession(active);};
  const poll=window.setInterval(update,5000);
  window.addEventListener('xiptv-cloud-sync-status',update);
  return ()=>{window.clearInterval(poll);window.removeEventListener('xiptv-cloud-sync-status',update);};
 },[]);
 const enableAutoSync=async()=>{
  if(!session){setMessage('Önce Google hesabına bağlan.');return;}
  if(password.length<10){setMessage('Senkronizasyon şifresi en az 10 karakter olmalı.');return;}
  if(mismatch){setMessage('Bu cihaz başka bir Google hesabına bağlı.');return;}
  setBusy(true);
  try{await CloudSyncController.start(session,password);setPassword('');setMessage('Kalıcı otomatik eşitleme açıldı. Parola bu telefonda Android Keystore ile şifrelenerek saklanır.');}
  catch(e:any){setMessage(e.message||'Kalıcı eşitleme etkinleştirilemedi.');}
  finally{setBusy(false);setSyncStatus(CloudSyncController.status());}
 };
 const perform=async(action:'connect'|'backup'|'inspect'|'restore')=>{
  setBusy(true);setMessage('');
  try{
   if(action==='connect'){
    const auth=await CloudDriveService.signIn();
    const owner=CloudDriveService.linkedOwner();
    setSession(auth);
    const remote=await CloudDriveService.remoteInfo(auth);
    setRemoteExists(remote.exists);
    setMessage(owner&&owner!==auth.accountId
      ? 'Bu cihaz başka Google hesabına bağlı. Verilerin karışmasını önlemek için yükleme ve geri getirme kapalı.'
      : remote.exists?'Bu Google Drive hesabında şifreli bir yedek var.':'Bu Google Drive hesabında henüz yedek yok.');
   }else{
    if(!session)throw Error('Önce Google hesabına bağlan.');
    if(password.length<10)throw Error('Yedek şifresi en az 10 karakter olmalı.');
    if(action==='backup'){
      if(remoteExists && !window.confirm('Drive üzerindeki önceki yedeğin yerine yeni yedek yazılacak. Devam edilsin mi?'))return;
      await CloudDriveService.backup(session,password);
      setRemoteExists(true);setMessage('Şifreli yedek kendi Google Drive hesabına kaydedildi.');
    }else if(action==='inspect'){
      const snapshot=await CloudDriveService.inspectBackup(session,password);
      setMessage('Yedek doğrulandı ✓ · Tarih: '+new Date(snapshot.createdAt).toLocaleString('tr-TR')+
        ' · '+(snapshot.profiles?.profiles.length||1)+' profil (Ana Profil dahil) · '+snapshot.playlists.length+' playlist.');
      setConfirmRestore(true);
    }else if(action==='restore'){
      const snapshot=await CloudDriveService.inspectBackup(session,password);
      CloudDriveService.restore(session,snapshot);
      setMessage('Yedek geri yüklendi. Uygulama verileri yeniden okunacak.');
      onRestored();
    }
   }
  }catch(e:any){setMessage(e?.message||'Google Drive işlemi başarısız oldu.');}
  finally{setBusy(false);}
 };
 const mismatch=Boolean(session&&CloudDriveService.linkedOwner()&&CloudDriveService.linkedOwner()!==session.accountId);
 return <div className="fixed inset-0 z-[350] bg-[#07090d]/95 flex items-center justify-center p-4 text-white">
  <section className="bg-[#1e2228] border border-white/10 rounded-3xl p-5 max-w-lg w-full max-h-[94dvh] overflow-y-auto space-y-4" role="dialog" aria-modal="true">
   <header className="flex items-center justify-between"><h2 className="font-bold text-lg flex items-center gap-2"><Cloud className="text-[#00f0ff]"/> Kişisel Google Drive</h2><button onClick={onClose} aria-label="Kapat"><X/></button></header>
   <p className="text-xs text-[#b9cacb]">Herkes kendi Google hesabına bağlanır. XIPTV Play sadece o hesabın gizli uygulama klasörünü kullanır. Filmler ve indirilmiş videolar buluta yüklenmez.</p>
   <div role="status" className="rounded-xl bg-white/5 p-3 text-sm space-y-1">
    <p>{syncStatus.restoring?'Google bağlantısı yenileniyor…':syncStatus.busy?'Eşitleniyor…':syncStatus.offline?'Çevrimdışı · internet bekleniyor':syncStatus.active?'Otomatik eşitleme açık':'Otomatik eşitleme kapalı'}</p>
    <p>Son başarılı eşitleme: {syncStatus.lastSync?new Date(syncStatus.lastSync).toLocaleString('tr-TR'):'Henüz yok'}</p>
    {syncStatus.active&&syncStatus.pending&&<p>Yerel değişiklikler eşitleme bekliyor.</p>}
    {syncStatus.lastError&&<p className="text-red-200">{syncStatus.lastError}</p>}
   </div>
   {!session ? <button disabled={busy} onClick={()=>void perform('connect')} className="w-full bg-[#00f0ff] text-black p-3 rounded-xl font-bold disabled:opacity-40">Google ile Bağlan · Drive İzni Ver</button>
   : <div className="bg-[#26333a] p-3 rounded-xl text-sm">
      <p className="font-bold text-[#00f0ff]">✓ {session.email}</p>
      <p className="text-[11px] text-[#b9cacb]">Kalıcı eşitleme açıksa bağlantı yeniden açılışta otomatik yenilenir.</p>
      <button disabled={busy||syncStatus.busy||syncStatus.restoring} onClick={async()=>{try{await CloudSyncController.stop();await CloudDriveService.disconnect();setSession(null);setPassword('');setRemoteExists(null);}catch(e:any){setMessage(e.message);}}} className="mt-2 px-3 py-1.5 rounded-lg bg-white/10 text-xs">Bağlantıyı Kes</button>
    </div>}
   {session&&<div className="space-y-3">
    <label className="block text-sm"><LockKeyhole className="w-4 h-4 inline mr-1"/> Şifreli yedek parolası
      <input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)}
        placeholder="En az 10 karakter · unutma!" className="block w-full mt-2 p-3 rounded-xl bg-[#343840] outline-none"/>
    </label>
    <p className="text-[11px] text-amber-200">Bu parola Google şifren değildir. Google'a veya sunucumuza gönderilmez. Unutursan şifreli yedeği geri açamayız.</p>
    <div className="rounded-xl border border-[#00f0ff]/20 bg-[#10242a] p-3 space-y-2">
      <p className="text-sm font-bold text-[#bafaff]">🔄 Cihazlar Arası Otomatik Eşitleme</p>
      <p className="text-xs text-[#d0e3e5]">Favoriler, izleme geçmişi, profil tanımları ve IPTV bağlantıları aynı Google hesabındaki cihazlarda birleştirilir. İndirilen video dosyaları ve büyük katalog önbelleği aktarılmaz.</p>
      <p className="text-[11px] text-amber-200">Playlist bağlantıları ve aile profilleri de şifreli eşitlenir. 1 MB üzeri, URL içermeyen M3U dosyaları otomatik aktarılmaz; bunları manuel yedekten taşı. Çocuk erişimlerini genişleten değişiklikler otomatik uygulanmaz. Tüm cihazlarda aynı eşitleme parolasını kullan.</p>
      {syncStatus.active ? <>
        <p className="text-xs text-green-300">● Otomatik eşitleme açık{syncStatus.lastSync?' · Son: '+new Date(syncStatus.lastSync).toLocaleString('tr-TR'):''}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={syncStatus.busy||syncStatus.restoring} onClick={()=>void CloudSyncController.now()} className="rounded-lg bg-[#00f0ff] p-2.5 text-black text-xs font-bold">Şimdi Eşitle</button>
          <button type="button" disabled={syncStatus.busy||syncStatus.restoring} onClick={async()=>{try{await CloudSyncController.stop();setSyncStatus(CloudSyncController.status());setMessage('Otomatik eşitleme kapatıldı; güvenli kayıt bu telefondan kaldırıldı.');}catch(e:any){setMessage(e.message);}}} className="rounded-lg bg-white/10 p-2.5 text-xs">Otomatiği Kapat</button>
        </div>
      </> : <button type="button" disabled={busy||mismatch} onClick={enableAutoSync} className="w-full rounded-lg bg-[#00f0ff] p-3 font-bold text-black disabled:opacity-40">Otomatik Eşitlemeyi Aç</button>}
      {syncStatus.lastError&&<p className="text-xs text-[#ffb4ab]">⚠️ {syncStatus.lastError}</p>}
      <p className="text-[11px] text-[#a1c3c6]">Uygulama tamamen kapalıyken veya internet yokken eşitleme bekler. Kalıcı eşitleme açıksa yeniden açıldığında devam eder. Google yeniden izin isterse bağlantıyı yenile.</p>
    </div>
    <button disabled={busy||mismatch} onClick={()=>void perform('backup')} className="w-full p-3 rounded-xl bg-[#00f0ff] text-black font-bold disabled:opacity-40">☁️ Şimdi Şifreli Yedekle</button>
    <button disabled={busy||mismatch||!remoteExists} onClick={()=>void perform('inspect')} className="w-full p-3 rounded-xl bg-white/10 font-semibold disabled:opacity-40">♻️ Yedeği İncele ve Geri Yükle</button>
    {confirmRestore&&<div className="bg-[#403226] border border-amber-300/30 rounded-xl p-3 space-y-2">
      <p className="text-xs text-amber-100">Geri yükleme mevcut profil, favori, geçmiş ve playlist verilerini değiştirecek. İndirilen dosyalar korunur. Devam edilsin mi?</p>
      <button disabled={busy} onClick={()=>void perform('restore')} className="w-full rounded-lg bg-amber-300 text-black p-3 text-sm font-bold">Evet, Yedeği Geri Yükle</button>
    </div>}
   </div>}
   {message&&<p role="status" className="bg-white/5 rounded-xl p-3 text-sm">{message}</p>}
   {busy&&<p className="text-xs text-[#00f0ff] flex gap-2 items-center"><RefreshCcw size={14} className="animate-spin"/> Google Drive işlemi sürüyor...</p>}
   <div className="bg-[#242c30] rounded-xl p-3 text-xs text-[#c8d7d9] space-y-1">
    <p className="font-bold flex gap-2 items-center"><ShieldCheck size={15}/> Güvenlik ve senkronizasyon</p>
    <p>Şifreli manuel yedekleme korunur. Otomatik eşitleme favori, geçmiş, profil ve playlist bağlantılarını cihazların ayrı günlüklerinden birleştirir. Cihazdaki mevcut yönetici PIN'i değiştirilmez; profil/listenin otomatik silinmesi desteklenmez.</p>
   </div>
  </section>
 </div>;
};
