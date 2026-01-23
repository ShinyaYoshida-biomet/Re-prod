import fs from "node:fs";
import path from "node:path";
import { TEST_CASES } from "../shared/test-registry";

type SuiteName = keyof typeof TEST_CASES;

const e2eRoot = path.resolve(__dirname, "..");
const playwrightDir = path.join(e2eRoot, "tests");
const webdriverDir = path.join(e2eRoot, "webdriver-specs");

const errors: string[] = [];

const assertFileExists = (filePath: string, label: string) => {
	if (!fs.existsSync(filePath)) {
		errors.push(`${label} file not found: ${filePath}`);
		return false;
	}
	return true;
};

const assertCaseReferences = (filePath: string, suite: SuiteName, label: string) => {
	const content = fs.readFileSync(filePath, "utf8");
	const cases = TEST_CASES[suite];

	cases.forEach((_, index) => {
		const pattern = new RegExp(
			`TEST_CASES(?:\\[(?:"|')${suite}(?:"|')\\]|\\.${suite})\\[${index}\\]`,
		);
		if (!pattern.test(content)) {
			errors.push(`${label} missing ${suite} case ${index + 1}: ${TEST_CASES[suite][index]}`);
		}
	});
};

(Object.keys(TEST_CASES) as SuiteName[]).forEach((suite) => {
	const playwrightFile = path.join(playwrightDir, `${suite}.spec.ts`);
	const webdriverFile = path.join(webdriverDir, `${suite}.e2e.ts`);

	const hasPlaywright = assertFileExists(playwrightFile, "Playwright");
	const hasWebdriver = assertFileExists(webdriverFile, "WebDriver");

	if (hasPlaywright) {
		assertCaseReferences(playwrightFile, suite, "Playwright");
	}

	if (hasWebdriver) {
		assertCaseReferences(webdriverFile, suite, "WebDriver");
	}
});

if (errors.length === 0) {
	console.log("E2E suites match the shared test registry.");
	process.exit(0);
}

console.error("E2E parity check failed:");
for (const error of errors) {
	console.error(`- ${error}`);
}
process.exit(1);
