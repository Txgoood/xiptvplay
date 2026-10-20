import React, { useState } from 'react';
import { SystemStats } from '../../types';
import { StorageService } from '../../services/storage';
import { Settings, Tv, Sliders, Trash2, Volume2, HardDrive } from 'lucide-react';

interface SettingsScreenProps {
  stats: SystemStats;
  onClearCache: () => void;
  onResetApp: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  stats,
  onClearCache,
  onResetApp,
}) => {
  const [hardwareDecoder, setHardwareDecoder] = useState(() => {
    const settings = StorageService.getSettings();
    return settings.hardwareDecoder || 'HEVC/H.265 Donanım Hızlandırıcı (MediaCodec)';
  });
  const [bufferSeconds, setBufferSeconds] = useState(15);
  const [wifiOnly, setWifiOnly] = useState(stats.wifiOnly);
  const [concurrency, setConcurrency] = useState(8);
  const [defaultAudio, setDefaultAudio] = useState('Türkçe (Dublaj / Orijinal)');
  const [defaultSubtitle, setDefaultSubtitle] = useState('Türkçe (Kapalı)');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  return (
    <div className="flex flex-col w-full max-w-xl mx-auto px-4 pt-2 pb-28 gap-4 select-none">
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

      {/* Video & Playback Settings */}
      <div className="flex flex-col gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-white/5">
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
            onChange={(e) => setBufferSeconds(Number(e.target.value))}
            className="w-full h-1.5 bg-[#2a2a2c] rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-[10px] text-[#849495]">Düşük gecikme için 5-10s, dalgalı internette 15-30s önerilir.</span>
        </div>
      </div>

      {/* Download & Network Engine */}
      <div className="flex flex-col gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-white/5">
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
            onClick={() => {
              setWifiOnly(!wifiOnly);
              showToast(!wifiOnly ? 'Wi-Fi koruması açık' : 'Mobil veri izni verildi');
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
            <span className="text-[#e5e1e4] font-semibold">Eşzamanlı İndirme Soket Sayısı</span>
            <span className="text-[#4edea3] font-mono font-bold">{concurrency} Hat</span>
          </div>
          <input
            type="range"
            min="2"
            max="16"
            step="2"
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="w-full h-1.5 bg-[#2a2a2c] rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* Audio & Subtitles */}
      <div className="flex flex-col gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-white/5">
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
      <div className="flex flex-col gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-white/5">
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
              showToast('Önbellek temizlendi (42 MB boşaltıldı)');
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
              onResetApp();
              showToast('Uygulama sıfırlandı ve tüm veriler temizlendi.');
            }}
            className="px-3 py-1.5 rounded-full bg-[#93000a]/30 hover:bg-[#93000a]/50 text-xs font-semibold text-[#ffb4ab] border border-[#ffb4ab]/20 cursor-pointer active:scale-95 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#ffb4ab]" />
            <span>Tüm Verileri Sıfırla</span>
          </button>
        </div>
      </div>

      {/* Legal & App Version Footprint */}
      <div className="text-center text-[11px] text-[#849495] py-2 flex flex-col items-center gap-1">
        <span>xiptvplay Engine v4.2.8</span>
        <span>AES-256 Encrypted Keystore • Scoped Storage Compliant</span>
      </div>
    </div>
  );
};
