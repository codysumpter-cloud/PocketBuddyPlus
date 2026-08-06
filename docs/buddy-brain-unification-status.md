# Buddy Brain unification status

Implemented on this branch:

- stable `openpets.virtual-pet` id retained;
- visible plugin renamed Buddy Brain;
- state v3 combines lifecycle and brain data;
- existing v2 lifecycle saves upgrade in place;
- renderer-local Buddy profile imports once with backup and idempotency marker;
- Brain panel manages care, identity, relationship, personality, training, notes, tasks, collection, and progression;
- old renderer nav/card are replaced by the plugin route for one compatibility release;
- official plugin and migration adapter tests run in the root suite.

Still intentionally separate for this compatibility pass: reaction-to-animation overrides remain owned by the existing Settings → Reaction Mapping editor. They are not a second Buddy lifecycle store.
