import {getInterfaceMode,saveInterfaceMode,type InterfaceMode} from '../../services/interfaceMode';
import { Capacitor, registerPlugin } from '@capacitor/core';
import React, { useState } from 'react';
import { categoryKey, classifyTr, createContentFilter } from '../../services/smartTrFilter';
import { SystemStats, MediaItem } from '../../types';
import { StorageService } from '../../services/storage';
import { Settings, Tv, Sliders, Trash2, Volume2, HardDrive, ShieldCheck } from 'lucide-react';

interface SettingsScreenProps {
  stats: SystemStats;
  onOpenPlaylists?: () => void;
  catalog: MediaItem[];
  onClearCache: () => void;
  onResetApp: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  stats,
  onOpenPlaylists,
  catalog,
  onClearCache,
  onResetApp,
}) => {
  const tv=getInterfaceMode()==='tv';
  const [group,setGroup]=useState('interface');
  const [reducedMotion,setReducedMotion]=useState(()=>localStorage.getItem('xiptv_tv_reduced_motion')==='1');
  const [confirmReset,setConfirmReset]=useState(false);
  const hidden=(...groups:string[])=>tv&&!groups.includes(group);
  const [interfaceMode,setInterfaceMode]=useState<InterfaceMode>(getInterfaceMode);
  const disk=React.useMemo(()=>registerPlugin<{getDownloadTarget():Promise<any>;setDownloadTarget(options:{target:string}):Promise<any>}>('DownloadFiles'),[]);
  const [target,setTarget]=useState<any>(null);
  const refreshTarget=()=>disk.getDownloadTarget().then(setTarget).catch(()=>{});
  React.useEffect(()=>{if(Capacitor.getPlatform()==='android')void refreshTarget();},[]);
  const [hardwareDecoder, setHardwareDecoder] = useState(() => {
    const settings = StorageService.getSettings();
    return settings.hardwareDecoder || 'HEVC/H.265 Donanım Hızlandırıcı (MediaCodec)';
  });
  const [bufferSeconds, setBufferSeconds] = useState(() => { const s = StorageService.getSettings(); return Number.isFinite(Number(s.bufferSeconds)) ? Math.max(3, Math.min(45, Number(s.bufferSeconds))) : 15; });
  const [wifiOnly, setWifiOnly] = useState(() => StorageService.isDownloadWifiOnly());
  const [concurrency, setConcurrency] = useState(() => { const s = StorageService.getSettings(); return Number.isFinite(Number(s.downloadConcurrency)) ? Math.max(2, Math.min(4, Number(s.downloadConcurrency))) : 4; });
  const [defaultAudio, setDefaultAudio] = useState('Türkçe (Dublaj / Orijinal)');
  const [defaultSubtitle, setDefaultSubtitle] = useState('Türkçe (Kapalı)');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hideAdultCategories, setHideAdultCategories] = useState(() => Boolean(StorageService.getSettings().hideAdultCategories));
  const [showOnlyTurkishCategories, setShowOnlyTurkishCategories] = useState(() => Boolean(StorageService.getSettings().showOnlyTurkishCategories));

  const [trSettings, setTrSettings] = useState(() => StorageService.getSettings());
  const [manageTr, setManageTr] = useState(false);
  const [trSearch, setTrSearch] = useState('');
  const [trType, setTrType] = useState('live');
  const saveTr = (patch: Record<string, any>) => {
    const next = {...StorageService.getSettings(), ...patch};
    StorageService.saveSettings(next); setTrSettings(next);
  };
  const categories = React.useMemo(() => {
    const map = new Map<string, {name:string; type:string; count:number; shown:number}>();
    const filter = createContentFilter(trSettings);
    for(const item of catalog){
      const name=item.category||'Genel', key=categoryKey(item.type,name);
      const row=map.get(key)||{name,type:item.type,count:0,shown:0};
      row.count++; if(filter(item))row.shown++; map.set(key,row);
    }
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  },[catalog,trSettings]);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  return (
    <div className="tv-settings-screen flex flex-col w-full max-w-xl mx-auto px-4 pt-2 pb-28 gap-4 select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 inset-x-0 flex justify-center z-50 pointer-events-none px-4">
          <div className="px-4 py-2 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold shadow-2xl border border-white/20 pointer-events-auto">
            {toastMessage}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-[#00f0ff]" />
        <h2 className="font-headline text-lg font-bold text-[#e5e1e4]">Uygulama &amp; Motor Ayarları</h2>

      </div>

      {tv&&<nav className="tv-management-tabs" aria-label="Ayar kategorileri">{[["interface","Arayüz ve TV"],["playlist","Playlist ve sunucu"],["privacy","İçerik filtreleri"],["player","Oynatıcı ve dil"],["download","İndirme ve USB"],["maintenance","Bakım"],["about","Sürüm bilgileri"]].map(([id,label])=><button key={id} aria-pressed={group===id} onClick={()=>{setGroup(id);setConfirmReset(false);}}>{label}</button>)}</nav>}
      {onOpenPlaylists && !hidden("playlist") && <button type="button" onClick={onOpenPlaylists} className="w-full flex items-center justify-between rounded-2xl bg-[#1c1b1d] border border-white/10 p-4 text-left"><span><strong>Playlist ve Sunucu Yönetimi</strong><br/><span className="text-xs text-[#b9cacb]">Sunucu ekle, düzenle, doğrula ve senkronize et</span></span><span>›</span></button>}
      {target&&!hidden("download")&&<section className="flex flex-col gap-2 rounded-2xl bg-[#1c1b1d] p-4"><strong>İndirme ve Depolama Konumu</strong><label>Varsayılan hedef <select className="bg-[#29292c] rounded-lg p-2" value={target.target} onChange={e=>disk.setDownloadTarget({target:e.target.value}).then(setTarget).catch(err=>showToast(String(err.message||err)))}><option value="internal">Dahili hafıza</option><option value="usb">Harici USB bellek</option></select></label><span>Dahili boş/toplam: {(target.internalFree/1e9).toFixed(1)} / {(target.internalTotal/1e9).toFixed(1)} GB</span><span>{target.usbAvailable?'USB boş/toplam: '+(target.usbFree/1e9).toFixed(1)+' / '+(target.usbTotal/1e9).toFixed(1)+' GB':'USB bağlı değil veya erişilemiyor'}</span><button className="p-2 rounded-lg bg-white/10" onClick={refreshTarget}>Depolamayı yenile</button><p className="text-xs">Yeni indirmeler seçili konuma kaydedilir. Eski dosyalar taşınmaz.</p></section>}
      <section hidden={hidden("interface")} className="flex flex-col gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-white/5">
        <strong>Arayüz ve Cihaz Deneyimi</strong>
        <p className="text-xs text-[#b9cacb]">Telefon veya Android TV görünümünü seçin. Uygulama yeniden açılır; kayıtlı veriler silinmez.</p>
        <div className="flex gap-2 flex-wrap">{(['phone','tv'] as const).map(mode=><button key={mode} type="button" aria-pressed={interfaceMode===mode} onClick={()=>setInterfaceMode(mode)} className={interfaceMode===mode?'rounded-xl bg-[#00f0ff] text-[#00363a] p-3 font-bold':'rounded-xl bg-white/10 p-3'}>{mode==='phone'?'Telefon':'TV / Android TV'}</button>)}</div>
        <button type="button" disabled={interfaceMode===getInterfaceMode()} className="rounded-xl bg-[#0566d9] p-3 disabled:opacity-40" onClick={()=>{saveInterfaceMode(interfaceMode);window.location.reload();}}>Arayüzü uygula</button>
      </section>
      {tv&&group==="interface"&&<section className="tv-preference-panel"><strong>TV deneyimi</strong><button role="switch" aria-checked={reducedMotion} onClick={()=>{const next=!reducedMotion;localStorage.setItem("xiptv_tv_reduced_motion",next?"1":"0");setReducedMotion(next);document.documentElement.classList.toggle("xiptv-tv-reduced-motion",next);}}>Hafif animasyon modu: {reducedMotion?"Açık":"Kapalı"}</button><p>Hareketli efektleri azaltarak kumanda kullanımını sadeleştirir. Poster boyutu katalogdaki görünüm menüsünden ayarlanır.</p></section>}
      {/* Content privacy settings */}
      <div hidden={hidden("privacy")} className="flex flex-col gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-white/5">
        <div className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[#ffb4ab]" /><span className="font-headline text-xs text-[#ffb4ab] uppercase tracking-wider font-bold">İçerik Gizliliği</span></div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col pr-2 gap-1"><span className="text-xs font-semibold text-[#e5e1e4]">Yetişkin kategorilerini gizle</span><span className="text-[11px] text-[#b9cacb]">Canlı TV, film ve dizilerde yetişkin kategori ve içerik adlarını katalogdan ve arama sonuçlarından gizler.</span></div>
          <button type="button" role="switch" aria-checked={hideAdultCategories} onClick={() => { const next = !hideAdultCategories; setHideAdultCategories(next); saveTr({hideAdultCategories: next}); showToast(next ? 'Yetişkin kategorileri gizlendi' : 'Yetişkin kategorileri gösteriliyor'); }} className={`w-11 h-6 rounded-full transition-colors duration-200 p-0.5 flex items-center shrink-0 ${hideAdultCategories ? 'bg-[#0566d9]' : 'bg-[#2a2a2c]'}`}><span className={`w-5 h-5 rounded-full transition-transform duration-200 shadow-md ${hideAdultCategories ? 'translate-x-5 bg-[#00f0ff]' : 'translate-x-0 bg-[#849495]'}`}></span></button>
        </div>
        <p className="text-[10px] text-[#849495]">Bu ayar uygulama arayüzünde gizleme yapar; tek başına ebeveyn kilidi veya içerik erişim koruması değildir.</p>
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/5">
          <div className="flex flex-col pr-2 gap-1"><span className="text-xs font-semibold text-[#e5e1e4]">Akıllı Türkiye filtresi</span><span className="text-[11px] text-[#b9cacb]">TR, [TR], Türkçe kategorileri ve Türk kanallarını tanır. Yabancı ülke kategorilerini gizler.</span></div>
          <button type="button" role="switch" aria-checked={showOnlyTurkishCategories} onClick={() => { const next = !showOnlyTurkishCategories; setShowOnlyTurkishCategories(next); saveTr({showOnlyTurkishCategories: next}); showToast(next ? 'Yalnızca TR kategorileri gösteriliyor' : 'Tüm ülke kategorileri gösteriliyor'); }} className={`w-11 h-6 rounded-full transition-colors duration-200 p-0.5 flex items-center shrink-0 ${showOnlyTurkishCategories ? 'bg-[#0566d9]' : 'bg-[#2a2a2c]'}`}><span className={`w-5 h-5 rounded-full transition-transform duration-200 shadow-md ${showOnlyTurkishCategories ? 'translate-x-5 bg-[#00f0ff]' : 'translate-x-0 bg-[#849495]'}`}></span></button>
        </div>

        {showOnlyTurkishCategories && <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
          {([['trLive','Canlı TV Türkiye filtresi'],['trMovie','Film Türkçe filtresi'],['trSeries','Dizi Türkçe filtresi'],['trUnknown','Tanımlanamayan içerikleri göster']] as const).map(([key,label])=>{
            const enabled=key==='trUnknown'?trSettings[key]===true:trSettings[key]!==false;
            return <button key={key} type="button" role="switch" aria-checked={enabled} onClick={()=>saveTr({[key]:!enabled})} className="flex justify-between items-center rounded-xl bg-[#201f21] p-3 text-sm"><span>{label}</span><span className={enabled?'text-[#00f0ff]':'text-[#849495]'}>{enabled?'Açık':'Kapalı'}</span></button>;
          })}
          <button type="button" onClick={()=>setManageTr(!manageTr)} className="rounded-xl bg-[#0566d9] p-3 text-sm font-bold">Kategori yönetimi ve filtre raporu ({categories.length})</button>
          {manageTr && <div className="flex flex-col gap-2">
            <select value={trType} onChange={e=>setTrType(e.target.value)} className="discovery-select"><option value="live">Canlı TV</option><option value="movie">Film</option><option value="series">Dizi</option></select>
            <input value={trSearch} onChange={e=>setTrSearch(e.target.value)} placeholder="Kategori ara..." className="discovery-select"/>
            <div className="max-h-80 overflow-y-auto flex flex-col gap-2">
            {categories.filter(row=>row.type===trType&&row.name.toLocaleLowerCase('tr').includes(trSearch.toLocaleLowerCase('tr'))).map(row=>{
              const key=categoryKey(row.type,row.name);
              return <div key={key} className="rounded-xl bg-[#201f21] p-2 flex flex-col gap-1"><span>{row.name} · {row.shown}/{row.count} görünür · {classifyTr({type:row.type,category:row.name})==='tr'?'Türkiye':classifyTr({type:row.type,category:row.name})==='foreign'?'Yabancı':'Belirsiz'}</span><select aria-label={row.name} className="discovery-select" value={trSettings.trOverrides?.[key]||'auto'} onChange={e=>{const overrides={...trSettings.trOverrides};if(e.target.value==='auto')delete overrides[key];else overrides[key]=e.target.value;saveTr({trOverrides:overrides});}}><option value="auto">Otomatik</option><option value="show">Göster</option><option value="hide">Gizle</option></select></div>;
            })}
            </div>
          </div>}
        </div>}
      </div>

      {/* Video & Playback Settings */}
      <div hidden={hidden("player")} className="flex flex-col gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-white/5">
        <div className="flex items-center gap-1.5">
          <Tv className="w-4 h-4 text-[#00f0ff]" />
          <span className="font-headline text-xs text-[#00f0ff] uppercase tracking-wider font-bold">
            Oynatıcı &amp; Donanım
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#e5e1e4] font-semibold">Video Donanım Çözücü</label>
          <select
            value={hardwareDecoder}
            onChange={(e) => {
              const val = e.target.value;
              setHardwareDecoder(val);
              const settings = StorageService.getSettings();
              StorageService.saveSettings({ ...settings, hardwareDecoder: val });
              showToast('Video donanım çözücü tercihi kalıcı olarak kaydedildi');
            }}
            className="w-full bg-[#201f21] border border-white/5 rounded-xl px-3 py-2 text-xs text-[#e5e1e4] focus:outline-none focus:border-[#00f0ff]/40"
          >
            <option>HEVC/H.265 Donanım Hızlandırıcı (MediaCodec)</option>
            <option>AV1 Ultra-HD Donanım Dekoderi</option>
            <option>AVC/H.264 Standart Donanım</option>
            <option>Yazılımsal Fallback (FFmpeg libavcodec)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#e5e1e4] font-semibold">Canlı Yayın Tamponu (Buffer)</span>
            <span className="text-[#00f0ff] font-mono font-bold">{bufferSeconds} saniye</span>
          </div>
          <input
            type="range"
            min="3"
            max="45"
            step="1"
            value={bufferSeconds}
            onChange={(e) => { const value = Number(e.target.value); setBufferSeconds(value); const settings = StorageService.getSettings(); if (!StorageService.saveSettings({ ...settings, bufferSeconds: value })) showToast('Tampon ayarı kaydedilemedi'); }}
            className="w-full h-1.5 bg-[#2a2a2c] rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-[10px] text-[#849495]">Düşük gecikme için 5-10s, dalgalı internette 15-30s önerilir.</span>
        </div>
      </div>

      {/* Download & Network Engine */}
      <div hidden={hidden("download")} className="flex flex-col gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-white/5">
        <div className="flex items-center gap-1.5">
          <Sliders className="w-4 h-4 text-[#0566d9]" />
          <span className="font-headline text-xs text-[#0566d9] uppercase tracking-wider font-bold">
            İndirme &amp; Ağ Motoru
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-col pr-2">
            <span className="text-xs font-semibold text-[#e5e1e4]">Sadece Wi-Fi Üzerinden İndir</span>
            <span className="text-[11px] text-[#b9cacb]">Mobil veri kotası aşmamak için indirmeleri kısıtlar</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Sadece Wi-Fi Üzerinden İndir"
            aria-checked={wifiOnly}
            onClick={() => {
              const next = !wifiOnly;
              if (!StorageService.saveSettings({ ...StorageService.getSettings(), wifiOnly: next })) {
                showToast('İndirme ayarı kaydedilemedi');
                return;
              }
              setWifiOnly(next);
              showToast(next ? 'Wi-Fi koruması açık' : 'Mobil veri izni verildi');
            }}
            className={`w-11 h-6 rounded-full transition-colors duration-200 p-0.5 flex items-center shrink-0 cursor-pointer ${
              wifiOnly ? 'bg-[#0566d9]' : 'bg-[#2a2a2c]'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full transition-transform duration-200 shadow-md ${
                wifiOnly ? 'translate-x-5 bg-[#00f0ff]' : 'translate-x-0 bg-[#849495]'
              }`}
            ></span>
          </button>
        </div>

        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#e5e1e4] font-semibold">Mobil Veride İndirme Bağlantısı</span>
            <span className="text-[#4edea3] font-mono font-bold">{concurrency} Hat</span>
          </div>
          <input
            type="range"
            min="2"
            max="4"
            step="1"
            value={concurrency}
            onChange={(e) => { const value = Number(e.target.value); setConcurrency(value); const settings = StorageService.getSettings(); if (!StorageService.saveSettings({ ...settings, downloadConcurrency: value })) showToast('İndirme ayarı kaydedilemedi'); }}
            className="w-full h-1.5 bg-[#2a2a2c] rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* Audio & Subtitles */}
      <div hidden={hidden("player")} className="flex flex-col gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-white/5">
        <div className="flex items-center gap-1.5">
          <Volume2 className="w-4 h-4 text-[#4edea3]" />
          <span className="font-headline text-xs text-[#4edea3] uppercase tracking-wider font-bold">
            Varsayılan Dil &amp; Altyazı
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#e5e1e4] font-semibold">Tercih Edilen Ses İzi</label>
          <select
            value={defaultAudio}
            onChange={(e) => setDefaultAudio(e.target.value)}
            className="w-full bg-[#201f21] border border-white/5 rounded-xl px-3 py-2 text-xs text-[#e5e1e4] focus:outline-none"
          >
            <option>Türkçe (Dublaj / Orijinal)</option>
            <option>English (Dolby Atmos / 5.1)</option>
            <option>Yayın Birincil Parçası</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#e5e1e4] font-semibold">Altyazı Davranışı</label>
          <select
            value={defaultSubtitle}
            onChange={(e) => setDefaultSubtitle(e.target.value)}
            className="w-full bg-[#201f21] border border-white/5 rounded-xl px-3 py-2 text-xs text-[#e5e1e4] focus:outline-none"
          >
            <option>Türkçe (Kapalı)</option>
            <option>Her Zaman Açık (Türkçe)</option>
            <option>Her Zaman Açık (English)</option>
            <option>Tamamen Devre Dışı</option>
          </select>
        </div>
      </div>

      {/* Storage and Maintenance */}
      <div hidden={hidden("maintenance")} className="flex flex-col gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-white/5">
        <div className="flex items-center gap-1.5">
          <HardDrive className="w-4 h-4 text-[#ffb4ab]" />
          <span className="font-headline text-xs text-[#ffb4ab] uppercase tracking-wider font-bold">
            Bakım &amp; Depolama
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[#e5e1e4]">Önbellek &amp; Geçici Dosyalar</span>
            <span className="text-[11px] text-[#b9cacb]">
              {stats.cacheSizeGb} GB önbellek ({stats.releasableMb} MB serbest bırakılabilir)
            </span>
          </div>
          <button
            onClick={() => {
              onClearCache();
              showToast('Önbellek temizleme işlemi başlatıldı');
            }}
            className="px-3 py-1.5 rounded-full bg-[#2a2a2c] hover:bg-[#353437] text-xs font-semibold text-[#e5e1e4] border border-white/5 cursor-pointer active:scale-95"
          >
            Temizle
          </button>
        </div>

        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[#ffb4ab]">Uygulamayı Sıfırla</span>
            <span className="text-[10px] text-[#849495]">Kayıtlı playlistler, indirmeler ve ayarlar silinir</span>
          </div>
          <button
            onClick={() => {
              if(tv&&!confirmReset){setConfirmReset(true);return;}
              setConfirmReset(false);onResetApp();
            }}
            className="px-3 py-1.5 rounded-full bg-[#93000a]/30 hover:bg-[#93000a]/50 text-xs font-semibold text-[#ffb4ab] border border-[#ffb4ab]/20 cursor-pointer active:scale-95 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#ffb4ab]" />
            <span>{tv&&confirmReset?'Onayla: Tüm verileri sil':'Tüm Verileri Sıfırla'}</span>
          </button>
        </div>
      </div>

      {tv&&group==='maintenance'&&confirmReset&&<button className="tv-preference-panel" onClick={()=>setConfirmReset(false)}>Vazgeç — verilerimi koru</button>}
      {/* Legal & App Version Footprint */}
      <div hidden={hidden("about")} className="text-center text-[11px] text-[#849495] py-2 flex flex-col items-center gap-1">
        <span>XIPTV Play v{__XIPTV_ANDROID_VERSION__} • Android Build {__XIPTV_ANDROID_BUILD__}</span>
        <span>Engine v4.2.8</span>
        <span>AES-256 Encrypted Keystore • Scoped Storage Compliant</span>
      </div>
    </div>
  );
};
