import md5 from 'md5';
import { fetch } from '@tauri-apps/plugin-http';
import { VideoTrack } from '../types';

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

export const cloakBrowserStatus = { isReady: false, isLoggedIn: false };

// 1. MIRROR PYTHON SESSION HEADERS EXACTLY
export const BILI_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  "Referer": "https://search.bilibili.com/",
  "Origin": "https://search.bilibili.com",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
};

export const BILI_AUTH_HEADERS: Record<string, string> = { ...BILI_HEADERS };

export function updateBilibiliCookies(cookieObj: Record<string, string>) {
  // if (!cookieObj || Object.keys(cookieObj).length === 0) return;
  // const cookieString = Object.entries(cookieObj)
  //   .map(([key, value]) => `${key}=${value}`)
  //   .join('; ');
  
  // BILI_AUTH_HEADERS["Cookie"] = cookieString;
  // BILI_HEADERS["Cookie"] = cookieString;
  // console.log("✅ Bilibili cookies auto-updated in memory!");
  console.log("⚠️ Bilibili cookies temporarily DISABLED for testing!");
  return;
}
let cachedImgKey = '';
let cachedSubKey = '';
let keyTimestamp = 0;

function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  return MIXIN_KEY_ENC_TAB.slice(0, 32).map(i => raw[i]).join('');
}

function safeEncode(val: string | number): string {
  const str = String(val).replace(/[!'()*]/g, '');
  return encodeURIComponent(str);
}

function wbiSign(params: Record<string, string | number>, imgKey: string, subKey: string) {
  const mixinKey = getMixinKey(imgKey, subKey);
  const wts = Math.floor(Date.now() / 1000);
  const newParams: Record<string, string | number> = { ...params, wts };

  const sortedKeys = Object.keys(newParams).sort();
  const queryParts = sortedKeys.map(k => `${safeEncode(k)}=${safeEncode(newParams[k])}`);
  const query = queryParts.join('&');
  
  const w_rid = md5(query + mixinKey);
  return { ...newParams, w_rid };
}

async function getWbiKeys() {
  if (cachedImgKey && cachedSubKey && (Date.now() - keyTimestamp < 3600000)) {
    return { imgKey: cachedImgKey, subKey: cachedSubKey };
  }

  // 2. INJECT HEADERS HERE
  const response = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    method: 'GET',
    headers: BILI_HEADERS
  });

  if (!response.ok) {
     console.error("Failed to fetch WBI keys. Status:", response.status);
     const text = await response.text();
     console.error("Server replied with:", text.substring(0, 200)); // Print why it failed
     throw new Error("WBI Key Fetch Failed");
  }

  const json = await response.json();
  const data = json.data.wbi_img;
  
  const imgUrl = data.img_url;
  const subUrl = data.sub_url;
  
  cachedImgKey = imgUrl.substring(imgUrl.lastIndexOf('/') + 1, imgUrl.lastIndexOf('.'));
  cachedSubKey = subUrl.substring(subUrl.lastIndexOf('/') + 1, subUrl.lastIndexOf('.'));
  keyTimestamp = Date.now();
  
  return { imgKey: cachedImgKey, subKey: cachedSubKey };
}

export async function searchVideos(keyword: string, page: number = 1): Promise<VideoTrack[]> {
  try {
    const { imgKey, subKey } = await getWbiKeys();
    
    const params = { keyword, page };
    const signedParams = wbiSign(params, imgKey, subKey);
    
    const queryString = Object.entries(signedParams)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
      
    const url = `https://api.bilibili.com/x/web-interface/wbi/search/all/v2?${queryString}`;
    
    // 3. INJECT HEADERS HERE TOO
    const response = await fetch(url, {
      method: 'GET',
      headers: BILI_HEADERS
    });

    if (!response.ok) {
        console.error("Search API failed with status:", response.status);
        return [];
    }

    const data = await response.json();
    if (data.code !== 0) {
      console.error("API Error:", data.message);
      return [];
    }

    const result = data.data?.result || [];
    const videoModule = result.find((m: any) => m.result_type === "video");
    
    if (!videoModule) return [];
    
    return videoModule.data.map((item: any) => {
      const pubdate_ts = item.pubdate || item.created || 0;
      const dateObj = new Date(pubdate_ts * 1000);
      const pubdate_str = pubdate_ts > 0 
        ? dateObj.toISOString().slice(0, 19).replace('T', ' ')
        : "N/A";
      
      return {
        bvid: item.bvid,
        cover: item.pic || item.cover,
        title: item.title.replace(/<em class="keyword">/g, "").replace(/<\/em>/g, ""),
        uploader: item.author || (item.owner && item.owner.name) || "Unknown",
        views: item.play || item.view || 0,
        pubdate: pubdate_ts,
        pubdate_str: pubdate_str,
        duration: item.duration,
        aid: item.aid
      };
    });
  } catch (error) {
    console.error("Parse or Network Error:", error);
    return [];
  }
}

