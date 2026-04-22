import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import RunsListClient from "@/app/dashboard/runs/runs-list-client";
import { PageContainer } from "@/components/page-container";

export default async function RunsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  // The list client pulls its own data via the paginated REST endpoint
  // (`GET /api/runs`) so it can search and load older pages without
  // refreshing the whole route on every interaction.
  return (
    <PageContainer width="data" className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Runs</h1>
        <p className="text-muted-foreground mt-1">
          Review each browser session in one place instead of jumping between captures and replays.
        </p>
      </div>

      <RunsListClient />
    </PageContainer>
  );
}
