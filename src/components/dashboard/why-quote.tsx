import { cn } from "@/lib/utils";

/** The user's personal "why", shown as a sun-yellow sticker under the dashboard greeting. */
export function WhyQuote({ text, className }: { text: string; className?: string }) {
  return (
    <figure
      className={cn(
        "mt-4 w-fit max-w-xl -rotate-1 rounded-[10px] border-2 border-ink bg-block-sun px-4 py-3 text-[#111111] shadow-brutal-sm motion-reduce:rotate-0",
        className,
      )}
    >
      <figcaption className="inline-flex items-center rounded-full bg-[#111111] px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-block-sun uppercase">Your why</figcaption>
      <blockquote className="mt-2 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">
        <span aria-hidden className="mr-0.5 font-display text-lg leading-none font-extrabold">
          &ldquo;
        </span>
        {text}
        <span aria-hidden className="ml-0.5 font-display text-lg leading-none font-extrabold">
          &rdquo;
        </span>
      </blockquote>
    </figure>
  );
}
