# Commit Hooks Setup

This project uses [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/okonet/lint-staged) to enforce code quality before commits.

---

## What Happens on Commit?

Every time you run `git commit`, the following checks run automatically:

### 1. 📝 Lint and Format Staged Files

**What:** Only the files you're committing (staged files) are checked
**Tools:** ESLint + Prettier
**Action:** Automatically fixes and formats code where possible

Checks:
- ✅ ESLint rules compliance
- ✅ Code formatting (Prettier)
- ✅ Auto-fixes applied where possible

### 2. 🔧 TypeScript Type Check

**What:** Full TypeScript compilation check (no emit)
**Tool:** `tsc --noEmit`
**Action:** Ensures all TypeScript code compiles without errors

Checks:
- ✅ Type safety
- ✅ Import/export correctness
- ✅ No TypeScript errors

---

## Scripts Added

### `npm run type-check`
Runs TypeScript compiler in check-only mode (no output files).

```bash
npm run type-check
```

### `npm run lint:check`
Runs ESLint without auto-fixing (useful for CI/CD).

```bash
npm run lint:check
```

### `npm run lint`
Runs ESLint with auto-fix (existing script).

```bash
npm run lint
```

---

## Configuration

### lint-staged (package.json)

```json
"lint-staged": {
  "*.ts": [
    "eslint --fix",
    "prettier --write"
  ]
}
```

This configuration:
- Runs on all `.ts` files that are staged
- Auto-fixes ESLint issues
- Formats code with Prettier
- Stages the fixed files automatically

### Pre-commit Hook (.husky/pre-commit)

The hook performs these steps:
1. Run `lint-staged` - Lint and format staged files
2. Run `npm run type-check` - Verify TypeScript compilation
3. If any step fails, the commit is blocked

---

## Usage Examples

### Normal Commit (All Checks Pass)

```bash
git add src/modules/transaction/transaction.service.ts
git commit -m "feat: add new transaction method"

# Output:
# 🔍 Running pre-commit checks...
# 📝 Linting and formatting staged files...
# ✓ src/modules/transaction/transaction.service.ts
# 🔧 Running TypeScript type check...
# ✅ All pre-commit checks passed!
# [main abc1234] feat: add new transaction method
```

### Commit with Linting Errors

```bash
git add src/modules/account/account.service.ts
git commit -m "fix: update account logic"

# Output:
# 🔍 Running pre-commit checks...
# 📝 Linting and formatting staged files...
# ✖ src/modules/account/account.service.ts:
#   45:10  error  'unusedVar' is defined but never used  @typescript-eslint/no-unused-vars
# ❌ Linting failed. Please fix the errors and try again.

# Fix the error, then try again:
# ... fix the code ...
git add src/modules/account/account.service.ts
git commit -m "fix: update account logic"
# ✅ All pre-commit checks passed!
```

### Commit with TypeScript Errors

```bash
git add src/modules/transaction/transaction.controller.ts
git commit -m "feat: add endpoint"

# Output:
# 🔍 Running pre-commit checks...
# 📝 Linting and formatting staged files...
# ✓ src/modules/transaction/transaction.controller.ts
# 🔧 Running TypeScript type check...
# src/modules/transaction/transaction.controller.ts(56,18): 
#   error TS2339: Property 'invalidMethod' does not exist on type 'TransactionService'.
# ❌ Type check failed. Please fix the TypeScript errors and try again.

# Fix the TypeScript error, then commit:
# ... fix the code ...
git add src/modules/transaction/transaction.controller.ts
git commit -m "feat: add endpoint"
# ✅ All pre-commit checks passed!
```

---

## Bypassing Hooks (Not Recommended)

In rare cases where you need to bypass hooks (e.g., WIP commits):

```bash
git commit --no-verify -m "WIP: work in progress"
```

⚠️ **Warning:** This should be used sparingly. CI/CD will still run checks, and the code won't merge if it fails.

---

## Benefits

### 1. **Catch Errors Early**
- Find issues before they reach CI/CD
- Faster feedback loop
- Reduced failed builds

### 2. **Consistent Code Quality**
- All commits meet quality standards
- Automated formatting
- No debates about code style

### 3. **Better Git History**
- Every commit is working code
- Easy to bisect when debugging
- Clean, professional history

### 4. **Team Productivity**
- Less time in code review for style issues
- Focus reviews on logic and architecture
- Fewer "fix linting" commits

---

## Performance Considerations

### Why lint-staged?

Instead of linting the entire codebase on every commit, `lint-staged` only checks files you're actually committing. This means:

- **Fast:** Only checks changed files
- **Efficient:** No wasted time on unchanged code
- **Scalable:** Works well even with large codebases

### Typical Performance

- **Small commit** (1-5 files): < 5 seconds
- **Medium commit** (5-20 files): 5-15 seconds
- **Large commit** (20+ files): 15-30 seconds

Type checking always runs on the full codebase but uses incremental compilation, so it's typically fast (5-10 seconds).

---

## Troubleshooting

### Hook Not Running?

If hooks aren't running, ensure husky is installed:

```bash
npm run prepare
```

### Permission Issues?

Make the hook executable:

```bash
chmod +x .husky/pre-commit
```

### Want to Disable Temporarily?

Create `.husky/_/skip` file (don't commit this):

```bash
touch .husky/_/skip
```

To re-enable, remove the file:

```bash
rm .husky/_/skip
```

### Hook Runs But Fails Every Time?

Check the individual commands work:

```bash
# Test lint-staged
npx lint-staged

# Test type-check
npm run type-check

# Test linting
npm run lint:check
```

---

## CI/CD Integration

The same checks run in CI/CD:

```yaml
# .github/workflows/ci.yml (example)
- name: Lint
  run: npm run lint:check

- name: Type Check
  run: npm run type-check

- name: Test
  run: npm test
```

This ensures code that passes locally will also pass in CI/CD.

---

## Updating Hooks

To modify the pre-commit hook:

1. Edit `.husky/pre-commit`
2. Commit the changes
3. All team members get the update on next `git pull` + `npm install`

To add new checks:

```bash
# Example: Add test run to pre-push hook
npx husky add .husky/pre-push "npm test"
```

---

## For New Team Members

When cloning the repository:

```bash
git clone <repo>
cd billing-engine
npm install  # This runs 'npm run prepare' which sets up husky
```

Hooks are automatically installed! No additional setup needed.

---

## Summary

✅ **Automatic linting and formatting** on commit  
✅ **TypeScript type checking** before commit  
✅ **Fast** - only checks staged files  
✅ **Team-wide** - everyone uses same checks  
✅ **CI/CD aligned** - same checks locally and remotely  

**Result:** Higher code quality, fewer bugs, cleaner git history! 🚀

