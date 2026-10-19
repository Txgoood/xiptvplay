import React, { useRef, useState, useEffect } from 'react';
import { MediaItem, DownloadItem } from '../../types';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Sliders,
  X,
  AlertTriangle,
  Tv,
} from 'lucide-react';

interface VideoPlayerModalProps {
  media: MediaItem | DownloadItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ media, isOpen, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showControls, setShowControls] = useState(true);

  const controlsTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      setHasError(false);
      setErrorMessage('');
      setCurrentTime(0);
      setIsPlaying(true);
    }
  }, [isOpen, media]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen || !media) return null;

  const title = media.title;
  const subtitle =
    'category' in media
      ? `${media.category} • ${media.resolution || 'HD'}`
      : `${(media as DownloadItem).subtitle || 'İndirilen İçerik'}`;
  const streamUrl = media.streamUrl;

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleSkip = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    videoRef.current.muted = nextMute;
    setIsMuted(nextMute);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        className="relative w-full h-full max-w-6xl max-h-[85vh] bg-black sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between"
      >
        {/* Video Element */}
        <video
          ref={videoRef}
          src={streamUrl}
          autoPlay
          playsInline
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
              setDuration(videoRef.current.duration || 0);
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setDuration(videoRef.current.duration || 0);
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onError={() => {
            setHasError(true);
            setErrorMessage(
              'Yayın akışı başlatılamadı veya hedef IPTV sunucusu bu bağlantıyı reddetti. Akış bağlantısının ve hesabın aktif olduğunu kontrol edin.'
            );
          }}
          onClick={handlePlayPause}
          className="w-full h-full object-contain cursor-pointer"
        />

        {/* Top Header Overlay */}
        <div
          className={`absolute top-0 inset-x-0 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 z-10 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#00f0ff]/10 border border-[#00f0ff]/30 flex items-center justify-center text-[#00f0ff] shrink-0">
              <Tv className="w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="font-headline font-bold text-sm sm:text-base text-white truncate">{title}</h2>
              <span className="text-xs text-[#00f0ff] font-mono truncate">{subtitle}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer shrink-0"
            title="Kapat (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Notification Overlay */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/85 z-20">
            <div className="max-w-md bg-[#1c1b1d] border border-[#ff5470]/30 rounded-3xl p-6 text-center flex flex-col items-center gap-3 shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-[#ff5470]/10 flex items-center justify-center text-[#ff5470]">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h3 className="font-headline font-bold text-base text-white">Yayın Oynatılamadı</h3>
              <p className="text-xs text-[#849495] leading-relaxed">{errorMessage}</p>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => {
                    setHasError(false);
                    if (videoRef.current) {
                      videoRef.current.load();
                      videoRef.current.play().catch(() => {});
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold cursor-pointer"
                >
                  Tekrar Dene
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-[#201f21] text-[#849495] hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Player Controls Overlay */}
        <div
          className={`absolute bottom-0 inset-x-0 p-4 sm:p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-3 transition-opacity duration-300 z-10 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Progress / Timeline Bar (If VoD or duration available) */}
          {duration > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-[#849495] font-mono shrink-0">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#00f0ff]"
              />
              <span className="text-[11px] text-[#849495] font-mono shrink-0">
                {formatTime(duration)}
              </span>
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={handlePlayPause}
                className="w-10 h-10 rounded-full bg-[#00f0ff] text-[#00363a] flex items-center justify-center hover:scale-105 transition-transform shadow-[0_0_12px_rgba(0,240,255,0.4)] cursor-pointer"
                title={isPlaying ? 'Durdur' : 'Oynat'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <button
                onClick={() => handleSkip(-10)}
                className="text-white/80 hover:text-white transition-colors cursor-pointer p-1"
                title="10 saniye geri"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                onClick={() => handleSkip(10)}
                className="text-white/80 hover:text-white transition-colors cursor-pointer p-1"
                title="10 saniye ileri"
              >
                <RotateCw className="w-5 h-5" />
              </button>

              {/* Volume Group */}
              <div className="flex items-center gap-2 pl-2">
                <button
                  onClick={handleToggleMute}
                  className="text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-[#ff5470]" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 sm:w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#00f0ff]"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">
                Proxy Aktif (No-CORS)
              </span>

              <button
                onClick={handleToggleFullscreen}
                className="text-white/80 hover:text-white transition-colors cursor-pointer p-1"
                title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran'}
              >
                <Maximize2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
