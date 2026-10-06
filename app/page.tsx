import type { Metadata } from "next";
import LandingApp from "@/landing/App.jsx";

export const metadata: Metadata = {
  title: "Alma by Requisor — The AI-Native University",
  description: "A university built around one student: you. An AI tutor that knows your industry, your background and how you learn, with mastery you can prove.",
};

export default function Home() {
  return <LandingApp />;
}
