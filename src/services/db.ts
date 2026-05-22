import Database from '@tauri-apps/plugin-sql';
import { VideoTrack } from '../types';
import { queueGenreSync } from './genreSync';

let db: Database | null = null;

export async function initDb() {
  if (db) return db;
  db = await Database.load('sqlite:kandb.db');
  
  // Playlist Table with Multi-platform configuration
  await db.execute(`
    CREATE TABLE IF NOT EXISTS playlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT DEFAULT 'bilibili',
      bvid TEXT,
      track_data TEXT,
      sort_order INTEGER,
      UNIQUE(platform, bvid)
    )
  `);

  // Recent History Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS recent (
      platform TEXT DEFAULT 'bilibili',
      bvid TEXT,
      track_data TEXT,
      play_count INTEGER DEFAULT 1,
      total_time INTEGER DEFAULT 0,
      last_played INTEGER,
      PRIMARY KEY (platform, bvid)
    )
  `);

  // Favorites Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT DEFAULT 'bilibili',
      bvid TEXT,
      track_data TEXT,
      sort_order INTEGER,
      UNIQUE(platform, bvid)
    )
  `);

  // User Custom Playlists Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER
    )
  `);

  // User Custom Playlist Tracks Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER,
      platform TEXT DEFAULT 'bilibili',
      bvid TEXT,
      track_data TEXT,
      sort_order INTEGER,
      UNIQUE(playlist_id, platform, bvid)
    )
  `);

  // Normalized Track Genres Cache
  await db.execute(`
    CREATE TABLE IF NOT EXISTS track_genres (
      platform TEXT,
      track_id TEXT,
      genres TEXT,
      PRIMARY KEY (platform, track_id)
    )
  `);

  // Asynchronous Fault-Tolerant Genre Recovery Queue
  await db.execute(`
    CREATE TABLE IF NOT EXISTS genre_sync_queue (
      platform TEXT,
      track_id TEXT,
      track_data TEXT,
      attempts INTEGER DEFAULT 0,
      last_attempt INTEGER,
      PRIMARY KEY (platform, track_id)
    )
  `);
  
  return db;
}

// --- PLAYLIST LOGIC ---
export async function getPlaylist(): Promise<VideoTrack[]> {
  const database = await initDb();
  const result = await database.select<{track_data: string}[]>('SELECT track_data FROM playlist ORDER BY sort_order ASC');
  return result.map(r => JSON.parse(r.track_data));
}

export async function addToPlaylist(track: VideoTrack, platform: string = 'bilibili') {
  const database = await initDb();
  const maxRes = await database.select<{m: number}[]>('SELECT MAX(sort_order) as m FROM playlist');
  const nextOrder = (maxRes[0]?.m || 0) + 1;
  try {
    await database.execute(
      'INSERT INTO playlist (platform, bvid, track_data, sort_order) VALUES ($1, $2, $3, $4)',
      [platform, track.bvid, JSON.stringify(track), nextOrder]
    );
  } catch (e) { /* Track already initialized */ }
}

export async function removeFromPlaylist(bvid: string, platform: string = 'bilibili') {
  const database = await initDb();
  await database.execute('DELETE FROM playlist WHERE platform = $1 AND bvid = $2', [platform, bvid]);
}

export async function updatePlaylistOrder(tracks: VideoTrack[], platform: string = 'bilibili') {
  const database = await initDb();
  for (let i = 0; i < tracks.length; i++) {
    await database.execute('UPDATE playlist SET sort_order = $1 WHERE platform = $2 AND bvid = $3', [i, platform, tracks[i].bvid]);
  }
}

export async function clearPlaylist() {
  const database = await initDb();
  await database.execute('DELETE FROM playlist');
}

export async function recordPlay(track: VideoTrack, platform: string = 'bilibili') {
  const database = await initDb();
  try {
    await database.execute(`
      INSERT INTO recent (platform, bvid, track_data, play_count, total_time, last_played) 
      VALUES ($1, $2, $3, 1, 0, $4)
      ON CONFLICT(platform, bvid) DO UPDATE SET 
        play_count = play_count + 1,
        last_played = $4,
        track_data = $3
    `, [platform, track.bvid, JSON.stringify(track), Date.now()]);
  } catch (e) {
    console.error("Failed to track playback metrics:", e);
  }
}

// NEW: A safe, atomic incrementer for actual real-time seconds listened
export async function addPlayTime(bvid: string, seconds: number, platform: string = 'bilibili') {
  if (seconds <= 0 || !bvid) return;
  const database = await initDb();
  try {
    await database.execute(`
      UPDATE recent SET total_time = total_time + $1 
      WHERE platform = $2 AND bvid = $3
    `, [Math.round(seconds), platform, bvid]);
  } catch (e) {
    // Silently ignore
  }
}

export interface RecentTrack extends VideoTrack {
  play_count: number;
  total_time: number;
  last_played: number;
}

export async function getRecentTracks(): Promise<RecentTrack[]> {
  const database = await initDb();
  const result = await database.select<any[]>('SELECT * FROM recent ORDER BY last_played DESC');
  return result.map(r => ({
    ...JSON.parse(r.track_data),
    play_count: r.play_count,
    total_time: r.total_time,
    last_played: r.last_played
  }));
}

