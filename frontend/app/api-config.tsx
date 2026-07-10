"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    VEKIN_API_BASE?: string;
  }
}

export function ApiConfig() {
  useEffect(() => {
    window.VEKIN_API_BASE =
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
  }, []);

  return null;
}
