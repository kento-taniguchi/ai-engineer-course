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
          900: '#172554',
        },
        // アクセントカラー（10%）：ブライトオレンジ … ボタン・強調のみ
        accent: {
          DEFAULT: '#F97316',
          50: '#FFF7ED',
          600: '#EA580C',
        },
      },
    },
  },
  plugins: [],
};
