import { ProfileAppearanceSettings, ProfileAvatar } from './ProfileAppearanceSettings';
import React, { useMemo, useState } from 'react';
import { LockKeyhole, ShieldCheck, UserRound, Baby, X, Settings2 } from 'lucide-react';
import type { MediaItem } from '../../types';
import { ChildAge, FamilyConfiguration, FamilyProfile, FamilyProfilesService } from '../../services/familyProfiles';
import { ChildAutoScanService } from '../../services/childAutoScan';

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
// Only Turkish-prefixed IPTV categories are offered in the child approval list.
// Matching the category itself (not the media title) avoids false positives.
const isTurkishCategory = (category: string): boolean => /^TR(?:$|[^A-Za-z0-9])/i.test(category.trim());

export const FamilyProfilesModal: React.FC<Props> = ({
  mode, configuration, catalog, activePlaylistName, onCreate, onSave, onSelect, onClose,
}) => {
  const [managementUnlocked,setManagementUnlocked]=useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [childName, setChildName] = useState(configuration?.profiles.find(p => p.kind === 'child')?.name || 'Çocuk');
  const [age, setAge] = useState<ChildAge>(configuration?.profiles.find(p => p.kind === 'child')?.ageLimit || 7);
  const [selected, setSelected] = useState<FamilyProfile | null>(null);
  const [editingChildId, setEditingChildId] = useState<string>(configuration?.profiles.find(p => p.kind === 'child')?.id || 'child');
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'adult' | 'child'>('adult');
  const [newAge, setNewAge] = useState<ChildAge>(7);
  const [newPin, setNewPin] = useState('');
  const [copyChildId, setCopyChildId] = useState('');
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [authorizations, setAuthorizations] = useState<string[]>(configuration?.profiles.find(p => p.kind === 'child')?.allowedCategories || []);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'mixed' | 'manual' | 'automatic'>('mixed');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  const [autoSuggestedCategories, setAutoSuggestedCategories] = useState<string[]>([]);
  const [autoSuggestedItemIds, setAutoSuggestedItemIds] = useState<string[]>([]);
  const [scannedIds, setScannedIds] = useState<Record<string, string[]>>({});
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(configuration?.profiles.find(p => p.kind === 'child')?.allowedItemIds || []);
  const [lastScan, setLastScan] = useState<{ checked: number; approved: number; remaining: number } | null>(null);
  const categoryItems = useMemo(() => {
    const groups = new Map<string, MediaItem[]>();
    for (const item of catalog) {
      if (!isTurkishCategory(item.category || '')) continue;
      const key = FamilyProfilesService.categoryKey(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return groups;
  }, [catalog]);
  const suggestedItemSet = useMemo(() => new Set(autoSuggestedItemIds), [autoSuggestedItemIds]);
  const selectedItemSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const categories = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number; type: MediaItem['type'] }>();
    for (const [key, items] of categoryItems) {
      const item = items[0];
      map.set(key, { key, label: `${kinds[item.type]} · ${item.category || 'Genel'}`, count: items.length, type: item.type });
    }
    return [...map.values()].filter(row => {
      if (selectionMode === 'automatic') {
        if (!autoSuggestedCategories.includes(row.key) &&
            !(categoryItems.get(row.key) || []).some(item => suggestedItemSet.has(item.id))) return false;
      }
      return row.label.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'));
    }).sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  }, [categoryItems, search, selectionMode, autoSuggestedCategories, suggestedItemSet]);

  const runScan = async (categoryKey?: string) => {
    if (scanBusy) return;
    const currentChecked = categoryKey ? (scannedIds[categoryKey] || []) : [];
    setScanBusy(true);
    setScanTarget(categoryKey || null);
    setError('');
    setScanMessage(categoryKey ? 'Seçtiğin TR kategorisi yaş kontrolünden geçiriliyor...' : 'TR kanalları ve film/diziler taranıyor...');
    try {
      const result = await ChildAutoScanService.analyze(catalog, age, setScanMessage, currentChecked, categoryKey);
      setAutoSuggestedCategories(prev => [...new Set([...prev, ...result.suggestedCategoryKeys])]);
      setAutoSuggestedItemIds(prev => [...new Set([...prev, ...result.suggestedItemIds])]);
      if (categoryKey) {
        setScannedIds(prev => ({
          ...prev, [categoryKey]: [...new Set([...(prev[categoryKey] || []), ...result.scannedItemIds])],
        }));
      }
      setLastScan({ checked: result.checkedMovies, approved: result.acceptedMovies, remaining: result.unscannedMovies });
      setScanMessage(`Tarama bitti: ${result.acceptedMovies} uygun film/dizi, ${result.suggestedChannelCount} canlı kanal önerildi.${result.unscannedMovies ? ' Kalanlar için bu kategoriyi tekrar tara.' : ''}`);
    } catch (err: any) {
      setError('Otomatik tarama tamamlanamadı: ' + (err?.message || 'Bilinmeyen hata'));
    } finally {
      setScanBusy(false);
    }
  };

  // Changing the age threshold invalidates previous automatic suggestions, not manual approvals.
  const changeAge = (value: ChildAge) => {
    if (value === age) return;
    // Previously verified titles must not remain approved after changing the age policy.
    setSelectedItemIds([]);
    setAge(value);
    setAutoSuggestedCategories([]);
    setAutoSuggestedItemIds([]);
    setScannedIds({});
    setLastScan(null);
    setScanMessage('Yaş sınırı değişti. Otomatik önerileri yeniden tarayabilirsin.');
  };

  const toggleManualCategory = (key: string) => {
    setAuthorizations(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  };

  const addAutomaticCategory = (key: string, mediaType: MediaItem['type']) => {
    if (mediaType === 'live') {
      if (!autoSuggestedCategories.includes(key)) return;
      setAuthorizations(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
      return;
    }
    const categoryIds = (categoryItems.get(key) || []).filter(item => suggestedItemSet.has(item.id)).map(item => item.id);
    if (categoryIds.length === 0) return;
    const allApproved = categoryIds.every(id => selectedItemIds.includes(id));
    setSelectedItemIds(prev => allApproved ? prev.filter(id => !categoryIds.includes(id)) : [...new Set([...prev, ...categoryIds])]);
  };

  const submitSetup = async () => {
    setError('');
    if (pin !== confirmPin) return setError('PIN tekrarları eşleşmiyor.');
    if (!childName.trim()) return setError('Çocuk profiline bir ad verin.');
    setBusy(true);
    try { onCreate(await FamilyProfilesService.create(pin, childName, age)); }
    catch (err: any) { setError(err.message || 'Profil kurulamadı.'); }
    finally { setBusy(false); }
  };
  const addNewProfile = async () => {
    if (!configuration) return;
    setBusy(true); setError('');
    try {
      const next = await FamilyProfilesService.add(configuration, {
        name: newName, kind: newKind, ageLimit: newAge,
        pin: newKind === 'adult' ? newPin : undefined,
        copyFromId: newKind === 'child' ? copyChildId : undefined,
      });
      onSave(next);
      setNewName(''); setNewPin(''); setCreatingProfile(false);
    } catch(err: any) { setError(err.message || 'Yeni profil oluşturulamadı.'); }
    finally { setBusy(false); }
  };
  const unlock = async () => {
    if (!configuration || !selected) return;
    setBusy(true); setError('');
    try {
      if (await FamilyProfilesService.verifyProfilePin(pin, selected, configuration)) {
        onSelect(selected);
      } else { setError('PIN yanlış.'); setPin(''); }
    } catch (err: any) { setError(err.message || 'PIN kontrol edilemedi.'); setPin(''); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (!configuration) return;
    const next = { ...configuration, profiles: configuration.profiles.map(p => p.id === editingChildId && p.kind === 'child'
      ? { ...p, name: childName.trim() || 'Çocuk', ageLimit: age, allowedCategories: authorizations, allowedItemIds: selectedItemIds }
      : p) };
    onSave(next);
  };

  if(mode==='manage' && configuration && !managementUnlocked)return (
    <div className="fixed inset-0 z-[300] bg-[#0b0c10] text-white flex items-center justify-center p-4">
      <section className="w-full max-w-sm space-y-4 rounded-2xl bg-[#25252a] p-5" role="dialog" aria-label="Aile ayarlarını aç">
        <h2>Aile ayarları · Yönetici PIN’i</h2>
        <input aria-label="Yönetici PIN’i" type="password" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} className="w-full bg-[#34363b] p-3 rounded-xl"/>
        {error&&<p role="alert">{error}</p>}
        <button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{if(await FamilyProfilesService.verifyPin(pin,configuration)){setManagementUnlocked(true);setPin('');}else setError('PIN yanlış.');}catch(e:any){setError(e.message);}finally{setBusy(false);}}} className="w-full p-3 bg-cyan-400 text-black rounded-xl">Ayarları Aç</button>
        <button onClick={onClose} className="w-full p-3">Vazgeç</button>
      </section>
    </div>
  );
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
              <ProfileAvatar icon={p.icon}/>
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
          {configuration && <ProfileAppearanceSettings configuration={configuration} onSave={onSave}/>}
          <div className="space-y-3 p-3 rounded-xl bg-[#262a30] border border-white/10">
            <h3 className="text-sm font-bold">Aile Profilleri ({configuration?.profiles.length || 0})</h3>
            <div className="flex flex-wrap gap-2">
              {configuration?.profiles.map(profile => <div key={profile.id} className="flex items-center gap-1 rounded-xl bg-[#353840] px-3 py-2 text-xs">
                <span>{profile.kind === 'child' ? '👧' : '👤'} {profile.name}</span>
                {profile.id !== 'parent' && <button type="button" aria-label={profile.name + ' profilini sil'} title="Profili Sil"
                  className="ml-2 text-[#ffb4ab]" onClick={() => {
                    if (!window.confirm(profile.name + ' profili ve bu cihaza kaydedilmiş kişisel verileri silinsin mi?')) return;
                    const next = FamilyProfilesService.delete(configuration, profile.id);
                    localStorage.removeItem('xiptvplay_profile_favorites_v1_' + profile.id);
                    localStorage.removeItem('xiptvplay_watch_history_v1_' + profile.id);
                    if (editingChildId === profile.id) {
                      const first = next.profiles.find(p => p.kind === 'child');
                      if (first) setEditingChildId(first.id);
                    }
                    onSave(next);
                  }}>✕</button>}
              </div>)}
            </div>
            <button type="button" onClick={() => setCreatingProfile(v => !v)} className="px-3 py-2 bg-[#00f0ff] text-black rounded-xl text-xs font-bold">➕ Profil Ekle</button>
            {creatingProfile && <div className="space-y-2">
              <input aria-label="Yeni profil adı" value={newName} maxLength={32} onChange={e => setNewName(e.target.value)} placeholder="Profil adı" className="w-full bg-[#34363b] rounded-lg p-2.5 text-sm"/>
              <select aria-label="Profil türü" value={newKind} onChange={e => setNewKind(e.target.value as 'adult'|'child')} className="w-full bg-[#34363b] rounded-lg p-2.5 text-sm">
                <option value="adult">Yetişkin</option><option value="child">Çocuk</option>
              </select>
              {newKind === 'adult' ? <label className="text-xs block">İsteğe bağlı profil PIN'i (boş bırakırsan yönetici PIN'i gerekir)
                <input type="password" inputMode="numeric" value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,'').slice(0,6))} className="w-full bg-[#34363b] rounded-lg p-2.5 mt-1"/>
              </label> : <>
                <select aria-label="Çocuk yaş sınırı" value={newAge} onChange={e=>setNewAge(Number(e.target.value) as ChildAge)} className="w-full bg-[#34363b] rounded-lg p-2.5 text-sm">
                  {ages.map(a=><option key={a} value={a}>{a}+ yaş</option>)}
                </select>
                <select aria-label="Çocuk izinlerini kopyala" value={copyChildId} onChange={e=>setCopyChildId(e.target.value)} className="w-full bg-[#34363b] rounded-lg p-2.5 text-sm">
                  <option value="">Boş ve güvenli başlat</option>
                  {configuration?.profiles.filter(p=>p.kind==='child').map(p=><option key={p.id} value={p.id}>{p.name} izinlerini kopyala</option>)}
                </select>
              </>}
              <button type="button" disabled={busy || !newName.trim()} onClick={() => void addNewProfile()} className="w-full bg-[#00f0ff] text-black rounded-lg p-2.5 font-bold disabled:opacity-40">Yeni Profili Kaydet</button>
            </div>}
          </div>
          <div className="rounded-xl bg-[#29292d] border border-white/10 p-3 text-xs text-[#d6d6d6]">
            Çocuk profili varsayılan olarak kapalıdır: sadece kaydettiğin izinler geçerlidir. Otomatik kontrol TMDB yaş etiketlerine bakar; manuel seçimde bir kategorinin tamamı açılır. İki yöntem birlikte kullanılabilir.
          </div>
          {(configuration?.profiles.some(p=>p.kind==='child')) && <label className="block text-sm">Filtreleri yönetilecek çocuk profili
            <select value={editingChildId} onChange={e=>{
              const profile=configuration?.profiles.find(p=>p.id===e.target.value);
              if(!profile)return;
              setEditingChildId(profile.id);setChildName(profile.name);setAge(profile.ageLimit||7);
              setAuthorizations([...profile.allowedCategories]);setSelectedItemIds([...profile.allowedItemIds]);
              setAutoSuggestedCategories([]);setAutoSuggestedItemIds([]);setScannedIds({});setLastScan(null);
            }} className="w-full mt-2 rounded-xl bg-[#2b2b30] p-3">
              {configuration?.profiles.filter(p=>p.kind==='child').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>}
          <label className="block text-sm">Çocuk profili adı<input value={childName} onChange={e => setChildName(e.target.value.slice(0,32))} className="block w-full mt-2 rounded-xl bg-[#2b2b30] p-3"/></label>
          <label className="block text-sm">Yaş tercihi<select value={age} onChange={e => changeAge(Number(e.target.value) as ChildAge)} className="block w-full mt-2 rounded-xl bg-[#2b2b30] p-3">{ages.map(a => <option key={a} value={a}>{a}+ yaş</option>)}</select></label>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="İçerik seçim yöntemi">
            {([
              ['mixed', 'Karma'],
              ['manual', 'Manuel'],
              ['automatic', 'Otomatik'],
            ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setSelectionMode(value)}
              className={'rounded-xl py-2.5 text-xs font-bold border ' + (selectionMode === value ? 'bg-[#00f0ff] border-[#00f0ff] text-[#00363a]' : 'bg-[#2b2b30] border-white/10 text-white')}>{label}</button>)}
          </div>
          <div className="rounded-xl bg-[#00f0ff]/10 border border-[#00f0ff]/20 p-3 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Settings2 size={16}/> Akıllı içerik taraması</h3>
            <p className="text-xs text-[#c5edf0]">{scanMessage || 'İstersen TR çocuk kanallarını ve filmleri otomatik analiz et; istersen doğrudan manuel seç.'}</p>
            {lastScan && <p className="text-xs text-[#c5edf0]">Son tarama: {lastScan.checked} film/dizi incelendi · {lastScan.approved} uygun bulundu · {lastScan.remaining} sırada.</p>}
            <button type="button" disabled={scanBusy} onClick={() => void runScan()}
              className="rounded-lg bg-[#25252a] border border-white/20 px-3 py-2 text-xs font-semibold disabled:opacity-40">
              {scanBusy && !scanTarget ? 'Taranıyor...' : 'Genel Otomatik Tara (ilk 200)'}
            </button>
          </div>
          <div>
            <p className="text-sm font-semibold">🇹🇷 TR Kategorileri · {activePlaylistName || 'Aktif playlist'}</p>
            <p className="text-xs text-[#b9cacb] mt-1">
              {selectionMode === 'manual' ? 'İstediğin TR kategorisini tamamen aç veya ayrı bir yaş taraması başlat.' :
                selectionMode === 'automatic' ? 'Sadece otomatik taramada öneri bulunan kategoriler gösterilir. Kategori bazında doğrulanmış içerikleri ekle.' :
                'TR kategorileri arasından hem elle izin verebilir hem de kategoriye özel otomatik analiz yapabilirsin.'}
            </p>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="TR kategorisi ara..." className="w-full rounded-xl bg-[#2b2b30] p-3 text-sm outline-none"/>
          <div className="max-h-[38dvh] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
            {categories.length ? categories.map(row => {
              const suggestedLive = autoSuggestedCategories.includes(row.key);
              const approvedIds = (categoryItems.get(row.key) || []).filter(item => suggestedItemSet.has(item.id)).map(item => item.id);
              const manualSelected = authorizations.includes(row.key);
              const autoSelected = row.type === 'live' ? suggestedLive && manualSelected
                : approvedIds.length > 0 && approvedIds.every(id => selectedItemSet.has(id));
              return <div key={row.key} className="p-3 space-y-2 bg-[#25252a]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold min-w-0 break-words">{row.label}</span>
                  <span className="text-xs text-[#aebfc0] shrink-0">{row.count.toLocaleString('tr-TR')} içerik</span>
                </div>
                {row.type !== 'live' && approvedIds.length > 0 && <p className="text-[11px] text-[#4edea3]">TMDB doğrulamalı: {approvedIds.length} içerik</p>}
                <div className="flex flex-wrap gap-2">
                  {selectionMode !== 'automatic' && <button type="button" onClick={() => toggleManualCategory(row.key)}
                    className={'rounded-lg px-2.5 py-2 text-xs font-semibold border ' + (manualSelected ? 'bg-[#00f0ff] text-[#00363a] border-[#00f0ff]' : 'bg-[#39393d] text-white border-white/10')}>
                    {manualSelected ? '✓ Tamamına izin verildi' : 'Tamamına izin ver'}
                  </button>}
                  {row.type !== 'live' && <button type="button" disabled={scanBusy} onClick={() => void runScan(row.key)}
                    className="rounded-lg px-2.5 py-2 text-xs font-semibold bg-[#39393d] text-white border border-white/10 disabled:opacity-40">
                    {scanBusy && scanTarget === row.key ? 'Taranıyor...' : (scannedIds[row.key]?.length ? 'Sonraki 200’ü Tara' : 'Bu kategoriyi tara')}
                  </button>}
                  {selectionMode !== 'manual' && ((row.type === 'live' && suggestedLive) || (row.type !== 'live' && approvedIds.length > 0)) &&
                    <button type="button" onClick={() => addAutomaticCategory(row.key, row.type)}
                      className={'rounded-lg px-2.5 py-2 text-xs font-semibold border ' + (autoSelected ? 'bg-[#4edea3]/20 border-[#4edea3]/50 text-[#4edea3]' : 'bg-[#155561] border-[#00f0ff]/30 text-[#baf6ff]')}>
                      {autoSelected ? '✓ Otomatik öneri seçili' : 'Doğrulananları ekle'}
                    </button>}
                </div>
                {manualSelected && row.type !== 'live' && <p className="text-[11px] text-amber-200">Manuel izin bu kategorideki yaş bilgisi doğrulanmamış film/dizileri de açar.</p>}
              </div>;
            }) : <p className="p-4 text-xs text-[#b9cacb]">Bu görünümde eşleşen TR kategori yok. Otomatik moddaysan önce tarama başlat veya Karma / Manuel seç.</p>}
          </div>
          <p className="text-xs text-[#c8d1d2]">Kaydedilecekler: {authorizations.length} tam kategori + {selectedItemIds.length} ayrı onaylı film/dizi. Önceden kaydettiğin izinler korunur.</p>
          <button type="button" onClick={save} disabled={scanBusy}
            className="w-full disabled:opacity-40 rounded-xl bg-[#00f0ff] text-[#00363a] p-3 font-bold">İzinleri Kaydet</button>
        </>}
        {error && <p role="alert" className="rounded-lg text-sm p-2 bg-red-500/15 text-red-200">{error}</p>}
      </section>
    </div>
  );
};
