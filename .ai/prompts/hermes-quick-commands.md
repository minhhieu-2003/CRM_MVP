# Hermes Quick Commands and Skills

## Config example
File: `~/.hermes/config.yaml`

```yaml
quick_commands:
  server-status:
    type: exec
    command: systemctl status <service-name>
  git-safe-status:
    type: exec
    command: git status --short && git branch --show-current
  test-unit:
    type: exec
    command: npm test -- --runInBand
  security-scan:
    type: exec
    command: git diff --cached --name-only && git secrets --scan || true
```

## Skill slash command
Any installed skill in `~/.hermes/skills/<skill-name>/` can be invoked as:

```text
/<skill-name> <instruction>
```

## Session launch
```bash
hermes -s <skill-name>
hermes chat -s github-pr-workflow -s github-auth
```
