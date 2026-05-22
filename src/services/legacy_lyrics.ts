// src/services/legacy_lyrics.ts
import { LyricLine } from './bilibili';

export async function fetchNeteaseLyrics(title: string): Promise<LyricLine[]> {
  try {
    const cleanTitle = title.replace(/\[.*?\]|\(.*?\)/g, "").trim();
    const searchRes = await fetch(`https://v2.alapi.cn/api/music/search?token=LwExDtUWhF3rH5ib&keyword=${encodeURIComponent(cleanTitle)}`);
    const searchData = await searchRes.json();
    const songId = searchData?.data?.songs?.[0]?.id;
    if (!songId) return [];

    const lyricRes = await fetch(`https://api.bugpk.com/api/music?id=${songId}&media=netease&type=song`);
    const lyricData = await lyricRes.json();
    const lrcStr = lyricData?.lrc_data || '';

    const lines = lrcStr.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    for (const line of lines) {
      const match = timeRegex.exec(line);
      if (match) {
        const m = parseInt(match[1], 10);
        const s = parseInt(match[2], 10);
        const msStr = match[3];
        const ms = msStr.length === 2 ? parseInt(msStr, 10) * 10 : parseInt(msStr, 10);
        const time = m * 60 + s + ms / 1000;
        const content = line.replace(timeRegex, '').trim();
        if (content) result.push({ from: time, to: 0, content });
      }
    }

    for (let i = 0; i < result.length - 1; i++) {
      result[i].to = result[i + 1].from;
    }
    if (result.length > 0) result[result.length - 1].to = result[result.length - 1].from + 10;
    return result;
  } catch (e) {
    console.error("Netease lyric fetch failed:", e);
    return [];
  }
}

export async function fetchTencentLyrics(title: string): Promise<LyricLine[]> {
  try {
    const cleanTitle = title.replace(/\[.*?\]|\(.*?\)/g, "").trim();
    const searchRes = await fetch(`https://api.yaohud.cn/api/music/qq?key=x5qiTqDwvzyy7amfUB4&msg=${encodeURIComponent(cleanTitle)}`);
    const searchData = await searchRes.json();
    const songMid = searchData?.data?.songs?.[0]?.mid;
    if (!songMid) return [];

    const lyricRes = await fetch(`https://api.bugpk.com/api/music?id=${songMid}&media=tencent&type=song`);
    const lyricData = await lyricRes.json();
    const lrcStr = lyricData?.lrc_data || '';

    const lines = lrcStr.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    for (const line of lines) {
      const match = timeRegex.exec(line);
      if (match) {
        const m = parseInt(match[1], 10);
        const s = parseInt(match[2], 10);
        const msStr = match[3];
        const ms = msStr.length === 2 ? parseInt(msStr, 10) * 10 : parseInt(msStr, 10);
        const time = m * 60 + s + ms / 1000;
        const content = line.replace(timeRegex, '').trim();
        if (content) result.push({ from: time, to: 0, content });
      }
    }

    for (let i = 0; i < result.length - 1; i++) {
      result[i].to = result[i + 1].from;
    }
    if (result.length > 0) result[result.length - 1].to = result[result.length - 1].from + 10;
    return result;
  } catch (e) {
    console.error("Tencent lyric fetch failed:", e);
    return [];
  }
}