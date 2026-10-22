import { assetPermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { access, failure, sameOrigin, requirePermission } from "@/lib/access";
import { assetSchema } from "@/lib/asset-input";
import { createAsset, inventoryInclude } from "@/lib/inventory";
export async function GET() {
  try {
    const m = await access(); requirePermission(m,"network.view"); const { organizationId } = m;
    return Response.json(
      await db.asset.findMany({
        where: { organizationId },
        include: inventoryInclude,
        orderBy: { createdAt: "desc" },
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const member = await access(true),
      data = assetSchema.parse(await request.json());
    requirePermission(member,assetPermission(data.kind,"create"));
    const asset = await db.$transaction((tx) => createAsset(tx, member, data), {
      timeout: 20000,
    });
    return Response.json(asset, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
