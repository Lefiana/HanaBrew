import type { AiOverview, ChatResponse, ChatItem, ProviderStatus } from "@hanabrew/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, newDb, renderWithQuery, type FakeDb } from "@/test/fake-api";
import { AiApp } from "./ai-app";
import { AiSettingsSection } from "./ai-settings-section";

const at = "2026-11-02T00:00:00.000Z";
const uid = () => crypto.randomUUID();

const providerStatus = (
  provider: ProviderStatus["provider"],
  over: Partial<ProviderStatus> = {},
): ProviderStatus => ({
  provider,
  source: "none",
  ready: false,
  hasKey: false,
  keyHint: null,
  model: null,
  baseUrl: provider === "OLLAMA" ? "http://localhost:11434" : null,
  cloud: provider !== "OLLAMA",
  needsKey: provider !== "OLLAMA",
  customBaseUrlAllowed: false,
  ...over,
});
const overview = (over: Partial<AiOverview> = {}): AiOverview => ({
  providers: [providerStatus("GEMINI"), providerStatus("GROQ"), providerStatus("OLLAMA")],
  settings: {
    preferredProvider: null,
    fallbackProvider: null,
    allowCloudFallback: false,
    confirmationPolicy: "DESTRUCTIVE_ONLY",
  },
  keyStorageAvailable: true,
  activeProvider: null,
  ...over,
});
const ready = overview({
  providers: [
    providerStatus("GEMINI"),
    providerStatus("GROQ"),
    providerStatus("OLLAMA", { ready: true, model: "llama" }),
  ],
  activeProvider: "OLLAMA",
});

const user = (content: string): ChatItem => ({ type: "user", id: uid(), content, createdAt: at });
const hana = (content: string): ChatItem => ({
  type: "assistant",
  id: uid(),
  content,
  createdAt: at,
});
const action = (over: Partial<Extract<ChatItem, { type: "action" }>> = {}): ChatItem => ({
  type: "action",
  id: uid(),
  toolName: "create_task",
  risk: "write",
  status: "EXECUTED",
  summary: "Create task “Buy beans”",
  outcome: "Created task “Buy beans”",
  expiresAt: null,
  createdAt: at,
  ...over,
});
const conversation = (items: ChatItem[], over: Partial<ChatResponse> = {}): ChatResponse => ({
  id: "c0000000-0000-4000-8000-000000000001",
  title: "Chat",
  createdAt: at,
  updatedAt: at,
  items,
  pendingCount: items.filter((i) => i.type === "action" && i.status === "PENDING").length,
  hana: { message: "", mood: "idle", suggestions: [] },
  provider: "OLLAMA",
  model: "llama",
  ...over,
});

type Handler = NonNullable<FakeDb["ai"]>;
/** A fake AI backend: the overview, plus whatever the test wants chat / approve / etc. to return. */
function backend(over: {
  overview?: AiOverview | (() => AiOverview);
  chat?: (body: Record<string, unknown> | undefined) => {
    status: number;
    body: unknown;
    delayMs?: number;
  };
  decide?: (id: string, decision: string) => { status: number; body: unknown };
  extra?: Handler;
}): Handler {
  return (request) => {
    const { method, path } = request;
    if (path === "/api/ai/overview")
      return {
        status: 200,
        body: typeof over.overview === "function" ? over.overview() : (over.overview ?? ready),
      };
    if (path === "/api/ai/conversations" && method === "GET") return { status: 200, body: [] };
    if (path === "/api/ai/chat") return over.chat?.(request.body) ?? { status: 500, body: {} };
    const decide = path.match(/^\/api\/ai\/actions\/([^/]+)\/(approve|reject)$/);
    if (decide) return over.decide?.(decide[1]!, decide[2]!) ?? { status: 500, body: {} };
    return (
      over.extra?.(request) ?? {
        status: 404,
        body: { statusCode: 404, error: "NOT_FOUND", message: "unhandled" },
      }
    );
  };
}
const withAi = (ai: Handler) => {
  const db = newDb({ ai });
  installFakeApi(db);
  return db;
};
const apiError = (status: number, message: string) => ({
  status,
  body: { statusCode: status, error: "ERR", message },
});

