// src/services/tencent_lyric.ts
import { fetch } from '@tauri-apps/plugin-http';
import pako from 'pako';

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

// ==============================================================================
// SECTION 1: CUSTOM TRIPLE-DES IMPLEMENTATION (TENCENT S-BOXES)
// ==============================================================================

const ENCRYPT = 1;
const DECRYPT = 0;
const QRC_KEY = new TextEncoder().encode("!@#)(*$%123ZXC!@!@#)(NHL");

const sbox = [
  [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
   0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
   4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
   15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
   3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5,
   0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
   13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
   13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
   13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
   1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
   13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
   10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
   3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
   14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
   4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
   11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
   10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
   9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
   4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
   13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
   1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
   6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
   1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
   7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
   2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11]
];

function bitnum(a: Uint8Array, b: number, c: number): number {
  return ((a[Math.floor(b / 32) * 4 + 3 - Math.floor((b % 32) / 8)] >>> (7 - (b % 8))) & 1) << c;
}

function bitnum_intr(a: number, b: number, c: number): number {
  return ((a >>> (31 - b)) & 1) << c;
}

function bitnum_intl(a: number, b: number, c: number): number {
  return ((a << b) & 0x80000000) >>> c;
}

function sbox_bit(a: number): number {
  return (a & 32) | ((a & 31) >>> 1) | ((a & 1) << 4);
}

function initial_permutation(input_data: Uint8Array): [number, number] {
  return [
    (bitnum(input_data, 57, 31) | bitnum(input_data, 49, 30) | bitnum(input_data, 41, 29) | bitnum(input_data, 33, 28) |
     bitnum(input_data, 25, 27) | bitnum(input_data, 17, 26) | bitnum(input_data, 9, 25) | bitnum(input_data, 1, 24) |
     bitnum(input_data, 59, 23) | bitnum(input_data, 51, 22) | bitnum(input_data, 43, 21) | bitnum(input_data, 35, 20) |
     bitnum(input_data, 27, 19) | bitnum(input_data, 19, 18) | bitnum(input_data, 11, 17) | bitnum(input_data, 3, 16) |
     bitnum(input_data, 61, 15) | bitnum(input_data, 53, 14) | bitnum(input_data, 45, 13) | bitnum(input_data, 37, 12) |
     bitnum(input_data, 29, 11) | bitnum(input_data, 21, 10) | bitnum(input_data, 13, 9) | bitnum(input_data, 5, 8) |
     bitnum(input_data, 63, 7) | bitnum(input_data, 55, 6) | bitnum(input_data, 47, 5) | bitnum(input_data, 39, 4) |
     bitnum(input_data, 31, 3) | bitnum(input_data, 23, 2) | bitnum(input_data, 15, 1) | bitnum(input_data, 7, 0)) >>> 0,
    (bitnum(input_data, 56, 31) | bitnum(input_data, 48, 30) | bitnum(input_data, 40, 29) | bitnum(input_data, 32, 28) |
     bitnum(input_data, 24, 27) | bitnum(input_data, 16, 26) | bitnum(input_data, 8, 25) | bitnum(input_data, 0, 24) |
     bitnum(input_data, 58, 23) | bitnum(input_data, 50, 22) | bitnum(input_data, 42, 21) | bitnum(input_data, 34, 20) |
     bitnum(input_data, 26, 19) | bitnum(input_data, 18, 18) | bitnum(input_data, 10, 17) | bitnum(input_data, 2, 16) |
     bitnum(input_data, 60, 15) | bitnum(input_data, 52, 14) | bitnum(input_data, 44, 13) | bitnum(input_data, 36, 12) |
     bitnum(input_data, 28, 11) | bitnum(input_data, 20, 10) | bitnum(input_data, 12, 9) | bitnum(input_data, 4, 8) |
     bitnum(input_data, 62, 7) | bitnum(input_data, 54, 6) | bitnum(input_data, 46, 5) | bitnum(input_data, 38, 4) |
     bitnum(input_data, 30, 3) | bitnum(input_data, 22, 2) | bitnum(input_data, 14, 1) | bitnum(input_data, 6, 0)) >>> 0
  ];
}

