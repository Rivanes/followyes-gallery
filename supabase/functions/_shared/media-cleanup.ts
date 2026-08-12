export type CleanupResult = {
  claimed: number;
  completed: number;
  failed: number;
  items: Array<{ id: string; ok: boolean; paths: number; error?: string }>;
};

export async function processCanonicalMediaCleanup(admin: any, limit = 25): Promise<CleanupResult> {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const { data: claimed, error: claimError } = await admin.rpc("media_claim_cleanup_batch", { p_limit: safeLimit });
  if (claimError) throw claimError;
  const result: CleanupResult = { claimed: (claimed || []).length, completed: 0, failed: 0, items: [] };
  for (const item of claimed || []) {
    const paths = [...new Set((item.storage_paths || []).filter(Boolean))];
    try {
      if (paths.length) {
        const removed = await admin.storage.from(item.storage_bucket).remove(paths);
        if (removed.error) throw removed.error;
      }
      const { error: confirmError } = await admin.rpc("media_confirm_cleanup", {
        p_cleanup_id: item.id,
        p_ok: true,
        p_error: null
      });
      if (confirmError) throw confirmError;
      result.completed += 1;
      result.items.push({ id: item.id, ok: true, paths: paths.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await admin.rpc("media_confirm_cleanup", {
        p_cleanup_id: item.id,
        p_ok: false,
        p_error: message
      }).catch(() => null);
      result.failed += 1;
      result.items.push({ id: item.id, ok: false, paths: paths.length, error: message });
    }
  }
  return result;
}
