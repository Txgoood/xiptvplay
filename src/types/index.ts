export type ScreenType = 'onboarding' | 'playlists' | 'catalog' | 'downloads' | 'favorites' | 'settings';
export type AppMode = 'app' | 'prd';

export interface XtreamUserInfo {
  username?: string;
  password?: string;
  message?: string;
  auth?: number;
  status?: string;
  exp_date?: string | number;
  is_trial?: string;
  active_cons?: string;
  created_at?: string;
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
  time_now?: string;
}

export interface Playlist {
  id: string;
  name: string;
  type: 'xtream' | 'm3u';
  serverUrl?: string;
  m3uUrl?: string;
  username?: string;
  password?: string;
  status: 'active' | 'warning' | 'error' | 'syncing';
  statusLabel: string;
  badge?: string;
  expiryDays: number;
  expiryDateStr: string;
  liveCount: number;
  movieCount: number;
  seriesCount: number;
  isCached?: boolean;
  lastSync: string;
  pingMs?: number;
  isDemo?: boolean;
  maxConnections?: number;
  activeConnections?: number;
  errorMessage?: string;
}

export interface DownloadItem {
  id: string;
  mediaId: string;
  title: string;
  subtitle: string;
  type: 'movie' | 'series';
  resolutionBadge: string;
  totalSizeGb: number;
  downloadedGb: number;
  speedMbps: number;
  eta: string;
  progressPercent: number;
  status: 'downloading' | 'paused' | 'completed' | 'queued' | 'failed';
  statusLabel: string;
  poster: string;
  streamUrl?: string;
  offlinePath?: string;
  queueOrder?: number;
}

export interface MediaItem {
  id: string;
  playlistId: string;
  title: string;
  category: string;
  type: 'live' | 'movie' | 'series';
  resolution: string;
  poster: string;
  streamUrl: string;
  channelNumber?: number;
  epgCurrent?: string;
  duration?: string;
  rating?: string;
  year?: number;
  fileSizeGb?: number;
  audioTracks?: string[];
  subtitles?: string[];
  isFavorite?: boolean;
  streamId?: string | number;
  containerExtension?: string;
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
  wifiOnly: boolean;
}

export interface PrdStage {
  id: string;
  number: string;
  title: string;
  description: string;
  content: string;
}
