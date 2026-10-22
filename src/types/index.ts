export type ScreenType = 'onboarding' | 'playlists' | 'catalog' | 'downloads' | 'favorites' | 'settings';
export type AppMode = 'app' | 'prd';

export interface Playlist {
  id: string;
  name: string;
  type: 'xtream' | 'm3u';
  serverUrl?: string;
  username?: string;
  password?: string;
  m3uUrl?: string;
  m3uContent?: string;
  status: 'active' | 'warning' | 'expired' | 'error';
  statusLabel: string;
  badge?: string;
  expiryDays: number;
  expiryDateStr: string;
  liveCount: number;
  movieCount: number;
  seriesCount: number;
  isCached: boolean;
  lastSync: string;
  pingMs?: number;
  isDemo?: boolean;
  errorMessage?: string;
  activeConnections?: number;
  maxConnections?: number;
}

export interface MediaItem {
  id: string;
  playlistId?: string;
  title: string;
  category: string;
  type: 'live' | 'movie' | 'series';
  resolution: '4K UHD' | 'FHD 60P' | '1080p HEVC' | 'HD';
  duration?: string;
  year?: number;
  rating?: string;
  poster: string;
  backdrop?: string;
  streamUrl: string;
  epgCurrent?: string;
  epgNext?: string;
  epgProgressPercent?: number;
  fileSizeGb?: number;
  audioTracks: string[];
  subtitles: string[];
  isFavorite?: boolean;
  channelNumber?: number;
  streamId?: string | number;
  containerExtension?: string;
  rawStreamUrl?: string;
  nextEpisodeUrl?: string;
  nextEpisodeTitle?: string;
  nextNextEpisodeUrl?: string;
  nextNextEpisodeTitle?: string;
  seriesTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
}

export interface DownloadItem {
  id: string;
  mediaId: string;
  playlistId?: string;
  title: string;
  subtitle: string;
  type: 'movie' | 'series' | 'catchup';
  resolutionBadge: string;
  totalSizeGb: number;
  downloadedGb: number;
  speedMbps: number;
  eta: string;
  progressPercent: number;
  status: 'downloading' | 'paused' | 'queued' | 'completed' | 'error';
  statusLabel: string;
  queueOrder?: number;
  poster: string;
  verifiedMd5?: boolean;
  offlinePath?: string;
  recordedDate?: string;
  streamUrl?: string;
  rawStreamUrl?: string;
  localUrl?: string;
  fileUri?: string;
  errorMessage?: string;
  seriesTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
}

export interface SystemStats {
  activePlaylistsCount: number;
  cacheSizeGb: number;
  releasableMb: number;
  totalStorageGb: number;
  iptvArchiveGb: number;
  freeStorageGb: number;
  usedPercent: number;
  downloadSpeedMbps: number;
  parallelSockets: number;
  turboActive: boolean;
  wifiOnly: boolean;
  engineVersion: string;
}

export interface XtreamUserInfo {
  username: string;
  status: string;
  auth: number;
  exp_date?: string;
  is_trial?: string;
  active_cons?: string;
  max_connections?: string;
  allowed_output_formats?: string[];
}

export interface XtreamServerInfo {
  url?: string;
  port?: string;
  https_port?: string;
  server_protocol?: string;
  rtmp_port?: string;
  timezone?: string;
}

export interface SeriesEpisode {
  id: string | number;
  episodeNum: number;
  seasonNum: number;
  title: string;
  containerExtension: string;
  duration?: string;
  plot?: string;
  rating?: string;
  releaseDate?: string;
  image?: string;
  streamUrl: string;
  rawStreamUrl?: string;
}

export interface SeriesSeason {
  seasonNumber: number;
  name?: string;
  episodeCount?: number;
  airDate?: string;
  cover?: string;
}

export interface SeriesDetail {
  name?: string;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string;
  backdrop?: string;
  seasons: SeriesSeason[];
  episodes: Record<string | number, SeriesEpisode[]>;
}

export interface AppSettings {
  bufferSeconds: number;
  hardwareDecoder?: string;
}