function inverse_permutation(s0: number, s1: number): Uint8Array {
  const data = new Uint8Array(8);
  data[3] = (bitnum_intr(s1, 7, 7) | bitnum_intr(s0, 7, 6) | bitnum_intr(s1, 15, 5) | bitnum_intr(s0, 15, 4) | bitnum_intr(s1, 23, 3) | bitnum_intr(s0, 23, 2) | bitnum_intr(s1, 31, 1) | bitnum_intr(s0, 31, 0));
  data[2] = (bitnum_intr(s1, 6, 7) | bitnum_intr(s0, 6, 6) | bitnum_intr(s1, 14, 5) | bitnum_intr(s0, 14, 4) | bitnum_intr(s1, 22, 3) | bitnum_intr(s0, 22, 2) | bitnum_intr(s1, 30, 1) | bitnum_intr(s0, 30, 0));
  data[1] = (bitnum_intr(s1, 5, 7) | bitnum_intr(s0, 5, 6) | bitnum_intr(s1, 13, 5) | bitnum_intr(s0, 13, 4) | bitnum_intr(s1, 21, 3) | bitnum_intr(s0, 21, 2) | bitnum_intr(s1, 29, 1) | bitnum_intr(s0, 29, 0));
  data[0] = (bitnum_intr(s1, 4, 7) | bitnum_intr(s0, 4, 6) | bitnum_intr(s1, 12, 5) | bitnum_intr(s0, 12, 4) | bitnum_intr(s1, 20, 3) | bitnum_intr(s0, 20, 2) | bitnum_intr(s1, 28, 1) | bitnum_intr(s0, 28, 0));
  data[7] = (bitnum_intr(s1, 3, 7) | bitnum_intr(s0, 3, 6) | bitnum_intr(s1, 11, 5) | bitnum_intr(s0, 11, 4) | bitnum_intr(s1, 19, 3) | bitnum_intr(s0, 19, 2) | bitnum_intr(s1, 27, 1) | bitnum_intr(s0, 27, 0));
  data[6] = (bitnum_intr(s1, 2, 7) | bitnum_intr(s0, 2, 6) | bitnum_intr(s1, 10, 5) | bitnum_intr(s0, 10, 4) | bitnum_intr(s1, 18, 3) | bitnum_intr(s0, 18, 2) | bitnum_intr(s1, 26, 1) | bitnum_intr(s0, 26, 0));
  data[5] = (bitnum_intr(s1, 1, 7) | bitnum_intr(s0, 1, 6) | bitnum_intr(s1, 9, 5) | bitnum_intr(s0, 9, 4) | bitnum_intr(s1, 17, 3) | bitnum_intr(s0, 17, 2) | bitnum_intr(s1, 25, 1) | bitnum_intr(s0, 25, 0));
  data[4] = (bitnum_intr(s1, 0, 7) | bitnum_intr(s0, 0, 6) | bitnum_intr(s1, 8, 5) | bitnum_intr(s0, 8, 4) | bitnum_intr(s1, 16, 3) | bitnum_intr(s0, 16, 2) | bitnum_intr(s1, 24, 1) | bitnum_intr(s0, 24, 0));
  return data;
}

