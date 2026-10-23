import { access, failure, sameOrigin, requirePermission } from "@/lib/access";
import { db } from "@/lib/db";
import { readDiagram, saveDiagram, diagramSchema } from "@/lib/diagram-server";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const member = await access();
    requirePermission(member, "network.view");
    const { id } = await context.params;
    return Response.json(
      await db.$transaction((tx) => readDiagram(tx, member, id), {
        isolationLevel: "RepeatableRead",
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const member = await access(true),
      { id } = await context.params;
    return Response.json(
      await saveDiagram(member, id, diagramSchema.parse(await request.json())),
    );
  } catch (e) {
    return failure(e);
  }
}
