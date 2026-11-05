// Runs before each e2e test file: point the app at the disposable test database.
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required for e2e tests");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = url;
process.env.API_PUBLIC_URL = "http://localhost:4000";
process.env.WEB_PUBLIC_URL = "http://localhost:3000";
process.env.CORS_ALLOWED_ORIGINS = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.SWAGGER_ENABLED = "true";
process.env.APP_ENCRYPTION_KEY = "test-encryption-key-test-encryption-key-0123456789";
process.env.AI_RATE_LIMIT_PER_MINUTE = "10000";
process.env.AI_ALLOW_CUSTOM_OLLAMA_URL = "false";
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
