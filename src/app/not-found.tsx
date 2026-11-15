import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/shell/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-10 text-center">
      <div className="flex w-full max-w-md flex-col items-center">
        <BrandLockup />
        <div className="mt-10 -rotate-2 rounded-[10px] border-[3px] border-ink bg-block-sun px-8 py-4 shadow-brutal-lg">
          <p className="font-display text-7xl leading-none font-extrabold tracking-[-0.04em] text-[#111111] tabular-nums">404</p>
        </div>
        <h1 className="mt-10 font-display text-3xl leading-tight font-extrabold tracking-[-0.03em]">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">But your goals do. Let&apos;s get you back.</p>
        <Button
          size="lg"
          className="press mt-7 h-11 rounded-[8px] border-2 border-ink bg-primary px-5 text-[15px] font-semibold text-primary-foreground shadow-brutal-sm hover:bg-primary"
          nativeButton={false}
          render={<Link href="/dashboard" />}
        >
          Go to dashboard
        </Button>
      </div>
    </main>
  );
}
