import { describe, expect, it } from "vitest";
import { parseSimpleChanges } from "../simpleChangeParser";

describe("parseSimpleChanges", () => {
	it("parses diff content inside fenced blocks", () => {
		const input = [
			"Response with diff block:",
			"```diff",
			"before_line_1()",
			"before_line_2()",
			"- old_call()",
			"+ new_call()",
			"after_line_1()",
			"after_line_2()",
			"```",
		].join("\n");

		const [change] = parseSimpleChanges(input);
		expect(change).toBeDefined();
		expect(change.beforeContext).toEqual(["before_line_1()", "before_line_2()"]);
		expect(change.afterContext).toEqual(["after_line_1()", "after_line_2()"]);
		expect(change.oldLines).toEqual([" old_call()"]);
		expect(change.newLines).toEqual([" new_call()"]);
	});

	it("detects multiple change sections outside fenced blocks", () => {
		const input = [
			"context_before_a()",
			"- remove_a()",
			"+ add_a()",
			"context_after_a()",
			"",
			"leading_text",
			"second_before()",
			"- erase_line()",
			"+ insert_line()",
			"second_after()",
		].join("\n");

		const changes = parseSimpleChanges(input);
		expect(changes).toHaveLength(2);

		expect(changes[0]).toMatchObject({
			beforeContext: ["context_before_a()"],
			afterContext: ["context_after_a()"],
			oldLines: [" remove_a()"],
			newLines: [" add_a()"],
		});

		expect(changes[1]).toMatchObject({
			beforeContext: ["leading_text", "second_before()"],
			afterContext: ["second_after()"],
		});
	});

	it("retains blank lines inside fenced diff blocks", () => {
		const input = [
			"```diff",
			"- summary(mtcars)",
			"+ summary(iris)",
			"",
			"- plot(mtcars$mpg)",
			"+ plot(iris$Sepal.Length)",
			"```",
		].join("\n");

		const [change] = parseSimpleChanges(input);
		expect(change).toBeDefined();
		expect(change.oldLines).toEqual([" summary(mtcars)", "", " plot(mtcars$mpg)"]);
		expect(change.newLines).toEqual([" summary(iris)", "", " plot(iris$Sepal.Length)"]);
	});

	it("resets regex state between calls", () => {
		const input = ["```diff", "- a()", "+ b()", "```"].join("\n");

		const first = parseSimpleChanges(input);
		const second = parseSimpleChanges(input);

		expect(first).toHaveLength(1);
		expect(second).toHaveLength(1);
	});

	it("ignores text without balanced +/- sections", () => {
		const input = "List:\n- item one\n- item two";
		expect(parseSimpleChanges(input)).toHaveLength(0);
	});
});
