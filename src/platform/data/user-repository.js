import { payload, rows, requireClient } from "./base.js";

export class UserRepository {
  constructor(client) {
    this.client = requireClient(client);
  }

  async list() {
    return rows(await this.client.rpc("admin_list_users"));
  }

  async setAccess(input) {
    return payload(await this.client.rpc("admin_set_user_access", {
      p_user_id: input.userId,
      p_active: input.active !== false,
      p_platform_role: input.platformRole || "viewer",
      p_venue_roles: input.venueRoles || [],
      p_exhibition_roles: input.exhibitionRoles || []
    }));
  }

  async invite(input) {
    const response = await this.client.functions.invoke("admin-users", {
      body: {
        action: "invite",
        email: input.email,
        displayName: input.displayName || "",
        platformRole: input.platformRole || "viewer",
        venueRoles: input.venueRoles || [],
        exhibitionRoles: input.exhibitionRoles || []
      }
    });
    if (response.error) throw response.error;
    return response.data;
  }
}
