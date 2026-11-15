"use client";
// Source: 21st.dev — starc007/animated-sidebar (beui.dev/components/motion/animated-sidebar)
// Adapted for TrackMe: menu links use next/link for client-side navigation,
// panels use the "Bold Blocks" surfaces (paper, 2px ink rules, hard shadows),
// and unused sub-menu parts were trimmed.

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { type HTMLMotionProps, motion, useReducedMotion } from "motion/react";
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  createContext,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { SharedLayoutBg } from "@/components/ui/animated-sidebar-utils/shared-layout-bg";
import { EASE_DRAWER, EASE_OUT, SPRING_LAYOUT, SPRING_PRESS } from "@/components/ui/animated-sidebar-utils/ease";
import { cn } from "@/lib/utils";

const MotionLink = motion.create(Link);

type SidebarState = "expanded" | "collapsed";
type SidebarSide = "left" | "right";
type SidebarVariant = "sidebar" | "floating" | "inset";
type SidebarCollapsible = "offcanvas" | "icon" | "none";

const MOBILE_QUERY = "(max-width: 767px)";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

const PANEL_TRANSITION = { duration: 0.36, ease: EASE_DRAWER } as const;
const SIDEBAR_MORPH_TRANSITION = { type: "spring", stiffness: 380, damping: 35, mass: 0.75 } as const;
const LABEL_ENTER_TRANSITION = { duration: 0.2, delay: 0.08, ease: EASE_OUT } as const;
const LABEL_EXIT_TRANSITION = { duration: 0.12, ease: EASE_OUT } as const;
const REDUCED_TRANSITION = { duration: 0.16, ease: EASE_OUT } as const;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function subscribeToMobileQuery(callback: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const getMobileSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const getServerMobileSnapshot = () => false;

function useIsMobile() {
  return useSyncExternalStore(subscribeToMobileQuery, getMobileSnapshot, getServerMobileSnapshot);
}

interface AnimatedSidebarContextValue {
  isMobile: boolean;
  layoutId: string;
  open: boolean;
  openMobile: boolean;
  reduce: boolean;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  state: SidebarState;
  toggleSidebar: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  registerTrigger: (node: HTMLButtonElement | null) => void;
}

const AnimatedSidebarContext = createContext<AnimatedSidebarContextValue | null>(null);

interface AnimatedSidebarPanelContextValue {
  collapsed: boolean;
  collapsible: SidebarCollapsible;
  side: SidebarSide;
}

const AnimatedSidebarPanelContext = createContext<AnimatedSidebarPanelContextValue | null>(null);

export function useAnimatedSidebar() {
  const context = useContext(AnimatedSidebarContext);
  if (!context) throw new Error("useAnimatedSidebar must be used inside AnimatedSidebarProvider.");
  return context;
}

function useAnimatedSidebarPanel() {
  const context = useContext(AnimatedSidebarPanelContext);
  if (!context) throw new Error("Animated Sidebar parts must be used inside AnimatedSidebar.");
  return context;
}

type SidebarProviderStyle = CSSProperties & {
  "--sidebar-width"?: string;
  "--sidebar-width-icon"?: string;
  "--sidebar-width-mobile"?: string;
};

export interface AnimatedSidebarProviderProps extends HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  openMobile?: boolean;
  defaultOpenMobile?: boolean;
  onOpenMobileChange?: (open: boolean) => void;
  style?: SidebarProviderStyle;
}