function f(state: number, key: number[]): number {
  const t1 = (bitnum_intl(state, 31, 0) | ((state & 0xf0000000) >>> 1) | bitnum_intl(state, 4, 5) |
              bitnum_intl(state, 3, 6) | ((state & 0x0f000000) >>> 3) | bitnum_intl(state, 8, 11) |
              bitnum_intl(state, 7, 12) | ((state & 0x00f00000) >>> 5) | bitnum_intl(state, 12, 17) |
              bitnum_intl(state, 11, 18) | ((state & 0x000f0000) >>> 7) | bitnum_intl(state, 16, 23)) >>> 0;
  
  const t2 = (bitnum_intl(state, 15, 0) | ((state & 0x0000f000) << 15) | bitnum_intl(state, 20, 5) |
              bitnum_intl(state, 19, 6) | ((state & 0x00000f00) << 13) | bitnum_intl(state, 24, 11) |
              bitnum_intl(state, 23, 12) | ((state & 0x000000f0) << 11) | bitnum_intl(state, 28, 17) |
              bitnum_intl(state, 27, 18) | ((state & 0x0000000f) << 9) | bitnum_intl(state, 0, 23)) >>> 0;

  const lrgstate = [
    ((t1 >>> 24) & 0xff) ^ key[0], ((t1 >>> 16) & 0xff) ^ key[1], ((t1 >>> 8) & 0xff) ^ key[2],
    ((t2 >>> 24) & 0xff) ^ key[3], ((t2 >>> 16) & 0xff) ^ key[4], ((t2 >>> 8) & 0xff) ^ key[5]
  ];

  const s = (
    (sbox[0][sbox_bit(lrgstate[0] >>> 2)] << 28) |
    (sbox[1][sbox_bit(((lrgstate[0] & 0x03) << 4) | (lrgstate[1] >>> 4))] << 24) |
    (sbox[2][sbox_bit(((lrgstate[1] & 0x0f) << 2) | (lrgstate[2] >>> 6))] << 20) |
    (sbox[3][sbox_bit(lrgstate[2] & 0x3f)] << 16) |
    (sbox[4][sbox_bit(lrgstate[3] >>> 2)] << 12) |
    (sbox[5][sbox_bit(((lrgstate[3] & 0x03) << 4) | (lrgstate[4] >>> 4))] << 8) |
    (sbox[6][sbox_bit(((lrgstate[4] & 0x0f) << 2) | (lrgstate[5] >>> 6))] << 4) |
    sbox[7][sbox_bit(lrgstate[5] & 0x3f)]
  ) >>> 0;

  return (bitnum_intl(s, 15, 0) | bitnum_intl(s, 6, 1) | bitnum_intl(s, 19, 2) |
          bitnum_intl(s, 20, 3) | bitnum_intl(s, 28, 4) | bitnum_intl(s, 11, 5) |
          bitnum_intl(s, 27, 6) | bitnum_intl(s, 16, 7) | bitnum_intl(s, 0, 8) |
          bitnum_intl(s, 14, 9) | bitnum_intl(s, 22, 10) | bitnum_intl(s, 25, 11) |
          bitnum_intl(s, 4, 12) | bitnum_intl(s, 17, 13) | bitnum_intl(s, 30, 14) |
          bitnum_intl(s, 9, 15) | bitnum_intl(s, 1, 16) | bitnum_intl(s, 7, 17) |
          bitnum_intl(s, 23, 18) | bitnum_intl(s, 13, 19) | bitnum_intl(s, 31, 20) |
          bitnum_intl(s, 26, 21) | bitnum_intl(s, 2, 22) | bitnum_intl(s, 8, 23) |
          bitnum_intl(s, 18, 24) | bitnum_intl(s, 12, 25) | bitnum_intl(s, 29, 26) |
          bitnum_intl(s, 5, 27) | bitnum_intl(s, 21, 28) | bitnum_intl(s, 10, 29) |
          bitnum_intl(s, 3, 30) | bitnum_intl(s, 24, 31)) >>> 0;
}

function crypt(inputData: Uint8Array, key: number[][]): Uint8Array {
  let [s0, s1] = initial_permutation(inputData);
  for (let idx = 0; idx < 15; idx++) {
    const prevS1 = s1;
    s1 = (f(s1, key[idx]) ^ s0) >>> 0;
    s0 = prevS1;
  }
  s0 = (f(s1, key[15]) ^ s0) >>> 0;
  return inverse_permutation(s0, s1);
}

function key_schedule(keyBytes: Uint8Array, offset: number, mode: number): number[][] {
  const schedule = Array.from({ length: 16 }, () => new Array(6).fill(0));
  const keyRndShift = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
  const keyPermC = [56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35];
  const keyPermD = [62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3];
  const keyCompression = [13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9, 22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1, 40, 51, 30, 36,
                          46, 54, 29, 39, 50, 44, 32, 47, 43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31];

  let c = 0, d = 0;
  for (let i = 0; i < 28; i++) {
    c = (c + bitnum(keyBytes.subarray(offset), keyPermC[i], 31 - i)) >>> 0;
    d = (d + bitnum(keyBytes.subarray(offset), keyPermD[i], 31 - i)) >>> 0;
  }

  for (let i = 0; i < 16; i++) {
    c = (((c << keyRndShift[i]) | (c >>> (28 - keyRndShift[i]))) & 0xfffffff0) >>> 0;
    d = (((d << keyRndShift[i]) | (d >>> (28 - keyRndShift[i]))) & 0xfffffff0) >>> 0;

    const togen = mode === DECRYPT ? 15 - i : i;
    for (let j = 0; j < 24; j++) {
      schedule[togen][Math.floor(j / 8)] |= bitnum_intr(c, keyCompression[j], 7 - (j % 8));
    }
    for (let j = 24; j < 48; j++) {
      schedule[togen][Math.floor(j / 8)] |= bitnum_intr(d, keyCompression[j] - 27, 7 - (j % 8));
    }
  }
  return schedule;
}