// --- ADD THIS TO THE BOTTOM OF bilibili.ts ---

// Helper to get the CID (internal part ID) required for audio streaming
async function getVideoCid(bvid: string): Promise<string | null> {
  try {
    // USING THE NEW PAGELIST API
    const url = `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}&jsonp=jsonp`;
    const response = await fetch(url, { method: 'GET', headers: BILI_HEADERS });
    const data = await response.json();
    
    // The new API returns an array in data, so we grab the cid from the first page (index 0)
    return (data.code === 0 && data.data && data.data.length > 0) ? data.data[0].cid : null;
  } catch (e) {
    console.error("Failed to fetch CID", e);
    return null;
  }
}

// Memory Cache for the current song's Blob URL
let currentCachedBvid: string | null = null;
let currentBlobUrl: string | null = null;

export async function getPureAudioStream(bvid: string): Promise<string | null> {
  // 1. Single-Track Memory Cache Logic
  if (currentCachedBvid === bvid && currentBlobUrl) {
    console.log("⚡ Using locally cached pure audio for", bvid);
    return currentBlobUrl;
  }

  // If switching tracks, permanently delete the old audio from RAM
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  try {
    // 2. Get the CID
    const cid = await getVideoCid(bvid);
    if (!cid) return null;

    // 3. Ask Bilibili for the DASH play stream (fnval: 16 strictly requests DASH format)
    const { imgKey, subKey } = await getWbiKeys();
    const params = { bvid, cid, fnval: 16 };
    const signedParams = wbiSign(params, imgKey, subKey);
    
    const queryString = Object.entries(signedParams).map(([k, v]) => `${k}=${v}`).join('&');
    const playUrlApi = `https://api.bilibili.com/x/player/wbi/playurl?${queryString}`;

    const playResp = await fetch(playUrlApi, { method: 'GET', headers: BILI_HEADERS });
    const playData = await playResp.json();
    
    if (playData.code !== 0 || !playData.data?.dash?.audio) {
      console.error("Failed to find DASH audio stream");
      return null;
    }

    // 4. Extract the pure audio URL (usually an extremely lightweight .m4s stream)
    const pureAudioUrl = playData.data.dash.audio[0].baseUrl;

    // 5. Download the audio bytes directly into RAM using Tauri (bypasses all CDN 403 errors)
    const audioStreamResp = await fetch(pureAudioUrl, {
      method: 'GET',
      headers: {
        "User-Agent": BILI_HEADERS["User-Agent"],
        "Referer": "https://www.bilibili.com" 
      }
    });

    if (!audioStreamResp.ok) return null;

    const arrayBuffer = await audioStreamResp.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'audio/mp4' });

    currentBlobUrl = URL.createObjectURL(blob);
    currentCachedBvid = bvid;

    return currentBlobUrl;

  } catch (error) {
    console.error("Pure Audio Stream Error:", error);
    return null;
  }
}

// --- SUBTITLE & LYRICS ENGINE ---

export interface SubtitleTrack {
  id: number;
  lan: string;
  lan_doc: string;
  subtitle_url: string;
}

export interface LyricLine {
  from: number;
  to: number;
  content: string;
}

// 1. Fetch the list of available languages for a specific track
export async function getTrackSubtitles(bvid: string, aid: number): Promise<SubtitleTrack[]> {
  try {
    const cid = await getVideoCid(bvid);
    if (!cid) return [];

    const url = `https://api.bilibili.com/x/v2/dm/view?type=1&aid=${aid}&oid=${cid}`;

    // We do NOT send BILI_HEADERS here, ensuring it acts as a clean, cookie-free request
    const resp = await fetch(url, { method: 'GET' });
    const data = await resp.json();

    return data.data?.subtitle?.subtitles || [];
  } catch (e) {
    console.error("Failed to fetch subtitles list", e);
    return [];
  }
}

// 2. Fetch the actual JSON lyric payload
export async function fetchLyricData(subtitleUrl: string): Promise<LyricLine[]> {
  try {
    let url = subtitleUrl.startsWith('//') ? `https:${subtitleUrl}` : subtitleUrl;
    url = url.replace('http://', 'https://'); 
    
    // We use a naked fetch here because Bilibili's subtitle CDN doesn't require strict headers
    const resp = await fetch(url, { method: 'GET' });
    const data = await resp.json();
    return data.body || [];
  } catch (e) {
    console.error("Failed to fetch lyric content", e);
    return [];
  }
}

