import React, { useMemo, useState } from 'react';
import { LockKeyhole, ShieldCheck, UserRound, Baby, X, Check, Settings2 } from 'lucide-react';
import type { MediaItem } from '../../types';
import { ChildAge, FamilyConfiguration, FamilyProfile, FamilyProfilesService } from '../../services/familyProfiles';

interface Props {
  mode: 'setup' | 'choose' | 'manage';
  configuration: FamilyConfiguration | null;
  catalog: MediaItem[];
  activePlaylistName?: string;
  onCreate: (configuration: FamilyConfiguration) => void;
  onSave: (configuration: FamilyConfiguration) => void;
  onSelect: (profile: FamilyProfile) => void;
  onClose?: () => void;
}
const ages: ChildAge[] = [3, 7, 13, 16];
const kinds: Record<string, string> = { live: 'Canlı TV', movie: 'Film', series: 'Dizi' };

export const FamilyProfilesModal: React.FC<Props> = ({
  mode, configuration, catalog, activePlaylistName, onCreate, onSave, onSelect, onClose,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [childName, setChildName] = useState(configuration?.profiles.find(p => p.kind === 'child')?.name || 'Çocuk');
  const [age, setAge] = useState<ChildAge>(configuration?.profiles.find(p => p.kind === 'child')?.ageLimit || 7);
  const [selected, setSelected] = useState<FamilyProfile | null>(null);
  const [authorizations, setAuthorizations] = useState<string[]>(configuration?.profiles.find(p => p.kind === 'child')?.allowedCategories || []);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const categories = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    for (const item of catalog) {
      const key = FamilyProfilesService.categoryKey(item);
      if (!map.has(key)) map.set(key, { key, label: `${kinds[item.type]} · ${item.category || 'Genel'}`, count: 0 });
      map.get(key)!.count++;
    }
    return [...map.values()].filter(row => row.label.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
      .sort((a,b) => a.label.localeCompare(b.label, 'tr'));
  }, [catalog, search]);

  const submitSetup = async () => {
    setError('');
    if (pin !== confirmPin) return setError('PIN tekrarları eşleşmiyor.');
    if (!childName.trim()) return setError('Çocuk profiline bir ad verin.');
    setBusy(true);
    try { onCreate(await FamilyProfilesService.create(pin, childName, age)); }
    catch (err: any) { setError(err.message || 'Profil kurulamadı.'); }
    finally { setBusy(false); }
  };
  const unlock = async () => {
    if (!configuration || !selected) return;
    setBusy(true); setError('');
    try {
      if (await FamilyProfilesService.verifyPin(pin, configuration)) {
        onSelect(selected);
      } else { setError('PIN yanlış.'); setPin(''); }
    } catch (err: any) { setError(err.message || 'PIN kontrol edilemedi.'); setPin(''); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (!configuration) return;
    const next = { ...configuration, profiles: configuration.profiles.map(p => p.kind === 'child'
      ? { ...p, name: childName.trim() || 'Çocuk', ageLimit: age, allowedCategories: authorizations }
      : p) };
    onSave(next);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0b0c10] p-4 text-white overflow-y-auto">
      <section role="dialog" aria-modal="true" aria-label="Aile profilleri" className="w-full max-w-lg max-h-[94dvh] overflow-y-auto rounded-3xl bg-[#1d1d20] border border-white/10 shadow-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-[#00f0ff] shrink-0" />
            <div><h2 className="font-bold text-lg">XIPTV Play · Aile Profilleri</h2>
              <p className="text-xs text-[#b9cacb]">{mode === 'setup' ? 'Çocuk profilini ve ebeveyn PIN’ini oluştur' : mode === 'choose' ? 'Kimin izleyeceğini seç' : 'Çocuk profilinin erişimlerini yönet'}</p></div>
          </div>
          {mode === 'manage' && onClose && <button className="p-2 bg-white/10 rounded-full" onClick={onClose} aria-label="Kapat"><X size={17}/></button>}
        </div>
        {mode === 'setup' && <>
          <p className="text-sm text-[#b9cacb]">Mevcut playlist ve favorilerin Ana Profil'de kalır. Çocuk profili ilk açılışta boş ve kilitlidir; yalnızca senin izin verdiğin kategoriler gösterilir.</p>
          <label className="block text-sm">Çocuk profili adı<input value={childName} onChange={e => setChildName(e.target.value.slice(0, 32))} maxLength={32} className="block w-full mt-2 rounded-xl bg-[#2b2b30] p-3 outline-none"/></label>
          <label className="block text-sm">Çocuk için yaş sınırı<select value={age} onChange={e => setAge(Number(e.target.value) as ChildAge)} className="block w-full mt-2 rounded-xl bg-[#2b2b30] p-3">{ages.map(a => <option key={a} value={a}>{a}+ yaş</option>)}</select></label>
          <label className="block text-sm">Ebeveyn PIN'i (4–6 rakam)<input aria-label="Ebeveyn PIN'i" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="block w-full mt-2 rounded-xl bg-[#2b2b30] p-3"/></label>
          <label className="block text-sm">PIN tekrar<input aria-label="PIN tekrar" type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="block w-full mt-2 rounded-xl bg-[#2b2b30] p-3"/></label>
          <button disabled={busy || pin.length < 4} onClick={() => void submitSetup()} className="w-full rounded-xl bg-[#00f0ff] text-[#00363a] p-3 font-bold disabled:opacity-40">Çocuk Profilini Oluştur</button>
        </>}
        {mode === 'choose' && <>
          <p className="text-xs text-[#b9cacb]">Ebeveyn profili PIN korumalıdır. Çocuk profili sadece izin verilen içeriklere erişebilir.</p>
          <div className="grid grid-cols-2 gap-3">
            {(configuration?.profiles || []).map(p => <button key={p.id} onClick={() => {setError(''); setPin(''); setSelected(p); if (p.kind === 'child') onSelect(p);}}
              className={'rounded-2xl border p-5 flex flex-col items-center gap-2 min-h-36 ' + (selected?.id === p.id ? 'border-[#00f0ff] bg-[#00f0ff]/10' : 'border-white/10 bg-[#2a2a30]')}>
              {p.kind === 'child' ? <Baby className="h-9 w-9 text-[#00f0ff]" /> : <UserRound className="h-9 w-9 text-[#00f0ff]" />}
              <strong className="text-sm break-all">{p.name}</strong>
              <span className="text-[11px] text-[#aebfc0]">{p.kind === 'child' ? `${p.ageLimit}+ yaş` : 'PIN korumalı'}</span>
            </button>)}
          </div>
          {selected?.kind === 'adult' && <div className="space-y-3">
            <label className="block text-sm"><LockKeyhole className="inline w-4 h-4 mr-1"/> Ebeveyn PIN'i<input autoFocus type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,6))} onKeyDown={e => {if (e.key === 'Enter') void unlock();}} className="block mt-2 w-full bg-[#2b2b30] rounded-xl p-3" /></label>
            <button disabled={busy || !pin} onClick={() => void unlock()} className="w-full rounded-xl bg-[#00f0ff] text-[#00363a] p-3 font-bold disabled:opacity-40">Ana Profili Aç</button>
          </div>}
        </>}
        {mode === 'manage' && <>
          <div className="rounded-xl bg-[#2a2a30] p-3 text-xs text-[#d6d6d6]">
            <strong>Güvenli başlangıç:</strong> Yaş seçimi henüz otomatik film yaş doğrulaması yapmaz. Sadece ebeveynin izin verdiği kategoriler görünür. IPTV kategori etiketleri her zaman güvenilir olmayabilir.
          </div>
          <label className="block text-sm">Çocuk profili adı<input value={childName} onChange={e => setChildName(e.target.value.slice(0,32))} className="block w-full mt-2 rounded-xl bg-[#2b2b30] p-3"/></label>
          <label className="block text-sm">Yaş tercihi<select value={age} onChange={e => setAge(Number(e.target.value) as ChildAge)} className="block w-full mt-2 rounded-xl bg-[#2b2b30] p-3">{ages.map(a => <option key={a} value={a}>{a}+ yaş</option>)}</select></label>
          <div><p className="text-sm font-semibold"><Settings2 className="inline mr-1 w-4 h-4"/> İzin verilen kategoriler</p><p className="text-[11px] text-[#b9cacb] mt-1">{activePlaylistName || 'Aktif playlist'} · İzin verilmeyen tüm içerikler gizlenir. Film/dizi kategorilerini açmadan önce uygunluklarını kontrol et.</p></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Kategori ara..." className="w-full rounded-xl bg-[#2b2b30] p-3 text-sm outline-none"/>
          <div className="max-h-[35dvh] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
            {categories.length ? categories.map(row => <button key={row.key} type="button" onClick={() => setAuthorizations(prev => prev.includes(row.key) ? prev.filter(x=>x!==row.key) : [...prev,row.key])}
              className="flex items-center gap-3 w-full px-3 py-3 text-left text-sm bg-[#25252a]">
              <span className={'w-6 h-6 border rounded-md shrink-0 flex items-center justify-center ' + (authorizations.includes(row.key) ? 'bg-[#00f0ff] border-[#00f0ff] text-black' : 'border-white/30')}>{authorizations.includes(row.key) && <Check size={14}/>}</span>
              <span className="flex-1">{row.label}</span><span className="text-xs text-[#aebfc0]">{row.count.toLocaleString('tr-TR')}</span>
            </button>) : <p className="p-4 text-xs text-[#b9cacb]">Bu playlistte eşleşen kategori yok. Önce playlisti Ana Profil'de aç.</p>}
          </div>
          <p className="text-xs text-[#b9cacb]">{authorizations.length} kategoriye izin verildi. Yeni eklenen içerikler, izin verilen kategorideyse otomatik görünür.</p>
          <button onClick={save} className="w-full rounded-xl bg-[#00f0ff] text-[#00363a] p-3 font-bold">İzinleri Kaydet</button>
        </>}
        {error && <p role="alert" className="rounded-lg text-sm p-2 bg-red-500/15 text-red-200">{error}</p>}
      </section>
    </div>
  );
};
