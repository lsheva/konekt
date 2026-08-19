const HEX = "0123456789abcdef";

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += HEX.charAt(b >> 4) + HEX.charAt(b & 15);
  return s;
}

export function fromHex(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2) throw new Error("odd hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function fromUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromB64(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toB64url(bytes: Uint8Array): string {
  return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function toB58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let x = 0n;
  for (const b of bytes) x = (x << 8n) | BigInt(b);
  let s = "";
  while (x > 0n) {
    s = B58[Number(x % 58n)] + s;
    x /= 58n;
  }
  return "1".repeat(zeros) + s;
}

export function fromB58(s: string): Uint8Array {
  let zeros = 0;
  while (zeros < s.length && s[zeros] === "1") zeros++;
  let x = 0n;
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v < 0) throw new Error("invalid base58");
    x = x * 58n + BigInt(v);
  }
  if (x === 0n) return new Uint8Array(zeros);
  const hex = x.toString(16);
  const body = fromHex(hex.length % 2 ? `0${hex}` : hex);
  const out = new Uint8Array(zeros + body.length);
  out.set(body, zeros);
  return out;
}
