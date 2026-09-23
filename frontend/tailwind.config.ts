import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'y2k-black': '#0a0a0f',
        'y2k-dark': '#12121a',
        'y2k-card': '#1a1a2e',
        'y2k-border': '#2a2a4a',
        'y2k-cyan': '#00f0ff',
        'y2k-magenta': '#ff00ff',
        'y2k-pink': '#ff66cc',
        'y2k-purple': '#9d4edd',
        'y2k-green': '#00ff88',
        'y2k-yellow': '#ffee00',
        'y2k-orange': '#ff6600',
        'y2k-red': '#ff0044',
        'y2k-blue': '#0066ff',
      },
      fontFamily: {
        'y2k-pixel': ['"Press Start 2P"', 'cursive'],
        'y2k-mono': ['"JetBrains Mono"', 'monospace'],
        'y2k-sans': ['"Inter"', 'sans-serif'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'scanline': 'scanline 8s linear infinite',
        'glitch': 'glitch 0.3s ease-in-out',
        'float': 'float 6s ease-in-out infinite',
        'chromatic': 'chromatic 0.5s ease-in-out',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px #00f0ff, 0 0 10px #00f0ff' },
          '50%': { boxShadow: '0 0 20px #00f0ff, 0 0 40px #00f0ff' },
        },
        'scanline': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'glitch': {
          '0%, 100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px, 2px)' },
          '40%': { transform: 'translate(-2px, -2px)' },
          '60%': { transform: 'translate(2px, 2px)' },
          '80%': { transform: 'translate(2px, -2px)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'chromatic': {
          '0%, 100%': { textShadow: '-2px 0 #ff00ff, 2px 0 #00f0ff' },
          '50%': { textShadow: '2px 0 #ff00ff, -2px 0 #00f0ff' },
        },
      },
      backgroundImage: {
        'y2k-grid': 'linear-gradient(rgba(0, 240, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.03) 1px, transparent 1px)',
        'y2k-gradient': 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0a0a0f 100%)',
      },
    },
  },
  plugins: [],
}

export default config
