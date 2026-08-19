import type { CSSProperties } from "react";

/** Color scheme used by konekt-ui components. `"system"` follows the user's OS preference. */
export type WcTheme = "light" | "dark" | "system";

/** React inline styles plus konekt-ui custom properties such as `--kui-accent`. */
export type WcStyle = CSSProperties & {
  [property: `--kui-${string}`]: string | number | undefined;
};

/** Appearance options shared by konekt-ui components. */
export type WcAppearanceProps = {
  /** Additional class applied to the component root. */
  className?: string | undefined;
  /** Inline styles and `--kui-*` design-token overrides applied to the component root. */
  style?: WcStyle | undefined;
  /** Color scheme. Defaults to `"system"`. */
  theme?: WcTheme | undefined;
  /** Removes the default `kui-*` classes while preserving semantic `data-kui-*` attributes. */
  unstyled?: boolean | undefined;
};

export function uiClass(defaultClass: string, unstyled?: boolean, className?: string): string | undefined {
  const value = [unstyled ? undefined : defaultClass, className].filter(Boolean).join(" ");
  return value || undefined;
}

export function themeAttribute(theme?: WcTheme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}
