import React from 'react';
import { ScreenType } from '../types';
import { Tv, Film, Download, Heart, Settings } from 'lucide-react';

interface BottomNavProps {
  currentScreen: ScreenType;
  onSelectScreen: (screen: ScreenType) => void;
  activeDownloadsCount: number;
  favoritesCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentScreen,
  onSelectScreen,
  activeDownloadsCount,
  favoritesCount,
}) => {
  const navItems: {
    id: ScreenType;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    { id: 'playlists', label: 'Playlistler', icon: <Tv className="w-5 h-5" /> },
    { id: 'catalog', label: 'Katalog', icon: <Film className="w-5 h-5" /> },
    {
      id: 'downloads',
      label: 'İndirmeler',
      icon: <Download className="w-5 h-5" />,
      badge: activeDownloadsCount,
    },
    {
      id: 'favorites',
      label: 'Favoriler',
      icon: <Heart className="w-5 h-5" />,
      badge: favoritesCount > 0 ? favoritesCount : undefined,
    },
    { id: 'settings', label: 'Ayarlar', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pb-safe bg-[#0e0e10]/95 backdrop-blur-xl border-t border-white/5 shadow-[0_-4px_24px_rgba(0,0,0,0.8)]">
      <div className="flex justify-around items-center h-16 sm:h-18 px-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = currentScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectScreen(item.id)}
              className={`relative flex flex-col items-center justify-center gap-1 min-w-[56px] py-1.5 transition-all duration-200 select-none cursor-pointer ${
                isActive
                  ? 'text-[#00f0ff] font-bold drop-shadow-[0_0_10px_rgba(0,240,255,0.4)] scale-105'
                  : 'text-[#b9cacb] hover:text-[#e5e1e4] active:scale-95'
              }`}
            >
              <div className="relative flex items-center justify-center">
                {item.icon}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 rounded-full bg-[#0566d9] text-white text-[9px] font-bold shadow-md">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-headline tracking-normal leading-none">
                {item.label}
              </span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] shadow-[0_0_6px_#00f0ff] mt-0.5"></span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
