import { fetch } from '@tauri-apps/plugin-http';
import { initDb } from './db';
import { VideoTrack } from '../types';

const NETEASE_KEY = "x5qiTqDwvzyy7amfUB4";
let cachedSpotifyToken = "";
let tokenExpireTime = 0;

let chosicCookieString = "pll_language=en; _gid=GA1.2.63480009.1779166816; fsuid=02863837-af3a-4bb9-8af8-fad75d52ebce; r_34874064=1779166845%7C66298cfa2dca325e%7Cbd76d1e36663d0e14116721d4417eb55cb79bc7caacb8ba9c6304aad4efc4ff4; _gat_gtag_UA_132567108_1=1; _ga_XPLVMMQKKB=GS2.1.s1779166815$o1$g1$t1779166944$j60$l0$h0; _ga=GA1.1.1265641420.1779166816";

export function updateChosicCookies(cookieObj: Record<string, string>) {
  if (!cookieObj || Object.keys(cookieObj).length === 0) return;
  chosicCookieString = Object.entries(cookieObj)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
  console.log("✅ Chosic cookies auto-updated in memory!");
}

// Respect client rate-limits by implementing an async throttle window
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function fetchSpotifyToken(): Promise<string> {
  if (cachedSpotifyToken && Date.now() < tokenExpireTime) {
    return cachedSpotifyToken;
  }

  try {
    const res = await fetch("https://www.chosic.com/api/tools/t/", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "app": "new_releases",
        "Origin": "https://www.chosic.com",
        "Referer": "https://www.chosic.com/"
      },
      // CRITICAL FIX: Force Tauri to send raw bytes so it doesn't overwrite our Content-Type
      body: new Uint8Array(new TextEncoder().encode("app=new_releases"))
    });

    if (!res.ok) throw new Error(`Chosic Handshake Failed: ${res.status}`);
    
    // Safely parse text first to catch Cloudflare blocks or empty responses
    const textData = await res.text();
    let data;
    try {
      data = JSON.parse(textData);
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }
    } catch (err) {
      throw new Error("Chosic returned non-JSON: " + textData.substring(0, 100));
    }

    if (!data.token) {
      throw new Error("Token missing from Chosic response: " + textData.substring(0, 100));
    }

    cachedSpotifyToken = data.token;
    tokenExpireTime = Date.now() + (data.time * 1000) - 60000; 
    return cachedSpotifyToken;
  } catch (e) {
    console.error("Token exchange dropped:", e);
    throw e;
  }
}

async function processTrackGenreLookup(track: VideoTrack): Promise<string[]> {
  // Clean titles by dropping bracket blocks
  const cleanTitle = track.title.replace(/\[.*?\]|\(.*?\)/g, "").trim();
  
  // Step 1: Query NetEase Bridge
  const neteaseRes = await fetch(`https://api.yaohud.cn/api/music/wy?key=${NETEASE_KEY}&msg=${encodeURIComponent(cleanTitle)}`);
  if (!neteaseRes.ok) throw new Error("NetEase link timed out");
  const neteaseData = await neteaseRes.json();
  const targetSong = neteaseData?.data?.songs?.[0];
  if (!targetSong) throw new Error("Song match unavailable on NetEase structure");

  const query = `${targetSong.name} - ${targetSong.singer}`;

  // Step 2: Query Spotify metadata provider
  const token = await fetchSpotifyToken();
  console.log(`Using token: ${token}`); // Debug log
  
  const spotifyRes = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&market=US`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  
  if (!spotifyRes.ok) throw new Error(`Spotify route dropped connection: ${spotifyRes.status}`);
  const spotifyData = await spotifyRes.json();
  
  const items = spotifyData?.items || spotifyData?.tracks?.items || [];
  if (items.length === 0) throw new Error("No tracking profiles index matched");

  const spotifyUrl = items[0]?.external_urls?.spotify || "";
  const trackIdMatch = spotifyUrl.match(/track\/([a-zA-Z0-9]{22})/);
  if (!trackIdMatch) throw new Error("Failed to resolve Track ID format mapping");
  const trackId = trackIdMatch[1];

  // Step 3: Extract Chosic profiling tags
  const chosicHeaders = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "app": "genre_finder",
    "referer": `https://www.chosic.com/music-genre-finder/?track=${trackId}`,
    "x-requested-with": "XMLHttpRequest",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Cookie": chosicCookieString // <-- CRITICAL: Use the dynamic variable here!
  };

  const chosicTrackRes = await fetch(`https://www.chosic.com/api/tools/tracks/${trackId}`, { headers: chosicHeaders });
  
  // Safely handle non-JSON rejections
  if (!chosicTrackRes.ok) {
    const errText = await chosicTrackRes.text();
    throw new Error(`Chosic Tracks API failed: ${errText}`);
  }
  
  const chosicTrackData = await chosicTrackRes.json();
  const artistId = chosicTrackData?.artists?.[0]?.id;
  if (!artistId) throw new Error("Artist structural node mapping empty");

  const chosicArtistRes = await fetch(`https://www.chosic.com/api/tools/artists?ids=${artistId}`, { headers: chosicHeaders });
  
  if (!chosicArtistRes.ok) {
    const errText = await chosicArtistRes.text();
    throw new Error(`Chosic Artists API failed: ${errText}`);
  }
  
  const chosicArtistData = await chosicArtistRes.json();
  
  return chosicArtistData?.artists?.[0]?.genres || [];
}

