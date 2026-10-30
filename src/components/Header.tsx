import React from 'react';
import { ScreenType, AppMode } from '../types';
import { Cast, Search, User } from 'lucide-react';

interface HeaderProps {
  currentScreen: ScreenType;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  onOpenSearch: () => void;
  onOpenCast: () => void;
  isCastConnected: boolean;
  userEmail: string | null;
  onOpenProfile: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  appMode,
  setAppMode,
  onOpenSearch,
  onOpenCast,
  isCastConnected,
  userEmail,
  onOpenProfile,
}) => {
  const getScreenTitle = () => {
    switch (currentScreen) {
      case 'playlists':
        return 'Playlists';
      case 'downloads':
        return 'İndirmeler';
      case 'catalog':
        return 'Katalog & Canlı TV';
      case 'favorites':
        return 'Favorilerim';
      case 'settings':
        return 'Ayarlar';
      default:
        return 'Playlists';
    }
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 pt-safe bg-[#0e0e10]/90 backdrop-blur-xl border-b border-white/5 shadow-md">
      <div className="h-16 px-3.5 max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Brand identity */}
        <div className="flex items-center gap-2.5 min-w-0 shrink">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#0566d9] to-[#00f0ff] flex items-center justify-center text-[#00363a] font-headline font-black text-xs shadow-md shrink-0">
            X
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-headline text-[16px] sm:text-[17px] font-bold text-[#e5e1e4] tracking-normal whitespace-nowrap">
                xiptv<span className="text-[#00f0ff] drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">play</span>
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-[#65f2b5]/20 text-[#4edea3] text-[9px] sm:text-[10px] font-bold tracking-wider flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse"></span>
                ONLINE
              </span>
            </div>
            <span className="text-[11px] text-[#b9cacb] font-medium truncate max-w-[120px] sm:max-w-[200px]">
              {appMode === 'prd' ? 'PM Analiz & Rapor' : getScreenTitle()}
            </span>
          </div>
        </div>

        {/* Mode Switcher & Global Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Cast button */}
          <button
            onClick={onOpenCast}
            className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
              isCastConnected
                ? 'bg-[#00f0ff]/20 text-[#00f0ff]'
                : 'bg-[#2a2a2c]/80 text-[#b9cacb] hover:text-[#00f0ff]'
            }`}
            title="Chromecast / TV Yayını"
          >
            <Cast className="w-4 h-4" />
          </button>

          {/* Search button */}
          <button
            onClick={onOpenSearch}
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-[#2a2a2c]/80 text-[#b9cacb] hover:text-[#00f0ff] transition-colors cursor-pointer"
            title="Kanal & Film Arama"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* User Profile Avatar */}
          <button
            onClick={onOpenProfile}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-[#0566d9] to-[#00f0ff] flex items-center justify-center text-white shadow-md hover:brightness-110 transition-all cursor-pointer ml-0.5"
            title={userEmail ? `Hesap: ${userEmail}` : 'Misafir Kullanıcı'}
          >
            <User className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

