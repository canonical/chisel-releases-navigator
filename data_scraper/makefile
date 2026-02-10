.DEFAULT_GOAL := help
.SUFFIXES:

.PHONY: help
help:  ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-10s\033[0m %s\n", $$1, $$2}'

.PHONY: all
all: test lint spellcheck  ## Run all checks

.PHONY: test
test:  ## Run tests
# 	uv run pytest

.PHONY: lint
lint:  ## Lint but don't format
	uv run ruff format --check .
	uv run ruff check .
	uv run mypy
	uvx ty check .

.PHONY: format
format:  ## Format the code
	uv run ruff format .
	uv run ruff check --fix .

.PHONY: spellcheck
spellcheck:  ## Run spellchecker
	npx --yes cspell *.py