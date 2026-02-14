# Antigravity Agent Instructions

## Terminal Command Execution

### Command Termination Bug
There is a known issue where terminal commands sent via `run_command` or `send_command_input` may hang because the model fails to include a newline character (`\n` or `↵`) at the end of the string.

### Mandatory Rule
**ALWAYS** ensure that every terminal command or input string intended for execution ends with a newline character (`\n`). 

Example:
```javascript
// Correct
run_command({ CommandLine: "ls -la\n", ... });

// Incorrect
run_command({ CommandLine: "ls -la", ... });
```

Failure to follow this rule will result in commands sitting idle in the terminal without executing.