export function AnimatedSidebarProvider({
  children,
  open,
  defaultOpen = true,
  onOpenChange,
  openMobile,
  defaultOpenMobile = false,
  onOpenMobileChange,
  className,
  style,
  ...props
}: AnimatedSidebarProviderProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [internalOpenMobile, setInternalOpenMobile] = useState(defaultOpenMobile);
  const isMobile = useIsMobile();
  const reduce = useReducedMotion() ?? false;
  const generatedId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const desktopOpen = open ?? internalOpen;
  const mobileOpen = openMobile ?? internalOpenMobile;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  const setOpenMobile = useCallback(
    (nextOpen: boolean) => {
      if (openMobile === undefined) setInternalOpenMobile(nextOpen);
      onOpenMobileChange?.(nextOpen);
    },
    [onOpenMobileChange, openMobile],
  );

  const registerTrigger = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isMobile) setOpenMobile(!mobileOpen);
    else setOpen(!desktopOpen);
  }, [desktopOpen, isMobile, mobileOpen, setOpen, setOpenMobile]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [toggleSidebar]);

  return (
    <AnimatedSidebarContext.Provider
      value={{
        isMobile,
        layoutId: `${generatedId}-active`,
        open: desktopOpen,
        openMobile: mobileOpen,
        reduce,
        setOpen,
        setOpenMobile,
        state: desktopOpen ? "expanded" : "collapsed",
        toggleSidebar,
        triggerRef,
        registerTrigger,
      }}
    >
      <div
        {...props}
        data-slot="sidebar-wrapper"
        data-state={desktopOpen ? "expanded" : "collapsed"}
        style={{ "--sidebar-width": "15.5rem", "--sidebar-width-icon": "4.25rem", "--sidebar-width-mobile": "18rem", ...style }}
        className={cn("group/sidebar-wrapper flex min-h-svh w-full min-w-0", className)}
      >
        {children}
      </div>
    </AnimatedSidebarContext.Provider>
  );
}

