import md5 from 'md5';
import { fetch } from '@tauri-apps/plugin-http';

// We only store the currently playing track. 
// When this changes, the old URL is forgotten and the browser drops the buffered file.
let currentCachedBvid: string | null = null;
let currentCachedUrl: string | null = null;

export async function getBilibiliAudioUrl(bvid: string): Promise<string | null> {
  // 1. Single-Track Cache Logic
  if (currentCachedBvid !== bvid) {
    // User switched to a new track: permanently delete old cache reference
    currentCachedBvid = null;
    currentCachedUrl = null;
  } else if (currentCachedUrl) {
    // User clicked play on the same track again: use cache
    console.log("⚡ Using cached audio URL for", bvid);
    return currentCachedUrl;
  }

  try {
    const bilibiliUrl = `https://www.bilibili.com/video/${bvid}/`;
    const url = "https://api.snapany.com/v1/extract/post";
    
    const timestamp = Date.now().toString();
    const lang = "zh";
    const SALT = "6HTugjCXxR";
    
    const signStr = `${bilibiliUrl}${lang}${timestamp}${SALT}`;
    const gFooter = md5(signStr);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        "Accept": "*/*",
        "Accept-Language": lang,
        "G-Timestamp": timestamp,
        "G-Footer": gFooter,
        "Content-Type": "application/json",
        "Origin": "https://snapany.com",
        "Referer": "https://snapany.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ link: bilibiliUrl })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const medias = data.medias || [];
    
    // 2. Pure Audio Logic: Look for pure audio first, fallback to video if separated audio doesn't exist
    const audioMedia = medias.find((m: any) => m.media_type === "audio") || 
                       medias.find((m: any) => m.media_type === "video");
    
    if (audioMedia && audioMedia.resource_url) {
      const audioUrl = audioMedia.resource_url;
      
      // Save the new track to the cache
      currentCachedBvid = bvid;
      currentCachedUrl = audioUrl;
      
      return audioUrl;
    }
    
    return null;
  } catch (error) {
    console.error("SnapAny Fetch Error:", error);
    return null;
  }
}