import { LocalTime } from "@/components/local-time";
import type { ReviewSummary } from "../server";
import { DecisionButtons } from "./decision-buttons";
import { RequestReviewButton } from "./request-review-button";
import { describeRule } from "../rules";

type Props = {
  assetId: string;
  review: ReviewSummary | null;
  currentUserId: string;
  canRequest: boolean;
  versions: { id: string; number: number }[];
  selectedVersionId: string;
  reviewers: { id: string; name: string }[];
};

const STATUS_TEXT = {
  active: "In progress",
  approved: "Approved",
  changes_requested: "Changes requested",
  stale: "Outdated",
} as const;

const DECISION_TEXT = { approve: "✓ approved", request_changes: "✗ requested changes" } as const;

// Server Component: shows the latest review of the asset. The only client
// parts are the buttons (decide, request / restart).
export function ReviewPanel(props: Props) {
  const { review } = props;
  const latestVersion = props.versions[0];
  const wizard = {
    assetId: props.assetId,
    versions: props.versions,
    reviewers: props.reviewers,
  };

  if (!review) {
    return props.canRequest ? (
      <section aria-label="Review" className="flex flex-col gap-2">
        <RequestReviewButton {...wizard} defaultVersionId={props.selectedVersionId} label="Request review" />
      </section>
    ) : null;
  }

  const currentStep = review.steps[review.currentStep];
  const myTurn =
    review.status === "active" &&
    currentStep.reviewers.some((r) => r.id === props.currentUserId && r.decision === null);
  // A reviewer whose step was settled by others (e.g. an "any" step, or a
  // simultaneous click that lost the race): derived from the data, so the
  // explanation survives the page re-rendering from the realtime event.
  const lateReviewer =
    (review.status === "approved" || review.status === "changes_requested") &&
    currentStep.reviewers.some((r) => r.id === props.currentUserId && r.decision === null);
  const deciders = currentStep.reviewers.filter((r) => r.decision !== null).map((r) => r.name);

  return (
    <section aria-label="Review" className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold">Review of v{review.versionNumber}</h2>
        <span className={review.status === "approved" ? "text-green-700 dark:text-green-500" : review.status === "changes_requested" ? "text-amber-700 dark:text-amber-400" : "text-neutral-500"}>
          {STATUS_TEXT[review.status]}
          {review.status === "active" && review.steps.length > 1 && ` · step ${review.currentStep + 1} of ${review.steps.length}`}
        </span>
        <span className="text-neutral-500">
          requested by {review.createdBy}
          {review.dueAt && (
            <>
              {" · due "}
              <LocalTime value={review.dueAt} />
            </>
          )}
        </span>
      </div>
      {review.message && <p className="whitespace-pre-wrap">{review.message}</p>}

      <ol className="flex flex-col gap-2">
        {review.steps.map((step, index) => (
          <li key={index}>
            <p className="text-neutral-500">
              {review.steps.length > 1 && `Step ${index + 1}: `}
              {describeRule(step.rule)}
            </p>
            <ul className="flex flex-col">
              {step.reviewers.map((reviewer) => (
                <li key={reviewer.id}>
                  {reviewer.name} —{" "}
                  <span className={reviewer.decision === "approve" ? "text-green-700 dark:text-green-500" : reviewer.decision ? "text-amber-700 dark:text-amber-400" : "text-neutral-500"}>
                    {reviewer.decision ? DECISION_TEXT[reviewer.decision] : "waiting"}
                  </span>
                  {reviewer.note && <span className="text-neutral-500"> “{reviewer.note}”</span>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {myTurn && <DecisionButtons requestId={review.id} />}
      {lateReviewer && (
        <p role="status" className="text-neutral-500">
          Settled by {deciders.join(", ")} before you decided. Your decision is no longer needed.
        </p>
      )}

      {review.status === "stale" && (
        <p className="text-neutral-500">A newer version was uploaded while this review was running.</p>
      )}
      {review.status !== "active" && props.canRequest && (
        <RequestReviewButton
          {...wizard}
          defaultVersionId={latestVersion.id}
          // Restart with the same people and rules.
          initialSteps={review.steps.map((step) => ({ reviewers: step.reviewers.map((r) => r.id), rule: step.rule }))}
          label={review.status === "stale" ? `Restart review on v${latestVersion.number}` : "Request another review"}
        />
      )}
    </section>
  );
}
