"use client";

import { forwardRef, type HTMLAttributes, type ElementType } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal polymorphic container used by the 21st.dev Animated Sidebar menu.
 * The active pill is animated by the menu button itself (layoutId), so this
 * container only renders the list element.
 */
export interface SharedLayoutBgProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  inset?: number;
  pillClassName?: string;
  pillContainerClassName?: string;
}

export const SharedLayoutBg = forwardRef<HTMLElement, SharedLayoutBgProps>(function SharedLayoutBg(
  { as: Comp = "div", inset: _inset, pillClassName: _pill, pillContainerClassName: _pillContainer, className, ...props },
  ref,
) {
  void _inset;
  void _pill;
  void _pillContainer;
  return <Comp ref={ref} className={cn(className)} {...props} />;
});
