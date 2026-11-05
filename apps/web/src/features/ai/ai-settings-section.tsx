"use client";

import {
  AI_PROVIDERS,
  type AiProviderId,
  type ProviderStatus,
  type ProviderTestResult,
} from "@hanabrew/contracts";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { errorMessageOf, fieldErrorsOf } from "@/lib/api-client";
import { useAiOverview, useProviderMutations, useRecentActions } from "./use-ai";

const LABEL: Record<AiProviderId, string> = {
  GEMINI: "Google Gemini",
  GROQ: "Groq",
  OLLAMA: "Ollama (local)",
};

/** Everything about how Hana thinks: providers and keys (write-only), privacy choices, and an activity log. */
export function AiSettingsSection() {
  const overview = useAiOverview();
  const { settings } = useProviderMutations();
  const [showActivity, setShowActivity] = useState(false);
  const data = overview.data;

  return (
    <section aria-labelledby="ai-heading" className="space-y-4">
      <div>
        <h2 id="ai-heading" className="text-lg font-semibold">
          Hana’s AI
        </h2>
        <p className="mt-1 text-sm text-muted">
          Choose which AI Hana uses. API keys are stored encrypted on the server and are never shown
          again after you save them.
        </p>
      </div>

      {overview.isPending && (
        <p className="text-sm text-muted" role="status">
          Loading…
        </p>
      )}
      {overview.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessageOf(overview.error)}
        </p>
      )}

      {data && (
        <>
          {!data.keyStorageAvailable && (
            <p role="note" className="rounded-md bg-accent/25 px-3 py-2 text-sm">
              This server can’t store personal API keys (it has no APP_ENCRYPTION_KEY). You can
              still choose models, and the administrator can provide keys in the server environment.
            </p>
          )}
          {data.providers.map((provider) => (
            <ProviderCard
              key={provider.provider}
              status={provider}
              keyStorageAvailable={data.keyStorageAvailable}
            />
          ))}

          <Card className="space-y-4">
            <h3 className="font-semibold">Preferences and privacy</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="ai-preferred"
                label="Preferred provider"
                hint="With “Automatic”, the first ready provider is used."
              >
                <Select
                  id="ai-preferred"
                  value={data.settings.preferredProvider ?? ""}
                  onChange={(e) =>
                    settings.mutate({
                      preferredProvider: (e.target.value || null) as AiProviderId | null,
                    })
                  }
                >
                  <option value="">Automatic</option>
                  {AI_PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                id="ai-fallback"
                label="If that one is unavailable, try"
                hint="Only used when the first provider is down or busy."
              >
                <Select
                  id="ai-fallback"
                  value={data.settings.fallbackProvider ?? ""}
                  onChange={(e) =>
                    settings.mutate({
                      fallbackProvider: (e.target.value || null) as AiProviderId | null,
                    })
                  }
                >
                  <option value="">Nothing (show an error)</option>
                  {AI_PROVIDERS.filter((p) => p !== data.settings.preferredProvider).map((p) => (
                    <option key={p} value={p}>
                      {LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--hb-ring)]"
                checked={data.settings.allowCloudFallback}
                onChange={(e) => settings.mutate({ allowCloudFallback: e.target.checked })}
              />
              <span>
                Allow falling back to a <strong>cloud</strong> provider
                <span className="block text-xs text-muted">
                  Off by default. When on, if your preferred provider is down, your conversation is
                  sent to the fallback provider (Gemini or Groq). Hana never does this without this
                  switch.
                </span>
              </span>
            </label>
            <fieldset>
              <legend className="text-sm font-medium">When should Hana ask before acting?</legend>
              <div className="mt-2 space-y-2">
                {(
                  [
                    ["DESTRUCTIVE_ONLY", "Only for deleting and bulk changes (recommended)"],
                    ["ALL_WRITES", "Before every change she makes"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="confirmation"
                      className="accent-[var(--hb-ring)]"
                      checked={data.settings.confirmationPolicy === value}
                      onChange={() => settings.mutate({ confirmationPolicy: value })}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                Deleting, and changing many items at once, always needs your approval.
              </p>
            </fieldset>
            {settings.isError && (
              <p role="alert" className="text-xs text-danger">
                {errorMessageOf(settings.error)}
              </p>
            )}
          </Card>

          <div>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showActivity}
              onClick={() => setShowActivity((v) => !v)}
            >
              {showActivity ? "Hide" : "Show"} recent AI activity
            </Button>
            {showActivity && <Activity />}
          </div>
        </>
      )}
    </section>
  );
}

function ProviderCard({
  status,
  keyStorageAvailable,
}: {
  status: ProviderStatus;
  keyStorageAvailable: boolean;
}) {
  const { save, removeKey, test, models } = useProviderMutations();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(status.model ?? "");
  const [baseUrl, setBaseUrl] = useState(status.baseUrl ?? "");
  const [result, setResult] = useState<ProviderTestResult | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const id = status.provider.toLowerCase();
  const fields = fieldErrorsOf(save.error);

  async function onSave() {
    const input: { apiKey?: string; model?: string; baseUrl?: string } = {};
    if (apiKey.trim()) input.apiKey = apiKey.trim();
    if (model.trim() && model.trim() !== status.model) input.model = model.trim();
    if (status.customBaseUrlAllowed && baseUrl.trim() && baseUrl.trim() !== status.baseUrl)
      input.baseUrl = baseUrl.trim();
    if (Object.keys(input).length === 0) return;
    try {
      await save.mutateAsync({ provider: status.provider, input });
      setApiKey(""); // the key is never kept in the browser after saving
      setResult(null);
    } catch {
      /* shown below */
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{LABEL[status.provider]}</h3>
        <span className="flex gap-1.5">
          {status.cloud ? <Badge>Cloud</Badge> : <Badge tone="sage">Runs on your machine</Badge>}
          {status.ready ? (
            <Badge tone="sage">Ready</Badge>
          ) : (
            <Badge tone="accent">
              {status.needsKey && !status.hasKey ? "Needs a key" : "Choose a model"}
            </Badge>
          )}
        </span>
      </div>

      {status.needsKey && (
        <Field
          id={`${id}-key`}
          label="API key"
          error={fields.apiKey}
          hint={
            status.source === "server"
              ? "The server provides a key. Saving your own overrides it."
              : status.keyHint
                ? `A key is saved (${status.keyHint}). Paste a new one to replace it.`
                : undefined
          }
        >
          <div className="flex gap-2">
            <Input
              id={`${id}-key`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={status.keyHint ? "••••••••••••" : "Paste your key"}
              value={apiKey}
              disabled={!keyStorageAvailable}
              onChange={(e) => setApiKey(e.target.value)}
            />
            {status.keyHint && (
              <Button
                variant="outline"
                onClick={() => removeKey.mutate(status.provider)}
                disabled={removeKey.isPending}
              >
                Remove key
              </Button>
            )}
          </div>
        </Field>
      )}

      {status.provider === "OLLAMA" && (
        <Field
          id="ollama-url"
          label="Ollama address"
          error={fields.baseUrl}
          hint={status.customBaseUrlAllowed ? undefined : "Set by the server (OLLAMA_BASE_URL)."}
        >
          <Input
            id="ollama-url"
            value={baseUrl}
            disabled={!status.customBaseUrlAllowed}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </Field>
      )}

      <Field
        id={`${id}-model`}
        label="Model"
        error={fields.model}
        hint="Use “Load models” to see what this provider offers right now."
      >
        <div className="flex gap-2">
          <Input
            id={`${id}-model`}
            list={`${id}-models`}
            value={model}
            placeholder="Choose or type a model"
            onChange={(e) => setModel(e.target.value)}
          />
          <datalist id={`${id}-models`}>
            {options.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <Button
            variant="outline"
            disabled={models.isPending || (status.needsKey && !status.hasKey)}
            onClick={() =>
              models.mutate(status.provider, { onSuccess: (r) => setOptions(r.models) })
            }
          >
            Load models
          </Button>
        </div>
      </Field>
      {models.isError && (
        <p role="alert" className="text-xs text-danger">
          {errorMessageOf(models.error)}
        </p>
      )}
      {options.length > 0 && (
        <p className="text-xs text-muted">
          {options.length} models available. Start typing to pick one.
        </p>
      )}
      {save.isError && Object.keys(fields).length === 0 && (
        <p role="alert" className="text-xs text-danger">
          {errorMessageOf(save.error)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void onSave()} disabled={save.isPending}>
          Save
        </Button>
        <Button
          variant="outline"
          onClick={() => test.mutate(status.provider, { onSuccess: setResult })}
          disabled={test.isPending || !status.ready}
        >
          Test connection
        </Button>
        {test.isPending && (
          <span role="status" className="text-xs text-muted">
            Testing…
          </span>
        )}
      </div>
      {(result || test.isError) && (
        <p
          role="status"
          className={`text-sm ${result?.ok ? "text-secondary-text" : "text-danger"}`}
        >
          {result
            ? `${result.ok ? "✓" : "✗"} ${result.message}${result.latencyMs ? ` (${result.latencyMs} ms)` : ""}`
            : errorMessageOf(test.error)}
        </p>
      )}
    </Card>
  );
}

function Activity() {
  const actions = useRecentActions(true);
  if (actions.isPending)
    return (
      <p className="mt-2 text-sm text-muted" role="status">
        Loading…
      </p>
    );
  if (!actions.data?.length)
    return <p className="mt-2 text-sm text-muted">Hana hasn’t done anything yet.</p>;
  return (
    <ul
      className="mt-2 divide-y divide-border rounded-md border border-border text-sm"
      aria-label="Recent AI activity"
    >
      {actions.data.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
          <span className="font-medium">{a.toolName.replace(/_/g, " ")}</span>
          <span className="text-xs text-muted">
            {a.status.toLowerCase()} · {a.risk}
            {a.provider ? ` · ${a.provider.toLowerCase()}` : ""} ·{" "}
            {new Date(a.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
          </span>
        </li>
      ))}
    </ul>
  );
}
