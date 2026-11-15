// Easing + spring presets used by the 21st.dev Animated Sidebar (starc007/animated-sidebar).
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;
export const SPRING_LAYOUT = { type: "spring", stiffness: 500, damping: 40, mass: 0.8 } as const;
export const SPRING_PRESS = { type: "spring", stiffness: 600, damping: 30 } as const;
