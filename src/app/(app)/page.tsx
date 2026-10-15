import { requireUser } from "@/features/auth/session";

export default async function HomePage() {
  // Same render as the layout, so React cache() makes this a free lookup.
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
      <p className="text-neutral-500">Workspaces and projects come next.</p>
    </div>
  );
}