// Memoized key cache to mimic Python lru_cache behavior
let _cachedSchedule: number[][][] | null = null;
function tripledes_key_setup(key: Uint8Array, mode: number): number[][][] {
  if (_cachedSchedule) return _cachedSchedule;
  
  if (mode === ENCRYPT) {
    _cachedSchedule = [
      key_schedule(key, 0, ENCRYPT),
      key_schedule(key, 8, DECRYPT),
      key_schedule(key, 16, ENCRYPT)
    ];
  } else {
    _cachedSchedule = [
      key_schedule(key, 16, DECRYPT),
      key_schedule(key, 8, ENCRYPT),
      key_schedule(key, 0, DECRYPT)
    ];
  }
  return _cachedSchedule;
}

function tripledes_crypt(data: Uint8Array, keyCache: number[][][]): Uint8Array {
  let block: any = data.slice(); 
  for (let i = 0; i < 3; i++) {
    block = crypt(block, keyCache[i]);
  }
  return block as Uint8Array;
}

// ==============================================================================
// SECTION 2: QRC DECRYPTION AND XML PARSING
// ==============================================================================

function qrcDecrypt(encryptedHexStr: string): string {
  if (!encryptedHexStr || !encryptedHexStr.trim()) return "";
  try {
    const hex = encryptedHexStr.trim();
    const encryptedBytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < encryptedBytes.length; i++) {
      encryptedBytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }

    const data = new Uint8Array(encryptedBytes.length);
    const schedule = tripledes_key_setup(QRC_KEY, DECRYPT);
    
    for (let i = 0; i < encryptedBytes.length; i += 8) {
      const decryptedBlock = tripledes_crypt(encryptedBytes.subarray(i, i + 8), schedule);
      data.set(decryptedBlock, i);
    }
    
    const decompressed = pako.inflate(data);
    return new TextDecoder('utf-8').decode(decompressed);
  } catch (e) {
    console.error("Failed to decrypt QRC data streams:", e);
    return "";
  }
}

