import Database from '@tauri-apps/plugin-sql';
import { VideoTrack } from '../types';
import { queueGenreSync } from './genreSync';

let db: Database | null = null;

// Helper to generate timestamps
const now = () => Date.now();

export async function initDb() {
  if (db) return db;
  db = await Database.load('sqlite:kandb.db');
  
  // Rule 1 & 2 & 3 applied: UUIDs, is_deleted, and updated_at added to all tables

  await db.execute(`
    CREATE TABLE IF NOT EXISTS playlist (
      uuid TEXT PRIMARY KEY,
      platform TEXT DEFAULT 'bilibili',
      bvid TEXT,
      track_data TEXT,
      sort_order INTEGER,
      is_deleted INTEGER DEFAULT 0,
      updated_at INTEGER,
      UNIQUE(platform, bvid)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recent (
      platform TEXT DEFAULT 'bilibili',
      bvid TEXT,
      track_data TEXT,
      play_count INTEGER DEFAULT 1,
      total_time INTEGER DEFAULT 0,
      last_played INTEGER,
      is_deleted INTEGER DEFAULT 0,
      updated_at INTEGER,
      PRIMARY KEY (platform, bvid)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS favorites (
      uuid TEXT PRIMARY KEY,
      platform TEXT DEFAULT 'bilibili',
      bvid TEXT,
      track_data TEXT,
      sort_order INTEGER,
      is_deleted INTEGER DEFAULT 0,
      updated_at INTEGER,
      UNIQUE(platform, bvid)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_playlists (
      uuid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER,
      is_deleted INTEGER DEFAULT 0,
      updated_at INTEGER
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_playlist_tracks (
      uuid TEXT PRIMARY KEY,
      playlist_uuid TEXT,
      platform TEXT DEFAULT 'bilibili',
      bvid TEXT,
      track_data TEXT,
      sort_order INTEGER,
      is_deleted INTEGER DEFAULT 0,
      updated_at INTEGER,
      UNIQUE(playlist_uuid, platform, bvid)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS track_genres (
      platform TEXT,
      track_id TEXT,
      genres TEXT,
      PRIMARY KEY (platform, track_id)
    )
  `);

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
  // Sync Rule: Never fetch deleted items!
  const result = await database.select<{track_data: string}[]>('SELECT track_data FROM playlist WHERE is_deleted = 0 ORDER BY sort_order ASC');
  return result.map(r => JSON.parse(r.track_data));
}

export async function addToPlaylist(track: VideoTrack, platform: string = 'bilibili') {
  const database = await initDb();
  const maxRes = await database.select<{m: number}[]>('SELECT MAX(sort_order) as m FROM playlist WHERE is_deleted = 0');
  const nextOrder = (maxRes[0]?.m || 0) + 1;
  try {
    // If it exists but was deleted, we "resurrect" it. Otherwise insert new.
    await database.execute(`
      INSERT INTO playlist (uuid, platform, bvid, track_data, sort_order, updated_at, is_deleted) 
      VALUES ($1, $2, $3, $4, $5, $6, 0)
      ON CONFLICT(platform, bvid) DO UPDATE SET 
        is_deleted = 0, 
        sort_order = $5, 
        updated_at = $6
    `, [crypto.randomUUID(), platform, track.bvid, JSON.stringify(track), nextOrder, now()]);
  } catch (e) { console.error(e); }
}

export async function removeFromPlaylist(bvid: string, platform: string = 'bilibili') {
  const database = await initDb();
  // Sync Rule: Tombstone it, don't delete it!
  await database.execute('UPDATE playlist SET is_deleted = 1, updated_at = $1 WHERE platform = $2 AND bvid = $3', [now(), platform, bvid]);
}

export async function updatePlaylistOrder(tracks: VideoTrack[], platform: string = 'bilibili') {
  const database = await initDb();
  for (let i = 0; i < tracks.length; i++) {
    await database.execute('UPDATE playlist SET sort_order = $1, updated_at = $2 WHERE platform = $3 AND bvid = $4', [i, now(), platform, tracks[i].bvid]);
  }
}

