import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from "vitest";

vi.mock("server-only", () => ({}));

const { requestCompletion } = await import("../lib/groq");

const messages = [{ role: "user", content: "Root prompt" }];
const options = { model: "test-model", timeoutMs: 1000 };

function answer(status, body) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  }));
}

describe("requestCompletion", () => {
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("sends a JSON mode request and returns the content", async () => {
    const fetch = answer(200, {
      choices: [{ message: { content: '{"ideas": []}' } }]
    });
    vi.stubGlobal("fetch", fetch);

    const text = await requestCompletion(messages, options);

    expect(text).toBe('{"ideas": []}');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      "https://api.groq.com/openai/v1/chat/completions"
    );
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toEqual({
      model: "test-model",
      messages,
      response_format: { type: "json_object" }
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("throws when Groq answers with an error status", async () => {
    vi.stubGlobal("fetch", answer(500, {}));
    await expect(
      requestCompletion(messages, options)
    ).rejects.toThrow("Groq answered 500");
  });

  test("throws without calling Groq when the key is missing", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const fetch = answer(200, {});
    vi.stubGlobal("fetch", fetch);

    await expect(
      requestCompletion(messages, options)
    ).rejects.toThrow("GROQ_API_KEY is not set");
    expect(fetch).not.toHaveBeenCalled();
  });
});