function MobileSidebar({ ariaLabel, children, className, side }: { ariaLabel: string; children: ReactNode; className?: string; side: SidebarSide }) {
  const context = useAnimatedSidebar();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(!context.openMobile);
  const openMobileRef = useRef(context.openMobile);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    openMobileRef.current = context.openMobile;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (context.openMobile) setHidden(false);
  }, [context.openMobile]);

  useEffect(() => {
    if (!context.openMobile) return;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = { left: body.style.left, overflow: body.style.overflow, position: body.style.position, right: body.style.right, top: body.style.top };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstFocusable ?? panelRef.current)?.focus({ preventScroll: true });
    });
    const trigger = context.triggerRef.current;
    return () => {
      cancelAnimationFrame(focusFrame);
      Object.assign(body.style, prev);
      window.scrollTo(0, scrollY);
      trigger?.focus({ preventScroll: true });
    };
  }, [context.openMobile, context.triggerRef]);

  if (!mounted) return null;

  return createPortal(
    <div className={cn("pointer-events-none fixed left-0 top-0 z-50 size-0 md:hidden", hidden && !context.openMobile ? "invisible" : "visible")}>
      <motion.button
        type="button"
        aria-label="Close sidebar"
        tabIndex={context.openMobile ? 0 : -1}
        initial={false}
        animate={{ opacity: context.openMobile ? 1 : 0 }}
        transition={context.reduce ? REDUCED_TRANSITION : PANEL_TRANSITION}
        onClick={() => context.setOpenMobile(false)}
        className={cn("fixed inset-0 bg-[#111111]/45", context.openMobile ? "pointer-events-auto" : "pointer-events-none")}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-hidden={!context.openMobile}
        inert={!context.openMobile}
        tabIndex={-1}
        data-mobile="true"
        data-state={context.openMobile ? "expanded" : "collapsed"}
        data-side={side}
        initial={false}
        animate={{
          opacity: context.reduce ? (context.openMobile ? 1 : 0) : 1,
          x: context.reduce ? 0 : context.openMobile ? "0%" : side === "left" ? "-100%" : "100%",
        }}
        transition={context.reduce ? REDUCED_TRANSITION : PANEL_TRANSITION}
        onAnimationComplete={() => {
          if (!openMobileRef.current) setHidden(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            context.setOpenMobile(false);
            return;
          }
          if (event.key !== "Tab") return;
          const focusable = panelRef.current ? Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
          if (focusable.length === 0) {
            event.preventDefault();
            panelRef.current?.focus();
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        className={cn(
          "pointer-events-auto fixed inset-y-0 flex h-dvh w-(--sidebar-width-mobile) max-w-[88vw] flex-col overflow-hidden",
          "border-ink bg-background text-foreground shadow-brutal-lg will-change-transform",
          side === "left" ? "left-0 border-r-2" : "right-0 border-l-2",
          !context.openMobile && "pointer-events-none",
          className,
        )}
      >
        <AnimatedSidebarPanelContext.Provider value={{ collapsed: false, collapsible: "none", side }}>{children}</AnimatedSidebarPanelContext.Provider>
      </motion.div>
    </div>,
    document.body,
  );
}

export interface AnimatedSidebarProps extends Omit<HTMLMotionProps<"aside">, "children"> {
  children?: ReactNode;
  side?: SidebarSide;
  variant?: SidebarVariant;
  collapsible?: SidebarCollapsible;
  ariaLabel?: string;
  panelClassName?: string;
}

export const AnimatedSidebar = forwardRef<HTMLElement, AnimatedSidebarProps>(function AnimatedSidebar(
  { side = "left", variant = "sidebar", collapsible = "icon", ariaLabel = "Sidebar", children, className, panelClassName, style, ...props },
  forwardedRef,
) {
  const context = useAnimatedSidebar();
  const collapsed = collapsible !== "none" && !context.open;
  const offcanvas = collapsed && collapsible === "offcanvas";
  const width = offcanvas ? "0px" : collapsed ? "var(--sidebar-width-icon)" : "var(--sidebar-width)";

  if (context.isMobile) {
    return (
      <MobileSidebar ariaLabel={ariaLabel} className={className} side={side}>
        {children}
      </MobileSidebar>
    );
  }

  return (
    <motion.aside
      {...props}
      ref={forwardedRef}
      initial={false}
      aria-label={ariaLabel}
      data-slot="sidebar"
      data-state={collapsed ? "collapsed" : "expanded"}
      data-collapsible={collapsible}
      data-variant={variant}
      data-side={side}
      animate={{ width }}
      transition={context.reduce ? { duration: 0 } : SIDEBAR_MORPH_TRANSITION}
      style={style}
      className={cn("group/sidebar peer relative hidden h-auto shrink-0 will-change-[width] md:block", side === "right" && "order-last", className)}
    >
      <motion.div
        initial={false}
        animate={{ opacity: offcanvas ? 0 : 1, x: offcanvas ? (side === "left" ? "-100%" : "100%") : "0%" }}
        transition={context.reduce ? REDUCED_TRANSITION : PANEL_TRANSITION}
        className={cn(
          "sticky top-0 flex h-svh w-full flex-col overflow-hidden bg-background text-foreground",
          collapsible === "offcanvas" && "w-[var(--sidebar-width)]",
          variant === "sidebar" && (side === "left" ? "border-r-2 border-ink" : "border-l-2 border-ink"),
          variant === "floating" && "m-2 h-[calc(100svh-1rem)] rounded-[10px] border-2 border-ink shadow-brutal",
          variant === "inset" && "m-2 h-[calc(100svh-1rem)] rounded-[10px]",
          panelClassName,
        )}
      >
        <AnimatedSidebarPanelContext.Provider value={{ collapsed, collapsible, side }}>{children}</AnimatedSidebarPanelContext.Provider>
      </motion.div>
    </motion.aside>
  );
});

export const AnimatedSidebarTrigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function AnimatedSidebarTrigger(
  { className, onClick, type = "button", ...props },
  forwardedRef,
) {
  const context = useAnimatedSidebar();
  const expanded = context.isMobile ? context.openMobile : context.open;
  return (
    <button
      {...props}
      ref={(node) => {
        context.registerTrigger(node);
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      type={type}
      aria-label={props["aria-label"] ?? "Toggle sidebar"}
      aria-expanded={expanded}
      data-slot="sidebar-trigger"
      data-state={expanded ? "expanded" : "collapsed"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.toggleSidebar();
      }}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] outline-none",
        "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground",
        className,
      )}
    />
  );
});

export const AnimatedSidebarClose = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function AnimatedSidebarClose(
  { className, onClick, type = "button", ...props },
  forwardedRef,
) {
  const context = useAnimatedSidebar();
  return (
    <button
      {...props}
      ref={forwardedRef}
      type={type}
      aria-label={props["aria-label"] ?? "Close sidebar"}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (context.isMobile) context.setOpenMobile(false);
        else context.setOpen(false);
      }}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground",
        className,
      )}
    />
  );
});