// --- ASYNCHRONOUS ORCHESTRATION LAYER ---
let isProcessingQueue = false;

export async function queueGenreSync(platform: string, trackId: string, track: VideoTrack) {
  const database = await initDb();
  
  // Verify if cache node is already mapped
  const existing = await database.select<any[]>('SELECT 1 FROM track_genres WHERE platform = $1 AND track_id = $2', [platform, trackId]);
  if (existing.length > 0) return;

  await database.execute(`
    INSERT OR IGNORE INTO genre_sync_queue (platform, track_id, track_data, attempts, last_attempt)
    VALUES ($1, $2, $3, 0, 0)
  `, [platform, trackId, JSON.stringify(track)]);

  if (!isProcessingQueue) {
    triggerBackgroundSyncLoop();
  }
}

async function triggerBackgroundSyncLoop() {
  isProcessingQueue = true;
  const database = await initDb();

  while (true) {
    const pendings = await database.select<any[]>(
      'SELECT * FROM genre_sync_queue WHERE attempts < 6 ORDER BY last_attempt ASC LIMIT 1'
    );
    if (pendings.length === 0) break;

    const task = pendings[0];
    const track = JSON.parse(task.track_data);

    // Explicit 3000ms delay window to respect remote endpoint constraints
    await delay(3000);

    try {
      const genres = await processTrackGenreLookup(track);
      
      // Save collected data
      await database.execute(
        'INSERT OR REPLACE INTO track_genres (platform, track_id, genres) VALUES ($1, $2, $3)',
        [task.platform, task.track_id, JSON.stringify(genres)]
      );
      // Evict task item from queue
      await database.execute('DELETE FROM genre_sync_queue WHERE platform = $1 AND track_id = $2', [task.platform, task.track_id]);
    } catch (err) {
      console.warn(`Sync failure across track mapping path: ${task.track_id}. Staging for retry later.`, err);
      await database.execute(`
        UPDATE genre_sync_queue 
        SET attempts = attempts + 1, last_attempt = $1 
        WHERE platform = $2 AND track_id = $3
      `, [Date.now(), task.platform, task.track_id]);
    }
  }
  isProcessingQueue = false;
}

export async function getAllCachedGenres(): Promise<Record<string, string[]>> {
  const database = await initDb();
  const rows = await database.select<any[]>('SELECT * FROM track_genres');
  const mapping: Record<string, string[]> = {};
  rows.forEach(r => {
    mapping[r.track_id] = JSON.parse(r.genres);
  });
  return mapping;
}

export async function resumeBackgroundSync() {
  if (!isProcessingQueue) {
    console.log("Resuming background genre sync queue...");
    triggerBackgroundSyncLoop();
  }
}