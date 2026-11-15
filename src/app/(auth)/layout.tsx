import { redirect } from "next/navigation";
import { ByYash, LogoMark, Wordmark } from "@/components/shell/logo";
import { getSession } from "@/server/auth";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  // Real session check (not just cookie presence) so stale cookies can't cause a redirect loop.
  if (await getSession()) redirect("/");
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-10 sm:py-14">
      <div className="w-full max-w-sm">
        {/* Stacked brand lockup: mark, large wordmark, then the centred "By Yash" tag. */}
        <div className="mb-9 flex flex-col items-center text-center">
          <LogoMark size={64} decorative />
          <h1 className="mt-5 text-[42px] leading-none">
            <Wordmark className="text-[42px] [&>span]:border-[3px] [&>span]:shadow-[3px_3px_0_currentColor]" />
          </h1>
          <ByYash className="mt-4" />
          <p className="mt-5 font-sans text-[15px] font-medium text-muted-foreground">Your goals. Your time. Your growth.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
