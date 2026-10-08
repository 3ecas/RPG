/**
 * Bootstrap for the online client: validate content, work out where the zone
 * server is, mount the shell. The server address comes from `?server=`, else
 * the VITE_SERVER_URL build variable, else port 8080 on this host.
 */
import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import { OnlineApp } from '@/ui/online/shell';

export function startOnline(params: URLSearchParams): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app element');
  const content = new Registry(CONTENT);
  const problems = content.validate();
  if (problems.length > 0) {
    root.innerHTML = `<pre class="fatal">Content errors:\n${problems.map((p) => `  - ${p}`).join('\n')}</pre>`;
    throw new Error(`Content validation failed:\n${problems.join('\n')}`);
  }
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  const serverUrl = params.get('server') ?? configured ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8080`;
  new OnlineApp(root, content, { serverUrl }).mount();
}
