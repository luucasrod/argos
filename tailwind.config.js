/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#050810',
          secondary: '#080D1A',
          elevated: '#101828',
        },
        accent: {
          primary: '#4F6EF7',
          secondary: '#7B5CEA',
          cyan: '#00D4FF',
        },
        aria: {
          text: '#F0F4FF',
          muted: '#8A94B2',
          dim: '#4A5068',
        },
      },
      fontFamily: {
        display: ['SpaceGrotesk-Bold'],
        body: ['Inter-Regular'],
        mono: ['JetBrainsMono-Regular'],
      },
    },
  },
  plugins: [],
};
