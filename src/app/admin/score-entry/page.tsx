import { GroupedScoreEntryPage } from "@/components/scoring/grouped-score-entry-page";

export default function AdminScoreEntryPage() {
  return (
    <GroupedScoreEntryPage
      requireAdmin
      allowScorecardSigning={false}
      title="Admin Score Entry"
      subtitle="Manage hole-by-hole scores for players marked as playing this week."
      backHref="/admin"
      backLabel="Admin"
    />
  );
}
