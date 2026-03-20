import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui/PageHeader";

type PageHeroProps = {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  backgroundImage?: string;
};

export function PageHero({
  title,
  subtitle,
  rightSlot,
  backgroundImage = "/images/backgrounds/golf_peak_summer.jpg",
}: PageHeroProps) {
  return (
    <PageHeader
      label="RMR ADMIN"
      title={title}
      subtitle={subtitle}
      backgroundImage={backgroundImage}
      labelClassName="inline-block rounded-md bg-red-600 px-3 py-1 text-xs font-semibold tracking-widest text-white shadow-sm"
      contentClassName="mx-auto max-w-screen-xl px-4 pb-8 pt-8 sm:px-5 sm:pb-10 sm:pt-10"
      rightSlot={rightSlot}
    />
  );
}
