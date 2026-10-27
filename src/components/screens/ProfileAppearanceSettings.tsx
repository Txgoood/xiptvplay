import React,{useState} from 'react';
import {FamilyConfiguration,FamilyProfilesService} from '../../services/familyProfiles';
import {DeviceProfileAccess} from '../../services/deviceProfileAccess';
const avatars=['👤','👩','👨','🦊','🐼','🐱','🐶','🦁','🐸','🚀','⭐','🌈'];
export const ProfileAvatar=({icon}:{icon?:string})=>icon?.startsWith('data:image/jpeg;base64,')&&icon.length<100000
 ? <img src={icon} alt="Profil resmi" className="h-12 w-12 rounded-full object-cover"/>
 : <span className="text-3xl" aria-hidden="true">{avatars.includes(icon||'')?icon:'👤'}</span>;
export function ProfileAppearanceSettings({configuration,onSave}:{configuration:FamilyConfiguration;onSave:(c:FamilyConfiguration)=>void}){
 const [id,setId]=useState(configuration.profiles[0]?.id);
 const p=configuration.profiles.find(p=>p.id===id)!;
 const [prefs,setPrefs]=useState(()=>DeviceProfileAccess.read());
 const [icon,setIcon]=useState(p?.icon||'👤'),[name,setName]=useState(p?.name||'');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [pin,setPin]=useState(''),[removePin,setRemovePin]=useState(false);
 const photo=async(file?:File)=>{
  if(!file)return;
  setError('');setBusy(true);
  let url='';
  try{
   if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>12*1024*1024)throw Error('12 MB altında JPG, PNG veya WebP seç.');
   url=URL.createObjectURL(file);
   const image=new Image();
   await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Fotoğraf açılamadı.'));image.src=url;});
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Fotoğraf hazırlanamadı.');
   const side=Math.min(image.width,image.height);
   ctx.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,256,256);
   const data=canvas.toDataURL('image/jpeg',0.8);
   if(data.length>=100000)throw Error('Fotoğraf boyutu küçültülemedi.');
   setIcon(data);
  }catch(e:any){setError(e.message);}finally{if(url)URL.revokeObjectURL(url);setBusy(false);}
 };
 const save=async()=>{
  setBusy(true);setError('');
  try{
   let next:FamilyConfiguration={...configuration,profiles:configuration.profiles.map(q=>q.id===id?{...q,name:name.trim()||q.name,icon}:q)};
   if(p.id!=='parent'&&p.kind==='adult'&&(removePin||pin))next=await FamilyProfilesService.setProfilePin(next,id,removePin?'':pin);
   DeviceProfileAccess.write(prefs);
   // Preferences belong only to this phone; they are not part of Drive snapshots.
   onSave(next);
  }catch(e:any){setError(e.message||'Kaydedilemedi.');}finally{setBusy(false);}
 };
 if(!p)return null;
 return <div className="space-y-3 rounded-xl bg-[#262a30] p-3">
  <h3 className="font-bold">Profil resmi ve bu telefonun açılışı</h3>
  <select aria-label="Düzenlenecek profil" className="w-full bg-[#34363b] p-3 rounded-xl" value={id} onChange={e=>{const q=configuration.profiles.find(p=>p.id===e.target.value)!;setId(q.id);setIcon(q.icon||'👤');setName(q.name);setPin('');setRemovePin(false);setError('');}}>
   {configuration.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
  <input aria-label="Profil adı" value={name} maxLength={32} onChange={e=>setName(e.target.value)} className="w-full bg-[#34363b] p-3 rounded-xl"/>
  <ProfileAvatar icon={icon}/>
  <div className="flex flex-wrap gap-2">{avatars.map(a=><button type="button" aria-label={'Avatar '+a} aria-pressed={icon===a} key={a} onClick={()=>setIcon(a)} className={'p-2 rounded-lg '+(icon===a?'bg-cyan-700':'bg-white/10')}>{a}</button>)}</div>
  <label className="block text-sm">Telefondan fotoğraf seç
   <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{void photo(e.target.files?.[0]);e.target.value='';}} className="block w-full mt-2"/>
  </label>
  <p className="text-xs">Fotoğraf ortadan kare kırpılır. Kaldırmak için hazır bir avatar seç.</p>
  <select aria-label="Bu telefonun kullanım şekli" value={prefs.personal?'personal':'shared'} onChange={e=>setPrefs({...prefs,personal:e.target.value==='personal'})} className="w-full bg-[#34363b] p-3 rounded-xl">
   <option value="shared">Ortak cihaz · Yetişkin açılışında PIN</option>
   <option value="personal">Kişisel cihaz · Son profili hatırla</option>
  </select>
  {p.kind==='adult'&&<label className="block text-sm"><input type="checkbox" checked={prefs.locked[id]!==false} onChange={e=>setPrefs({...prefs,locked:{...prefs.locked,[id]:e.target.checked}})}/> Bu yetişkin profilinde açılışta PIN iste</label>}
  <p className="text-xs">Kişisel cihazda son yetişkin profilini PIN olmadan açmak için üstteki işareti kaldır. Çocuk profilinden yetişkine geçişte ve aile ayarlarında PIN her zaman gerekir. Bu açılış tercihi yalnızca bu telefonda geçerlidir.</p>
  {p.kind==='adult'&&p.id!=='parent'&&<div className="space-y-2">
   <label className="text-sm block">Yeni profil PIN'i (isteğe bağlı)<input type="password" inputMode="numeric" value={pin} disabled={removePin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} className="w-full bg-[#34363b] p-2 rounded-lg"/></label>
   <label className="text-sm block"><input type="checkbox" checked={removePin} onChange={e=>setRemovePin(e.target.checked)}/> Özel profil PIN'ini kaldır; korumalı geçişlerde yönetici PIN'ini kullan</label>
  </div>}
  {error&&<p role="alert" className="text-red-200">{error}</p>}
  <button type="button" disabled={busy} onClick={()=>void save()} className="w-full bg-cyan-400 text-black rounded-xl p-3 font-bold disabled:opacity-40">Profil ve Açılış Ayarlarını Kaydet</button>
 </div>;
}
