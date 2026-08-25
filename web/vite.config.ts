import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, type PluginOption } from 'vite';
import hostingConfig from './.openai/hosting.json' with { type: 'json' };

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/app-router-entry',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // The Sites and Cloudflare plugins are only needed for a hosted production
  // build. Loading them during local RSC development adds startup work and
  // starts a local workerd/inspector path that the app does not use.
  const plugins: PluginOption[] = [vinext()];
  if (command === 'build') {
    const [{ sites }, { cloudflare }] = await Promise.all([
      import('@openai/sites-vite-plugin'),
      import('@cloudflare/vite-plugin'),
    ]);
    // Wrangler snapshots its log path while the Cloudflare plugin is imported.
    plugins.push(
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    );
  }

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    // The complete catalog is embedded only by the offline build; the hosted
    // page loads it after the lightweight application shell is available.
    build: { chunkSizeWarningLimit: 10_000 },
    // Windows resolves `localhost` to ::1 first. Binding the IPv6 loopback
    // keeps the browser/PowerShell request on the first address instead of
    // waiting for a fallback to an IPv4-only listener. `::1` is loopback-only
    // and does not expose the local development server to the LAN.
    server: {
      host: '::1',
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins,
  };
});
