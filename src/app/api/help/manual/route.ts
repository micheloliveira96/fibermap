import { readFile } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { failure, ApiError } from "@/lib/access";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) throw new ApiError(401, "Entre para consultar o manual.");
    const pdf = await readFile(
      path.join(process.cwd(), "resources", "Manual_FiberMap.pdf"),
    );
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="Manual_FiberMap.pdf"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
