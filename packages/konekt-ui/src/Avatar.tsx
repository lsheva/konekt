import { avatarGradient } from "./address.ts";
import { uiClass, type WcAppearanceProps } from "./appearance.ts";

/** Props for {@link Avatar}. */
export type AvatarProps = Pick<WcAppearanceProps, "className" | "style" | "unstyled"> & {
  /** Account address the gradient is derived from. */
  address: string;
  /** Rendered width and height in CSS pixels. Defaults to 28. */
  size?: number | undefined;
};

/**
 * Address-derived gradient disc used by the account chip and account dialog.
 *
 * Decorative: pair it with a visible address. The disc is `aria-hidden`.
 */
export function Avatar({ address, size = 28, className, style, unstyled }: AvatarProps) {
  return (
    <span
      className={uiClass("kui-avatar", unstyled, className)}
      style={{ ...style, width: size, height: size, background: avatarGradient(address) }}
      data-kui-slot="avatar"
      aria-hidden="true"
    />
  );
}
