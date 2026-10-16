/** Present one flat, source-labelled administrator statistic without side effects. */
import PropTypes from 'prop-types';

/**
 * Render an accessible label and tabular count.
 * Args:
 *   props.label (string): Exact source statistic label.
 *   props.value (number): Nonnegative collection count.
 * Returns:
 *   {JSX.Element} Labelled statistic with a safe zero for invalid numeric input.
 */
export function StatCard({ label, value }) {
  const count = Number.isFinite(value) && value >= 0 ? value : 0;
  return (
    <div role="group" aria-label={label} className="min-w-0 rounded border border-border bg-surface p-6">
      <p className="text-sm text-foreground-muted">
        {label}
      </p>
      <p className="mt-4 text-3xl tabular-nums">
        {count}
      </p>
    </div>
  );
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
};
