import type { FamilyConfiguration, FamilyProfile } from './familyProfiles';
const KEY='xiptvplay_device_profile_access_v1';
type Preferences={personal:boolean; locked:Record<string,boolean>; last?:string; proof?:string};
const fingerprint=(p:FamilyProfile,c:FamilyConfiguration)=>JSON.stringify([p.id,p.kind,p.role,c.pinHash,c.pinSalt,p.pinHash,p.pinSalt]);
export const DeviceProfileAccess={
 read():Preferences {try {const v=JSON.parse(localStorage.getItem(KEY)||'null');return {personal:v?.personal===true,locked:v?.locked||{},last:v?.last,proof:v?.proof};}catch{return {personal:false,locked:{}};}},
 write(v:Preferences){localStorage.setItem(KEY,JSON.stringify(v));},
 remember(p:FamilyProfile,c:FamilyConfiguration){const v=this.read();this.write({...v,last:p.id,proof:fingerprint(p,c)});},
 startup(c:FamilyConfiguration|null):string|null {
  if(!c)return 'parent';
  const v=this.read(),p=c.profiles.find(p=>p.id===v.last);
  if(!p||v.proof!==fingerprint(p,c))return null;
  if(p.kind==='child')return p.id;
  return v.personal&&v.locked[p.id]===false?p.id:null;
 }
};
