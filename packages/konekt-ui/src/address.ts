export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function avatarGradient(address: string): string {
  const seed = Number.parseInt(address.slice(2, 8), 16);
  const hue = Number.isNaN(seed) ? 210 : seed % 360;
  return [
    `radial-gradient(circle at 28% 24%, hsl(${(hue + 40) % 360} 95% 72%), transparent 62%)`,
    `linear-gradient(135deg, hsl(${hue} 88% 58%), hsl(${(hue + 300) % 360} 82% 46%))`,
  ].join(", ");
}
