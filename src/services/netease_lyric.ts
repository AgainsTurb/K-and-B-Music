// src/services/netease_lyric.ts
import { fetch } from '@tauri-apps/plugin-http';
import CryptoJS from 'crypto-js';

// --- Cryptographic Parameters ---
const EAPI_KEY = CryptoJS.enc.Utf8.parse('e82ckenh8dichen8');
const DEVICEID_XOR_KEY = '3go8&$8*3*3h0k(2)2';

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

// --- Regex Patterns from Python Script ---
const TAG_SPLIT_PATTERN = /^\[(\w+):([^\]]*)\]$/;
const LINE_SPLIT_PATTERN = /^\[(\d+):(\d+)\.(\d+)\](.*)$/;
const ENHANCED_WORD_SPLIT_PATTERN = /<(\d+):(\d+)\.(\d+)>((?:(?!<\d+:\d+\.\d+>).)*)(?:<(\d+):(\d+)\.(\d+)>$)?/g;
const WORD_SPLIT_PATTERN = /((?:(?!\[\d+:\d+\.\d+\]).)*)(?:\[(\d+):(\d+)\.(\d+)\])?/g;
const MULTI_LINE_SPLIT_PATTERN = /^((?:\[\d+:\d+\.\d+\]){2,})(.*)$/;
const TIMESTAMPS_PATTERN = /\[(\d+):(\d+)\.(\d+)\]/g;
const YRC_LINE_PATTERN = /^\[(\d+),(\d+)\](.*)$/;
// Captures: 1: start, 2: duration, 3: content
const YRC_WORD_PATTERN = /(?:\[\d+,\d+\])?\((\d+),(\d+),\d+\)((?:.(?!\d+,\d+,\d+\)))*)/g;

// --- Cryptographic Helpers ---
function getAnonymousUsername(deviceId: string): string {
  let xored = '';
  for (let i = 0; i < deviceId.length; i++) {
    xored += String.fromCharCode(deviceId.charCodeAt(i) ^ DEVICEID_XOR_KEY.charCodeAt(i % DEVICEID_XOR_KEY.length));
  }
  const md5Digest = CryptoJS.MD5(xored);
  const md5Base64 = CryptoJS.enc.Base64.stringify(md5Digest);
  const combined = `${deviceId} ${md5Base64}`;
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(combined));
}

function eapiParamsEncrypt(path: string, params: any): string {
  const paramsStr = JSON.stringify(params);
  const msg = `nobody${path}use${paramsStr}md5forencrypt`;
  const sign = CryptoJS.MD5(msg).toString(CryptoJS.enc.Hex);
  
  const aesSrc = `${path}-36cd479b6b5-${paramsStr}-36cd479b6b5-${sign}`;
  
  const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(aesSrc), EAPI_KEY, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
  });
  
  return `params=${encrypted.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase()}`;
}

function eapiResponseDecrypt(cipherBuffer: ArrayBuffer): string {
  const words = CryptoJS.lib.WordArray.create(new Uint8Array(cipherBuffer) as any);
  const decrypted = CryptoJS.AES.decrypt({ ciphertext: words } as any, EAPI_KEY, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
  });
  return decrypted.toString(CryptoJS.enc.Utf8);
}

function generateDeviceId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function ms2str(ms: number): string {
  if (ms === undefined || ms === null) return "[00:00.000]";
  const m = Math.floor(ms / 60000).toString().padStart(2, '0');
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
  const fff = Math.floor(ms % 1000).toString().padStart(3, '0');
  return `[${m}:${s}.${fff}]`;
}

function time2ms(m: string, s: string, ms: string): number {
  const minVal = parseInt(m, 10);
  const secVal = parseInt(s, 10);
  const msStr = (ms + '000').substring(0, 3);
  const msVal = parseInt(msStr, 10);
  return minVal * 60000 + secVal * 1000 + msVal;
}

// --- Exact Python Parsers Ported to TypeScript ---
function parseNeteaseJsonLines(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith("{")) continue;
    try {
      const item = JSON.parse(line);
      const startMs = item.t;
      const components = item.c || [];
      const lineText = components.map((c: any) => c.tx || "").join("");
      
      lines.push({
        start: startMs,
        end: startMs, 
        words: [{ start: startMs, end: startMs, content: lineText }],
        content: lineText
      });
    } catch (e) {
      continue;
    }
  }
  return lines;
}

