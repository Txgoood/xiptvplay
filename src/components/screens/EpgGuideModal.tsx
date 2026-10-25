import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Loader2, Play, RefreshCw, X } from 'lucide-react';
import { MediaItem, Playlist } from '../../types';
import { EpgProgramme, EpgService } from '../../services/epgService';

interface Props {
  channel: MediaItem | null;
  playlist: Playlist | null;
  onClose: () => void;
  onPlay: (item: MediaItem) => void;
}

const dateKey = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-CA');
const formatHour = (timestamp: number) => new Date(timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

export const EpgGuideModal: React.FC<Props> = ({ channel, playlist, onClose, onPlay }) => {
  const [programmes, setProgrammes] = useState<EpgProgramme[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selectedDate, setSelectedDate] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!channel) return;
    let live = true;
    setProgrammes([]); setError(''); setLoading(true);
    EpgService.fetchChannelProgrammes(channel, playlist)
      .then(rows => { if (live) setProgrammes(rows); })
      .catch(err => { if (live) setError(err?.message || 'EPG bilgisi alınamadı.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [channel?.id, playlist?.id, refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const dates = useMemo(() => {
    const today = dateKey(now);
    const keys = new Set([today, ...programmes.map(p => dateKey(p.start))]);
    return [...keys].sort().filter(key => key >= today).slice(0, 7);
  }, [programmes, now]);
  const day = dates.includes(selectedDate) ? selectedDate : dates[0];
  const visible = programmes.filter(p => dateKey(p.start) === day);
  const current = programmes.find(p => p.start <= now && p.end > now);
  const upcoming = programmes.find(p => p.start > now);

  if (!channel) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/85 sm:p-4" onClick={onClose}>
      <section onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="TV yayın rehberi" className="flex w-full sm:max-w-xl max-h-[92dvh] flex-col rounded-t-3xl sm:rounded-3xl bg-[#171719] border border-white/10 overflow-hidden text-white">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <CalendarDays className="w-6 h-6 text-[#00f0ff] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold">TV Yayın Rehberi</h2>
              <p className="text-xs text-[#b9cacb] truncate">{channel.title}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button aria-label="Yayın akışını yenile" title="Yenile" onClick={() => setRefresh(x => x + 1)} className="rounded-full p-2 bg-[#29292c]"><RefreshCw className="w-4 h-4"/></button>
            <button aria-label="Rehberi kapat" onClick={onClose} className="rounded-full p-2 bg-[#29292c]"><X className="w-4 h-4"/></button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto space-y-4">
          {loading ? <div className="flex items-center gap-2 py-8 justify-center text-sm text-[#00f0ff]"><Loader2 className="w-5 h-5 animate-spin"/> Yayın akışı yükleniyor...</div> : (
            <>
              {error && <p className="rounded-xl bg-amber-500/10 text-amber-200 text-sm p-3">{error}</p>}
              {!error && programmes.length === 0 && <p className="rounded-xl bg-[#29292c] text-[#b9cacb] text-sm p-4">Bu kanal için IPTV sağlayıcısı yayın akışı göndermiyor.</p>}
              {(current || upcoming) && <div className="rounded-xl bg-[#20292d] border border-[#00f0ff]/20 p-3 space-y-3">
                {current && <div>
                  <p className="text-[11px] text-[#4edea3] font-bold">ŞU AN YAYINDA · {formatHour(current.start)} – {formatHour(current.end)}</p>
                  <p className="text-sm font-semibold mt-1">{current.title}</p>
                  <div className="h-1.5 rounded-full bg-white/15 mt-2 overflow-hidden"><div className="h-full bg-[#00f0ff]" style={{ width: Math.min(100, Math.max(0, (now-current.start)/(current.end-current.start)*100))+'%' }}/></div>
                </div>}
                {upcoming && <div><p className="text-[11px] text-[#00f0ff] font-bold">SIRADAKİ · {formatHour(upcoming.start)}</p><p className="text-sm mt-1">{upcoming.title}</p></div>}
              </div>}
              {programmes.length > 0 && <>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {dates.map(key => <button key={key} onClick={() => setSelectedDate(key)} className={'shrink-0 px-3 py-2 text-xs rounded-xl border ' + (day === key ? 'bg-[#00f0ff] text-[#00363a] border-[#00f0ff] font-bold' : 'bg-[#29292c] text-[#d5d5d5] border-white/10')}>
                    {key === dateKey(now) ? 'Bugün' : new Date(key + 'T12:00:00').toLocaleDateString('tr-TR', { weekday:'short',day:'numeric',month:'short' })}
                  </button>)}
                </div>
                <div className="space-y-2">
                  {visible.length ? visible.map(p => {
                    const playing = p.start <= now && p.end > now;
                    return <div key={p.id} className={'rounded-xl p-3 border ' + (playing ? 'border-[#00f0ff]/40 bg-[#00f0ff]/10' : 'border-white/5 bg-[#222224]')}>
                      <div className="flex items-center gap-2"><Clock size={13} className="text-[#00f0ff]"/><span className="font-mono text-[11px] text-[#b9cacb]">{formatHour(p.start)} – {formatHour(p.end)}</span>{playing && <span className="text-[10px] font-bold text-[#4edea3]">CANLI</span>}</div>
                      <p className="font-semibold text-sm mt-1">{p.title}</p>
                      {p.description && <p className="text-xs text-[#b9cacb] mt-1 leading-relaxed">{p.description}</p>}
                    </div>;
                  }) : <p className="text-xs text-[#b9cacb] p-3">Bu gün için yayın bilgisi yok.</p>}
                </div>
              </>}
            </>
          )}
          <button onClick={() => { onClose(); onPlay(channel); }} className="w-full rounded-xl bg-[#00f0ff] text-[#00363a] py-3 font-bold text-sm flex justify-center items-center gap-2"><Play size={17}/> Kanalı İzle</button>
          <p className="text-[10px] text-[#849495]">Yayın saatleri cihaz saatine göre gösterilir. Bilgiler IPTV sağlayıcınızın EPG verilerinden alınır.</p>
        </div>
      </section>
    </div>
  );
};
