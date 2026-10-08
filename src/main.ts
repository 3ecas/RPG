/**
 * Entry point: the online client. Validates content, works out where the
 * zone server is, mounts the shell. The server address comes from `?server=`
 * in the URL, else the VITE_SERVER_URL build variable, else port 8080 on this
 * machine when the page runs locally. Served from anywhere else with no
 * address configured, the join card asks for one.
 */
import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import { OnlineApp } from '@/ui/shell';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');

const content = new Registry(CONTENT);
const problems = content.validate();
if (problems.length > 0) {
  root.innerHTML = `<pre class="fatal">Content errors:\n${problems.map((p) => `  - ${p}`).join('\n')}</pre>`;
  throw new Error(`Content validation failed:\n${problems.join('\n')}`);
}

const params = new URLSearchParams(location.search);
const configured = (import.meta.env.VITE_SERVER_URL as string | undefined) || null;
const local = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const serverUrl = params.get('server') ?? configured ?? (local ? 'ws://localhost:8080' : '');
new OnlineApp(root, content, { serverUrl }).mount();
