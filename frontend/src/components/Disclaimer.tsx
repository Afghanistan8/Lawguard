import { DISCLAIMER } from "../config";

/** Permanent, repeated professional-review disclaimer. */
export function Disclaimer({ sticky = false }: { sticky?: boolean }) {
  return (
    <div className={sticky ? "disclaimer sticky" : "disclaimer"} role="note">
      <strong>⚖️ Decision-support only.</strong> {DISCLAIMER}
    </div>
  );
}
