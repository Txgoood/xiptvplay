import React, { useState, useEffect } from 'react';
import { Playlist } from '../../types';
import { X, Server, User, Lock, Eye, EyeOff, Link2, Check, ShieldCheck } from 'lucide-react';

interface EditPlaylistModalProps {
  playlist: Playlist | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Playlist) => void;
}

export const EditPlaylistModal: React.FC<EditPlaylistModalProps> = ({
  playlist,
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (playlist) {
      setName(playlist.name || '');
      setServerUrl(playlist.serverUrl || '');
      setUsername(playlist.username || '');
      setPassword(playlist.password || '');
      setM3uUrl(playlist.m3uUrl || '');
    }
  }, [playlist]);

  if (!isOpen || !playlist) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const updated: Playlist = {
      ...playlist,
      name: name.trim(),
      serverUrl: playlist.type === 'xtream' ? serverUrl.trim() : undefined,
      username: playlist.type === 'xtream' ? username.trim() : undefined,
      password: playlist.type === 'xtream' ? password.trim() : undefined,
      m3uUrl: playlist.type === 'm3u' ? m3uUrl.trim() : undefined,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-3xl bg-[#1c1b1d] border border-white/10 shadow-2xl p-6 flex flex-col gap-5 overflow-hidden text-[#e5e1e4]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -right-16 -top-16 w-36 h-36 bg-[#00f0ff]/10 rounded-full blur-2xl pointer-events-none"></div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#00f0ff]/20 text-[#00f0ff] flex items-center justify-center border border-[#00f0ff]/30 shadow-inner">
              <Server className="w-5 h-5 text-[#00f0ff]" />
            </div>
            <div className="flex flex-col">
              <h3 className="font-headline text-base font-bold text-[#e5e1e4]">Playlist'i Düzenle</h3>
              <span className="text-[11px] text-[#b9cacb]">
                {playlist.type === 'xtream' ? 'Xtream Codes API Bağlantısı' : 'M3U Çalma Listesi'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#2a2a2c] hover:bg-[#353437] flex items-center justify-center text-[#b9cacb] hover:text-[#e5e1e4] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#b9cacb] font-medium">Playlist Adı</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: Evim IPTV"
              required
              className="w-full bg-[#201f21] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-[#e5e1e4] focus:outline-none focus:border-[#00f0ff]/50"
            />
          </div>

          {playlist.type === 'xtream' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#b9cacb] font-medium">Sunucu URL (Port dahil)</label>
                <div className="relative flex items-center">
                  <Server className="absolute left-3.5 w-4 h-4 text-[#849495]" />
                  <input
                    type="text"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="http://example.com:8080"
                    required
                    className="w-full bg-[#201f21] border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#e5e1e4] font-mono focus:outline-none focus:border-[#00f0ff]/50"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#b9cacb] font-medium">Kullanıcı Adı</label>
                <div className="relative flex items-center">
                  <User className="absolute left-3.5 w-4 h-4 text-[#849495]" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Kullanıcı adı"
                    required
                    className="w-full bg-[#201f21] border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#e5e1e4] font-mono focus:outline-none focus:border-[#00f0ff]/50"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#b9cacb] font-medium">Şifre</label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 w-4 h-4 text-[#849495]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Şifre"
                    required
                    className="w-full bg-[#201f21] border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-xs text-[#e5e1e4] font-mono focus:outline-none focus:border-[#00f0ff]/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 text-[#849495] hover:text-[#e5e1e4] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#b9cacb] font-medium">M3U Akış URL</label>
              <div className="relative flex items-center">
                <Link2 className="absolute left-3.5 w-4 h-4 text-[#849495]" />
                <input
                  type="text"
                  value={m3uUrl}
                  onChange={(e) => setM3uUrl(e.target.value)}
                  placeholder="https://example.com/playlist.m3u"
                  required
                  className="w-full bg-[#201f21] border border-white/10 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-[#e5e1e4] font-mono focus:outline-none focus:border-[#00f0ff]/50"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-[#2a2a2c] hover:bg-[#353437] text-xs font-semibold text-[#e5e1e4] transition-colors cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-2xl bg-[#00f0ff] hover:bg-[#00d5e2] text-xs font-bold text-[#00363a] shadow-[0_0_16px_rgba(0,240,255,0.4)] transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Değişiklikleri Kaydet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
