export async function api<T = Record<string, unknown>>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Please try again.");
  return json as T;
}