export const AnimatedSidebarRail = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function AnimatedSidebarRail(
  { className, onClick, type = "button", ...props },
  forwardedRef,
) {
  const context = useAnimatedSidebar();
  const panel = useAnimatedSidebarPanel();
  return (
    <button
      {...props}
      ref={forwardedRef}
      type={type}
      data-side={panel.side}
      aria-label={props["aria-label"] ?? "Toggle sidebar"}
      title="Toggle sidebar (Ctrl/⌘ + B)"
      tabIndex={-1}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.toggleSidebar();
      }}
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 outline-none md:block",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 after:bg-transparent after:transition-colors hover:after:bg-ink",
        "data-[side=right]:right-0 data-[side=right]:translate-x-1/2 data-[side=left]:left-full",
        className,
      )}
    />
  );
});

export const AnimatedSidebarInset = forwardRef<HTMLElement, HTMLMotionProps<"main">>(function AnimatedSidebarInset({ className, ...props }, forwardedRef) {
  return (
    <motion.main
      {...props}
      ref={forwardedRef}
      data-slot="sidebar-inset"
      className={cn("relative flex min-h-svh min-w-0 flex-1 flex-col bg-background", className)}
    />
  );
});

export const AnimatedSidebarHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarHeader({ className, ...props }, ref) {
  return <div {...props} ref={ref} data-slot="sidebar-header" className={cn("flex shrink-0 flex-col gap-2 p-3", className)} />;
});

export const AnimatedSidebarContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarContent({ className, ...props }, ref) {
  return (
    <div
      {...props}
      ref={ref}
      data-slot="sidebar-content"
      className={cn("scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-2", className)}
    />
  );
});

export const AnimatedSidebarFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarFooter({ className, ...props }, ref) {
  return (
    <div
      {...props}
      ref={ref}
      data-slot="sidebar-footer"
      className={cn("flex shrink-0 flex-col gap-2 border-t-2 border-ink p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", className)}
    />
  );
});

export const AnimatedSidebarGroup = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarGroup({ className, ...props }, ref) {
  return <div {...props} ref={ref} data-slot="sidebar-group" className={cn("flex w-full min-w-0 flex-col px-1 py-1.5", className)} />;
});

