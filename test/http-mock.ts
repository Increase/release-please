/**
 * MSW-backed nock-compatible HTTP mock for Vitest.
 * Octokit uses fetch; nock only patches Node http/https.
 */
import {http, HttpResponse, type HttpHandler} from 'msw';
import {server} from './msw';

type HttpMethod =
  | 'get'
  | 'post'
  | 'put'
  | 'patch'
  | 'delete'
  | 'head';

type Reply = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

type RouteEntry = {
  interceptor: Interceptor;
  reply: Reply;
};

type RouteState = {
  entries: RouteEntry[];
  position: number;
};

const routes = new Map<string, RouteState>();

function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function routeKey(method: HttpMethod, url: string): string {
  return `${method}:${url}`;
}

function urlsMatch(expected: string, actual: string): boolean {
  const e = new URL(expected);
  const a = new URL(actual);
  if (`${e.origin}${e.pathname}` !== `${a.origin}${a.pathname}`) {
    return false;
  }
  if (e.search === '') {
    return true;
  }
  for (const [key, value] of e.searchParams) {
    if (a.searchParams.get(key) !== value) {
      return false;
    }
  }
  return true;
}

function ensureHandler(method: HttpMethod, url: string, state: RouteState): void {
  const handler: HttpHandler = http[method](
    ({request}) => urlsMatch(url, request.url),
    async ({request}) => {
    const entry = state.entries[Math.min(state.position++, state.entries.length - 1)];
    if (entry.interceptor.bodyMatcher) {
      const body = await request.clone().json();
      if (!entry.interceptor.bodyMatcher(body)) {
        return new HttpResponse(null, {status: 404});
      }
    }
    entry.interceptor.recordHit();
    const {reply} = entry;
    const headers = new Headers();
    if (reply.headers) {
      for (const [key, value] of Object.entries(reply.headers)) {
        headers.set(key, value);
      }
    }
    const init: ResponseInit = {status: reply.status, headers};
    if (reply.body === undefined) {
      return new HttpResponse(null, init);
    }
    if (typeof reply.body === 'string') {
      return new HttpResponse(reply.body, init);
    }
    return HttpResponse.json(reply.body, init);
    }
  );
  server.use(handler);
}

class Interceptor {
  private optional = false;
  private repeatCount = 1;
  hitCount = 0;

  constructor(
    private readonly scope: Scope,
    private readonly method: HttpMethod,
    private readonly baseUrl: string,
    private readonly path: string
  ) {
    scope.track(this);
  }

  setBodyMatcher(matcher: (body: unknown) => boolean): void {
    this.bodyMatcher = matcher;
  }

  recordHit(): void {
    this.hitCount++;
  }

  optionally(): this {
    this.optional = true;
    return this;
  }

  persist(): this {
    return this;
  }

  query(_query: Record<string, string>): this {
    return this;
  }

  times(count: number): this {
    this.repeatCount = count;
    return this;
  }

  reply(
    status: number,
    body?: unknown,
    headers?: Record<string, string>
  ): Scope {
    const url = joinUrl(this.baseUrl, this.path);
    const key = routeKey(this.method, url);
    let state = routes.get(key);
    if (!state) {
      state = {entries: [], position: 0};
      routes.set(key, state);
      ensureHandler(this.method, url, state);
    }
    for (let i = 0; i < this.repeatCount; i++) {
      state.entries.push({
        interceptor: this,
        reply: {status, body, headers},
      });
    }
    this.repeatCount = 1;
    return this.scope;
  }

  get(path: string): Interceptor {
    return this.scope.request('get', path);
  }

  post(path: string, bodyMatcher?: (body: unknown) => boolean): Interceptor {
    const interceptor = this.scope.request('post', path);
    if (bodyMatcher) {
      interceptor.setBodyMatcher(bodyMatcher);
    }
    return interceptor;
  }

  put(path: string, bodyMatcher?: unknown): Interceptor {
    const interceptor = this.scope.request('put', path);
    if (typeof bodyMatcher === 'function') {
      interceptor.setBodyMatcher(bodyMatcher as (body: unknown) => boolean);
    } else if (bodyMatcher !== undefined) {
      interceptor.setBodyMatcher(
        (actual: unknown) =>
          JSON.stringify(actual) === JSON.stringify(bodyMatcher)
      );
    }
    return interceptor;
  }

  patch(path: string, bodyMatcher?: (body: unknown) => boolean): Interceptor {
    const interceptor = this.scope.request('patch', path);
    if (bodyMatcher) {
      interceptor.setBodyMatcher(bodyMatcher);
    }
    return interceptor;
  }

  delete(path: string): Interceptor {
    return this.scope.request('delete', path);
  }

  isSatisfied(): boolean {
    if (this.optional) return true;
    return this.hitCount > 0;
  }
}

export class Scope {
  private readonly interceptors: Interceptor[] = [];

  constructor(private readonly baseUrl: string) {}

  track(interceptor: Interceptor): void {
    this.interceptors.push(interceptor);
  }

  request(method: HttpMethod, path: string): Interceptor {
    return new Interceptor(this, method, this.baseUrl, path);
  }

  get(path: string, bodyMatcher?: (body: unknown) => boolean): Interceptor {
    const interceptor = this.request('get', path);
    if (bodyMatcher) {
      interceptor.setBodyMatcher(bodyMatcher);
    }
    return interceptor;
  }

  post(path: string, bodyMatcher?: (body: unknown) => boolean): Interceptor {
    const interceptor = this.request('post', path);
    if (bodyMatcher) {
      interceptor.setBodyMatcher(bodyMatcher);
    }
    return interceptor;
  }

  put(path: string, bodyMatcher?: unknown): Interceptor {
    const interceptor = this.request('put', path);
    if (typeof bodyMatcher === 'function') {
      interceptor.setBodyMatcher(bodyMatcher as (body: unknown) => boolean);
    } else if (bodyMatcher !== undefined) {
      interceptor.setBodyMatcher(
        (actual: unknown) =>
          JSON.stringify(actual) === JSON.stringify(bodyMatcher)
      );
    }
    return interceptor;
  }

  patch(path: string, bodyMatcher?: (body: unknown) => boolean): Interceptor {
    const interceptor = this.request('patch', path);
    if (bodyMatcher) {
      interceptor.setBodyMatcher(bodyMatcher);
    }
    return interceptor;
  }

  delete(path: string): Interceptor {
    return this.request('delete', path);
  }

  done(): void {
    const pending = this.interceptors.filter(i => !i.isSatisfied());
    if (pending.length > 0) {
      throw new Error(
        `Mocks not satisfied: ${pending.length} pending interceptor(s)`
      );
    }
  }
}

function nock(baseUrl: string): Scope {
  return new Scope(baseUrl);
}

nock.disableNetConnect = () => {
  // MSW blocks unhandled requests when onUnhandledRequest is 'error'.
};

nock.enableNetConnect = () => {
  // no-op
};

nock.cleanAll = () => {
  routes.clear();
  server.resetHandlers();
};

export default nock;
