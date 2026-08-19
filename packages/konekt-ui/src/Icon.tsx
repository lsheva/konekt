import type { SVGProps } from "react";

export type IconName =
  | "arrow-left"
  | "check"
  | "chevron-right"
  | "close"
  | "copy"
  | "disconnect"
  | "grid"
  | "network"
  | "qr"
  | "search"
  | "wallet";

const paths: Record<IconName, string> = {
  "arrow-left": "m15 18-6-6 6-6",
  check: "m5 12 4 4L19 6",
  "chevron-right": "m9 18 6-6-6-6",
  close: "M18 6 6 18M6 6l12 12",
  copy: "M8 8h11v11H8zM5 16H4V5h11v1",
  disconnect: "M10 5V3h4v2m-2 0v7m5.66-4.66a8 8 0 1 1-11.32 0",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  network:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.2 2.46 3.33 5.46 3.4 9-.07 3.54-1.2 6.54-3.4 9m0-18C9.8 5.46 8.67 8.46 8.6 12c.07 3.54 1.2 6.54 3.4 9M3 12h18",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14v2h-2v4h3v-2h2v2h2v-4h-3v-2z",
  search: "m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",
  wallet:
    "M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v2h-5a3 3 0 0 0 0 6h5v2a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5Zm11 3.5h6v2h-6a1 1 0 0 1 0-2Z",
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
