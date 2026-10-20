import React from 'react';
import { Gauge, Lock, CheckCircle2, Download, Key, SlidersHorizontal, Play } from 'lucide-react';

interface OnboardingScreenProps {
  onContinueAsGuest: () => void;
  onSignInWithGoogle: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  onContinueAsGuest,
  onSignInWithGoogle,
}) => {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-6 max-w-md mx-auto select-none overflow-hidden">
      {/* Ambient Atmospheric Lighting */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-[#0566d9]/20 blur-3xl pointer-events-none"></div>
      <div className="absolute top-28 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-[#00f0ff]/15 blur-2xl pointer-events-none"></div>

      {/* Hero & Brand Section */}
      <div className="relative flex flex-col items-center text-center mt-2 z-10">
        {/* Glowing Brand Emblem Container */}
        <div className="relative flex items-center justify-center w-28 h-28 mb-4">
          <div className="absolute inset-0 rounded-full bg-[#00f0ff]/30 blur-xl animate-pulse"></div>
          <div className="relative z-10 w-24 h-24 rounded-full bg-[#2a2a2c]/90 p-1 shadow-2xl flex items-center justify-center border border-white/10">
            <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#0566d9] via-[#00363a] to-[#00f0ff] flex items-center justify-center shadow-inner">
              <Play className="w-10 h-10 text-[#00f0ff] fill-[#00f0ff] ml-1 drop-shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
            </div>
          </div>
          {/* Floating Orbital Dot */}
          <div className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full bg-[#6ffbbe] shadow-[0_0_8px_#6ffbbe]"></div>
        </div>

        {/* Engine status badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2a2a2c]/70 backdrop-blur-md mb-2 border border-white/5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-ping"></span>
          <span className="font-headline text-[11px] text-[#6ffbbe] font-semibold">
            Engine v4.2 Aktif
          </span>
        </div>

        <h1 className="font-headline text-3xl sm:text-4xl text-[#dbfcff] font-bold tracking-normal">
          xiptv<span className="text-[#00f0ff] drop-shadow-[0_0_14px_rgba(0,240,255,0.55)]">play</span>
        </h1>
        <p className="text-[14px] text-[#b9cacb] max-w-xs mt-1 leading-snug">
          Güvenli Canlı Yayın &amp; Hızlı Çevrimdışı İndirme
        </p>
      </div>

      {/* Telemetry / Live Pulse Indicator */}
      <div className="flex items-center justify-center gap-2.5 mt-4 mb-3 z-10 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1c1b1d] text-[#b9cacb] border border-white/5 shadow-sm">
          <Gauge className="w-3.5 h-3.5 text-[#6ffbbe]" />
          <span className="font-headline text-[11px] font-medium">Ultra Düşük Gecikme</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1c1b1d] text-[#b9cacb] border border-white/5 shadow-sm">
          <Lock className="w-3.5 h-3.5 text-[#00f0ff]" />
          <span className="font-headline text-[11px] font-medium">Sıkı AES-256</span>
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="flex flex-col gap-2.5 my-3 w-full z-10">
        {/* Feature 1 */}
        <div className="group relative flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-[#2a2a2c]/50 backdrop-blur-md border border-white/5 transition-all duration-300 hover:bg-[#2a2a2c]/80 shadow-md">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-[#00f0ff]/15 text-[#00f0ff] shrink-0 shadow-sm">
            <CheckCircle2 className="w-5 h-5 text-[#00f0ff]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-headline text-[13px] text-[#e5e1e4] font-semibold truncate">
              HLS &amp; 4K UHD Doğrudan Oynatma
            </span>
            <span className="text-[11px] text-[#b9cacb]/80 truncate">
              Donanım hızlandırmalı tamponsuz video motoru
            </span>
          </div>
        </div>

        {/* Feature 2 */}
        <div className="group relative flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-[#2a2a2c]/50 backdrop-blur-md border border-white/5 transition-all duration-300 hover:bg-[#2a2a2c]/80 shadow-md">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-[#6ffbbe]/15 text-[#6ffbbe] shrink-0 shadow-sm">
            <Download className="w-5 h-5 text-[#6ffbbe]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-headline text-[13px] text-[#e5e1e4] font-semibold truncate">
              Çok Parçalı Arka Plan İndirici
            </span>
            <span className="text-[11px] text-[#b9cacb]/80 truncate">
              Segmentli yüksek hızlı yerel arşivleme
            </span>
          </div>
        </div>

        {/* Feature 3 */}
        <div className="group relative flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-[#2a2a2c]/50 backdrop-blur-md border border-white/5 transition-all duration-300 hover:bg-[#2a2a2c]/80 shadow-md">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-[#adc6ff]/15 text-[#adc6ff] shrink-0 shadow-sm">
            <Key className="w-5 h-5 text-[#adc6ff]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-headline text-[13px] text-[#e5e1e4] font-semibold truncate">
              Şifreli Xtream &amp; M3U Kasası
            </span>
            <span className="text-[11px] text-[#b9cacb]/80 truncate">
              Özel şifreli kalıcı playlist yönetimi
            </span>
          </div>
        </div>
      </div>

      {/* Call-to-Action Controls */}
      <div className="flex flex-col gap-2.5 mt-2 w-full z-10">
        <button
          onClick={onSignInWithGoogle}
          className="group relative flex items-center justify-center gap-3 w-full py-3.5 px-6 rounded-full bg-white text-[#0e0e10] font-headline text-[14px] font-bold shadow-xl shadow-[#00f0ff]/10 active:scale-[0.98] hover:bg-slate-100 transition-all cursor-pointer"
          type="button"
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              fill="#4285F4"
            />
            <path
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
              fill="#34A853"
            />
            <path
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              fill="#FBBC05"
            />
            <path
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              fill="#EA4335"
            />
          </svg>
          <span>Google ile Giriş Yap</span>
        </button>

        <button
          onClick={onContinueAsGuest}
          className="relative flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-full bg-[#2a2a2c]/80 backdrop-blur-md text-[#e5e1e4] font-headline text-[13px] font-semibold border border-white/10 shadow-md active:scale-[0.98] transition-all hover:bg-[#353437] cursor-pointer"
          type="button"
        >
          <SlidersHorizontal className="w-4 h-4 text-[#00f0ff]" />
          <span>Misafir Olarak Devam Et / Bilgileri Gir</span>
        </button>
      </div>

      {/* Legal & Compliance Disclaimer */}
      <div className="mt-4 text-center px-4 z-10">
        <p className="text-[11px] text-[#849495] leading-relaxed">
          Devam ederek Hizmet Koşullarını kabul etmiş ve akış oynatma listelerinizin meşru haklarına sahip olduğunuzu onaylamış olursunuz.
        </p>
      </div>
    </div>
  );
};
