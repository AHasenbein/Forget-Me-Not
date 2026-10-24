# core/testing

Deterministic test helpers. No real keys, network, or timers. Import from `@core/testing`.
Factories: patient, primary caregiver, circle member (± location grant), linked pair, unlinked user.
Mocks: AI, Plaid, notifier (push/SMS), location (simulated GPS path + geofence crossings).
`FakeClock` drives escalation timeouts / snooze / DST (set an explicit ISO time around the DST change).