function parseYrc(yrcText: string): ParsedLine[] {
  if (!yrcText) return [];
  const parsedLines: ParsedLine[] = [];
  
  for (const rawLine of yrcText.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith("[")) continue;
    
    const lineMatch = YRC_LINE_PATTERN.exec(line);
    if (!lineMatch) continue;
    
    const lineStart = parseInt(lineMatch[1], 10);
    const duration = parseInt(lineMatch[2], 10);
    const content = lineMatch[3];
    const lineEnd = lineStart + duration;
    
    let words: Word[] = [];
    let wordMatch;
    
    YRC_WORD_PATTERN.lastIndex = 0;
    while ((wordMatch = YRC_WORD_PATTERN.exec(content)) !== null) {
      const wStart = parseInt(wordMatch[1], 10);
      const wDuration = parseInt(wordMatch[2], 10);
      words.push({
        start: wStart,
        end: wStart + wDuration,
        content: wordMatch[3]
      });
    }
    
    if (words.length === 0) {
      words = [{ start: lineStart, end: lineEnd, content: content }];
    }
    
    parsedLines.push({
      start: lineStart,
      end: lineEnd,
      words: words,
      content: words.map(w => w.content).join('')
    });
  }
  
  return parsedLines;
}

function parseLrc(lrcText: string): ParsedLine[] {
  if (!lrcText) return [];
  
  if (lrcText.includes('{"t":') || lrcText.trim().startsWith("{")) {
    return parseNeteaseJsonLines(lrcText);
  }
  
  const rawLinesList: ParsedLine[] = [];
  
  for (const rawLine of lrcText.split('\n')) {
    const line = rawLine.trim();
    if (!line || !line.startsWith("[")) continue;
    if (TAG_SPLIT_PATTERN.test(line)) continue;
    
    const multiMatch = MULTI_LINE_SPLIT_PATTERN.exec(line);
    if (multiMatch) {
      const timestamps = multiMatch[1];
      const lineContent = multiMatch[2];
      
      let tsMatch;
      TIMESTAMPS_PATTERN.lastIndex = 0;
      while ((tsMatch = TIMESTAMPS_PATTERN.exec(timestamps)) !== null) {
        const tsStart = time2ms(tsMatch[1], tsMatch[2], tsMatch[3]);
        rawLinesList.push({
          start: tsStart,
          end: tsStart,
          words: [{ start: tsStart, end: tsStart, content: lineContent }],
          content: lineContent
        });
      }
      continue;
    }
    
    const lineMatch = LINE_SPLIT_PATTERN.exec(line);
    if (lineMatch) {
      const start = time2ms(lineMatch[1], lineMatch[2], lineMatch[3]);
      const lineContent = lineMatch[4];
      let end = start;
      const words: Word[] = [];
      
      if (lineContent.includes("<") && lineContent.includes(">")) {
        let enhancedMatch;
        ENHANCED_WORD_SPLIT_PATTERN.lastIndex = 0;
        while ((enhancedMatch = ENHANCED_WORD_SPLIT_PATTERN.exec(lineContent)) !== null) {
          const wordStart = time2ms(enhancedMatch[1], enhancedMatch[2], enhancedMatch[3]);
          let wordEnd = wordStart;
          if (enhancedMatch[5] && enhancedMatch[6] && enhancedMatch[7]) {
            wordEnd = time2ms(enhancedMatch[5], enhancedMatch[6], enhancedMatch[7]);
          }
          end = wordEnd;
          
          if (words.length > 0) words[words.length - 1].end = wordStart;
          if (enhancedMatch[4]) words.push({ start: wordStart, end: wordEnd, content: enhancedMatch[4] });
        }
      } else {
        let wordMatch;
        WORD_SPLIT_PATTERN.lastIndex = 0;
        const wordParts = [];
        // Prevent infinite loops on zero-length regex matches
        while ((wordMatch = WORD_SPLIT_PATTERN.exec(lineContent)) !== null) {
            if (wordMatch.index === WORD_SPLIT_PATTERN.lastIndex) WORD_SPLIT_PATTERN.lastIndex++;
            if (!wordMatch[1] && !wordMatch[2]) continue;
            wordParts.push(wordMatch);
        }
        
        if (wordParts.length > 0 && wordParts.some(p => p[2])) {
           for (let i = 0; i < wordParts.length; i++) {
               const p = wordParts[i];
               const wordStart = words.length === 0 ? start : words[words.length - 1].end;
               let wordEnd = wordStart;
               if (p[2] && p[3] && p[4]) wordEnd = time2ms(p[2], p[3], p[4]);
               if (i === wordParts.length - 1) end = wordEnd;
               if (p[1]) words.push({ start: wordStart, end: wordEnd, content: p[1] });
           }
        }
      }
      
      if (words.length === 0 && lineContent) words.push({ start: start, end: start, content: lineContent });
      
      rawLinesList.push({ start: start, end: end, words: words, content: lineContent });
    }
  }
  
  const sortedLines = rawLinesList.sort((a, b) => a.start - b.start);
  
  for (let idx = 0; idx < sortedLines.length; idx++) {
    if (idx > 0 && sortedLines[idx - 1].end === sortedLines[idx - 1].start) {
        sortedLines[idx - 1].end = sortedLines[idx].start;
        if (sortedLines[idx - 1].words.length > 0 && sortedLines[idx - 1].words[sortedLines[idx - 1].words.length - 1].end === sortedLines[idx - 1].words[sortedLines[idx - 1].words.length - 1].start) {
            sortedLines[idx - 1].words[sortedLines[idx - 1].words.length - 1].end = sortedLines[idx].start;
        }
    }
  }
  
  return sortedLines.filter(l => l.words.length > 0);
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

// --- Main Netease API Engine ---
export class NeteaseMusicAPI {
  private inited = false;
  private cookies: Record<string, string> = {};
  private expire = 0;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.inited && this.expire > Date.now() / 1000) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const deviceId = generateDeviceId();
        const clientSign = `00:00:00:00:00:00@@@ABCDEFGH@@@@@@${generateDeviceId()}${generateDeviceId()}`;
        
        const preCookies = {
          os: "pc",
          deviceId: deviceId,
          osver: "Microsoft-Windows-10--build-22600-64bit",
          clientSign: clientSign,
          channel: "netease",
          mode: "MSI MAG B550 TOMAHAWK",
          appver: "3.1.3.203419",
        };

        const path = "/eapi/register/anonimous";
        const cryptoPath = "/api/register/anonimous";
        
        const params = {
          username: getAnonymousUsername(preCookies.deviceId),
          e_r: true,
          header: JSON.stringify({
            clientSign: preCookies.clientSign,
            os: preCookies.os,
            appver: preCookies.appver,
            deviceId: preCookies.deviceId,
            requestId: 0,
            osver: preCookies.osver,
          })
        };

        const encryptedParams = eapiParamsEncrypt(cryptoPath, params);

        const response = await fetch("https://interface.music.163.com" + path, {
          method: 'POST',
          headers: this.getHeaders(preCookies),
          body: encryptedParams
        });

        const buffer = await response.arrayBuffer();
        const data = JSON.parse(eapiResponseDecrypt(buffer));

        const setCookie = response.headers.get('set-cookie') || '';
        const nmtid = setCookie.match(/NMTID=([^;]+)/)?.[1] || '';
        const musicA = setCookie.match(/MUSIC_A=([^;]+)/)?.[1] || '';
        const csrf = setCookie.match(/__csrf=([^;]+)/)?.[1] || '';

        this.cookies = {
          WEVNSM: "1.0.0",
          os: preCookies.os,
          deviceId: preCookies.deviceId,
          osver: preCookies.osver,
          clientSign: preCookies.clientSign,
          channel: "netease",
          mode: preCookies.mode,
          NMTID: nmtid,
          MUSIC_A: musicA,
          __csrf: csrf,
          appver: preCookies.appver,
          WNMCID: `abcdef.${Date.now() - 5000}.01.0`,
        };

        this.expire = (Date.now() / 1000) + 864000;
        this.inited = true;
      } catch (e) {
        console.error("Netease Initialization Failed:", e);
      }
    })();

    return this.initPromise;
  }

  private getHeaders(cookiesObj: Record<string, string>): Record<string, string> {
    const cookieStr = Object.entries(cookiesObj)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    return {
      "Accept": "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieStr,
      "Mconfig-Info": '{"IuRPVVmc3WWul9fT":{"version":733184,"appver":"3.1.3.203419"}}',
      "Origin": "orpheus://orpheus",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.3.203419",
    };
  }

  async request(path: string, params: any): Promise<any> {
    await this.init();

    params.e_r = true;
    params.header = JSON.stringify({
      clientSign: this.cookies.clientSign,
      os: this.cookies.os,
      appver: this.cookies.appver,
      deviceId: this.cookies.deviceId,
      requestId: 0,
      osver: this.cookies.osver,
    });

    const cryptoPath = path.replace("eapi", "api");
    const encryptedParams = eapiParamsEncrypt(cryptoPath, params);

    const url = "https://interface.music.163.com" + path;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(this.cookies),
      body: encryptedParams
    });

    const buffer = await response.arrayBuffer();
    const data = JSON.parse(eapiResponseDecrypt(buffer));

    if (data.code !== 200) {
      console.warn("Netease API returned non-200 code:", data);
    }
    return data;
  }

  async searchSongs(keyword: string, limit = 5): Promise<any[]> {
    const params = {
      limit: limit.toString(),
      offset: "0",
      keyword: keyword,
      scene: "NORMAL",
      needCorrect: "true",
    };
    
    const data = await this.request("/eapi/search/song/list/page", params);
    const resources = data?.data?.resources || [];
    
    return resources.map((r: any) => {
      const b = r.baseInfo?.simpleSongData;
      if (!b) return null;
      return {
        id: b.id.toString(),
        title: b.name,
        artists: b.ar?.map((a: any) => a.name) || [],
      };
    }).filter(Boolean);
  }

  async getLyricsData(songId: string): Promise<any> {
    const params = {
      id: parseInt(songId, 10),
      lv: "-1",
      tv: "-1",
      rv: "-1",
      yv: "-1",
    };
    return await this.request("/eapi/song/lyric/v1", params);
  }
}