describe("HanaAI chat", () => {
  it("asks you to set up a provider before chatting", async () => {
    withAi(backend({ overview: overview() }));
    renderWithQuery(<AiApp />);
    expect(await screen.findByText("Set up Hana")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open AI settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Message Hana")).toBeDisabled();
  });

  it("sends your message with your time zone and shows Hana's reply", async () => {
    const reply = conversation([user("hello"), hana("Hi! How can I help?")], {
      hana: { message: "Hi! How can I help?", mood: "idle", suggestions: ["Plan my week"] },
    });
    const db = withAi(
      backend({
        chat: () => ({ status: 200, body: reply }),
        extra: (r) =>
          r.path.startsWith("/api/ai/conversations/")
            ? { status: 200, body: reply }
            : { status: 404, body: {} },
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiApp />);

    const box = await screen.findByLabelText("Message Hana");
    await waitFor(() => expect(box).toBeEnabled());
    await u.type(box, "hello{Enter}");

    expect(await screen.findByText("Hi! How can I help?")).toBeInTheDocument();
    expect(db.writes[0]).toMatchObject({
      method: "POST",
      path: "/api/ai/chat",
      body: { message: "hello", timeZone: "Asia/Manila" },
    });
    expect(db.writes[0]!.body).not.toHaveProperty("conversationId"); // a new chat
    expect(box).toHaveValue("");
    expect(await screen.findByRole("button", { name: "Plan my week" })).toBeInTheDocument(); // suggestion chip from Hana
  });

  it("starter suggestions send a message when clicked", async () => {
    const db = withAi(
      backend({
        chat: () => ({ status: 200, body: conversation([user("Plan my week"), hana("Sure!")]) }),
        extra: () => ({ status: 200, body: conversation([user("Plan my week"), hana("Sure!")]) }),
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiApp />);
    await u.click(await screen.findByRole("button", { name: "Plan my week" }));
    await waitFor(() =>
      expect(db.writes[0]).toMatchObject({
        path: "/api/ai/chat",
        body: { message: "Plan my week" },
      }),
    );
  });

  it("shows what Hana did on a card, and she looks happy", async () => {
    const reply = conversation([user("add beans"), action(), hana("Added it!")], {
      hana: { message: "Added it!", mood: "happy", suggestions: [] },
    });
    withAi(
      backend({
        chat: () => ({ status: 200, body: reply }),
        extra: () => ({ status: 200, body: reply }),
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiApp />);
    const box = await screen.findByLabelText("Message Hana");
    await waitFor(() => expect(box).toBeEnabled());
    await u.type(box, "add beans{Enter}");

    expect(await screen.findByText("Create task “Buy beans”")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Hana is happy" })).toBeInTheDocument();
  });

  it("shows Hana as thinking while she works, and listening while you type", async () => {
    const reply = conversation([user("hi"), hana("Hello")]);
    withAi(
      backend({
        chat: () => ({ status: 200, body: reply, delayMs: 150 }),
        extra: () => ({ status: 200, body: reply }),
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiApp />);
    const box = await screen.findByLabelText("Message Hana");
    await waitFor(() => expect(box).toBeEnabled());

    await u.type(box, "h");
    expect(screen.getByRole("img", { name: "Hana is listening" })).toBeInTheDocument();
    await u.type(box, "i{Enter}");
    expect(await screen.findByRole("img", { name: "Hana is thinking" })).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument(); // your message shows immediately
    expect(await screen.findByText("Hello")).toBeInTheDocument();
  });

  it("asks for approval, and approving updates the card", async () => {
    const pending = action({
      status: "PENDING",
      risk: "destructive",
      summary: "Delete task “Old chore” permanently",
      outcome: null,
      expiresAt: "2026-11-02T00:15:00.000Z",
      toolName: "delete_task",
    });
    const done = {
      ...(pending as object),
      status: "EXECUTED",
      outcome: "Deleted task “Old chore”",
    } as ChatItem;
    const asked = conversation([user("delete it"), pending, hana("Waiting for your OK.")], {
      hana: { message: "Waiting for your OK.", mood: "listening", suggestions: [] },
    });
    const finished = conversation([user("delete it"), done, hana("Deleted.")], {
      hana: { message: "Deleted.", mood: "happy", suggestions: [] },
    });
    let approved = false;
    const db = withAi(
      backend({
        chat: () => ({ status: 200, body: asked }),
        decide: (id, decision) =>
          decision === "approve"
            ? ((approved = true), { status: 200, body: finished })
            : { status: 200, body: asked },
        extra: (r) =>
          r.path.startsWith("/api/ai/conversations/")
            ? { status: 200, body: approved ? finished : asked }
            : { status: 404, body: {} },
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiApp />);
    const box = await screen.findByLabelText("Message Hana");
    await waitFor(() => expect(box).toBeEnabled());
    await u.type(box, "delete it{Enter}");

    expect(await screen.findByText("Delete task “Old chore” permanently")).toBeInTheDocument();
    expect(screen.getByText("Needs your approval")).toBeInTheDocument();
    expect(screen.getByText("Can’t be undone")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Suggestions" })).not.toBeInTheDocument(); // no distractions while waiting
    expect(db.writes.filter((w) => w.path.includes("/actions/"))).toHaveLength(0); // nothing happens until you decide

    await u.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Deleted task “Old chore”")).toBeInTheDocument();
    expect(db.writes.at(-1)).toMatchObject({
      method: "POST",
      path: expect.stringMatching(/\/actions\/.*\/approve$/),
    });
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("declining sends a reject", async () => {
    const pending = action({
      status: "PENDING",
      summary: "Create task “X”",
      outcome: null,
      expiresAt: "2026-11-02T00:15:00.000Z",
    });
    const asked = conversation([user("add x"), pending]);
    const declined = conversation([
      user("add x"),
      { ...(pending as object), status: "REJECTED" } as ChatItem,
      hana("Okay."),
    ]);
    const db = withAi(
      backend({
        chat: () => ({ status: 200, body: asked }),
        decide: () => ({ status: 200, body: declined }),
        extra: () => ({ status: 200, body: asked }),
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiApp />);
    const box = await screen.findByLabelText("Message Hana");
    await waitFor(() => expect(box).toBeEnabled());
    await u.type(box, "add x{Enter}");
    await u.click(await screen.findByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(db.writes.at(-1)).toMatchObject({ path: expect.stringMatching(/\/reject$/) }),
    );
    expect(await screen.findByText("Declined")).toBeInTheDocument();
  });

  it("explains an expired or already-handled approval", async () => {
    const pending = action({
      status: "PENDING",
      summary: "Create task “X”",
      outcome: null,
      expiresAt: "2026-11-02T00:15:00.000Z",
    });
    const asked = conversation([user("add x"), pending]);
    withAi(
      backend({
        chat: () => ({ status: 200, body: asked }),
        decide: () => apiError(409, "That request expired. Ask Hana again if you still want it."),
        extra: () => ({ status: 200, body: asked }),
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiApp />);
    const box = await screen.findByLabelText("Message Hana");
    await waitFor(() => expect(box).toBeEnabled());
    await u.type(box, "add x{Enter}");
    await u.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/);
  });

  it("shows provider errors and gives your message back so you can retry", async () => {
    withAi(
      backend({
        chat: () => apiError(424, "Can't reach localhost:11434. Is it running and reachable?"),
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiApp />);
    const box = await screen.findByLabelText("Message Hana");
    await waitFor(() => expect(box).toBeEnabled());
    await u.type(box, "are you there?{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(/Can't reach localhost:11434/);
    expect(box).toHaveValue("are you there?"); // nothing was lost
  });

  it("deletes a conversation", async () => {
    const reply = conversation([user("hi"), hana("Hello")]);
    const db = withAi(
      backend({
        chat: () => ({ status: 200, body: reply }),
        extra: (r) =>
          r.method === "DELETE"
            ? { status: 204, body: null }
            : r.path.startsWith("/api/ai/conversations/")
              ? { status: 200, body: reply }
              : { status: 404, body: {} },
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiApp />);
    const box = await screen.findByLabelText("Message Hana");
    await waitFor(() => expect(box).toBeEnabled());
    await u.type(box, "hi{Enter}");
    await u.click(await screen.findByRole("button", { name: "Delete this conversation" }));
    await waitFor(() =>
      expect(db.writes.at(-1)).toMatchObject({
        method: "DELETE",
        path: `/api/ai/conversations/${reply.id}`,
      }),
    );
  });
});

describe("AI settings", () => {
  const lists = (r: { path: string }, body: unknown) =>
    r.path === "/api/ai/actions" ? { status: 200, body } : null;

  it("lists the providers and what each still needs", async () => {
    withAi(backend({ overview: overview() }));
    renderWithQuery(<AiSettingsSection />);
    expect(await screen.findByRole("heading", { name: "Google Gemini" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Groq" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Ollama/ })).toBeInTheDocument();
    expect(screen.getAllByText("Needs a key")).toHaveLength(2);
    expect(screen.getByText("Choose a model")).toBeInTheDocument();
  });

  it("saves an API key and never shows it again", async () => {
    const SECRET = "AIzaSy-super-secret-key-1234";
    let saved = false;
    const status = () =>
      providerStatus("GEMINI", saved ? { hasKey: true, keyHint: "…1234", source: "user" } : {});
    const db = withAi(
      backend({
        overview: () =>
          overview({ providers: [status(), providerStatus("GROQ"), providerStatus("OLLAMA")] }),
        extra: (r) =>
          r.method === "PUT" && r.path === "/api/ai/providers/gemini"
            ? ((saved = true), { status: 200, body: status() })
            : { status: 404, body: {} },
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiSettingsSection />);

    const [geminiKey] = await screen.findAllByLabelText("API key");
    expect(geminiKey).toHaveAttribute("type", "password");
    await u.type(geminiKey!, SECRET);
    await u.click(screen.getAllByRole("button", { name: "Save" })[0]!);

    await waitFor(() =>
      expect(db.writes[0]).toMatchObject({
        method: "PUT",
        path: "/api/ai/providers/gemini",
        body: { apiKey: SECRET },
      }),
    );
    expect(await screen.findByText(/A key is saved \(…1234\)/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("API key")[0]).toHaveValue(""); // cleared from the browser
    expect(document.body.textContent).not.toContain(SECRET);
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it("shows server-side validation errors next to the field", async () => {
    withAi(
      backend({
        overview: overview(),
        extra: (r) =>
          r.method === "PUT"
            ? {
                status: 400,
                body: {
                  statusCode: 400,
                  error: "BAD_REQUEST",
                  message: "Validation failed.",
                  issues: [{ path: "apiKey", message: "That key looks too short." }],
                },
              }
            : { status: 404, body: {} },
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiSettingsSection />);
    await u.type((await screen.findAllByLabelText("API key"))[0]!, "short");
    await u.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    expect(await screen.findByText("That key looks too short.")).toBeInTheDocument();
  });

  it("tests a connection and reports success or the reason for failure", async () => {
    let result: { ok: boolean; message: string; latencyMs: number | null } = {
      ok: true,
      message: "Connected. llama answered.",
      latencyMs: 120,
    };
    withAi(
      backend({
        extra: (r) =>
          r.path === "/api/ai/providers/ollama/test"
            ? { status: 200, body: result }
            : { status: 404, body: {} },
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiSettingsSection />);

    const buttons = await screen.findAllByRole("button", { name: "Test connection" });
    expect(buttons[0]).toBeDisabled(); // Gemini isn't ready
    await u.click(buttons[2]!);
    expect(await screen.findByText("✓ Connected. llama answered. (120 ms)")).toBeInTheDocument();

    result = {
      ok: false,
      message: "Can't reach localhost:11434. Is it running and reachable?",
      latencyMs: null,
    };
    await u.click(buttons[2]!);
    expect(await screen.findByText(/✗ Can't reach localhost:11434/)).toBeInTheDocument();
  });

  it("loads the live model list from the provider", async () => {
    withAi(
      backend({
        extra: (r) =>
          r.path === "/api/ai/providers/ollama/models"
            ? { status: 200, body: { models: ["llama3:8b", "qwen3:7b"] } }
            : { status: 404, body: {} },
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiSettingsSection />);
    await u.click((await screen.findAllByRole("button", { name: "Load models" }))[2]!);
    expect(await screen.findByText(/2 models available/)).toBeInTheDocument();
    expect(document.querySelectorAll("#ollama-models option")).toHaveLength(2);
  });

  it("makes the cloud-fallback privacy trade-off explicit, and saves the choice", async () => {
    const db = withAi(
      backend({
        extra: (r) =>
          r.method === "PATCH" ? { status: 200, body: ready.settings } : { status: 404, body: {} },
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiSettingsSection />);
    const box = await screen.findByRole("checkbox", {
      name: /Allow falling back to a cloud provider/,
    });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/Hana never does this without this switch/)).toBeInTheDocument();
    await u.click(box);
    await waitFor(() =>
      expect(db.writes[0]).toMatchObject({
        method: "PATCH",
        path: "/api/ai/settings",
        body: { allowCloudFallback: true },
      }),
    );
  });

  it("saves the preferred provider and the confirmation policy", async () => {
    const db = withAi(
      backend({
        extra: (r) =>
          r.method === "PATCH" ? { status: 200, body: ready.settings } : { status: 404, body: {} },
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiSettingsSection />);
    await u.selectOptions(await screen.findByLabelText("Preferred provider"), "OLLAMA");
    await waitFor(() =>
      expect(db.writes[0]).toMatchObject({ body: { preferredProvider: "OLLAMA" } }),
    );
    await u.click(screen.getByRole("radio", { name: "Before every change she makes" }));
    await waitFor(() =>
      expect(db.writes[1]).toMatchObject({ body: { confirmationPolicy: "ALL_WRITES" } }),
    );
    expect(
      screen.getByText(/Deleting, and changing many items at once, always needs your approval/),
    ).toBeInTheDocument();
  });

  it("explains when the server can't store personal keys", async () => {
    withAi(backend({ overview: overview({ keyStorageAvailable: false }) }));
    renderWithQuery(<AiSettingsSection />);
    expect(await screen.findByRole("note")).toHaveTextContent(/APP_ENCRYPTION_KEY/);
    for (const input of screen.getAllByLabelText("API key")) expect(input).toBeDisabled();
  });

  it("shows recent AI activity", async () => {
    withAi(
      backend({
        extra: (r) =>
          lists(r, [
            {
              id: uid(),
              toolName: "create_task",
              risk: "write",
              status: "EXECUTED",
              provider: "OLLAMA",
              createdAt: at,
              resolvedAt: at,
            },
          ]) ?? { status: 404, body: {} },
      }),
    );
    const u = userEvent.setup();
    renderWithQuery(<AiSettingsSection />);
    await u.click(await screen.findByRole("button", { name: /Show recent AI activity/ }));
    const list = await screen.findByRole("list", { name: "Recent AI activity" });
    expect(within(list).getByText("create task")).toBeInTheDocument();
    expect(within(list).getByText(/executed · write · ollama/)).toBeInTheDocument();
  });
});
