# GitHub Copilot @ / # / Slash Recipes

## Workspace discovery
```text
@workspace Find all files related to <FEATURE_OR_BUG>. Do not edit. Return entry points, data flow, affected files, risks, minimal plan, and test commands.
```

## Terminal error
```text
@terminal Analyze the last error. Return root cause, safe diagnostic commands, minimal fix, files affected, and commands not to run.
```

## Selection-only edit
```text
@workspace #selection Refactor selected code only. Preserve public API and behavior. Do not format unrelated lines.
```

## Useful context variables
- `#file`
- `#selection`
- `#function`
- `#class`
- `#project`
- `#path`
- `#line`
- `#sym`

## Common slash commands
- `/explain`
- `/fix`
- `/fixTestFailure`
- `/tests`
- `/doc`
- `/optimize`
- `/clear`
- `/new`
- `/help`
