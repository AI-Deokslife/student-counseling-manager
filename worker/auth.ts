import type { AuthenticatedUser, Env } from './types';
import { hasValidSession } from './session';

interface MembershipRow {
  email: string;
  display_name: string | null;
  role: AuthenticatedUser['role'];
  workspace_id: string;
  workspace_name: string;
}

export async function authenticate(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const accessEmail = request.headers.get('Cf-Access-Authenticated-User-Email')?.trim().toLowerCase();
  const email = accessEmail ?? (await hasValidSession(request, env) ? 'admin@maum.local' : null);
  if (!email) return null;

  const row = await env.DB.prepare(`
    SELECT
      users.access_email AS email,
      users.display_name,
      workspace_members.role,
      workspaces.id AS workspace_id,
      workspaces.name AS workspace_name
    FROM users
    INNER JOIN workspace_members ON workspace_members.user_id = users.id
    INNER JOIN workspaces ON workspaces.id = workspace_members.workspace_id
    WHERE users.access_email = ?
    LIMIT 1
  `).bind(email).first<MembershipRow>();

  if (!row) return null;

  return {
    email: row.email,
    name: row.display_name,
    role: row.role,
    workspace: { id: row.workspace_id, name: row.workspace_name }
  };
}
