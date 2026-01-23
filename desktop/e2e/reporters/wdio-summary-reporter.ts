import fs from "node:fs";
import path from "node:path";

const summaryPath =
	process.env.WDIO_SUMMARY_PATH ?? path.resolve(__dirname, "../.wdio-summary.jsonl");

type CountState = {
	tests: number;
	passes: number;
	failures: number;
	pending: number;
	skipping: number;
};

class E2eSummaryReporter {
	private counts: CountState = {
		tests: 0,
		passes: 0,
		failures: 0,
		pending: 0,
		skipping: 0,
	};

	onTestPass(): void {
		this.counts.tests += 1;
		this.counts.passes += 1;
	}

	onTestFail(): void {
		this.counts.tests += 1;
		this.counts.failures += 1;
	}

	onTestPending(): void {
		this.counts.tests += 1;
		this.counts.pending += 1;
	}

	onTestSkip(): void {
		this.counts.tests += 1;
		this.counts.skipping += 1;
	}

	onRunnerEnd(_runner: { failures?: number }): void {
		const skipped = this.counts.skipping + this.counts.pending;
		const payload = {
			total: this.counts.tests,
			passed: this.counts.passes,
			failed: this.counts.failures,
			skipped,
		};
		fs.appendFileSync(summaryPath, `${JSON.stringify(payload)}\n`);
	}
}

export default E2eSummaryReporter;
