SHELL := /bin/bash

ROOT_DIR := $(CURDIR)
IMAGE_NAME := chisel_dashboard_dev
IMAGE_TAG := latest
COMMON_DOCKER_ARGS := --rm -v $(ROOT_DIR)/:/repo -u $$(id -u):$$(id -g)

.DEFAULT_GOAL := help

.PHONY: help \
	build_dev_image save_image load_image image_shell \
	run_server build_site update_index update_data install_node_deps \
	setup_worktree setup rebuild_image \
	push_data push_dist

help:
	@echo "Usage: make <target> [ARGS=\"...\"] [MSG=\"commit message\"] [FORCE=1] [OUT=path] [IN=path]"
	@echo ""
	@echo "Website development:"
	@echo "  run_server          Run webpack dev server on port 3000"
	@echo "  build_site          Build index then webpack build"
	@echo "  update_index        Build the index (ARGS forwarded)"
	@echo "  update_data         Fetch data (ARGS forwarded)"
	@echo "  install_node_deps   Install dashboard node dependencies"
	@echo ""
	@echo "Development image management:"
	@echo "  build_dev_image     Build dev image (FORCE=1 to rebuild)"
	@echo "  save_image          Save dev image to OUT=path (builds if missing)"
	@echo "  load_image          Load dev image from IN=path"
	@echo "  rebuild_image       Force rebuild dev image"
	@echo "  image_shell         Open bash shell in dev image"
	@echo "  setup               Build dev image and setup worktrees"
	@echo "  setup_worktree      Create git worktrees for dist/data"
	@echo "  push_data           Commit & push data (MSG required)"
	@echo "  push_dist           Move index.db then commit & push dist (MSG required)"

build_dev_image:
	@echo "Building development image..."
	@if ! docker inspect $(IMAGE_NAME):$(IMAGE_TAG) &> /dev/null || [ "$(FORCE)" == "1" ]; then \
		set -x; \
		docker build --load -t $(IMAGE_NAME):$(IMAGE_TAG) .; \
	else \
		echo "Development image already exists."; \
	fi

save_image: build_dev_image
	@echo "Saving the development image..."
	@if [ -z "$(OUT)" ]; then \
		echo "expected image archive as OUT=path."; \
		exit 1; \
	fi
	docker save $(IMAGE_NAME):$(IMAGE_TAG) > "$(OUT)"

load_image:
	@echo "Loading the development image..."
	@if [ -z "$(IN)" ]; then \
		echo "expected image archive as IN=path."; \
		exit 1; \
	fi
	docker load < "$(IN)"

image_shell:
	@echo "Entering development image shell..."
	docker run $(COMMON_DOCKER_ARGS) -it -w /repo \
		$(IMAGE_NAME):$(IMAGE_TAG) /bin/bash

run_server:
	@echo "Running the server.... Open port 3000 in your browser."
	docker run $(COMMON_DOCKER_ARGS) -w /repo/dashboard -p 3000:3000 \
		$(IMAGE_NAME):$(IMAGE_TAG) webpack serve --no-client-overlay

build_site: update_index
	@echo "Building the website..."
	docker run $(COMMON_DOCKER_ARGS) -w /repo/dashboard \
		$(IMAGE_NAME):$(IMAGE_TAG) webpack build

update_index:
	@echo "Building the index..."
	docker run $(COMMON_DOCKER_ARGS) -w /repo \
		$(IMAGE_NAME):$(IMAGE_TAG) python3 -m data_manager compile $(ARGS)

update_data:
	@echo "Fetching data..."
	docker run $(COMMON_DOCKER_ARGS) -w /repo \
		$(IMAGE_NAME):$(IMAGE_TAG) python3 -m data_manager fetch $(ARGS)

install_node_deps:
	@echo "Installing node dependencies..."
	docker run $(COMMON_DOCKER_ARGS) -w /repo/dashboard \
		$(IMAGE_NAME):$(IMAGE_TAG) npx --yes yarn install

setup_worktree:
	@echo "Setting up worktree..."
	git fetch --all
	git worktree add "$(ROOT_DIR)/dashboard/dist" dashboard
	git worktree add "$(ROOT_DIR)/data" data

setup: build_dev_image setup_worktree

rebuild_image:
	$(MAKE) build_dev_image FORCE=1

push_data:
	@if [ -z "$(MSG)" ]; then \
		echo "Commit message is required. Use MSG=\"...\""; \
		exit 1; \
	fi
	@pushd "data" >/dev/null; \
		if git diff-index --quiet HEAD; then \
			echo "No changes to commit"; \
			popd >/dev/null; \
			exit 0; \
		fi; \
		git add -A; \
		git -c user.name='Dashboard Worker' -c user.email='' commit -m "$(MSG)"; \
		git push; \
	popd >/dev/null

push_dist:
	@if [ -z "$(MSG)" ]; then \
		echo "Commit message is required. Use MSG=\"...\""; \
		exit 1; \
	fi
	mv index.db dashboard/dist/index.db
	@pushd "dashboard/dist" >/dev/null; \
		if git diff-index --quiet HEAD; then \
			echo "No changes to commit"; \
			popd >/dev/null; \
			exit 0; \
		fi; \
		git add -A; \
		git -c user.name='Dashboard Worker' -c user.email='' commit -m "$(MSG)"; \
		git push; \
	popd >/dev/null
