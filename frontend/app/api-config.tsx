declare global {
  interface Window {
    VEKIN_API_BASE?: string;
  }
}

export function ApiConfig() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.VEKIN_API_BASE=${JSON.stringify(apiBase)};`,
      }}
    />
  );
}
