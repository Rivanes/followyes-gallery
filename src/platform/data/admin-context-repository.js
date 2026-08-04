import { payload, requireClient } from "./base.js";
import { normalizeAdminContext } from "../permissions.js";

export class AdminContextRepository {
  constructor(client) {
    this.client = requireClient(client);
  }

  async getSession() {
    const response = await this.client.auth.getSession();
    if (response.error) throw response.error;
    return response.data && response.data.session || null;
  }

  async signIn(email, password) {
    const response = await this.client.auth.signInWithPassword({ email, password });
    if (response.error) throw response.error;
    return response.data.session;
  }

  async signOut() {
    const response = await this.client.auth.signOut();
    if (response.error) throw response.error;
    return true;
  }

  async getContext() {
    return normalizeAdminContext(payload(await this.client.rpc("get_admin_context")) || {});
  }

  onAuthStateChange(callback) {
    return this.client.auth.onAuthStateChange((_event, session) => callback(session));
  }
}
