## Description

<!-- Describe your changes in detail -->

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Checklist

### For ALL PRs to `develop`:
- [ ] Code follows the project's style guidelines
- [ ] Tests pass locally (`pnpm test`)
- [ ] New tests added for new features/bug fixes
- [ ] Documentation updated (if needed)

### For PRs from `develop` → `main` (REQUIRED):
- [ ] ✅ **E2E tests ran successfully locally**
  ```bash
  pnpm tauri build --debug
  pnpm --filter @reprod/e2e test
  ```
- [ ] All acceptance criteria met
- [ ] Breaking changes documented in PR description
- [ ] Version bump prepared (if needed)

## Testing

<!-- Describe the tests you ran and how to reproduce them -->

## Screenshots (if applicable)

<!-- Add screenshots to demonstrate UI changes -->

## Related Issues

Closes #<!-- issue number -->
