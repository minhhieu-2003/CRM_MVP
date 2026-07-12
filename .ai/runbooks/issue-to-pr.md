# Runbook: Issue to PR

1. `gh issue view <NUMBER> --repo <OWNER>/<REPO>`
2. `git checkout -b feature/<module>-<task>`
3. Ask agent to analyze only.
4. Approve plan.
5. Implement minimal patch.
6. Run tests.
7. Review diff.
8. Commit.
9. Create PR.
10. Link issue and evidence.
