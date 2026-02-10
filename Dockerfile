FROM ubuntu:noble

RUN apt update && apt install --yes --no-install-recommends npm && \
    apt clean && rm -rf /var/lib/apt/lists/*

RUN npm install --global yarn && npm cache clean --force


WORKDIR /dashboard
RUN chown --recursive ubuntu:ubuntu /dashboard
COPY ./dashboard/package.json package.json
COPY ./dashboard/yarn.lock yarn.lock

RUN yarn install --frozen-lockfile --ignore-engines

# Copy the rest of the dashboard files after installing dependencies to leverage Docker caching
COPY ./dashboard /dashboard

