import type { HttpRequest, HttpResponse, HttpTransport } from "../../src/http.ts";

type Fixture = {
  readonly body: unknown;
  readonly match: {
    readonly method: HttpRequest["method"];
    readonly urlIncludes: string;
  };
  readonly status?: number;
};

type FakeTransport = HttpTransport & {
  readonly requests: readonly HttpRequest[];
};

export function createFakeTransport(fixtures: readonly Fixture[]): FakeTransport {
  const requests: HttpRequest[] = [];
  const queue = [...fixtures];

  const transport: HttpTransport = async (request) => {
    requests.push(request);
    const fixtureIndex = queue.findIndex(
      (candidate) =>
        candidate.match.method === request.method &&
        request.url.includes(candidate.match.urlIncludes),
    );

    const fixture = fixtureIndex >= 0 ? queue.splice(fixtureIndex, 1)[0] : undefined;
    if (fixture === undefined) {
      return jsonResponse(
        {
          error: `Unexpected request: ${request.method} ${request.url}`,
          requests,
        },
        599,
      );
    }

    return jsonResponse(fixture.body, fixture.status ?? 200);
  };

  return Object.assign(transport, { requests });
}

function jsonResponse(body: unknown, status: number): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}
