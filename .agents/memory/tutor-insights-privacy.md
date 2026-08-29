---
name: Tutor insights privacy
description: Privacy-threshold and activity-retention rules for aggregate tutor reporting.
---

Every learner-derived tutor metric must enforce the minimum cohort against the population that metric represents. Check both historical and selected-period cohorts; if either relevant nonzero cohort is below the threshold, return no learner-derived values. Keep zero learners as a genuine empty state.

**Why:** A large historical cohort can still expose one learner in a short activity window, while a zero-activity window can expose all-time progress for a historically small cohort. Aggregate-only fields are not anonymous when their denominator is tiny.

**How to apply:** Define each metric's denominator and time semantics before querying. Apply suppression server-side to the complete response, including summaries and lesson breakdowns; never rely on UI hiding.

Activity tied to a stable logical lesson identifier must survive catalog implementations that replace physical lesson rows during an ordinary edit. User or course deletion must still remove related activity.

**Why:** Cascading from a replaceable lesson row silently erased starts and drop-off history whenever tutors saved otherwise harmless course edits.

**How to apply:** Anchor lifecycle cleanup to durable user/course ownership, and avoid delete cascades from replaceable child rows unless the editor preserves those rows in place.

Only employee-role activity can contribute to learner insights. Reject staff-originated learning activity at write time and independently filter reporting reads by the user's current learner role.

**Why:** Tutor or admin activity can distort course metrics and can raise a genuinely small learner cohort above the privacy threshold.

**How to apply:** Enforce the role boundary on every activity source used by an aggregate, including legacy rows; never assume historical data was written only through today's guarded endpoint.