import { payload, requireClient } from "./base.js";

export class SiteRepository {
  constructor(client) {
    this.client = requireClient(client);
  }

  async getPublic() {
    return payload(await this.client.rpc("get_public_site_content"));
  }

  async getEditor(key = "homepage") {
    return payload(await this.client.rpc("admin_get_site_content", { p_key: key }));
  }

  async saveDraft(key, value, expectedRevision = null, expectedLockVersion = null) {
    return payload(await this.client.rpc("admin_save_site_draft", {
      p_key: key,
      p_value: value,
      p_expected_revision: expectedRevision,
      p_expected_lock_version: expectedLockVersion
    }));
  }

  async publish(key, expectedRevision = null, expectedLockVersion = null) {
    return payload(await this.client.rpc("admin_publish_site_content", {
      p_key: key,
      p_expected_revision: expectedRevision,
      p_expected_lock_version: expectedLockVersion
    }));
  }

  async rollback(key) {
    return payload(await this.client.rpc("admin_rollback_site_content", { p_key: key }));
  }
}