// Helper parser for the new endpoints
function parseVideoItem(item: any): VideoTrack {
  const pubdate_ts = item.pubdate || item.created || item.ctime || 0;
  const dateObj = new Date(pubdate_ts * 1000);
  const pubdate_str = pubdate_ts > 0 ? dateObj.toISOString().slice(0, 19).replace('T', ' ') : "N/A";
  
  return {
    bvid: item.bvid,
    cover: item.pic || item.cover,
    title: item.title ? item.title.replace(/<em class="keyword">/g, "").replace(/<\/em>/g, "") : "",
    uploader: item.owner?.name || item.author || "Unknown",
    views: item.stat?.view || item.play || 0,
    pubdate: pubdate_ts,
    pubdate_str: pubdate_str,
    duration: item.duration || "00:00",
    aid: item.aid
  };
}

export async function getLatestVideos(pn: number = 1, ps: number = 20): Promise<VideoTrack[]> {
  try {
    const { imgKey, subKey } = await getWbiKeys();
    const params = { rid: 3, pn, ps }; // 3 = Music
    const signedParams = wbiSign(params, imgKey, subKey);
    const query = Object.entries(signedParams).map(([k, v]) => `${k}=${v}`).join('&');
    const url = `https://api.bilibili.com/x/web-interface/dynamic/region?${query}`;
    
    const response = await fetch(url, { method: 'GET', headers: BILI_HEADERS });
    const data = await response.json();
    const items = data.data?.archives || data.data?.list || [];
    return items.map(parseVideoItem);
  } catch (e) {
    console.error("Latest Videos Error:", e);
    return [];
  }
}

export async function getRankingVideos(pn: number = 1): Promise<VideoTrack[]> {
  try {
    if (pn > 1) return []; // Bilibili Ranking is a flat Top 100, no deep pagination needed
    const { imgKey, subKey } = await getWbiKeys();
    const params = { rid: 3, type: "all" };
    const signedParams = wbiSign(params, imgKey, subKey);
    const query = Object.entries(signedParams).map(([k, v]) => `${k}=${v}`).join('&');
    const url = `https://api.bilibili.com/x/web-interface/ranking/v2?${query}`;
    
    const response = await fetch(url, { method: 'GET', headers: BILI_HEADERS });
    const data = await response.json();
    const items = data.data?.list || data.data?.items || [];
    return items.map(parseVideoItem);
  } catch (e) {
    console.error("Ranking Videos Error:", e);
    return [];
  }
}

export async function searchVideosInPartition(keyword: string, tids: number = 3, page: number = 1): Promise<VideoTrack[]> {
  try {
    const { imgKey, subKey } = await getWbiKeys();
    
    const params = { search_type: "video", keyword, tids, page, order: "totalrank" };
    const signedParams = wbiSign(params, imgKey, subKey);
    
    const queryString = Object.entries(signedParams).map(([k, v]) => `${k}=${v}`).join('&');
    const url = `https://api.bilibili.com/x/web-interface/wbi/search/type?${queryString}`;
    
    const response = await fetch(url, { method: 'GET', headers: BILI_HEADERS });
    if (!response.ok) {
        console.error("Partition Search API failed:", response.status);
        return [];
    }

    const data = await response.json();
    if (data.code !== 0) return [];

    const items = data.data?.result || [];
    
    return items.map((item: any) => {
      const pubdate_ts = item.pubdate || item.created || 0;
      const dateObj = new Date(pubdate_ts * 1000);
      const pubdate_str = pubdate_ts > 0 ? dateObj.toISOString().slice(0, 19).replace('T', ' ') : "N/A";
      
      return {
        bvid: item.bvid,
        cover: item.pic || item.cover,
        title: item.title ? item.title.replace(/<em class="keyword">/g, "").replace(/<\/em>/g, "") : "",
        uploader: item.author || "Unknown",
        views: item.play || item.view || 0,
        pubdate: pubdate_ts,
        pubdate_str: pubdate_str,
        duration: item.duration || "00:00",
        aid: item.aid
      };
    });
  } catch (error) {
    console.error("Partition Search Error:", error);
    return [];
  }
}

let isFetchingPrediction = false;

export async function getSearchPrediction(term: string): Promise<string[]> {
  if (!term || isFetchingPrediction) return [];
  
  isFetchingPrediction = true;
  try {
    const url = `https://s.search.bilibili.com/main/suggest?term=${encodeURIComponent(term)}`;
    // We don't need BILI_HEADERS for this public proxy endpoint
    const response = await fetch(url, { method: 'GET' });
    const data = await response.json();
    
    isFetchingPrediction = false;
    
    if (data.code !== 0 || !data.result?.tag) return [];
    
    // Extract the raw text values from the tag array
    return data.result.tag.map((t: any) => t.value);
  } catch (error) {
    isFetchingPrediction = false;
    console.error("Prediction API Error:", error);
    return [];
  }
}