export async function clearPlaylist() {
  const database = await initDb();
  // Sync Rule: Tombstone the whole table
  await database.execute('UPDATE playlist SET is_deleted = 1, updated_at = $1', [now()]);
}

export async function recordPlay(track: VideoTrack, platform: string = 'bilibili') {
  const database = await initDb();
  try {
    await database.execute(`
      INSERT INTO recent (platform, bvid, track_data, play_count, total_time, last_played, updated_at) 
      VALUES ($1, $2, $3, 1, 0, $4, $4)
      ON CONFLICT(platform, bvid) DO UPDATE SET 
        play_count = play_count + 1,
        last_played = $4,
        updated_at = $4,
        is_deleted = 0,
        track_data = $3
    `, [platform, track.bvid, JSON.stringify(track), now()]);
  } catch (e) {
    console.error("Failed to track playback metrics:", e);
  }
}

export async function addPlayTime(bvid: string, seconds: number, platform: string = 'bilibili') {
  if (seconds <= 0 || !bvid) return;
  const database = await initDb();
  try {
    await database.execute(`
      UPDATE recent SET total_time = total_time + $1, updated_at = $2 
      WHERE platform = $3 AND bvid = $4
    `, [Math.round(seconds), now(), platform, bvid]);
  } catch (e) {}
}

export interface RecentTrack extends VideoTrack {
  play_count: number;
  total_time: number;
  last_played: number;
}

export async function getRecentTracks(): Promise<RecentTrack[]> {
  const database = await initDb();
  const result = await database.select<any[]>('SELECT * FROM recent WHERE is_deleted = 0 ORDER BY last_played DESC');
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
  const result = await database.select<{track_data: string}[]>('SELECT track_data FROM favorites WHERE is_deleted = 0 ORDER BY sort_order ASC');
  return result.map(r => JSON.parse(r.track_data));
}

export async function addToFavorites(track: VideoTrack, platform: string = 'bilibili') {
  const database = await initDb();
  const maxRes = await database.select<{m: number}[]>('SELECT MAX(sort_order) as m FROM favorites WHERE is_deleted = 0');
  const nextOrder = (maxRes[0]?.m || 0) + 1;
  try {
    await database.execute(`
      INSERT INTO favorites (uuid, platform, bvid, track_data, sort_order, updated_at, is_deleted) 
      VALUES ($1, $2, $3, $4, $5, $6, 0)
      ON CONFLICT(platform, bvid) DO UPDATE SET 
        is_deleted = 0, 
        sort_order = $5, 
        updated_at = $6
    `, [crypto.randomUUID(), platform, track.bvid, JSON.stringify(track), nextOrder, now()]);
    queueGenreSync(platform, track.bvid, track);
  } catch (e) {}
}

export async function removeFromFavorites(bvid: string, platform: string = 'bilibili') {
  const database = await initDb();
  await database.execute('UPDATE favorites SET is_deleted = 1, updated_at = $1 WHERE platform = $2 AND bvid = $3', [now(), platform, bvid]);
}

export async function updateFavoritesOrder(tracks: VideoTrack[], platform: string = 'bilibili') {
  const database = await initDb();
  for (let i = 0; i < tracks.length; i++) {
    await database.execute('UPDATE favorites SET sort_order = $1, updated_at = $2 WHERE platform = $3 AND bvid = $4', [i, now(), platform, tracks[i].bvid]);
  }
}

// --- USER CUSTOM PLAYLISTS LOGIC ---
export interface UserPlaylist {
  id: string; // CHANGED: Now a UUID String!
  name: string;
  cover?: string;
  trackIds: string[];
}

