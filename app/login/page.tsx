"use client";

import { Suspense } from "react";
import { LoginScreen } from "@/components/login-screen";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}