import type { IncomingMessage, ServerResponse } from "node:http";

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => void | Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

function pathToPattern(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const patternSource = path.replace(/:([^/]+)/g, (_, name: string) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return { pattern: new RegExp(`^${patternSource}$`), paramNames };
}

export function createRouter() {
  const routes: Route[] = [];

  function add(method: string, path: string, handler: RouteHandler) {
    const { pattern, paramNames } = pathToPattern(path);
    routes.push({ method, pattern, paramNames, handler });
  }

  return {
    get(path: string, handler: RouteHandler) {
      add("GET", path, handler);
    },
    post(path: string, handler: RouteHandler) {
      add("POST", path, handler);
    },
    patch(path: string, handler: RouteHandler) {
      add("PATCH", path, handler);
    },
    delete(path: string, handler: RouteHandler) {
      add("DELETE", path, handler);
    },
    async handle(req: IncomingMessage, res: ServerResponse, pathname: string) {
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const match = pathname.match(route.pattern);
        if (!match) continue;

        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });
        await route.handler(req, res, params);
        return true;
      }
      return false;
    },
  };
}
