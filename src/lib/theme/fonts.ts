import { DM_Sans, Lora, Montserrat, Nunito_Sans, Open_Sans, Roboto, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import type { ThemeFont } from "@/lib/theme/university-theme";

/**
 * The fonts a university theme can use, served from this site (next/font
 * downloads them at build time, so no request goes to Google). None is
 * preloaded: a browser only fetches the one a page actually uses.
 */
// next/font needs every option written out here, not passed in a variable.
const roboto = Roboto({ subsets: ["latin"], display: "swap", preload: false, fallback: ["ui-sans-serif", "system-ui", "sans-serif"] });
const openSans = Open_Sans({ subsets: ["latin"], display: "swap", preload: false, fallback: ["ui-sans-serif", "system-ui", "sans-serif"] });
const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "swap", preload: false, fallback: ["ui-sans-serif", "system-ui", "sans-serif"] });
const nunitoSans = Nunito_Sans({ subsets: ["latin"], display: "swap", preload: false, fallback: ["ui-sans-serif", "system-ui", "sans-serif"] });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap", preload: false, fallback: ["ui-sans-serif", "system-ui", "sans-serif"] });
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", preload: false, fallback: ["ui-sans-serif", "system-ui", "sans-serif"] });
const lora = Lora({ subsets: ["latin"], display: "swap", preload: false, fallback: ["ui-serif", "Georgia", "serif"] });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], display: "swap", preload: false, fallback: ["ui-serif", "Georgia", "serif"] });

const FAMILIES: Record<Exclude<ThemeFont, "default" | "custom">, string> = {
  roboto: roboto.style.fontFamily,
  "open-sans": openSans.style.fontFamily,
  "source-sans": sourceSans.style.fontFamily,
  "nunito-sans": nunitoSans.style.fontFamily,
  montserrat: montserrat.style.fontFamily,
  "dm-sans": dmSans.style.fontFamily,
  lora: lora.style.fontFamily,
  "source-serif": sourceSerif.style.fontFamily,
};

/** The CSS font-family for a theme's font; null for Requisor's own, and for an uploaded one (themeCss names it). */
export const themeFontFamily = (font: ThemeFont): string | null => (font === "default" || font === "custom" ? null : FAMILIES[font]);