export async function getUserPlaylists(): Promise<UserPlaylist[]> {
  const database = await initDb();
  const playlists = await database.select<any[]>('SELECT * FROM user_playlists WHERE is_deleted = 0 ORDER BY created_at ASC');
  const result: UserPlaylist[] = [];
  for (const pl of playlists) {
    const coverRes = await database.select<{track_data: string}[]>(
      'SELECT track_data FROM user_playlist_tracks WHERE playlist_uuid = $1 AND is_deleted = 0 ORDER BY sort_order ASC LIMIT 1', 
      [pl.uuid]
    );
    let cover = undefined;
    if (coverRes.length > 0) {
      cover = JSON.parse(coverRes[0].track_data).cover;
    }
    const bvidRes = await database.select<{bvid: string}[]>(
      'SELECT bvid FROM user_playlist_tracks WHERE playlist_uuid = $1 AND is_deleted = 0',
      [pl.uuid]
    );
    const trackIds = bvidRes.map(r => r.bvid);
    result.push({ id: pl.uuid, name: pl.name, cover, trackIds });
  }
  return result;
}

export async function createUserPlaylist(name: string) {
  const database = await initDb();
  await database.execute('INSERT INTO user_playlists (uuid, name, created_at, updated_at) VALUES ($1, $2, $3, $3)', [crypto.randomUUID(), name, now()]);
}

export async function renameUserPlaylist(playlistUuid: string, newName: string) {
  const database = await initDb();
  await database.execute('UPDATE user_playlists SET name = $1, updated_at = $2 WHERE uuid = $3', [newName, now(), playlistUuid]);
}

export async function deleteUserPlaylist(playlistUuid: string) {
  const database = await initDb();
  // Tombstone the playlist AND its tracks
  await database.execute('UPDATE user_playlists SET is_deleted = 1, updated_at = $1 WHERE uuid = $2', [now(), playlistUuid]);
  await database.execute('UPDATE user_playlist_tracks SET is_deleted = 1, updated_at = $1 WHERE playlist_uuid = $2', [now(), playlistUuid]);
}

export async function getPlaylistTracks(playlistUuid: string): Promise<VideoTrack[]> {
  const database = await initDb();
  const result = await database.select<{track_data: string}[]>(
    'SELECT track_data FROM user_playlist_tracks WHERE playlist_uuid = $1 AND is_deleted = 0 ORDER BY sort_order ASC', 
    [playlistUuid]
  );
  return result.map(r => JSON.parse(r.track_data));
}

export async function addTrackToUserPlaylist(playlistUuid: string, track: VideoTrack, platform: string = 'bilibili') {
  const database = await initDb();
  const maxRes = await database.select<{m: number}[]>(
    'SELECT MAX(sort_order) as m FROM user_playlist_tracks WHERE playlist_uuid = $1 AND is_deleted = 0', 
    [playlistUuid]
  );
  const nextOrder = (maxRes[0]?.m || 0) + 1;
  try {
    await database.execute(`
      INSERT INTO user_playlist_tracks (uuid, playlist_uuid, platform, bvid, track_data, sort_order, updated_at, is_deleted) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
      ON CONFLICT(playlist_uuid, platform, bvid) DO UPDATE SET 
        is_deleted = 0, 
        sort_order = $6, 
        updated_at = $7
    `, [crypto.randomUUID(), playlistUuid, platform, track.bvid, JSON.stringify(track), nextOrder, now()]);
    queueGenreSync(platform, track.bvid, track);
  } catch (e) { console.error(e); }
}

export async function removeTrackFromUserPlaylist(playlistUuid: string, bvid: string, platform: string = 'bilibili') {
  const database = await initDb();
  await database.execute('UPDATE user_playlist_tracks SET is_deleted = 1, updated_at = $1 WHERE playlist_uuid = $2 AND platform = $3 AND bvid = $4', [now(), playlistUuid, platform, bvid]);
}

export async function updateUserPlaylistOrder(playlistUuid: string, tracks: VideoTrack[], platform: string = 'bilibili') {
  const database = await initDb();
  for (let i = 0; i < tracks.length; i++) {
    await database.execute(
      'UPDATE user_playlist_tracks SET sort_order = $1, updated_at = $2 WHERE playlist_uuid = $3 AND platform = $4 AND bvid = $5', 
      [i, now(), playlistUuid, platform, tracks[i].bvid]
    );
  }
}