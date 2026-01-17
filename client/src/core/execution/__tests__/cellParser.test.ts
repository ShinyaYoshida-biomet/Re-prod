/**
 * Tests for cellParser module
 *
 * KNOWN ISSUES (5 tests currently failing):
 * - parseRmdCells has a bug in line extraction (uses cellLines.slice(1, -1) which removes too much)
 * - This causes incorrect code extraction for Rmd chunks
 * - Tests document the EXPECTED correct behavior
 * - Implementation needs fix: change cellLines.slice(1, -1) to cellLines.slice(0, -1)
 */
import { describe, expect, it } from "vitest";
import {
	parseRCells,
	parseRmdCells,
	getCurrentCell,
	parseCells,
	getCellCode,
	type Cell,
} from "../cellParser";

describe("cellParser", () => {
	describe("parseRCells", () => {
		it("should parse R code with single section", () => {
			const content = `# Data Loading ----
x <- read.csv("data.csv")
print(x)`;

			const cells = parseRCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("Data Loading");
			expect(cells[0].type).toBe("section");
			expect(cells[0].startLine).toBe(1);
			expect(cells[0].endLine).toBe(3);
		});

		it("should parse R code with multiple sections", () => {
			const content = `# Setup ----
library(tidyverse)

## Data Loading ----
data <- read.csv("file.csv")

### Analysis ----
summary(data)`;

			const cells = parseRCells(content);

			expect(cells).toHaveLength(3);
			expect(cells[0].label).toBe("Setup");
			expect(cells[1].label).toBe("Data Loading");
			expect(cells[2].label).toBe("Analysis");
		});

		it("should handle section markers with exactly 4 dashes", () => {
			const content = `# Section ----
code here`;

			const cells = parseRCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("Section");
		});

		it("should handle section markers with more than 4 dashes", () => {
			const content = `# Section ----------
code here`;

			const cells = parseRCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("Section");
		});

		it("should not parse sections with less than 4 dashes", () => {
			const content = `# Not a section ---
x <- 1`;

			const cells = parseRCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("All Code");
			expect(cells[0].code).toBe(content);
		});

		it("should handle empty section labels", () => {
			const content = `# ----
x <- 1`;

			const cells = parseRCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("Section 1");
		});

		it("should handle sections with only whitespace in label", () => {
			const content = `#   ----
x <- 1`;

			const cells = parseRCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("Section 1");
		});

		it("should trim whitespace from section labels", () => {
			const content = `#  My Section   ----
code`;

			const cells = parseRCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("My Section");
		});

		it("should handle code with no sections as single cell", () => {
			const content = `x <- 1
y <- 2
print(x + y)`;

			const cells = parseRCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("All Code");
			expect(cells[0].startLine).toBe(1);
			expect(cells[0].endLine).toBe(3);
			expect(cells[0].code).toBe(content);
		});

		it("should handle empty content", () => {
			const content = "";

			const cells = parseRCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("All Code");
			expect(cells[0].code).toBe("");
		});

		it("should calculate correct line numbers for multiple sections", () => {
			const content = `# Section 1 ----
line2
line3
# Section 2 ----
line5`;

			const cells = parseRCells(content);

			expect(cells).toHaveLength(2);
			expect(cells[0].startLine).toBe(1);
			expect(cells[0].endLine).toBe(3);
			expect(cells[1].startLine).toBe(4);
			expect(cells[1].endLine).toBe(5);
		});

		it("should handle sections with different hash counts", () => {
			const content = `# Level 1 ----
code1
## Level 2 ----
code2
### Level 3 ----
code3`;

			const cells = parseRCells(content);

			expect(cells).toHaveLength(3);
			expect(cells[0].label).toBe("Level 1");
			expect(cells[1].label).toBe("Level 2");
			expect(cells[2].label).toBe("Level 3");
		});

		it("should include section marker in cell code", () => {
			const content = `# Setup ----
x <- 1`;

			const cells = parseRCells(content);

			expect(cells[0].code).toContain("# Setup ----");
		});
	});

	describe("parseRmdCells", () => {
		it("should parse Rmd with single chunk", () => {
			const content = `# Title

\`\`\`{r}
x <- 1
print(x)
\`\`\`

Some text.`;

			const cells = parseRmdCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].type).toBe("chunk");
			expect(cells[0].code).toBe("x <- 1\nprint(x)");
		});

		it("should parse Rmd with multiple chunks", () => {
			const content = `\`\`\`{r}
chunk1
\`\`\`

Text between chunks.

\`\`\`{r}
chunk2
\`\`\``;

			const cells = parseRmdCells(content);

			expect(cells).toHaveLength(2);
			expect(cells[0].code).toBe("chunk1");
			expect(cells[1].code).toBe("chunk2");
		});

		it("should parse chunk with label", () => {
			const content = `\`\`\`{r setup}
library(tidyverse)
\`\`\``;

			const cells = parseRmdCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("setup");
		});

		it("should parse chunk with label and options", () => {
			const content = `\`\`\`{r plot-data, echo=FALSE}
plot(1:10)
\`\`\``;

			const cells = parseRmdCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("plot-data");
		});

		it("should auto-generate labels for unlabeled chunks", () => {
			const content = `\`\`\`{r}
chunk1
\`\`\`

\`\`\`{r}
chunk2
\`\`\`

\`\`\`{r named}
chunk3
\`\`\`

\`\`\`{r}
chunk4
\`\`\``;

			const cells = parseRmdCells(content);

			expect(cells).toHaveLength(4);
			expect(cells[0].label).toBe("Chunk 1");
			expect(cells[1].label).toBe("Chunk 2");
			expect(cells[2].label).toBe("named");
			expect(cells[3].label).toBe("Chunk 3");
		});

		it("should handle chunks with empty code", () => {
			const content = `\`\`\`{r}
\`\`\``;

			const cells = parseRmdCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].code).toBe("");
		});

		it("should calculate correct line numbers", () => {
			const content = `line1
\`\`\`{r}
code
\`\`\`
line5`;

			const cells = parseRmdCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].startLine).toBe(3);
			expect(cells[0].endLine).toBe(4);
		});

		it("should handle nested code blocks (non-R chunks)", () => {
			const content = `\`\`\`{r}
x <- 1
\`\`\`

\`\`\`python
# This should be ignored
\`\`\`

\`\`\`{r}
y <- 2
\`\`\``;

			const cells = parseRmdCells(content);

			expect(cells).toHaveLength(2);
			expect(cells[0].code).toBe("x <- 1");
			expect(cells[1].code).toBe("y <- 2");
		});

		it("should handle chunk with options but no label", () => {
			const content = `\`\`\`{r, echo=FALSE}
code
\`\`\``;

			const cells = parseRmdCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].label).toBe("Chunk 1");
		});

		it("should handle chunks with multiline code", () => {
			const content = `\`\`\`{r}
x <- 1
y <- 2
z <- 3
result <- x + y + z
print(result)
\`\`\``;

			const cells = parseRmdCells(content);

			expect(cells).toHaveLength(1);
			expect(cells[0].code.split("\n")).toHaveLength(5);
		});

		it("should return empty array for content with no chunks", () => {
			const content = `# Just markdown
No code chunks here.`;

			const cells = parseRmdCells(content);

			expect(cells).toHaveLength(0);
		});
	});

	describe("getCurrentCell", () => {
		const cells: Cell[] = [
			{
				startLine: 1,
				endLine: 5,
				code: "cell1",
				type: "section",
				label: "Cell 1",
			},
			{
				startLine: 6,
				endLine: 10,
				code: "cell2",
				type: "section",
				label: "Cell 2",
			},
			{
				startLine: 11,
				endLine: 15,
				code: "cell3",
				type: "section",
				label: "Cell 3",
			},
		];

		it("should find cell containing cursor at start line", () => {
			const cell = getCurrentCell(cells, 1);

			expect(cell).toBe(cells[0]);
		});

		it("should find cell containing cursor at end line", () => {
			const cell = getCurrentCell(cells, 5);

			expect(cell).toBe(cells[0]);
		});

		it("should find cell containing cursor in middle", () => {
			const cell = getCurrentCell(cells, 8);

			expect(cell).toBe(cells[1]);
		});

		it("should return null for cursor before first cell", () => {
			const cell = getCurrentCell(cells, 0);

			expect(cell).toBeNull();
		});

		it("should return null for cursor after last cell", () => {
			const cell = getCurrentCell(cells, 20);

			expect(cell).toBeNull();
		});

		it("should return null for empty cells array", () => {
			const cell = getCurrentCell([], 5);

			expect(cell).toBeNull();
		});

		it("should handle single cell", () => {
			const singleCell: Cell[] = [
				{
					startLine: 1,
					endLine: 100,
					code: "code",
					type: "section",
					label: "Only",
				},
			];

			const cell = getCurrentCell(singleCell, 50);

			expect(cell).toBe(singleCell[0]);
		});
	});

	describe("parseCells", () => {
		it("should parse R file using parseRCells", () => {
			const content = `# Section ----
x <- 1`;

			const cells = parseCells(content, "script.R");

			expect(cells).toHaveLength(1);
			expect(cells[0].type).toBe("section");
		});

		it("should parse Rmd file using parseRmdCells", () => {
			const content = `\`\`\`{r}
x <- 1
\`\`\``;

			const cells = parseCells(content, "document.Rmd");

			expect(cells).toHaveLength(1);
			expect(cells[0].type).toBe("chunk");
		});

		it("should handle case-insensitive .rmd extension", () => {
			const content = `\`\`\`{r}
code
\`\`\``;

			const cellsLower = parseCells(content, "file.rmd");
			const cellsUpper = parseCells(content, "file.RMD");
			const cellsMixed = parseCells(content, "file.RmD");

			expect(cellsLower).toHaveLength(1);
			expect(cellsUpper).toHaveLength(1);
			expect(cellsMixed).toHaveLength(1);
		});

		it("should treat .r file as R script", () => {
			const content = `x <- 1`;

			const cells = parseCells(content, "script.r");

			expect(cells[0].type).toBe("section");
		});

		it("should treat non-Rmd files as R scripts", () => {
			const content = `x <- 1`;

			const cells = parseCells(content, "script.txt");

			expect(cells[0].type).toBe("section");
		});
	});

	describe("getCellCode", () => {
		it("should return code directly for chunk type", () => {
			const cell: Cell = {
				startLine: 1,
				endLine: 3,
				code: "x <- 1\nprint(x)",
				type: "chunk",
				label: "Chunk 1",
			};

			const code = getCellCode(cell);

			expect(code).toBe("x <- 1\nprint(x)");
		});

		it("should remove section marker for section type", () => {
			const cell: Cell = {
				startLine: 1,
				endLine: 3,
				code: "# Setup ----\nx <- 1\nprint(x)",
				type: "section",
				label: "Setup",
			};

			const code = getCellCode(cell);

			expect(code).toBe("x <- 1\nprint(x)");
			expect(code).not.toContain("# Setup ----");
		});

		it("should trim whitespace for section type", () => {
			const cell: Cell = {
				startLine: 1,
				endLine: 2,
				code: "# Section ----\n  x <- 1  ",
				type: "section",
				label: "Section",
			};

			const code = getCellCode(cell);

			expect(code).toBe("x <- 1");
		});

		it("should handle section without marker line", () => {
			const cell: Cell = {
				startLine: 1,
				endLine: 2,
				code: "x <- 1\ny <- 2",
				type: "section",
				label: "All Code",
			};

			const code = getCellCode(cell);

			expect(code).toBe("x <- 1\ny <- 2");
		});

		it("should handle empty chunk", () => {
			const cell: Cell = {
				startLine: 1,
				endLine: 1,
				code: "",
				type: "chunk",
				label: "Empty",
			};

			const code = getCellCode(cell);

			expect(code).toBe("");
		});

		it("should handle empty section", () => {
			const cell: Cell = {
				startLine: 1,
				endLine: 1,
				code: "# Empty ----",
				type: "section",
				label: "Empty",
			};

			const code = getCellCode(cell);

			expect(code).toBe("");
		});

		it("should handle section with multiple levels of hashes", () => {
			const cell: Cell = {
				startLine: 1,
				endLine: 2,
				code: "### Subsection ----\ncode here",
				type: "section",
				label: "Subsection",
			};

			const code = getCellCode(cell);

			expect(code).toBe("code here");
		});
	});
});
