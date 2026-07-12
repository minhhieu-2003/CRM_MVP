---
name: clean-project
description: Clean up the project tree by identifying and removing redundant, unused, or temporary files.
---

# Clean Project Skill

Use this skill to help the user clean up their project tree by finding and removing redundant files (such as logs, temp files, caches, backups, unused scripts, etc.).

## Guidelines for Cleaning
1. **Identify Candidates**: Look for common temporary or redundant file patterns like `*.log`, `*.tmp`, `*.bak`, `.DS_Store`, or unused artifact files.
2. **Safe Mode / Dry Run First**: NEVER delete files immediately. Always list the files you plan to delete and ask for explicit user approval first.
3. **Use Specific Tools**: Use `run_command` (e.g., PowerShell `Remove-Item`) to delete the files only AFTER the user has approved.
4. **Scope**: Do not delete source code, `.env` files, or configuration files without very high confidence that they are unused, and only if the user explicitly confirms.

## Execution Steps
1. Scan the directories (using `list_dir` or terminal commands) to find candidates for deletion.
2. Present a categorized list of files to the user.
3. Wait for the user's confirmation.
4. Execute the deletion commands safely.
5. Report the total number of files removed and confirm the clean up.
