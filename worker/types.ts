export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
}

export interface D1DatabaseBinding {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  DB: D1DatabaseBinding;
  ASSETS: AssetFetcher;
  APP_ENV: 'local' | 'preview' | 'production';
  APP_VERSION: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
}

export type AppRole = 'owner' | 'admin' | 'teacher' | 'readonly';

export interface AuthenticatedUser {
  email: string;
  name: string | null;
  role: AppRole;
  workspace: {
    id: string;
    name: string;
  };
}
