/** @type {import('tailwindcss').Config} */
// 色は「役割の名前」で決める（中身は src/index.css でライト／ダークごとに切り替え）
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'), // 画面の背景（オーツ麦色／深煎り）
        surface: token('surface'), // カード
        sunken: token('sunken'), // 入力欄などの一段沈んだ面
        line: token('line'), // 枠線
        ink: token('ink'), // 本文の文字
        muted: token('muted'), // 補足の文字
        roast: token('roast'), // メインのボタン（エスプレッソ）
        'on-roast': token('on-roast'),
        caramel: token('caramel'), // 差し色
        'caramel-soft': token('caramel-soft'),
        sage: token('sage'), // 空いている・成功
        berry: token('berry'), // 混雑・削除
      },
      fontFamily: {
        serif: ['"Shippori Mincho B1"', '"Noto Serif JP"', 'serif'],
        sans: ['"Zen Kaku Gothic New"', '"Hiragino Sans"', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(var(--c-shadow) / 0.06), 0 4px 16px rgb(var(--c-shadow) / 0.06)',
        lift: '0 2px 4px rgb(var(--c-shadow) / 0.08), 0 12px 32px rgb(var(--c-shadow) / 0.12)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        steam: {
          '0%': { opacity: '0', transform: 'translateY(4px) scaleY(0.8)' },
          '50%': { opacity: '0.7' },
          '100%': { opacity: '0', transform: 'translateY(-8px) scaleY(1.1)' },
        },
      },
      animation: {
        rise: 'rise 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        steam: 'steam 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
