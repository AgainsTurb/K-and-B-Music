// src/services/kugou_lyric.ts
import { fetch } from '@tauri-apps/plugin-http';
import CryptoJS from 'crypto-js';
import pako from 'pako';

// --- Core KuGou Decryption Key ---
const KRC_KEY_STR = "@Gaw^2tGQ61-\xce\xd2ni";
const KRC_KEY = new Uint8Array(KRC_KEY_STR.length);
for (let i = 0; i < KRC_KEY_STR.length; i++) {
  KRC_KEY[i] = KRC_KEY_STR.charCodeAt(i);
}

// --- Types & Interfaces ---
export interface Word {
  content: string;
  start: number;
  end: number;
}

export interface ParsedLine {
  start: number;
  end: number;
  words: Word[];
  content: string;
}

// --- Parsers and Decryptors ---
function krcDecrypt(encryptedB64: string): string {
  if (!encryptedB64) return "";
  try {
    const rawString = atob(encryptedB64);
    const rawBytes = new Uint8Array(rawString.length);
    for (let i = 0; i < rawString.length; i++) {
      rawBytes[i] = rawString.charCodeAt(i);
    }

    const payload = rawBytes.subarray(4);
    const decryptedData = new Uint8Array(payload.length);
    
    for (let i = 0; i < payload.length; i++) {
      decryptedData[i] = payload[i] ^ KRC_KEY[i % KRC_KEY.length];
    }
    
    const decompressed = pako.inflate(decryptedData);
    return new TextDecoder('utf-8').decode(decompressed);
  } catch (e) {
    console.error("[KuGou Debug] Failed to decrypt KRC data:", e);
    return "";
  }
}

function parseKrcToStructure(krcText: string): { origLines: ParsedLine[], transLines: ParsedLine[] } {
  const origLines: ParsedLine[] = [];
  const transLines: ParsedLine[] = [];
  const tags: Record<string, string> = {};
  
  const linePattern = /^\[(\d+),(\d+)\](.*)$/;
  const wordPattern = /<(\d+),(\d+),\d+>([^<]*)/g;
  
  const rawLines = krcText.split('\n');
  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line.startsWith("[")) continue;
    
    if (line.startsWith("[language:")) {
      tags["language"] = line.substring(10, line.length - 1);
      continue;
    }
    
    const lineMatch = linePattern.exec(line);
    if (lineMatch) {
      const lStart = parseInt(lineMatch[1], 10);
      const lDur = parseInt(lineMatch[2], 10);
      const content = lineMatch[3];
      
      const words: Word[] = [];
      let wMatch;
      wordPattern.lastIndex = 0;
      
      while ((wMatch = wordPattern.exec(content)) !== null) {
        const wStart = parseInt(wMatch[1], 10);
        const wDur = parseInt(wMatch[2], 10);
        const wText = wMatch[3];
        
        const absWStart = lStart + wStart;
        const absWEnd = absWStart + wDur;
        
        words.push({
          start: absWStart,
          end: absWEnd,
          content: wText
        });
      }
      
      let finalWords = words;
      if (words.length === 0 && content) {
        const cleanContent = content.replace(/<\d+,\d+,\d+>/g, '');
        finalWords = [{ start: lStart, end: lStart + lDur, content: cleanContent }];
      }
      
      origLines.push({
        start: lStart,
        end: lStart + lDur,
        words: finalWords,
        content: finalWords.map(w => w.content).join('')
      });
    }
  }

  if (tags["language"]) {
    try {
      // Use safer Uint8Array + TextDecoder to bypass JS string encoding issues
      const b64Data = atob(tags["language"].trim());
      const bytes = new Uint8Array(b64Data.length);
      for(let i=0; i<b64Data.length; i++) bytes[i] = b64Data.charCodeAt(i);
      const decodedJsonStr = new TextDecoder('utf-8').decode(bytes);
      
      const langJson = JSON.parse(decodedJsonStr);
      
      for (const lang of (langJson.content || [])) {
        if (lang.type === 1) { 
          const transContents = lang.lyricContent || [];
          for (let i = 0; i < origLines.length; i++) {
            if (i < transContents.length && transContents[i] && transContents[i].length > 0) {
              const tText = transContents[i][0];
              transLines.push({
                start: origLines[i].start,
                end: origLines[i].end,
                words: [{ start: origLines[i].start, end: origLines[i].end, content: tText }],
                content: tText
              });
            }
          }
          break;
        }
      }
    } catch (e) {
      console.warn("[KuGou Debug] Failed to unpack embedded translation JSON:", e);
    }
  }

  return { origLines, transLines };
}

