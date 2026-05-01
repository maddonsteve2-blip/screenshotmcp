import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "DeepSyte – AI-Powered Website Auditing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, system-ui, sans-serif",
          padding: "60px",
        }}
      >
        {/* Eye icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          <svg
            width="56"
            height="56"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#22c55e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span
            style={{
              color: "#ffffff",
              fontSize: "48px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            DeepSyte
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            color: "#e2e8f0",
            fontSize: "32px",
            fontWeight: 500,
            marginBottom: "24px",
            textAlign: "center",
          }}
        >
          See what your website is really doing.
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {[
            "Screenshots",
            "Browser Automation",
            "SEO Audit",
            "Performance",
            "Accessibility",
            "Visual Diff",
          ].map((label) => (
            <div
              key={label}
              style={{
                background: "rgba(34, 197, 94, 0.15)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "9999px",
                padding: "8px 20px",
                color: "#86efac",
                fontSize: "18px",
                fontWeight: 500,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Bottom badge */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            color: "#64748b",
            fontSize: "18px",
          }}
        >
          46+ AI-Powered Tools · Free Forever · MCP Server + CLI + REST API
        </div>
      </div>
    ),
    { ...size }
  );
}