function parseQrcXmlToStructure(qrcStr: string): ParsedLine[] {
  if (!qrcStr) return [];
  const lines: ParsedLine[] = [];
  
  // 1. Try QRC format
  const qrcLinePattern = /\[(\d+),(\d+)\](.*)/;
  const qrcWordPattern = /([^\(]+)\((\d+),(\d+)\)/g;
  
  const rawLines = qrcStr.split('\n');
  for (const rawLine of rawLines) {
    const lineMatch = qrcLinePattern.exec(rawLine);
    if (lineMatch) {
      const lStart = parseInt(lineMatch[1], 10);
      const lDur = parseInt(lineMatch[2], 10);
      const content = lineMatch[3];
      const words: Word[] = [];
      
      let wMatch;
      qrcWordPattern.lastIndex = 0;
      while ((wMatch = qrcWordPattern.exec(content)) !== null) {
        words.push({
          content: wMatch[1],
          start: parseInt(wMatch[2], 10),
          end: parseInt(wMatch[2], 10) + parseInt(wMatch[3], 10)
        });
      }
      
      let finalWords = words;
      if (words.length === 0 && content) {
        const cleanContent = content.replace(/\[\d+:\d+\.\d+\]/g, '');
        finalWords = [{ start: lStart, end: lStart + lDur, content: cleanContent }];
      }
      
      lines.push({ 
        start: lStart, 
        end: lStart + lDur, 
        words: finalWords, 
        content: finalWords.map(w => w.content).join('') 
      });
    }
  }
  
  if (lines.length > 0) return lines;
  
  // 2. Try Standard LRC format
  const lrcPattern = /\[(\d+):(\d+)\.(\d+)\](.*)/;
  for (const rawLine of rawLines) {
    const match = lrcPattern.exec(rawLine);
    if (match) {
      const m = parseInt(match[1], 10);
      const s = parseInt(match[2], 10);
      const msStr = (match[3] + '000').substring(0, 3);
      const ms = parseInt(msStr, 10);
      const start = m * 60000 + s * 1000 + ms;
      const text = match[4].trim();
      
      lines.push({
        start: start,
        end: start,
        words: [{ start: start, end: start, content: text }],
        content: text
      });
    }
  }
  
  return lines;
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
// SECTION 3: TENCENT API WRAPPER
// ==============================================================================

export class TencentMusicAPI {
  private inited = false;
  private initPromise: Promise<void> | null = null;
  private comm = {
    ct: 11,
    cv: "1003006",
    v: "1003006",
    os_ver: "15",
    phonetype: "24122RKC7C",
    rom: "Redmi/miro/miro:15/AE3A.240806.005/OS2.0.105.0.VOMCNXM:user/release-keys",
    tmeAppID: "qqmusiclight",
    nettype: "NETWORK_WIFI",
    udid: "0",
    uid: "0",
    sid: "",
    userip: ""
  };

  async init(): Promise<void> {
    if (this.inited) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const param = { caller: 0, uid: "0", vkey: 0 };
        const data = await this.request("GetSession", "music.getSession.session", param);
        
        this.comm.uid = data.session.uid || "0";
        this.comm.sid = data.session.sid || "";
        this.comm.userip = data.session.userip || "";
        
        this.inited = true;
      } catch (e) {
        console.error("Tencent Initialization Failed:", e);
      }
    })();

    return this.initPromise;
  }

  async request(method: string, module: string, param: any): Promise<any> {
    if (!this.inited && method !== "GetSession") {
      await this.init();
    }
    
    const payload = {
      comm: this.comm,
      request: {
        method: method,
        module: module,
        param: param,
      }
    };

    const response = await fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
      method: 'POST',
      headers: {
        "cookie": "tmeLoginType=-1;",
        "content-type": "application/json",
        "user-agent": "okhttp/3.14.9"
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();
    if (responseData.code !== 0 || (responseData.request && responseData.request.code !== 0)) {
      throw new Error(`Tencent API Request Error Code: ${responseData.code}`);
    }
    
    return responseData.request.data;
  }

  async searchSongs(keyword: string, limit = 1): Promise<any[]> {
    const searchId = (Math.floor(Math.random() * 20) * 18014398509481984 + Math.round(Date.now()) % 86400000).toString();
    const param = {
      search_id: searchId,
      remoteplace: "search.android.keyboard",
      query: keyword,
      search_type: 0,
      num_per_page: limit,
      page_num: 1,
      highlight: 0,
      nqc_flag: 0,
      page_id: 1,
      grp: 1,
    };
    
    const data = await this.request("DoSearchForQQMusicLite", "music.search.SearchCgiService", param);
    const songList = data?.body?.item_song || [];
    
    return songList.map((info: any) => ({
      id: info.id.toString(),
      mid: info.mid || "",
      title: info.title || "",
      artists: (info.singer || []).map((s: any) => s.name).filter(Boolean),
      album: info.album?.name || "",
      duration_ms: (info.interval || 0) * 1000,
    }));
  }

  async getLyrics(songInfo: any): Promise<any> {
    const artistStr = Array.isArray(songInfo.artists) ? songInfo.artists.join('/') : songInfo.artists;
    
    const param = {
      albumName: btoa(unescape(encodeURIComponent(songInfo.album))),
      crypt: 1,
      ct: 19,
      cv: 2111,
      interval: Math.floor(songInfo.duration_ms / 1000),
      lrc_t: 0,
      qrc: 1,
      qrc_t: 0,
      roma: 1,
      roma_t: 0,
      singerName: btoa(unescape(encodeURIComponent(artistStr))),
      songID: parseInt(songInfo.id, 10),
      songName: btoa(unescape(encodeURIComponent(songInfo.title))),
      trans: 1,
      trans_t: 0,
      type: 0,
    };

    const response = await this.request("GetPlayLyricInfo", "music.musichallSong.PlayLyricInfo", param);
    return {
      song_id: songInfo.id,
      lyric_xml: qrcDecrypt(response.lyric || ""),
      trans_xml: qrcDecrypt(response.trans || ""),
    };
  }
}

// --- High Level Public Accessor ---
export const tencentApi = new TencentMusicAPI();

export async function fetchTencentProLyrics(title: string, useTranslation = true): Promise<string> {
  try {
    const cleanTitle = title.replace(/\[.*?\]|\(.*?\)/g, "").trim();
    const results = await tencentApi.searchSongs(cleanTitle);
    if (!results || results.length === 0) return "";

    const target = results[0];
    const lyricsPackage = await tencentApi.getLyrics(target);

    let parsedLines = parseQrcXmlToStructure(lyricsPackage.lyric_xml);

    // Merge translated lines directly into original matching timestamps (2-second snapping)
    if (useTranslation && lyricsPackage.trans_xml) {
      const transLines = parseQrcXmlToStructure(lyricsPackage.trans_xml);
      
      for (const tLine of transLines) {
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

    if (parsedLines.length === 0) return "";

    return convertToVerbatimText(parsedLines);
  } catch (error) {
    console.error("Tencent Pro Engine Error:", error);
    return "";
  }
}