/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 背景（60%）：オフホワイト
        canvas: '#F8FAFC',
        // メインカラー（30%）：ディープブルー … 見出し・枠線
        navy: {
          DEFAULT: '#1E3A8A',
          50: '#F0F4FB',
          100: '#DFE7F6',
          200: '#BCCBEA',
          300: '#8FA6D6',
          // 補足の文字用（白地で 4.5:1 以上）
          400: '#4A64A8',
          900: '#172554',
        },
        // アクセントカラー（10%）：ブライトオレンジ … ボタン・強調のみ
        accent: {
          DEFAULT: '#F97316',
          50: '#FFF7ED',
          400: '#FB923C',
          600: '#EA580C',
        },
      },
      keyframes: {
        'overlay-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'dialog-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'overlay-in': 'overlay-in 150ms ease-out',
        'dialog-in': 'dialog-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
