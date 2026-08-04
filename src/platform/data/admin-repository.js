import { payload, rows, requireClient } from "./base.js";

export class AdminRepository {
  constructor(client) {
    this.client = requireClient(client);
  }

  async dashboard() {
    return payload(await this.client.rpc("admin_dashboard_summary"));
  }

  async archive() {
    return rows(await this.client.rpc("admin_list_archive"));
  }

  async audit(filters = {}) {
    return rows(await this.client.rpc("admin_list_audit", {
      p_entity_type: filters.entityType || null,
      p_entity_id: filters.entityId || null,
      p_limit: filters.limit || 100
    }));
  }

  async jobs() {
    return rows(await this.client.rpc("admin_list_jobs"));
  }

  async restore(entityType, entityId) {
    return payload(await this.client.rpc("admin_restore_archived_item", {
      p_entity_type: entityType,
      p_entity_id: entityId
    }));
  }

  async requestPermanentDelete(entityType, entityId) {
    return payload(await this.client.rpc("admin_request_permanent_delete", {
      p_entity_type: entityType,
      p_entity_id: entityId
    }));
  }

  async runJob(jobId) {
    const response = await this.client.functions.invoke("cms-jobs", { body: { jobId } });
    if (response.error) throw response.error;
    if (response.data?.error) throw new Error(response.data.error);
    return response.data;
  }
}