export function ms2str(ms: number): string {
  if (ms === undefined || ms === null) return "[00:00.000]";
  const m = Math.floor(ms / 60000).toString().padStart(2, '0');
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
  const fff = Math.floor(ms % 1000).toString().padStart(3, '0');
  return `[${m}:${s}.${fff}]`;
}

export function convertToVerbatimText(parsedLines: ParsedLine[]): string {
  const outputLines: string[] = [];
  
  for (const line of parsedLines) {
    let lineStr = "";
    for (const word of line.words) {
      lineStr += `${ms2str(word.start)}${word.content}`;
    }
    
    let endMs = line.end;
    if (!endMs && line.words.length > 0) endMs = line.words[line.words.length - 1].end;
    if (!endMs) endMs = line.start;

    lineStr += ms2str(endMs);
    outputLines.push(lineStr);
  }
  
  return outputLines.join('\n');
}

// ==============================================================================
// SECTION 2: KUGOU API WRAPPER
// ==============================================================================

export class KuGouMusicAPI {
  private inited = false;
  private dfid = "-";
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.inited) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const mid = CryptoJS.MD5(Math.floor(Date.now()).toString()).toString();
        const params: Record<string, string> = {
          appid: "1014",
          platid: "4",
          mid: mid
        };
        
        const sortedValues = Object.values(params).filter(v => v !== "").sort();
        params.signature = CryptoJS.MD5(`1014${sortedValues.join('')}1014`).toString();
        
        const payload = btoa('{"uuid":""}');
        const queryParams = new URLSearchParams(params).toString();
        const url = `https://userservice.kugou.com/risk/v1/r_register_dev?${queryParams}`;
        
        const response = await fetch(url, { method: 'POST', body: payload });
        const data = await response.json();
        
        this.dfid = data?.data?.dfid || "-";
        console.log(`[KuGou Debug] Init Success. DFID: ${this.dfid}`);
        this.inited = true;
      } catch (e) {
        console.warn("[KuGou Debug] Failed to obtain KuGou device footprint:", e);
        this.dfid = "-";
        this.inited = true; 
      }
    })();

    return this.initPromise;
  }

  private signRequest(params: Record<string, string>, isLyricApi = false): { signedParams: Record<string, string>, mid: string } {
    const mid = CryptoJS.MD5(Math.floor(Date.now()).toString()).toString();
    
    const baseParams: Record<string, string> = isLyricApi ? {
      appid: "3116",
      clientver: "11070"
    } : {
      userid: "0",
      appid: "3116",
      token: "",
      clienttime: Math.floor(Date.now() / 1000).toString(),
      iscorrection: "1",
      uuid: "-",
      mid: mid,
      dfid: this.dfid,
      clientver: "11070",
      platform: "AndroidFilter"
    };
    
    Object.assign(baseParams, params);
    
    const sortedKeys = Object.keys(baseParams).sort();
    let signStr = "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA";
    for (const k of sortedKeys) {
      signStr += `${k}=${baseParams[k] || ''}`;
    }
    signStr += "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA";
    
    baseParams.signature = CryptoJS.MD5(signStr).toString();
    return { signedParams: baseParams, mid };
  }

  async searchSongs(keyword: string, limit = 1): Promise<any[]> {
    await this.init();
    
    const params = {
      keyword: keyword,
      page: "1",
      pagesize: limit.toString(),
      sorttype: "0"
    };
    
    const { signedParams, mid } = this.signRequest(params, false);
    const queryParams = new URLSearchParams(signedParams).toString();
    const url = `http://complexsearch.kugou.com/v2/search/song?${queryParams}`;
    
    console.log(`[KuGou Debug] Executing Search... URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        "User-Agent": "Android14-1070-11070-201-0-SearchSong-wifi",
        "KG-Rec": "1",
        "KG-RC": "1",
        "KG-CLIENTTIMEMS": Date.now().toString(),
        "x-router": "complexsearch.kugou.com",
        "mid": mid
      }
    });
    
    const data = await response.json();
    console.log(`[KuGou Debug] Search Response Data:`, data);
    
    const lists = data?.data?.lists || [];
    return lists.map((info: any) => ({
      id: info.ID?.toString(),
      hash: info.FileHash,
      title: info.SongName,
      artists: (info.Singers || []).map((s: any) => s.name).filter(Boolean),
      album: info.AlbumName || "",
      duration_ms: (info.Duration || 0) * 1000,
    }));
  }

  async getLyrics(songInfo: any): Promise<any> {
    await this.init();
    
    const artistStr = Array.isArray(songInfo.artists) ? songInfo.artists.join('、') : songInfo.artists;
    const searchParams = {
      album_audio_id: songInfo.id,
      duration: songInfo.duration_ms.toString(),
      hash: songInfo.hash,
      keyword: `${artistStr} - ${songInfo.title}`,
      lrctxt: "1",
      man: "no"
    };
    
    const { signedParams, mid } = this.signRequest(searchParams, true);
    const queryParams = new URLSearchParams(signedParams).toString();
    const url = `https://lyrics.kugou.com/v1/search?${queryParams}`;
    
    console.log(`[KuGou Debug] Fetching Lyric Candidates... URL: ${url}`);
    
    const headers = {
      "User-Agent": "Android14-1070-11070-201-0-Lyric-wifi",
      "KG-Rec": "1",
      "KG-RC": "1",
      "KG-CLIENTTIMEMS": Date.now().toString(),
      "mid": mid
    };
    
    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json();
    console.log(`[KuGou Debug] Candidate Response:`, data);
    
    const candidates = data?.candidates || [];
    if (candidates.length === 0) {
      console.warn(`[KuGou Debug] No candidates found!`);
      return null;
    }
    
    const targetLyric = candidates[0];
    console.log(`[KuGou Debug] Selected Candidate:`, targetLyric);
    
    const dlParamsRaw = {
      accesskey: targetLyric.accesskey,
      charset: "utf8",
      client: "mobi",
      fmt: "krc",
      id: targetLyric.id.toString(),
      ver: "1"
    };
    
    const dlSignData = this.signRequest(dlParamsRaw, true);
    const dlQueryParams = new URLSearchParams(dlSignData.signedParams).toString();
    
    console.log(`[KuGou Debug] Downloading Payload...`);
    const dlRes = await fetch(`http://lyrics.kugou.com/download?${dlQueryParams}`, { method: 'GET', headers });
    const payload = await dlRes.json();
    console.log(`[KuGou Debug] Download Response Code: ${payload.status}`);
    
    const decryptedKrc = krcDecrypt(payload.content || "");
    const { origLines, transLines } = parseKrcToStructure(decryptedKrc);
    
    return {
      song_id: songInfo.id,
      orig_lines: origLines,
      trans_lines: transLines
    };
  }
}