// --- FAVORITES LOGIC ---
export async function getFavorites(): Promise<VideoTrack[]> {
  const database = await initDb();
  const result = await database.select<{track_data: string}[]>('SELECT track_data FROM favorites ORDER BY sort_order ASC');
  return result.map(r => JSON.parse(r.track_data));
}

export async function addToFavorites(track: VideoTrack, platform: string = 'bilibili') {
  const database = await initDb();
  const maxRes = await database.select<{m: number}[]>('SELECT MAX(sort_order) as m FROM favorites');
  const nextOrder = (maxRes[0]?.m || 0) + 1;
  try {
    await database.execute(
      'INSERT INTO favorites (platform, bvid, track_data, sort_order) VALUES ($1, $2, $3, $4)',
      [platform, track.bvid, JSON.stringify(track), nextOrder]
    );
    // Dispatch asynchronous orchestration task to collect genres
    queueGenreSync(platform, track.bvid, track);
  } catch (e) { /* Track already favorited */ }
}

export async function removeFromFavorites(bvid: string, platform: string = 'bilibili') {
  const database = await initDb();
  await database.execute('DELETE FROM favorites WHERE platform = $1 AND bvid = $2', [platform, bvid]);
}

export async function updateFavoritesOrder(tracks: VideoTrack[], platform: string = 'bilibili') {
  const database = await initDb();
  for (let i = 0; i < tracks.length; i++) {
    await database.execute('UPDATE favorites SET sort_order = $1 WHERE platform = $2 AND bvid = $3', [i, platform, tracks[i].bvid]);
  }
}

// --- USER CUSTOM PLAYLISTS LOGIC ---
export interface UserPlaylist {
  id: number;
  name: string;
  cover?: string;
  trackIds: string[];
}

export async function getUserPlaylists(): Promise<UserPlaylist[]> {
  const database = await initDb();
  const playlists = await database.select<any[]>('SELECT * FROM user_playlists ORDER BY created_at ASC');
  const result: UserPlaylist[] = [];
  for (const pl of playlists) {
    const coverRes = await database.select<{track_data: string}[]>(
      'SELECT track_data FROM user_playlist_tracks WHERE playlist_id = $1 ORDER BY id DESC LIMIT 1', 
      [pl.id]
    );
    let cover = undefined;
    if (coverRes.length > 0) {
      cover = JSON.parse(coverRes[0].track_data).cover;
    }
    const bvidRes = await database.select<{bvid: string}[]>(
      'SELECT bvid FROM user_playlist_tracks WHERE playlist_id = $1',
      [pl.id]
    );
    const trackIds = bvidRes.map(r => r.bvid);
    result.push({ id: pl.id, name: pl.name, cover, trackIds });
  }
  return result;
}

export async function createUserPlaylist(name: string) {
  const database = await initDb();
  await database.execute('INSERT INTO user_playlists (name, created_at) VALUES ($1, $2)', [name, Date.now()]);
}

export async function renameUserPlaylist(id: number, newName: string) {
  const database = await initDb();
  await database.execute('UPDATE user_playlists SET name = $1 WHERE id = $2', [newName, id]);
}

export async function deleteUserPlaylist(id: number) {
  const database = await initDb();
  await database.execute('DELETE FROM user_playlists WHERE id = $1', [id]);
  await database.execute('DELETE FROM user_playlist_tracks WHERE playlist_id = $1', [id]);
}

export async function getPlaylistTracks(playlistId: number): Promise<VideoTrack[]> {
  const database = await initDb();
  const result = await database.select<{track_data: string}[]>(
    'SELECT track_data FROM user_playlist_tracks WHERE playlist_id = $1 ORDER BY sort_order ASC', 
    [playlistId]
  );
  return result.map(r => JSON.parse(r.track_data));
}

export async function addTrackToUserPlaylist(playlistId: number, track: VideoTrack, platform: string = 'bilibili') {
  const database = await initDb();
  const maxRes = await database.select<{m: number}[]>(
    'SELECT MAX(sort_order) as m FROM user_playlist_tracks WHERE playlist_id = $1', 
    [playlistId]
  );
  const nextOrder = (maxRes[0]?.m || 0) + 1;
  try {
    await database.execute(
      'INSERT INTO user_playlist_tracks (playlist_id, platform, bvid, track_data, sort_order) VALUES ($1, $2, $3, $4, $5)',
      [playlistId, platform, track.bvid, JSON.stringify(track), nextOrder]
    );
    // Dispatch asynchronous orchestration task to collect genres
    queueGenreSync(platform, track.bvid, track);
  } catch (e) { /* Track exists in target collection */ }
}

export async function removeTrackFromUserPlaylist(playlistId: number, bvid: string, platform: string = 'bilibili') {
  const database = await initDb();
  await database.execute('DELETE FROM user_playlist_tracks WHERE playlist_id = $1 AND platform = $2 AND bvid = $3', [playlistId, platform, bvid]);
}

export async function updateUserPlaylistOrder(playlistId: number, tracks: VideoTrack[], platform: string = 'bilibili') {
  const database = await initDb();
  for (let i = 0; i < tracks.length; i++) {
    await database.execute(
      'UPDATE user_playlist_tracks SET sort_order = $1 WHERE playlist_id = $2 AND platform = $3 AND bvid = $4', 
      [i, playlistId, platform, tracks[i].bvid]
    );
  }
}