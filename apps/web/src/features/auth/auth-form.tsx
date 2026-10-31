"use client";

import { placeholderEmailFor, signInFormSchema, signUpFormSchema } from "@hanabrew/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Flower2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { ME_QUERY_KEY, useMe } from "./use-me";

type Mode = "sign-in" | "sign-up";
type FieldErrors = Partial<Record<"username" | "displayName" | "password", string>>;

const COPY = {
  "sign-in": {
    title: "Welcome back",
    cta: "Sign in",
    alt: "New here?",
    altLink: "/sign-up",
    altCta: "Create an account",
  },
  "sign-up": {
    title: "Create your desk",
    cta: "Create account",
    alt: "Already have an account?",
    altLink: "/sign-in",
    altCta: "Sign in",
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const copy = COPY[mode];

  // Already signed in? Go straight to the desktop.
  useEffect(() => {
    if (me.data) router.replace("/");
  }, [me.data, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const data = new FormData(event.currentTarget);
    const raw = {
      username: String(data.get("username") ?? ""),
      displayName: String(data.get("displayName") ?? "").trim() || undefined,
      password: String(data.get("password") ?? ""),
    };

    const parsed =
      mode === "sign-up" ? signUpFormSchema.safeParse(raw) : signInFormSchema.safeParse(raw);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (mode === "sign-up") {
        const form = signUpFormSchema.parse(raw);
        const { error } = await authClient.signUp.email({
          // The server ignores this and derives its own placeholder; it only has to be well-formed.
          email: placeholderEmailFor(form.username),
          password: form.password,
          name: form.displayName ?? form.username,
          username: form.username,
        } as Parameters<typeof authClient.signUp.email>[0]);
        if (error) throw new Error(error.message ?? "Couldn’t create your account.");
      } else {
        const form = signInFormSchema.parse(raw);
        const { error } = await authClient.signIn.username({
          username: form.username,
          password: form.password,
        });
        if (error) {
          throw new Error(
            error.status === 401
              ? "Invalid username or password."
              : (error.message ?? "Couldn’t sign you in."),
          );
        }
      }
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      router.replace("/");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="hb-wallpaper flex min-h-dvh items-center justify-center p-4">
      <Card className="hb-glass w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Flower2 aria-hidden className="size-9" />
          <h1 className="mt-2 text-2xl font-semibold">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted">HanaBrew — your cozy productivity desktop</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-5 flex flex-col gap-4">
          <Field
            id="username"
            label="Username"
            error={fieldErrors.username}
            hint={mode === "sign-up" ? "3–30 letters, numbers, _ or ." : undefined}
          >
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!fieldErrors.username}
              required
            />
          </Field>
          {mode === "sign-up" && (
            <Field id="displayName" label="Display name (optional)" error={fieldErrors.displayName}>
              <Input id="displayName" name="displayName" autoComplete="nickname" maxLength={60} />
            </Field>
          )}
          <Field
            id="password"
            label="Password"
            error={fieldErrors.password}
            hint={mode === "sign-up" ? "At least 10 characters." : undefined}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              aria-invalid={!!fieldErrors.password}
              required
            />
          </Field>

          {formError && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          )}
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? "One moment…" : copy.cta}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          {copy.alt}{" "}
          <Link href={copy.altLink} className="font-medium text-fg underline underline-offset-2">
            {copy.altCta}
          </Link>
        </p>
      </Card>
    </main>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
