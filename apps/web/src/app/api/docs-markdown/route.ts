import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const docPath = searchParams.get("path") || "/docs";

  // Convert URL path to file path: /docs/tools/take-screenshot -> content/docs/tools/take-screenshot.mdx
  let filePath: string;
  if (docPath === "/docs" || docPath === "/docs/") {
    filePath = "content/docs/index.mdx";
  } else {
    const relative = docPath.replace(/^\/docs\/?/, "");
    filePath = `content/docs/${relative}.mdx`;
  }

  const fullPath = join(process.cwd(), filePath);

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
        "Content-Disposition": `inline; filename="${filePath.split("/").pop()?.replace(".mdx", ".md") || "doc.md"}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
}
