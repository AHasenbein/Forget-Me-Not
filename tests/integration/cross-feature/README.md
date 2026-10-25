# Cross-feature (overlap) tests

Tests where two or more features interact. They go through the event bus and `contracts/` only, exactly
as production code does. Name files `<scenario>.test.ts` in this folder. Use `core/testing` mocks (FakeClock,
mock location/notifier/AI). Status below: update `todo` -> `done` in the PR that adds the test.

| Status | Scenario                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------ |
| done   | scam-call-guard emits an alert that notifications delivers to the caregiver                      |
| done   | lost-button respects location-tracking permissions                                               |
| todo   | gift-card-guard approval flow vs bill-tracker                                                    |
| todo   | reminders escalate to the caregiver when unconfirmed                                             |
| todo   | friends-family location visibility respects per-member grants via the location-tracking contract |
| todo   | missed check-in escalates through the circle to the primary caregiver                            |
| todo   | removing a circle member mid-escalation reroutes the alert                                       |
| todo   | a circle member can never approve a gift card                                                    |
| todo   | safe-zone departure notifies only members who opted in                                           |
| todo   | offline behavior across features                                                                 |
| todo   | a feature flag off means the feature is fully inert                                              |
