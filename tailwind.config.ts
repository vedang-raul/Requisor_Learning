import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
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
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        glow: "0 2px 8px rgba(0, 0, 0, 0.08)",
        "glow-sm": "0 1px 3px rgba(0, 0, 0, 0.06)",
        soft: "0 1px 4px rgba(0, 0, 0, 0.06)",
      },
      keyframes: {
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
