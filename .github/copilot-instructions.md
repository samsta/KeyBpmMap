# Copilot review instructions

- The app version shown in the UI comes from `package.json`.
- Every pull request should bump `package.json` to a newer version before review.
- Treat the project version as monotonically increasing: never reuse, lower, or skip back to an older version than the base branch.
- Follow the current project convention of incrementing the minor version for each PR (for example `0.1.0` → `0.2.0` → `0.3.0` across consecutive PRs).
- Copilot reviews should flag any PR that does not update the version, or that updates it to a value that is not strictly greater than the version on the base branch.
