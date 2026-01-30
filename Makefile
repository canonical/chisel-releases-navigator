.DEFAULT_GOAL := help
SHELL := /usr/bin/bash

DOCKER_FLAGS := --rm --user ubuntu:ubuntu --publish 3000:3000 \
	--volume ./data_manager/index.db.br:/dashboard/index.db.br

IMAGE=dev-image

help:  ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
	
data_manager/index.db.br:
	uv --directory data_manager run data_manager.py

dev-image.tar: Dockerfile  ## Build the development Docker image
	docker build -t $(IMAGE) -f $< .
	docker save $(IMAGE) > $@


.PHONY: run-dev-image
run-dev-image: _load-dev-image  ## Run an interactive shell in the development image
	docker run -it $(DOCKER_FLAGS) $(IMAGE) /bin/bash


.PHONY: _load-dev-image
_load-dev-image: dev-image.tar
	docker load < $<


.PHONY: run-server
run-server: _load-dev-image  ## Run the development server
	docker run $(DOCKER_FLAGS) $(IMAGE) webpack serve --no-client-overlay

dashboard/dist: _load-dev-image data_manager/index.db.br
	docker rm -f build-temp || true
	docker run $(DOCKER_FLAGS) --name build-temp $(IMAGE) sleep inf &
	sleep 1
	docker exec build-temp webpack build
	docker cp build-temp:/dashboard/dist ./dashboard/dist
	docker rm -f build-temp

.PHONY: build-dist
build-dist: dashboard/dist  ## Build the production distribution

.PHONY: clean
clean:  ## Clean up generated files
	rm -f data_manager/index.db
	rm -f data_manager/index.db.br
	rm -rf dashboard/dist
	rm -f dev-image.tar
