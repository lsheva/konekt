import { type ReactNode, useEffect, useRef } from "react";
import { themeAttribute, uiClass, type WcAppearanceProps } from "./appearance.ts";

export type ModalProps = WcAppearanceProps & {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

const focusable =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, onClose, children, className, style, theme, unstyled }: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const frame = window.requestAnimationFrame(() => {
      dialog.current?.querySelector<HTMLElement>(focusable)?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>(focusable)];
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={uiClass("kui-root", unstyled, className)}
      style={style}
      data-kui="modal"
      data-theme={themeAttribute(theme)}
      data-state="open"
    >
      <button
        type="button"
        className={uiClass("kui-backdrop", unstyled)}
        data-kui-slot="backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={dialog}
        className={uiClass("kui-dialog", unstyled)}
        data-kui-slot="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {children}
      </div>
    </div>
  );
}
