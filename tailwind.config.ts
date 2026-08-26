import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./landing/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F3F4F6",
        card: "#FFFFFF",
        "card-hover": "#F9FAFB",
        border: "#E5E7EB",
        primary: { DEFAULT: "#23AE97", foreground: "#FFFFFF" },
        secondary: { DEFAULT: "#1C9583", foreground: "#FFFFFF" },
        accent: { DEFAULT: "#0E7490", foreground: "#FFFFFF" },
        muted: { DEFAULT: "#E5E7EB", foreground: "#6B7280" },
        paper: "#F3F4F6",
        ink: "#27272A",
        "ink-soft": "#575760",
        ultra: "#23AE97",
        "ultra-deep": "#1B8A76",
        apricot: "#FF9E5E",
        mint: "#17B890",
        line: "#E4E4E7",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Bricolage Grotesque", "sans-serif"],
        mono: ["Spline Sans Mono", "monospace"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
        card: "18px",
      },
      boxShadow: {
        glow: "0 2px 8px rgba(0, 0, 0, 0.08)",
        "glow-sm": "0 1px 3px rgba(0, 0, 0, 0.06)",
        soft: "0 1px 4px rgba(0, 0, 0, 0.06)",
        "landing-soft": "0 24px 60px -24px rgba(39, 39, 42, .18)",
      },
      spacing: {
        15: "3.75rem",
        21: "5.25rem",
      },
      keyframes: {
        eq: {
          "0%, 100%": { transform: "scaleY(.5)" },
          "50%": { transform: "scaleY(1)" },
        },
        pop: {
          to: { opacity: "1", transform: "none" },
        },
        blink: {
          "0%, 80%, 100%": { opacity: ".25" },
          "40%": { opacity: "1" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(36px)" },
          to: { opacity: "1", transform: "none" },
        },
        "rise-sm": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "none" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0) translateX(0)" },
          "33%": { transform: "translateY(-20px) translateX(12px)" },
          "66%": { transform: "translateY(10px) translateX(-14px)" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "0.9" },
        },
        "pulse-cursor": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      animation: {
        eq: "eq 1.1s ease-in-out infinite",
        pop: "pop .4s ease forwards",
        blink: "blink 1.2s infinite",
        rise: "rise 1.1s cubic-bezier(.16,1,.3,1) both",
        "rise-sm": "rise-sm .9s cubic-bezier(.16,1,.3,1) both",
        float: "float 9s ease-in-out infinite",
        "float-slow": "float 14s ease-in-out infinite",
        "gradient-x": "gradient-x 8s ease infinite",
        shimmer: "shimmer 1.6s infinite",
        "pulse-slow": "pulse-slow 6s ease-in-out infinite",
        "pulse-cursor": "pulse-cursor 0.9s step-end infinite",
      },
    },
  },
  plugins: [],
};
export default config;