// --- High Level Public Accessor ---
export const neteaseApi = new NeteaseMusicAPI();

export async function fetchNeteaseProLyrics(title: string, useTranslation = true): Promise<string> {
  try {
    const cleanTitle = title.replace(/\[.*?\]|\(.*?\)/g, "").trim();
    const results = await neteaseApi.searchSongs(cleanTitle);
    if (!results || results.length === 0) return "";

    const target = results[0];
    const rawPayload = await neteaseApi.getLyricsData(target.id);

    let parsedLines: ParsedLine[] = [];

    // 1. Primary Word-by-Word (YRC) or Standard (LRC)
    if (rawPayload.yrc?.lyric) {
      parsedLines = parseYrc(rawPayload.yrc.lyric);
    } else if (rawPayload.lrc?.lyric) {
      parsedLines = parseLrc(rawPayload.lrc.lyric);
    }

    // 2. Prevent identical duplication if Chinese translation equals original
    const hasTranslation = rawPayload.tlyric?.lyric && rawPayload.tlyric.lyric !== rawPayload.lrc?.lyric;

    // 3. Intelligently merge translated lines directly into the original lines
    if (useTranslation && hasTranslation) {
      const transLines = parseLrc(rawPayload.tlyric.lyric);
      
      for (const tLine of transLines) {
        if (!tLine.content.trim()) continue;

        // THE FIX: Find the absolute closest matching line, not just the first one!
        let bestMatch: ParsedLine | null = null;
        let minDiff = 2000; // 2-second maximum threshold

        for (const orig of parsedLines) {
          const diff = Math.abs(orig.start - tLine.start);
          if (diff < minDiff) {
            minDiff = diff;
            bestMatch = orig;
          }
        }

        if (bestMatch) {
          const separator = "  •  ";
          // Prevent double-appending if multiple translations accidentally snap to the same line
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

    if (parsedLines.length === 0) return "";

    return convertToVerbatimText(parsedLines);
  } catch (error) {
    console.error("Netease Pro Engine Error:", error);
    return "";
  }
}