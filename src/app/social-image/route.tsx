import { ImageResponse } from "next/og";

export function GET() {
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "space-between", padding: "64px", background: "#f5f8f6", color: "#163c36",
      }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 700 }}>
          alma<span style={{ color: "#168f7b" }}>.</span>
          <span style={{ marginLeft: 18, fontSize: 22, fontWeight: 400 }}>by Requisor</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
            AI learning that speaks your language.
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 28, color: "#48635d" }}>
            Multilingual narration. Lesson transcript support. Tutor course tools.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 23, color: "#168f7b" }}>alma.requisor.io</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
