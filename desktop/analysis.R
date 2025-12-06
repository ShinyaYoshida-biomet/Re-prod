# Welcome to Re-prod ----
# AI-Powered R Analysis IDE
# Try Cmd/Ctrl+Enter to run current section

# Load Data ----
data(mtcars)
head(mtcars)

# Summary Statistics ----
summary(mtcars)
str(mtcars)

# Scatter Plot ----
plot(mtcars$mpg, mtcars$hp,
     xlab = "Miles per Gallon",
     ylab = "Horsepower",
     main = "MPG vs Horsepower",
     col = "steelblue",
     pch = 19)
abline(lm(hp ~ mpg, data = mtcars), col = "red", lwd = 2)

# OWID Life Expectancy Analysis ----

# Load tidyverse for data manipulation and plotting
if (!requireNamespace("tidyverse", quietly = TRUE)) {
  install.packages("tidyverse")
}
library(tidyverse)

# Load OWID life expectancy data
life_url <- "https://ourworldindata.org/grapher/life-expectancy.csv"
life_raw <- read.csv(life_url)

# Inspect structure
str(life_raw)

# Compute year-to-year changes by country
life_changes <- life_raw %>%
  arrange(entity, year) %>%
  group_by(entity) %>%
  mutate(life_expectancy_change = value - lag(value)) %>%
  ungroup()

# Identify 5 countries with largest absolute year-to-year shifts
extreme_countries <- life_changes %>%
  filter(!is.na(life_expectancy_change)) %>%
  mutate(abs_change = abs(life_expectancy_change)) %>%
  group_by(entity) %>%
  summarise(max_abs_change = max(abs_change, na.rm = TRUE), .groups = "drop") %>%
  arrange(desc(max_abs_change)) %>%
  slice_head(n = 5)

print(extreme_countries)

# Filter data for those countries
life_extreme <- life_changes %>%
  semi_join(extreme_countries, by = "entity")

# Plot time series for life expectancy for these countries
life_extreme %>%
  ggplot(aes(x = year, y = value, color = entity)) +
  geom_line() +
  labs(
    title = "Life Expectancy Over Time for Countries with Largest Year-to-Year Shifts",
    x = "Year",
    y = "Life Expectancy (years)",
    color = "Country"
  ) +
  theme_minimal()
