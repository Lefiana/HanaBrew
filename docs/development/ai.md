# Working on the AI integration

## Try it without any API key

The test suite uses a **scripted fake model** (`apps/api/test/scripted-provider.ts`): you write the model's replies and tool calls
(`provider.call([{ name: "create_task", args: {...} }]).say("Done")`) and assert what the app did. No network, no cost, fully deterministic.
Start from `apps/api/test/ai.e2e-spec.ts`.

For a manual run without a real model, `apps/api` can talk to anything that speaks Ollama's `/api/chat` protocol.

## Adding a tool

1. Add it in `apps/api/src/modules/ai/tools/` with `defineTool({ name, description, risk, input, summarize, execute })`.
   - `input` is a Zod schema; it is both the validation and (simplified) the schema the model sees. Describe fields with `.describe()`.
   - Use `risk: "read" | "write" | "destructive"`; set `multiRecord: true` if it touches several records. Destructive and multi-record tools always require approval.
   - `summarize` is what the user reads on the approval card: build it from the validated arguments only.
   - `execute` must go through the existing services with `ctx.workspaceId`. Never accept user/workspace ids as arguments. Throw `ToolError` for expected failures; the model sees the message.
2. Register it in `tools.service.ts`.
3. Add e2e tests (happy path, invalid args, another user's ids, approval behaviour if it needs one).

## Adding a provider

Implement `AIProvider` in `packages/ai-core/src/` (`generateResponse`, `listModels`), keep the API key in a header, map HTTP errors to `ProviderError` kinds
(`auth`, `rate_limit`, `unavailable`, ...; only `unavailable`/`timeout`/`rate_limit` are fallback-eligible), redact secrets, and add a spec that runs against
`src/testing/fake-server.ts`. If the provider returns opaque state that must be echoed back, return it as `providerState` (see Gemini).
Then add it to the provider enum (`contracts`, Prisma), `provider-factory.ts` and the planning order.

## Troubleshooting

| Symptom                                      | Cause / fix                                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| "No AI provider is set up yet"               | Settings → Hana's AI: add a key (or use Ollama) **and choose a model**, then Test connection                      |
| "Your preferred provider isn't ready"        | You chose a preferred provider that lacks a key or model. Hana won't quietly use another one                      |
| "This server can't store API keys"           | Set `APP_ENCRYPTION_KEY` (32+ chars) and restart, or use `GEMINI_API_KEY` / `GROQ_API_KEY` in the environment     |
| Keys saved earlier stop working              | `APP_ENCRYPTION_KEY` changed; saved keys can't be decrypted. Re-enter them                                        |
| Gemini returns 400 about a signature         | The raw model parts weren't replayed. Please send me the exact error; this is the most likely real-API difference |
| "Can't reach localhost:11434"                | Ollama isn't running, or from Docker use `host.docker.internal` (`DOCKER_OLLAMA_BASE_URL`)                        |
| "The model … doesn't support tools" (Ollama) | Pick a tool-capable model                                                                                         |
| Groq: "invalid tool call"                    | The model produced malformed arguments; retry or choose a model with better tool support                          |
