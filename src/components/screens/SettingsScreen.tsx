import React, { useState } from 'react';
import { SystemStats } from '../../types';
import { Settings, Tv, Sliders, Trash2, Wifi, Volume2, HardDrive, ShieldCheck, RefreshCw, Cpu, Layers } from 'lucide-react';

interface SettingsScreenProps {
  stats: SystemStats;
  onClearCache: () => void;
  onResetApp: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ stats, onClearCache, onResetApp }) => {
  const [wifiOnly, setWifiOnly] = useState(stats.wifiOnly);
  const [bufferSize, setBufferSize] = useState<'normal' | 'large' | 'ultra'>('large');
  const [hwAcceleration, setHwAcceleration] = useState(true);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleClearCacheClick = () => {
    onClearCache();
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 3000);
  };

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-4 flex flex-col gap-6 pb-28">
      {/* Title */}
      <div className="flex items-center gap-3 bg-[#18181b]/90 border border-white/5 rounded-2xl p-4 backdrop-blur-md">
        <div className="w-10 h-10 rounded-xl bg-[#00f0ff]/10 border border-[#00f0ff]/20 flex items-center justify-center text-[#00f0ff]">
          <Settings className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <h1 className="font-headline font-bold text-base sm:text-lg text-white">
            Uygulama Ayarları &amp; Motor Yapılandırması
          </h1>
          <span className="text-xs text-[#849495]">
            Xtream motoru, tamponlama boyutu, indirme kuralları ve depolama yönetimi
          </span>
        </div>
      </div>

      {/* Network & Streaming Engine */}
      <div className="bg-[#18181b] rounded-2xl border border-white/5 p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-2 border-b border-white/5">
          <Sliders className="w-4 h-4 text-[#00f0ff]" />
          <h2 className="font-headline font-bold text-sm text-white">Yayın &amp; Oynatıcı Motoru</h2>
        </div>

        <div className="flex items-center justify-between py-1">
          <div className="flex flex-col">
            <span className="font-headline text-xs font-semibold text-white">Yalnızca Wi-Fi ile İndir</span>
            <span className="text-[11px] text-[#849495]">Mobil veri tüketimini engeller ve hücresel ağda indirmeleri bekletir</span>
          </div>
          <button
            onClick={() => setWifiOnly(!wifiOnly)}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              wifiOnly ? 'bg-[#00f0ff]' : 'bg-[#2a2a2c]'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-[#131315] absolute top-1 transition-transform ${
                wifiOnly ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between py-1">
          <div className="flex flex-col">
            <span className="font-headline text-xs font-semibold text-white">Donanım Hızlandırma (Hardware Decode)</span>
            <span className="text-[11px] text-[#849495]">4K UHD ve 60FPS yayınlarda GPU donanım çözücüsünü devreye sokar</span>
          </div>
          <button
            onClick={() => setHwAcceleration(!hwAcceleration)}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              hwAcceleration ? 'bg-[#00f0ff]' : 'bg-[#2a2a2c]'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-[#131315] absolute top-1 transition-transform ${
                hwAcceleration ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between py-1">
          <div className="flex flex-col">
            <span className="font-headline text-xs font-semibold text-white">HLS Tamponlama Boyutu (Buffer)</span>
            <span className="text-[11px] text-[#849495]">Ağ dalgalanmalarında canlı yayın donmalarını önleme süresi</span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#201f21] p-1 rounded-xl border border-white/5">
            {(['normal', 'large', 'ultra'] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBufferSize(b)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold capitalize transition-all cursor-pointer ${
                  bufferSize === b
                    ? 'bg-[#00f0ff] text-[#00363a]'
                    : 'text-[#849495] hover:text-white'
                }`}
              >
                {b === 'normal' ? '5 Sn' : b === 'large' ? '15 Sn' : '30 Sn'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Storage Management Card */}
      <div className="bg-[#18181b] rounded-2xl border border-white/5 p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-2 border-b border-white/5">
          <HardDrive className="w-4 h-4 text-[#00f0ff]" />
          <h2 className="font-headline font-bold text-sm text-white">Önbellek &amp; Kalıcı Depolama</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-[#201f21] border border-white/5 flex flex-col">
            <span className="text-[10px] text-[#849495]">Kanal Önbelleği</span>
            <span className="font-headline font-bold text-sm text-[#00f0ff] mt-0.5">
              {stats.cacheSizeGb} GB
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#201f21] border border-white/5 flex flex-col">
            <span className="text-[10px] text-[#849495]">Kurtarılabilir Alan</span>
            <span className="font-headline font-bold text-sm text-[#4edea3] mt-0.5">
              {cacheCleared ? '0 MB' : `${stats.releasableMb} MB`}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#201f21] border border-white/5 flex flex-col">
            <span className="text-[10px] text-[#849495]">Kullanılan Depolama</span>
            <span className="font-headline font-bold text-sm text-white mt-0.5">
              %{stats.usedPercent}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#201f21] border border-white/5 flex flex-col">
            <span className="text-[10px] text-[#849495]">Boş Cihaz Alanı</span>
            <span className="font-headline font-bold text-sm text-white mt-0.5">
              {stats.freeStorageGb} GB
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="text-xs text-[#849495]">
            Geçici resim önbelleklerini ve tamamlanan HLS segment parçalarını temizler.
          </div>
          <button
            onClick={handleClearCacheClick}
            disabled={cacheCleared}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#201f21] hover:bg-[#2a2a2c] text-xs font-semibold text-[#00f0ff] border border-[#00f0ff]/30 cursor-pointer transition-all flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cacheCleared ? 'animate-spin' : ''}`} />
            <span>{cacheCleared ? 'Önbellek Temizlendi' : 'Önbelleği Boşalt'}</span>
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-[#18181b] rounded-2xl border border-[#ff5470]/20 p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#ff5470]/10">
          <Trash2 className="w-4 h-4 text-[#ff5470]" />
          <h2 className="font-headline font-bold text-sm text-[#ff5470]">Sıfırlama &amp; Veri Silme</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-headline text-xs font-semibold text-white">Tüm Verileri ve Playlistleri Sıfırla</span>
            <span className="text-[11px] text-[#849495]">
              Cihazda kayıtlı tüm Xtream ve M3U oynatma listelerini, favorileri ve indirme geçmişini kalıcı olarak siler.
            </span>
          </div>

          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#ff5470]/10 hover:bg-[#ff5470]/20 text-xs font-bold text-[#ff5470] border border-[#ff5470]/30 cursor-pointer transition-all shrink-0"
            >
              Uygulamayı Sıfırla
            </button>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setConfirmReset(false)}
                className="px-3 py-2 rounded-xl bg-[#201f21] text-xs text-[#849495] hover:text-white cursor-pointer"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  onResetApp();
                  setConfirmReset(false);
                }}
                className="px-4 py-2 rounded-xl bg-[#ff5470] hover:bg-[#ff3355] text-xs font-bold text-white shadow-lg cursor-pointer"
              >
                Evet, Kalıcı Olarak Sil
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
