import { describe, it, expect } from "vitest";
import {
  getLlmProvider,
  getGlmConfig,
  getOpenRouterConfig,
  normalizeOpenRouterUrl,
} from "./config";

describe("getLlmProvider", () => {
  const original = process.env.LLM_PROVIDER;

  afterEach(() => {
    if (original != null) {
      process.env.LLM_PROVIDER = original;
    } else {
      delete process.env.LLM_PROVIDER;
    }
  });

  it("defaults to glm when no env is set", () => {
    delete process.env.LLM_PROVIDER;
    expect(getLlmProvider()).toBe("glm");
  });

  it('returns openrouter for "openrouter"', () => {
    process.env.LLM_PROVIDER = "openrouter";
    expect(getLlmProvider()).toBe("openrouter");
  });

  it('returns openrouter for "open-router"', () => {
    process.env.LLM_PROVIDER = "open-router";
    expect(getLlmProvider()).toBe("openrouter");
  });

  it('returns openrouter for "or"', () => {
    process.env.LLM_PROVIDER = "or";
    expect(getLlmProvider()).toBe("openrouter");
  });

  it("is case-insensitive", () => {
    process.env.LLM_PROVIDER = "OpenRouter";
    expect(getLlmProvider()).toBe("openrouter");
  });

  it("falls back to glm for unknown values", () => {
    process.env.LLM_PROVIDER = "unknown";
    expect(getLlmProvider()).toBe("glm");
  });
});

describe("getGlmConfig", () => {
  const originalKey = process.env.GLM_API_KEY;
  const originalKey2 = process.env.ZHIPUAI_API_KEY;

  afterEach(() => {
    if (originalKey != null) process.env.GLM_API_KEY = originalKey;
    else delete process.env.GLM_API_KEY;
    if (originalKey2 != null) process.env.ZHIPUAI_API_KEY = originalKey2;
    else delete process.env.ZHIPUAI_API_KEY;
  });

  it("throws when no API key is set", () => {
    delete process.env.GLM_API_KEY;
    delete process.env.ZHIPUAI_API_KEY;
    expect(() => getGlmConfig()).toThrow("Missing GLM API key");
  });

  it("uses GLM_API_KEY when set", () => {
    process.env.GLM_API_KEY = "test-key";
    delete process.env.ZHIPUAI_API_KEY;
    const config = getGlmConfig();
    expect(config.apiKey).toBe("test-key");
  });

  it("falls back to ZHIPUAI_API_KEY", () => {
    delete process.env.GLM_API_KEY;
    process.env.ZHIPUAI_API_KEY = "zhipu-key";
    const config = getGlmConfig();
    expect(config.apiKey).toBe("zhipu-key");
  });

  it("returns default model glm-4.7", () => {
    process.env.GLM_API_KEY = "k";
    const config = getGlmConfig();
    expect(config.model).toBe("glm-4.7");
  });
});

describe("getOpenRouterConfig", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    if (originalKey != null) process.env.OPENROUTER_API_KEY = originalKey;
    else delete process.env.OPENROUTER_API_KEY;
  });

  it("throws when no API key is set", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => getOpenRouterConfig()).toThrow("Missing OPENROUTER_API_KEY");
  });

  it("returns config with API key and default URL", () => {
    process.env.OPENROUTER_API_KEY = "or-key";
    const config = getOpenRouterConfig();
    expect(config.apiKey).toBe("or-key");
    expect(config.baseUrl).toContain("openrouter.ai");
  });
});

describe("normalizeOpenRouterUrl", () => {
  it("returns default URL for empty input", () => {
    expect(normalizeOpenRouterUrl("")).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
  });

  it("returns the input if it already ends with /chat/completions", () => {
    const url = "https://custom.ai/api/v1/chat/completions";
    expect(normalizeOpenRouterUrl(url)).toBe(url);
  });

  it("appends /chat/completions if input ends with /api/v1", () => {
    expect(normalizeOpenRouterUrl("https://custom.ai/api/v1")).toBe(
      "https://custom.ai/api/v1/chat/completions"
    );
  });

  it("appends /chat/completions if input ends with /v1", () => {
    expect(normalizeOpenRouterUrl("https://custom.ai/v1")).toBe(
      "https://custom.ai/v1/chat/completions"
    );
  });

  it("returns input unchanged for other URLs", () => {
    expect(normalizeOpenRouterUrl("https://other.ai/endpoint")).toBe(
      "https://other.ai/endpoint"
    );
  });
});
