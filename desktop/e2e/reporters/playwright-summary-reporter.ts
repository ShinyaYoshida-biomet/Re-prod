import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

class E2eSummaryReporter implements Reporter {
	private passed = 0;
	private failed = 0;
	private skipped = 0;

	onTestEnd(_test: TestCase, result: TestResult): void {
		switch (result.status) {
			case "passed":
				this.passed += 1;
				break;
			case "failed":
			case "timedOut":
			case "interrupted":
				this.failed += 1;
				break;
			case "skipped":
				this.skipped += 1;
				break;
			default:
				break;
		}
	}

	onEnd(): void {
		const total = this.passed + this.failed + this.skipped;
		console.log(
			`[e2e] Summary: total=${total} passed=${this.passed} failed=${this.failed} skipped=${this.skipped}`,
		);
	}
}

export default E2eSummaryReporter;
