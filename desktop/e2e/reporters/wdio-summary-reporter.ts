import fs from "node:fs";
import path from "node:path";
import SpecReporter from "@wdio/spec-reporter";

const summaryPath =
	process.env.WDIO_SUMMARY_PATH ?? path.resolve(__dirname, "../.wdio-summary.jsonl");

class E2eSummaryReporter extends SpecReporter {
	onRunnerEnd(runner: { failures?: number }): void {
		super.onRunnerEnd(runner);
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
