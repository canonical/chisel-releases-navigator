FROM ubuntu:noble
ENV VENV_PATH=/venv

RUN apt update && apt install -y npm git python3.12 python3.12-venv curl

RUN curl -LsSf https://astral.sh/uv/install.sh | sh

COPY requirements.txt requirements.txt
RUN /root/.local/bin/uv sync --python 3.12 --venv $VENV_PATH --requirements requirements.txt

# always activate the virtual environment
ENV PATH="$VENV_PATH/"bin":$PATH"