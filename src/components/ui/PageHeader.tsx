import type { ReactNode } from "react";

type PageHeaderProps = {
  label: string;
  title: string;
  subtitle?: string;
  metaText?: string;
  backgroundImage?: string;
  rightSlot?: ReactNode;
  className?: string;
  contentClassName?: string;
  backgroundClassName?: string;
  overlayClassName?: string;
  labelClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  metaTextClassName?: string;
};

function joinClasses(...classes: Array<string | undefined | null | false>): string {
  return classes.filter(Boolean).join(" ");
}

export function PageHeader({
  label,
  title,
  subtitle,
  metaText,
  backgroundImage,
  rightSlot,
  className,
  contentClassName,
  backgroundClassName,
  overlayClassName,
  labelClassName,
  titleClassName,
  subtitleClassName,
  metaTextClassName,
}: PageHeaderProps) {
  const isImageHeader = Boolean(backgroundImage);

  return (
    <div className={joinClasses("relative", className)}>
      {isImageHeader && (
        <div
          className={joinClasses(
            "pointer-events-none absolute left-1/2 top-[-1rem] -z-10 -ml-[50vw] -mr-[50vw] h-[56vh] max-h-[600px] min-h-[340px] w-screen overflow-hidden bg-[#17453a]",
            backgroundClassName
          )}
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 bg-cover bg-[position:center_42%] brightness-110 sm:bg-[position:center_45%] md:bg-center"
            style={{ backgroundImage: `url('${backgroundImage}')` }}
          />
          <div
            className={joinClasses(
              "absolute inset-0 bg-gradient-to-b from-[#0b211b]/70 via-[#12362d]/58 to-[#17453a]/44",
              overlayClassName
            )}
          />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-white/0 via-zinc-100/55 to-zinc-100" />
        </div>
      )}

      <div
        className={joinClasses(
          "relative z-10 mx-auto max-w-screen-xl px-6 py-10 sm:py-12 md:py-14",
          contentClassName
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p
              className={joinClasses(
                "text-[11px] font-semibold uppercase tracking-[0.2em]",
                isImageHeader ? "text-emerald-100/95" : "text-emerald-700",
                labelClassName
              )}
            >
              {label}
            </p>
            <h1
              className={joinClasses(
                "mt-2 text-4xl font-bold leading-none sm:text-5xl",
                isImageHeader ? "text-white" : "text-zinc-900",
                titleClassName
              )}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className={joinClasses(
                  "mt-2 text-lg font-medium sm:text-xl",
                  isImageHeader ? "text-emerald-50" : "text-zinc-600",
                  subtitleClassName
                )}
              >
                {subtitle}
              </p>
            )}
            {metaText && (
              <p
                className={joinClasses(
                  "mt-2 text-sm font-medium",
                  isImageHeader ? "text-white/85" : "text-zinc-500",
                  metaTextClassName
                )}
              >
                {metaText}
              </p>
            )}
          </div>
          {rightSlot && <div className="shrink-0">{rightSlot}</div>}
        </div>
      </div>
    </div>
  );
}
