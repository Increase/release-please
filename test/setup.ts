import {afterAll, afterEach, beforeAll, vi} from 'vitest';
import nock from './http-mock';
import {server} from './msw';

beforeAll(() => server.listen({onUnhandledRequest: 'error'}));
afterEach(() => {
  nock.cleanAll();
  vi.restoreAllMocks();
});
afterAll(() => server.close());
type Matcher = {test: (value: unknown) => boolean};

function isMatcher(value: unknown): value is Matcher {
  return (
    typeof value === 'object' &&
    value !== null &&
    'test' in value &&
    typeof (value as Matcher).test === 'function'
  );
}

function matchesExpected(exp: unknown, act: unknown): boolean {
  if (
    exp &&
    typeof exp === 'object' &&
    'asymmetricMatch' in exp &&
    typeof (exp as {asymmetricMatch: (value: unknown) => boolean})
      .asymmetricMatch === 'function'
  ) {
    return (exp as {asymmetricMatch: (value: unknown) => boolean}).asymmetricMatch(
      act
    );
  }
  if (typeof exp === 'function') return exp(act);
  if (isMatcher(exp)) return exp.test(act);
  return exp === act;
}

function argsMatch(expected: unknown[], actual: unknown[]): boolean {
  if (expected.length === 0) return true;
  if (expected.length > actual.length) return false;
  return expected.every((exp, i) => matchesExpected(exp, actual[i]));
}

class StubChain {
  private cases: Array<{
    args: unknown[];
    kind: 'resolve' | 'reject' | 'return';
    value: unknown;
  }> = [];
  private pendingArgs: unknown[] = [];
  private fallbackReject: unknown;

  constructor(private readonly spy: ReturnType<typeof vi.spyOn>) {}

  withArgs(...args: unknown[]) {
    this.pendingArgs = args;
  }

  resolves(value: unknown) {
    this.cases.push({args: [...this.pendingArgs], kind: 'resolve', value});
    this.pendingArgs = [];
    this.apply();
  }

  rejects(error: unknown) {
    if (this.pendingArgs.length === 0) {
      this.fallbackReject = error;
    } else {
      this.cases.push({args: [...this.pendingArgs], kind: 'reject', value: error});
      this.pendingArgs = [];
    }
    this.apply();
  }

  returns(value: unknown) {
    this.cases.push({args: [...this.pendingArgs], kind: 'return', value});
    this.pendingArgs = [];
    this.apply();
  }

  setFallbackReject(error: unknown) {
    this.fallbackReject = error;
    this.apply();
  }

  private apply() {
    this.spy.mockImplementation((...callArgs: unknown[]) => {
      for (const c of this.cases) {
        if (argsMatch(c.args, callArgs)) {
          if (c.kind === 'resolve') return Promise.resolve(c.value);
          if (c.kind === 'reject') return Promise.reject(c.value);
          return c.value;
        }
      }
      if (this.fallbackReject !== undefined) {
        return Promise.reject(this.fallbackReject);
      }
      return Promise.reject(
        Object.assign(new Error('Unexpected call'), {args: callArgs})
      );
    });
  }
}

const originalSpyOn = vi.spyOn.bind(vi);
vi.spyOn = ((obj, method) => {
  const spy = originalSpyOn(obj, method);
  const chain = new StubChain(spy);
  const chained = Object.assign(spy, {
    get callCount() {
      return spy.mock.calls.length;
    },
    withArgs: (...args: unknown[]) => {
      chain.withArgs(...args);
      return chained;
    },
    resolves: (value: unknown) => {
      chain.resolves(value);
      return chained;
    },
    rejects: (error: unknown) => {
      chain.rejects(error);
      return chained;
    },
    returns: (value: unknown) => {
      chain.returns(value);
      return chained;
    },
    mockReturnValue: (value: unknown) => {
      chain.returns(value);
      return chained;
    },
    mockResolvedValue: (value: unknown) => {
      chain.resolves(value);
      return chained;
    },
    mockRejectedValue: (error: unknown) => {
      chain.rejects(error);
      return chained;
    },
    throws: (error: unknown) => {
      chain.rejects(error);
      return chained;
    },
  });
  return chained;
}) as typeof vi.spyOn;

