import React, { useState } from 'react';
import { Playlist, SystemStats } from '../../types';
import { EditPlaylistModal } from './EditPlaylistModal';
import {
  Wifi,
  RefreshCw,
  HardDrive,
  PlusCircle,
  ChevronRight,
  Server,
  Link2,
  Tv,
  Film,
  Video,
  Play,
  MoreVertical,
  ShieldCheck,
  Upload,
  Trophy,
  Globe,
  Calendar,
  Zap,
  Trash2,
  Eye,
  ListPlus,
  Edit3,
} from 'lucide-react';

interface PlaylistsScreenProps {
  playlists: Playlist[];
  stats: SystemStats;
  onOpenAddModal: (type?: 'xtream' | 'm3u') => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onRefreshPlaylist: (id: string) => Promise<void>;
  onDeletePlaylist: (id: string) => void;
  onUpdatePlaylist: (playlist: Playlist) => void;
}

export const PlaylistsScreen: React.FC<PlaylistsScreenProps> = ({
  playlists,
  stats,
  onOpenAddModal,
  onSelectPlaylist,
  onRefreshPlaylist,
  onDeletePlaylist,
  onUpdatePlaylist,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'xtream' | 'm3u'>('all');
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    for (const pl of playlists) {
      await onRefreshPlaylist(pl.id);
    }
    setIsSyncingAll(false);
  };

  const handleSingleRefresh = async (id: string) => {
    setRefreshingId(id);
    await onRefreshPlaylist(id);
    setRefreshingId(null);
  };

  const filteredPlaylists = playlists.filter((item) => {
    if (filterType === 'all') return true;
    return item.type === filterType;
  });

  const xtreamCount = playlists.filter((p) => p.type === 'xtream').length;
  const m3uCount = playlists.filter((p) => p.type === 'm3u').length;

  return (
    <div className="flex flex-col w-full max-w-xl mx-auto px-4 pt-2 pb-28 gap-4 select-none">
      {/* Summary Dashboard Glass Card */}
      <div className="relative overflow-hidden rounded-2xl bg-[#201f21]/80 backdrop-blur-xl p-4 border border-white/5 shadow-xl flex flex-col gap-3.5">
        <div className="absolute -right-12 -top-12 w-36 h-36 bg-[#00f0ff]/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2a2a2c] flex items-center justify-center text-[#00f0ff] border border-white/5 shadow-inner">
              <Wifi className="w-5 h-5 text-[#00f0ff]" />
            </div>
            <div className="flex flex-col">
              <span className="font-headline text-[15px] font-bold text-[#e5e1e4]">Sistem Durumu</span>
              <span className="text-[11px] text-[#b9cacb]">Bağlantı &amp; Veri Akışı</span>
            </div>
          </div>
          <button
            onClick={handleSyncAll}
            disabled={isSyncingAll || playlists.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2a2a2c] hover:bg-[#353437] active:scale-95 transition-all text-[#e5e1e4] border border-white/5 cursor-pointer disabled:opacity-40"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[#00f0ff] ${isSyncingAll ? 'animate-spin' : ''}`}
            />
            <span className="font-headline text-[11px] font-semibold">
              {isSyncingAll ? 'Eşitleniyor...' : 'Hızlı Senkronize'}
            </span>
          </button>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="flex flex-col p-3 rounded-xl bg-[#1c1b1d]/90 border border-white/5">
            <div className="flex items-center gap-1.5 text-[#b9cacb]">
              <span
                className={`w-2 h-2 rounded-full ${
                  playlists.length > 0 ? 'bg-[#4edea3] animate-pulse' : 'bg-[#849495]'
                }`}
              ></span>
              <span className="font-headline text-[11px] font-medium">Aktif Bağlantılar</span>
            </div>
            <span className="font-headline text-lg text-[#e5e1e4] font-bold mt-1">
              {playlists.length} Playlist
            </span>
            <span className="text-[11px] text-[#4edea3]">
              {playlists.length > 0 ? 'Kalıcı depolama aktif' : 'Bağlı hat bulunmuyor'}
            </span>
          </div>
          <div className="flex flex-col p-3 rounded-xl bg-[#1c1b1d]/90 border border-white/5">
            <div className="flex items-center gap-1.5 text-[#b9cacb]">
              <HardDrive className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span className="font-headline text-[11px] font-medium">Önbellek &amp; EPG</span>
            </div>
            <span className="font-headline text-lg text-[#e5e1e4] font-bold mt-1">
              {stats.cacheSizeGb} GB
            </span>
            <span className="text-[11px] text-[#b9cacb]">{stats.releasableMb} MB serbest bırakılabilir</span>
          </div>
        </div>
      </div>

      {/* Primary Interactive Trigger: Add Playlist */}
      <div
        onClick={() => onOpenAddModal('xtream')}
        className="group relative overflow-hidden rounded-2xl bg-[#201f21] p-4 border border-white/10 shadow-xl flex flex-col gap-3.5 transition-all active:scale-[0.99] hover:border-[#00f0ff]/30 cursor-pointer"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-[#00f0ff]/15 via-[#0566d9]/20 to-transparent pointer-events-none"></div>
        <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-[#00f0ff]/15 rounded-full blur-xl pointer-events-none"></div>
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#00f0ff] text-[#00363a] flex items-center justify-center shadow-[0_0_16px_rgba(0,240,255,0.4)]">
              <PlusCircle className="w-7 h-7" />
            </div>
            <div className="flex flex-col">
              <span className="font-headline text-[16px] text-[#e5e1e4] font-bold tracking-normal">
                Yeni Playlist Ekle
              </span>
              <span className="text-[12px] text-[#b9cacb]">Xtream API veya M3U URL / Dosya</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-full bg-[#2a2a2c]/80 flex items-center justify-center text-[#00f0ff] group-hover:translate-x-1 transition-transform border border-white/5">
            <ChevronRight className="w-5 h-5 text-[#00f0ff]" />
          </div>
        </div>

        {/* Quick Format Badges */}
        <div className="flex items-center gap-2 pt-1 relative z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenAddModal('xtream');
            }}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-full bg-[#2a2a2c]/70 hover:bg-[#353437] transition-colors text-[#e5e1e4] border border-white/5 text-xs font-semibold cursor-pointer"
          >
            <Server className="w-4 h-4 text-[#00f0ff]" />
            <span>Xtream Codes API</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenAddModal('m3u');
            }}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-full bg-[#2a2a2c]/70 hover:bg-[#353437] transition-colors text-[#e5e1e4] border border-white/5 text-xs font-semibold cursor-pointer"
          >
            <Link2 className="w-4 h-4 text-[#adc6ff]" />
            <span>M3U URL / Dosya</span>
          </button>
        </div>
      </div>

      {/* Playlists Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-headline text-[18px] text-[#e5e1e4] font-bold">Playlistlerim</span>
            <span className="px-2 py-0.5 rounded-full bg-[#2a2a2c] text-[#b9cacb] font-headline text-[11px] font-semibold border border-white/5">
              {playlists.length} Aktif
            </span>
          </div>
          <button
            onClick={() => onOpenAddModal('xtream')}
            className="text-[#00f0ff] font-headline text-[12px] font-semibold hover:underline flex items-center gap-0.5 cursor-pointer"
          >
            + Ekle / Düzenle
          </button>
        </div>

        {/* Category Filters */}
        {playlists.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => setFilterType('all')}
              className={`shrink-0 px-4 py-1.5 rounded-full font-headline text-[12px] font-semibold transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-[#00f0ff] text-[#00363a] shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'bg-[#201f21] text-[#b9cacb] hover:text-[#e5e1e4] border border-white/5'
              }`}
            >
              Tümü ({playlists.length})
            </button>
            <button
              onClick={() => setFilterType('xtream')}
              className={`shrink-0 px-4 py-1.5 rounded-full font-headline text-[12px] font-semibold transition-all cursor-pointer ${
                filterType === 'xtream'
                  ? 'bg-[#00f0ff] text-[#00363a] shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'bg-[#201f21] text-[#b9cacb] hover:text-[#e5e1e4] border border-white/5'
              }`}
            >
              Xtream Codes ({xtreamCount})
            </button>
            <button
              onClick={() => setFilterType('m3u')}
              className={`shrink-0 px-4 py-1.5 rounded-full font-headline text-[12px] font-semibold transition-all cursor-pointer ${
                filterType === 'm3u'
                  ? 'bg-[#00f0ff] text-[#00363a] shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'bg-[#201f21] text-[#b9cacb] hover:text-[#e5e1e4] border border-white/5'
              }`}
            >
              M3U / M3U8 ({m3uCount})
            </button>
          </div>
        )}

        {/* Empty State when no playlists exist */}
        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 bg-[#1c1b1d] rounded-2xl border border-white/5 text-center my-2 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-[#201f21] flex items-center justify-center text-[#00f0ff] shadow-inner border border-white/5">
              <ListPlus className="w-8 h-8 text-[#00f0ff]" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-headline text-base font-bold text-[#e5e1e4]">
                Henüz Kayıtlı Playlist Yok
              </h3>
              <p className="text-xs text-[#b9cacb] max-w-sm leading-relaxed">
                IPTV sağlayıcınızın Xtream Codes bilgilerini veya M3U URL adresinizi ekleyin.
                Eklediğiniz çalma listeleri kalıcı depolamada saklanır.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => onOpenAddModal('xtream')}
                className="px-6 py-2.5 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold shadow-[0_0_12px_rgba(0,240,255,0.4)] active:scale-95 cursor-pointer"
              >
                + Xtream API Ekle
              </button>
              <button
                onClick={() => onOpenAddModal('m3u')}
                className="px-5 py-2.5 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] text-[#e5e1e4] font-headline text-xs font-semibold border border-white/5 cursor-pointer"
              >
                + M3U URL / Dosya
              </button>
            </div>
          </div>
        ) : (
          /* Playlist Items */
          <div className="flex flex-col gap-3.5">
            {filteredPlaylists.map((playlist) => {
              const isWarning = playlist.status === 'warning';
              const isError = playlist.status === 'error';
              const isRefreshing = refreshingId === playlist.id;

              return (
                <div
                  key={playlist.id}
                  className="group relative flex flex-col rounded-2xl bg-[#201f21]/90 border border-white/5 p-4 shadow-lg gap-3 transition-all hover:border-white/15"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-white/5 ${
                          playlist.type === 'xtream'
                            ? isWarning
                              ? 'bg-[#93000a]/20 text-[#ffb4ab]'
                              : 'bg-[#0566d9]/20 text-[#d8e2ff]'
                            : 'bg-[#2a2a2c] text-[#b9cacb]'
                        }`}
                      >
                        {playlist.type === 'xtream' ? (
                          isWarning ? (
                            <Trophy className="w-6 h-6 text-[#ffb4ab]" />
                          ) : (
                            <Tv className="w-6 h-6 text-[#00f0ff]" />
                          )
                        ) : (
                          <Globe className="w-6 h-6 text-[#b9cacb]" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-headline text-[15px] font-bold text-[#e5e1e4] truncate">
                            {playlist.name}
                          </span>
                          {playlist.badge && (
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-headline font-bold uppercase tracking-wider ${
                                playlist.badge === 'VIP' || playlist.badge === 'PRO'
                                  ? 'bg-[#7df4ff]/20 text-[#00f0ff]'
                                  : 'bg-[#93000a]/40 text-[#ffb4ab]'
                              }`}
                            >
                              {playlist.badge}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[#b9cacb] truncate font-mono">
                          {playlist.serverUrl || playlist.m3uUrl}
                        </span>
                      </div>
                    </div>
                    <div className="relative">
                      <button
                        onClick={() =>
                          setActiveMenuId(activeMenuId === playlist.id ? null : playlist.id)
                        }
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[#b9cacb] hover:text-[#e5e1e4] hover:bg-[#2a2a2c] shrink-0 transition-colors cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {activeMenuId === playlist.id && (
                        <div className="absolute right-0 top-9 z-20 w-44 py-1 bg-[#2a2a2c] rounded-xl border border-white/10 shadow-2xl flex flex-col">
                          <button
                            onClick={() => {
                              handleSingleRefresh(playlist.id);
                              setActiveMenuId(null);
                            }}
                            className="px-3 py-2 text-left text-xs text-[#e5e1e4] hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-[#00f0ff]" />
                            <span>Yenile &amp; Eşitle</span>
                          </button>
                          <button
                            onClick={() => {
                              onSelectPlaylist(playlist);
                              setActiveMenuId(null);
                            }}
                            className="px-3 py-2 text-left text-xs text-[#e5e1e4] hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#adc6ff]" />
                            <span>Kanalları Göster</span>
                          </button>
                          <button
                            onClick={() => {
                              setEditingPlaylist(playlist);
                              setActiveMenuId(null);
                            }}
                            className="px-3 py-2 text-left text-xs text-[#e5e1e4] hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#4edea3]" />
                            <span>Düzenle</span>
                          </button>
                          <button
                            onClick={() => {
                              onDeletePlaylist(playlist.id);
                              setActiveMenuId(null);
                            }}
                            className="px-3 py-2 text-left text-xs text-[#ffb4ab] hover:bg-[#93000a]/30 flex items-center gap-2 cursor-pointer border-t border-white/5 mt-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[#ffb4ab]" />
                            <span>Kalıcı Olarak Sil</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status & Expiry Badges */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-headline text-[11px] font-semibold ${
                        isError
                          ? 'bg-[#93000a]/40 text-[#ffb4ab]'
                          : isWarning
                          ? 'bg-[#93000a]/30 text-[#ffb4ab]'
                          : 'bg-[#65f2b5]/20 text-[#4edea3]'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isError
                            ? 'bg-[#ffb4ab]'
                            : isWarning
                            ? 'bg-[#ffb4ab] animate-ping'
                            : 'bg-[#4edea3]'
                        }`}
                      ></span>
                      {playlist.statusLabel}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0e0e10] text-[#b9cacb] font-headline text-[11px]">
                      {isWarning ? (
                        <Zap className="w-3.5 h-3.5 text-[#ffb4ab]" />
                      ) : (
                        <Calendar className="w-3.5 h-3.5 text-[#4edea3]" />
                      )}
                      {playlist.expiryDays > 0
                        ? `${playlist.expiryDays} gün kaldı (${playlist.expiryDateStr})`
                        : playlist.expiryDateStr}
                    </span>
                  </div>

                  {/* Real Counts Stream Bar */}
                  <div className="p-2.5 rounded-xl bg-[#0e0e10]/80 border border-white/5 flex items-center justify-between text-[#b9cacb]">
                    <div className="flex items-center gap-1.5">
                      <Tv className="w-4 h-4 text-[#00f0ff]" />
                      <span className="text-[11px] font-semibold text-[#e5e1e4]">
                        {playlist.liveCount.toLocaleString()} Canlı
                      </span>
                    </div>
                    <span className="text-white/20">•</span>
                    <div className="flex items-center gap-1.5">
                      <Film className="w-4 h-4 text-[#adc6ff]" />
                      <span className="text-[11px] font-semibold text-[#e5e1e4]">
                        {playlist.movieCount.toLocaleString()} Film
                      </span>
                    </div>
                    <span className="text-white/20">•</span>
                    <div className="flex items-center gap-1.5">
                      <Video className="w-4 h-4 text-[#4edea3]" />
                      <span className="text-[11px] font-semibold text-[#e5e1e4]">
                        {playlist.seriesCount.toLocaleString()} Dizi
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => onSelectPlaylist(playlist)}
                      className="flex-1 h-10 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-[13px] font-bold flex items-center justify-center gap-2 shadow-[0_0_14px_rgba(0,240,255,0.35)] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Gözat &amp; İzle</span>
                    </button>
                    <button
                      onClick={() => handleSingleRefresh(playlist.id)}
                      disabled={isRefreshing}
                      className="h-10 px-4 rounded-full bg-[#2a2a2c] text-[#e5e1e4] hover:bg-[#353437] flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer border border-white/5 text-xs font-semibold disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-4 h-4 text-[#b9cacb] ${isRefreshing ? 'animate-spin' : ''}`}
                      />
                      <span>{isRefreshing ? 'Yenileniyor...' : 'Yenile'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ambient Decorative Feature Section */}
      <div className="rounded-2xl bg-[#1c1b1d] p-4 flex items-center gap-3.5 border border-white/5">
        <div className="w-10 h-10 rounded-xl bg-[#65f2b5]/20 flex items-center justify-center text-[#4edea3] shrink-0 border border-white/5">
          <ShieldCheck className="w-5 h-5 text-[#4edea3]" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-headline text-[14px] font-bold text-[#e5e1e4]">
            Kalıcı Depolama &amp; Otomatik EPG
          </span>
          <span className="text-[12px] text-[#b9cacb]">
            Tüm çalma listeleriniz yerel kasada şifrelenir ve oturumlar arasında korunur.
          </span>
        </div>
      </div>

      {/* Floating Action Pill */}
      <div className="sticky bottom-24 self-end z-30">
        <button
          onClick={() => onOpenAddModal('m3u')}
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-[13px] font-bold shadow-[0_4px_24px_rgba(0,240,255,0.5)] active:scale-95 hover:brightness-110 transition-all cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>+ M3U İçe Aktar</span>
        </button>
      </div>

      {/* Edit Playlist Modal */}
      <EditPlaylistModal
        playlist={editingPlaylist}
        isOpen={!!editingPlaylist}
        onClose={() => setEditingPlaylist(null)}
        onSave={(updated) => {
          onUpdatePlaylist(updated);
          setEditingPlaylist(null);
        }}
      />
    </div>
  );
};