export const AnimatedSidebarGroupLabel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarGroupLabel({ children, className, ...props }, ref) {
  const { collapsed } = useAnimatedSidebarPanel();
  return (
    <div
      {...props}
      ref={ref}
      aria-hidden={collapsed}
      data-slot="sidebar-group-label"
      className={cn(
        "mb-1 flex h-6 items-center overflow-hidden px-2 font-sans text-[11px] leading-none font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase transition-opacity",
        collapsed ? "opacity-0" : "opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
});

export const AnimatedSidebarGroupContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AnimatedSidebarGroupContent({ className, ...props }, ref) {
  return <div {...props} ref={ref} data-slot="sidebar-group-content" className={cn("w-full min-w-0", className)} />;
});

export const AnimatedSidebarMenu = forwardRef<HTMLUListElement, HTMLAttributes<HTMLUListElement>>(function AnimatedSidebarMenu({ children, className, ...props }, ref) {
  return (
    <SharedLayoutBg {...props} ref={ref as React.Ref<HTMLElement>} as="ul" data-slot="sidebar-menu" className={cn("flex w-full min-w-0 list-none flex-col gap-1", className)}>
      {children}
    </SharedLayoutBg>
  );
});

export const AnimatedSidebarMenuItem = forwardRef<HTMLLIElement, HTMLMotionProps<"li">>(function AnimatedSidebarMenuItem({ className, ...props }, ref) {
  return <motion.li {...props} ref={ref} data-slot="sidebar-menu-item" className={cn("relative", className)} />;
});

export interface AnimatedSidebarMenuButtonProps {
  children: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  href?: string;
  isActive?: boolean;
  ariaExpanded?: boolean;
  disabled?: boolean;
  closeOnSelect?: boolean;
  onSelect?: () => void;
  className?: string;
}

export function AnimatedSidebarMenuButton({
  children,
  icon,
  badge,
  href,
  isActive = false,
  ariaExpanded,
  disabled = false,
  closeOnSelect,
  onSelect,
  className,
}: AnimatedSidebarMenuButtonProps) {
  const context = useAnimatedSidebar();
  const panel = useAnimatedSidebarPanel();
  const textLabel = typeof children === "string" ? children : undefined;

  const select = (event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onSelect?.();
    const shouldCloseOnSelect = closeOnSelect ?? ariaExpanded === undefined;
    if (context.isMobile && shouldCloseOnSelect) context.setOpenMobile(false);
    if (ariaExpanded !== undefined && panel.collapsed && !context.isMobile) context.setOpen(true);
  };

  const content = (
    <>
      {isActive ? (
        <motion.span
          layoutId={context.layoutId}
          transition={context.reduce ? { duration: 0 } : SPRING_LAYOUT}
          // Lime block with an ink rule and a 2px hard shadow. The link clips its overflow (so the
          // label can fold away when collapsed), so the block stops 2px short of the right and
          // bottom edges to leave room for its shadow.
          className="absolute top-0 left-0 right-[2px] bottom-[2px] rounded-[8px] border-2 border-ink bg-primary shadow-brutal-sm"
        />
      ) : null}
      {icon ? (
        <span aria-hidden="true" className="relative z-10 grid size-5 shrink-0 place-items-center">
          {icon}
        </span>
      ) : null}
      <motion.span
        initial={false}
        animate={{ opacity: panel.collapsed ? 0 : 1, x: panel.collapsed ? -4 : 0 }}
        transition={context.reduce ? REDUCED_TRANSITION : panel.collapsed ? LABEL_EXIT_TRANSITION : LABEL_ENTER_TRANSITION}
        aria-hidden={panel.collapsed}
        className={cn("relative z-10 min-w-0 flex-1 truncate", panel.collapsed && "pointer-events-none")}
      >
        {children}
      </motion.span>
      {badge && !panel.collapsed ? <span className="relative z-10 shrink-0 font-mono text-xs font-medium tabular-nums">{badge}</span> : null}
      {ariaExpanded !== undefined ? (
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={{ opacity: panel.collapsed ? 0 : 1, rotate: ariaExpanded ? 90 : 0, x: panel.collapsed ? 4 : 0 }}
          transition={context.reduce ? { duration: 0 } : SPRING_LAYOUT}
          className="relative z-10 grid size-4 shrink-0 place-items-center text-muted-foreground"
        >
          <ChevronRight className="size-3.5" />
        </motion.span>
      ) : null}
    </>
  );

  const interactiveClassName = cn(
    "relative flex h-10 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-[8px] px-3 text-left text-sm font-medium outline-none",
    "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground",
    isActive && "font-semibold text-[#111111] hover:bg-transparent hover:text-[#111111]",
    disabled && "cursor-not-allowed opacity-40",
    className,
  );

  return href ? (
    <MotionLink
      href={href}
      aria-current={isActive ? "page" : undefined}
      aria-disabled={disabled || undefined}
      aria-label={panel.collapsed ? textLabel : undefined}
      title={panel.collapsed ? textLabel : undefined}
      tabIndex={disabled ? -1 : undefined}
      onClick={select}
      whileTap={context.reduce || disabled ? undefined : { scale: 0.98 }}
      transition={SPRING_PRESS}
      className={interactiveClassName}
    >
      {content}
    </MotionLink>
  ) : (
    <motion.button
      type="button"
      disabled={disabled}
      aria-current={isActive ? "page" : undefined}
      aria-expanded={ariaExpanded}
      aria-label={panel.collapsed ? textLabel : undefined}
      title={panel.collapsed ? textLabel : undefined}
      onClick={select}
      whileTap={context.reduce || disabled ? undefined : { scale: 0.98 }}
      transition={SPRING_PRESS}
      className={interactiveClassName}
    >
      {content}
    </motion.button>
  );
}

export function useSidebarCollapsed() {
  return useAnimatedSidebarPanel().collapsed;
}
