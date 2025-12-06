# Welcome to Re-prod ----

# Load required packages
suppressPackageStartupMessages({
  library(rentrez)
  library(ape)
})

cat("Step 1: Fetching COVID RNA data from GenBank...\n")

# 1) Get publicly available COVID RNA data from GenBank ----
# Use a small example set of SARS-CoV-2 complete genomes to keep the demo fast
search_term <- "SARS-CoV-2[Organism] AND complete genome[Title]"
max_sequences <- 10

cat("Search term:", search_term, "\n")
cat("Max sequences:", max_sequences, "\n")

search_res <- entrez_search(db = "nuccore", term = search_term, retmax = max_sequences)

cat("Number of IDs found:", search_res$count, "\n")
cat("Using IDs (up to retmax):", paste(search_res$ids, collapse = ","), "\n")

# Fetch FASTA sequences for the found IDs
fasta_raw <- entrez_fetch(db = "nuccore", id = search_res$ids, rettype = "fasta")

# Parse FASTA into ape::DNAbin
cat("Parsing FASTA sequences...\n")
seqs <- read.dna(textConnection(fasta_raw), format = "fasta")

cat("Total sequences downloaded:", length(seqs), "\n")
cat("Sequence names:\n", paste(rownames(seqs), collapse = "\n"), "\n")

# 2) Simple phylogenetic analysis using sequences with same lengths ----
cat("Filtering sequences by common length...\n")

seq_lengths <- sapply(seqs, length)
cat("Original sequence lengths:\n")
cat(paste(names(seq_lengths), seq_lengths, sep = ": ", collapse = "\n"), "\n")

# Keep only sequences with the modal (most common) length
modal_len <- as.integer(names(sort(table(seq_lengths), decreasing = TRUE))[1])
keep <- seq_lengths == modal_len

cat("Modal length:", modal_len, "\n")
cat("Sequences kept:", paste(names(seq_lengths)[keep], collapse = ","), "\n")

seqs_filt <- seqs[keep]

# Compute distance matrix and tree
cat("Computing distance matrix and NJ tree...\n")

# Use a simple distance (raw proportion of differences)
dist_mat <- dist.dna(seqs_filt, model = "raw")
cat("Distance matrix (first 5 values):\n")
cat(capture.output(print(as.matrix(dist_mat)[1:min(5, nrow(as.matrix(dist_mat))),
                                          1:min(5, ncol(as.matrix(dist_mat)))])),
    sep = "\n")

nj_tree <- nj(dist_mat)

cat("Tree summary:\n")
cat(capture.output(print(nj_tree)), sep = "\n")

# 3) Plot tree with a simple modern-style UI and metadata ----
cat("Plotting tree...\n")

# Extract simple metadata from sequence names (e.g., accession + description)
meta <- strsplit(rownames(seqs_filt), " ")
accessions <- vapply(meta, `[`, character(1), 1)

# Create nicer labels: accession only
nj_tree$tip.label <- accessions

# Basic modern-style plot
par(bg = "white", mar = c(5, 4, 4, 2) + 0.1)
plot(
  nj_tree,
  type = "unrooted",
  cex = 0.8,
  no.margin = TRUE,
  edge.width = 1.5,
  lab4ut = "axial"
)
title(main = "SARS-CoV-2 Phylogenetic Tree (GenBank sample)", cex.main = 0.9)

cat("Done.\n")
