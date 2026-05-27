# Copilot review instructions

- The app version shown in the UI comes from `package.json`.
- Every pull request should bump `package.json` to a newer version before merge.
- Treat the project version as monotonically increasing: never reuse, lower, or skip back to an older version than the base branch.
- The project convention is to increment the minor version for each PR (for example `0.1.0` → `0.2.0` → `0.3.0` across consecutive PRs).
- Copilot reviews should flag any PR that does not update the version, or that updates it to a value that is not strictly greater than the version on the base branch.
- When replying with UI screenshots on PR comments, do not use `/tmp` paths. Save screenshots in a committed, repo-accessible path (for example `docs/screenshots/...`) and reference that committed file.


# Copilot agent coding instructions

- Whenever reasonable, write unit tests:
  - Any new logic that can reasonably be unit tested should include unit tests in the same change.
  - This especially includes algorithms, parsing, formatting, conversions, validation, protocol logic, and bug fixes.
  - Tests should be fast, deterministic, and cover edge cases.
  - Avoid UI automation, integration infrastructure, network, database, or hardware-dependent tests unless explicitly requested.
