/**
 * Entry point. The single-player game by default; the online client when the
 * URL carries `?online` (optionally `&server=ws://host:port`). Both share the
 * content, the world model and the renderer.
 */
import { startOnline } from './online';
import { startSinglePlayer } from './single-player';

const params = new URLSearchParams(location.search);
if (params.has('online')) startOnline(params);
else startSinglePlayer();
