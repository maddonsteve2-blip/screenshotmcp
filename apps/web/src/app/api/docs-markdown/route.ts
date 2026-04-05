import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const CONTENT_DIR = join(/*turbopackIgnore: true*/ process.cwd(), "content", "docs");

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const docPath = searchParams.get("path") || "/docs";

  // Convert URL path to relative file name: /docs/tools/take-screenshot -> tools/take-screenshot.mdx
  let fileName: string;
  if (docPath === "/docs" || docPath === "/docs/") {
    fileName = "index.mdx";
  } else {
    const relative = docPath.replace(/^\/docs\/?/, "");
    // Prevent directory traversal
    if (relative.includes("..")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    fileName = `${relative}.mdx`;
  }

  const fullPath = join(CONTENT_DIR, fileName);

  try {
    const raw = await readFile(fullPath, "utf-8");

    // Strip frontmatter
    const stripped = raw.replace(/^---[\s\S]*?---\n*/, "");

    // Extract title from frontmatter
    const titleMatch = raw.match(/^---[\s\S]*?title:\s*(.+?)[\r\n]/);
    const title = titleMatch ? titleMatch[1].trim() : "ScreenshotsMCP Docs";

    const markdown = `# ${title}\n\n${stripped.trim()}\n`;

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `inline; filename="${fileName.replace(/\.mdx$/, ".md").replace(/\//g, "-")}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
}
