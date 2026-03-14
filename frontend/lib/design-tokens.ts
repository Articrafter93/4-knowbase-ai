// KnowBase Design System Tokens
export const tokens = {
  colors: {
    bg: '#0B1020',
    surface: '#121A2B',
    surfaceHover: '#1A2540',
    border: '#24304A',
    borderLight: '#2E3D5C',
    text: '#EAF1FF',
    textMuted: '#8899BB',
    textSubtle: '#55698A',
    accent: '#5B8CFF',
    accentHover: '#7AA3FF',
    accentDim: 'rgba(91,140,255,0.15)',
    accent2: '#27D7A1',
    accent2Dim: 'rgba(39,215,161,0.15)',
    warn: '#FFB547',
    warnDim: 'rgba(255,181,71,0.15)',
    error: '#FF5D73',
    errorDim: 'rgba(255,93,115,0.15)',
    glass: 'rgba(18,26,43,0.7)',
    glassBorder: 'rgba(91,140,255,0.2)',
  },
  font: {
    sans: '"Inter", "Geist", system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", monospace',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '16px',
    xl: '24px',
  },
  shadow: {
    card: '0 4px 24px rgba(0,0,0,0.3)',
    glow: '0 0 20px rgba(91,140,255,0.2)',
    glowGreen: '0 0 20px rgba(39,215,161,0.2)',
  },
  transition: {
    fast: '150ms cubic-bezier(0.4,0,0.2,1)',
    medium: '200ms cubic-bezier(0.4,0,0.2,1)',
    spring: '300ms cubic-bezier(0.34,1.56,0.64,1)',
  },
} as const;

export type Tokens = typeof tokens;
