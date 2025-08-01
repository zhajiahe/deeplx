/**
 * Tests for main app endpoints
 */

// Mock the main app
jest.mock("../src/lib", () => ({
  clearMemoryCache: jest.fn(),
  generateCacheKey: jest.fn().mockReturnValue("cache:test-key"),
  getCachedTranslation: jest.fn(),
  setCachedTranslation: jest.fn(),
  query: jest.fn(),
}));

jest.mock("../src/lib/security", () => ({
  getSecureClientIP: jest.fn().mockReturnValue("192.168.1.1"),
  handleCORSPreflight: jest.fn().mockReturnValue("CORS response"),
  validateLanguageCode: jest
    .fn()
    .mockImplementation((code) => code?.toLowerCase()),
}));

jest.mock("../src/lib/env", () => ({
  validateEnvironment: jest.fn().mockReturnValue([]),
}));

jest.mock("../src/lib/performance", () => ({
  getPerformanceStats: jest
    .fn()
    .mockReturnValue({ requests: 100, avgResponseTime: 250 }),
}));

describe("Main App", () => {
  let app: any;
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = createMockEnv();

    // Reset all mocks
    jest.clearAllMocks();

    // Import the app after mocks are set up
    delete require.cache[require.resolve("../src/index")];
    const indexModule = require("../src/index");
    app = indexModule.default;
  });

  describe("GET /", () => {
    it("should redirect to GitHub repository", async () => {
      const request = new Request("http://localhost/", { method: "GET" });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(302);
    });
  });

  describe("GET /translate", () => {
    it("should return message for GET requests", async () => {
      const request = new Request("http://localhost/translate", {
        method: "GET",
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("Please use POST method");
    });
  });

  describe("POST /debug", () => {
    it("should return 404 when debug mode is disabled", async () => {
      mockEnv.DEBUG_MODE = "false";

      const request = new Request("http://localhost/debug", {
        method: "POST",
        body: JSON.stringify({ text: "Hello world" }),
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(404);
    });

    it("should provide debug information when enabled", async () => {
      mockEnv.DEBUG_MODE = "true";

      const request = new Request("http://localhost/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello world",
          source_lang: "en",
          target_lang: "zh",
        }),
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.code).toBe(200);

      const debugInfo = JSON.parse(result.data);
      expect(debugInfo.status).toBe("Request format is valid");
      expect(debugInfo.client_ip).toBe("192.168.1.1");
      expect(debugInfo.generated_request).toBeDefined();
    });

    it("should handle missing text parameter", async () => {
      mockEnv.DEBUG_MODE = "true";

      const request = new Request("http://localhost/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(400);
    });

    it("should handle invalid JSON", async () => {
      mockEnv.DEBUG_MODE = "true";

      const request = new Request("http://localhost/debug", {
        method: "POST",
        body: "invalid json",
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(400);
    });
  });

  describe("POST /translate", () => {
    it("should handle successful translation", async () => {
      const { query, getCachedTranslation } = require("../src/lib");

      getCachedTranslation.mockResolvedValueOnce(null);
      query.mockResolvedValueOnce({
        code: 200,
        data: "你好世界",
        id: 12345,
        source_lang: "EN",
        target_lang: "ZH",
      });

      const request = new Request("http://localhost/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello world",
          source_lang: "en",
          target_lang: "zh",
        }),
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.code).toBe(200);
      expect(result.data).toBe("你好世界");
    });

    it("should return cached translation when available", async () => {
      const { getCachedTranslation } = require("../src/lib");

      getCachedTranslation.mockResolvedValueOnce({
        data: "你好世界",
        timestamp: Date.now(),
        source_lang: "EN",
        target_lang: "ZH",
        id: 12345,
      });

      const request = new Request("http://localhost/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello world",
          source_lang: "en",
          target_lang: "zh",
        }),
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.code).toBe(200);
      expect(result.data).toBe("你好世界");
    });

    it("should handle missing text parameter", async () => {
      const request = new Request("http://localhost/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(400);
    });

    it("should handle invalid JSON", async () => {
      const request = new Request("http://localhost/translate", {
        method: "POST",
        body: "invalid json",
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(400);
    });

    it("should handle empty text", async () => {
      const request = new Request("http://localhost/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "   ",
          target_lang: "zh",
        }),
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(400);
    });

    it("should handle text that is too long", async () => {
      const request = new Request("http://localhost/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "a".repeat(100000),
          target_lang: "zh",
        }),
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(200); // Should truncate, not fail
    });

    it("should handle translation errors", async () => {
      const { query, getCachedTranslation } = require("../src/lib");

      getCachedTranslation.mockResolvedValueOnce(null);
      query.mockResolvedValueOnce({
        code: 500,
        data: null,
      });

      const request = new Request("http://localhost/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello world",
          target_lang: "zh",
        }),
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(500);
    });

    it("should use default language codes", async () => {
      const { query, getCachedTranslation } = require("../src/lib");

      getCachedTranslation.mockResolvedValueOnce(null);
      query.mockResolvedValueOnce({
        code: 200,
        data: "Hello world",
        id: 12345,
        source_lang: "AUTO",
        target_lang: "EN",
      });

      const request = new Request("http://localhost/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello world",
        }),
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(200);
    });
  });

  describe("OPTIONS requests", () => {
    it("should handle CORS preflight requests", async () => {
      const request = new Request("http://localhost/translate", {
        method: "OPTIONS",
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBe(200);
    });
  });

  describe("Scheduled events", () => {
    it("should handle scheduled maintenance", async () => {
      const { clearMemoryCache } = require("../src/lib");
      const indexModule = require("../src/index");

      const mockEvent = { scheduledTime: Date.now() } as ScheduledEvent;
      const mockContext = {
        waitUntil: jest.fn(),
        passThroughOnException: jest.fn(),
      } as ExecutionContext;

      await indexModule.scheduled(mockEvent, mockEnv, mockContext);

      expect(mockContext.waitUntil).toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("should handle unexpected errors gracefully", async () => {
      const { query } = require("../src/lib");
      query.mockRejectedValueOnce(new Error("Unexpected error"));

      const request = new Request("http://localhost/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello world",
          target_lang: "zh",
        }),
      });
      const response = await app.fetch(request, mockEnv);

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});
