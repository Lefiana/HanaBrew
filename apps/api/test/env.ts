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
