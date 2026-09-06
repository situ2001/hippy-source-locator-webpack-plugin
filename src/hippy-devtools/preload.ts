import { installDebugServerMiddleware } from './debug-server-adapter';

export function activateDebugServerPreload(
  entry: string = process.argv[1] || '',
  projectRoot: string = process.cwd(),
): void {
  const isDebugServer = /(?:^|[/\\])(?:hippy-debug|debug-server|index-debug\.js)$/.test(entry);
  if (isDebugServer) installDebugServerMiddleware(projectRoot, { forceLoad: true });
}
