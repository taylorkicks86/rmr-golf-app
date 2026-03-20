import { GroupedScoreEntryPage } from "@/components/scoring/grouped-score-entry-page";

export default function MemberScoreEntryPage() {
  return (
    <GroupedScoreEntryPage
      requireAdmin={false}
      allowScorecardSigning
      showFinalizedBanner={false}
      actionsRowAboveWeekSelect
      hideWeekSelectLabel
      contentMaxWidthClass="max-w-6xl"
      title="Score Entry"
      subtitle="Enter hole-by-hole scores for your tee-time group."
      backHref="/"
      backLabel="Home"
    />
  );
}