export const kugouApi = new KuGouMusicAPI();

export async function fetchKugouProLyrics(title: string, useTranslation = true): Promise<string> {
  try {
    const cleanTitle = title.replace(/\[.*?\]|\(.*?\)/g, "").trim();
    console.log(`[KuGou Debug] Triggered Fetch for: ${cleanTitle}`);
    
    const results = await kugouApi.searchSongs(cleanTitle);
    if (!results || results.length === 0) {
      console.warn(`[KuGou Debug] Search returned empty.`);
      return "";
    }

    const target = results[0];
    const lyricsPackage = await kugouApi.getLyrics(target);
    
    if (!lyricsPackage || !lyricsPackage.orig_lines || lyricsPackage.orig_lines.length === 0) {
      console.warn(`[KuGou Debug] Lyrics package parsing failed or empty.`);
      return "";
    }

    let parsedLines: ParsedLine[] = lyricsPackage.orig_lines;

    if (useTranslation && lyricsPackage.trans_lines && lyricsPackage.trans_lines.length > 0) {
      for (const tLine of lyricsPackage.trans_lines) {
        if (!tLine.content.trim()) continue;

        let bestMatch: ParsedLine | null = null;
        let minDiff = 2000;

        for (const orig of parsedLines) {
          const diff = Math.abs(orig.start - tLine.start);
          if (diff < minDiff) {
            minDiff = diff;
            bestMatch = orig;
          }
        }

        if (bestMatch) {
          const separator = "  •  ";
          if (!bestMatch.content.includes(separator)) {
            bestMatch.content += separator + tLine.content;
            if (bestMatch.words.length > 0) {
              bestMatch.words[bestMatch.words.length - 1].content += separator + tLine.content;
            } else {
              bestMatch.words.push({ content: separator + tLine.content, start: bestMatch.start, end: bestMatch.end });
            }
          }
        }
      }
    }

    const finalVerbatim = convertToVerbatimText(parsedLines);
    console.log(`[KuGou Debug] Final Output Generated Successfully! (${parsedLines.length} lines)`);
    return finalVerbatim;
  } catch (error) {
    console.error("[KuGou Debug] KuGou Pro Engine CRASHED:", error);
    return "";
  }
}