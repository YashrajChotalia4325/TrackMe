"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/form";
import { signIn, signUp } from "@/lib/auth-client";

const loginSchema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Enter your password") });
const registerSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(60),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
});

/**
 * Only follow ?next= when it resolves to a path on this origin. Parsing with URL (rather than
 * prefix checks) also rejects "//host", a backslash variant and paths with embedded tabs or
 * newlines, which browsers normalise to protocol-relative URLs.
 */
function sameOriginPath(next: string | null): string | null {
  if (!next || !next.startsWith("/")) return null;
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const isLogin = mode === "login";
  const form = useForm<{ name?: string; email: string; password: string }>({
    resolver: zodResolver(isLogin ? loginSchema : registerSchema) as never,
    defaultValues: { name: "", email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const res = isLogin ? await signIn.email({ email: v.email, password: v.password }) : await signUp.email({ name: v.name!, email: v.email, password: v.password });
    if (res.error) {
      setError(res.error.message ?? "Something went wrong");
      return;
    }
    // Without a valid ?next=, "/" sends the user to their chosen start page.
    router.push(isLogin ? (sameOriginPath(params.get("next")) ?? "/") : "/onboarding");
    router.refresh();
  });

  return (
    <div className="rounded-[10px] border-2 border-ink bg-card p-6 shadow-brutal-lg sm:p-7">
      <h2 className="font-display text-2xl leading-tight font-extrabold tracking-[-0.03em]">{isLogin ? "Welcome back" : "Create your account"}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{isLogin ? "Sign in to your command centre." : "Takes a minute. Your data stays private to you."}</p>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4" noValidate>
        {!isLogin && (
          <Field label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" autoComplete="given-name" {...form.register("name")} aria-invalid={!!errors.name} />
          </Field>
        )}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} aria-invalid={!!errors.email} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} {...form.register("password")} aria-invalid={!!errors.password} />
        </Field>
        {error && (
          <p role="alert" className="rounded-[8px] border-2 border-ink bg-[#FF8A8A] px-3 py-2 text-xs font-semibold text-[#111111]">
            {error}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="press mt-1 h-11 w-full rounded-[8px] border-2 border-ink bg-primary text-[15px] font-semibold text-primary-foreground shadow-brutal-sm hover:bg-primary"
        >
          {isSubmitting ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 border-t-2 border-muted pt-5 text-center text-sm text-muted-foreground">
        {isLogin ? "New here? " : "Already have an account? "}
        <Link
          href={isLogin ? "/register" : "/login"}
          className="rounded-[4px] font-semibold text-foreground underline decoration-block-pink decoration-[3px] underline-offset-4 outline-none hover:decoration-current focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
