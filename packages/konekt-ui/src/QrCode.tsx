import { useEffect, useState } from "react";
import { uiClass, type WcAppearanceProps } from "./appearance.ts";

type Matrix = readonly (readonly boolean[])[];

export type QrCodeProps = Pick<WcAppearanceProps, "className" | "style" | "unstyled"> & {
  value: string;
  size?: number | undefined;
};

async function encodeMatrix(value: string): Promise<Matrix> {
  const { encode } = await import("uqr");
  return encode(value, { border: 2 }).data;
}

function toPath(matrix: Matrix): string {
  let d = "";
  for (let y = 0; y < matrix.length; y++) {
    const row = matrix[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) if (row[x]) d += `M${x},${y}h1v1h-1z`;
  }
  return d;
}

export function QrCode({ value, size = 232, className, style, unstyled }: QrCodeProps) {
  const [matrix, setMatrix] = useState<Matrix>();

  useEffect(() => {
    let active = true;
    void encodeMatrix(value).then((data) => {
      if (active) setMatrix(data);
    });
    return () => {
      active = false;
    };
  }, [value]);

  if (!matrix) {
    return (
      <div
        className={uiClass("kui-qr-ph", unstyled, className)}
        style={{ ...style, width: size, height: size }}
        data-kui-slot="qr-placeholder"
      />
    );
  }

  const modules = matrix.length;

  return (
    <svg
      className={uiClass("kui-qr", unstyled, className)}
      style={style}
      data-kui-slot="qr-code"
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Pairing QR code"
    >
      <path d={toPath(matrix)} fill="currentColor" />
    </svg>
  );
}
