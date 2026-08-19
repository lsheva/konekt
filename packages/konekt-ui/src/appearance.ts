import type { CSSProperties } from "react";

export type WcTheme = "light" | "dark" | "system";

export type WcStyle = CSSProperties & {
  [property: `--kui-${string}`]: string | number | undefined;
};

export type WcAppearanceProps = {
  className?: string | undefined;
  style?: WcStyle | undefined;
  theme?: WcTheme | undefined;
  unstyled?: boolean | undefined;
};

export function uiClass(defaultClass: string, unstyled?: boolean, className?: string): string | undefined {
  const value = [unstyled ? undefined : defaultClass, className].filter(Boolean).join(" ");
  return value || undefined;
}

export function themeAttribute(theme?: WcTheme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}
