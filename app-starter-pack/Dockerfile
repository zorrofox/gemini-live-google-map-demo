# Stage 1: Build the base image with common dependencies
FROM python:3.11-slim AS builder

RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs

RUN pip install --no-cache-dir poetry==1.6.1

RUN poetry config virtualenvs.create false

WORKDIR /code

COPY ./app-starter-pack/pyproject.toml ./app-starter-pack/README.md ./app-starter-pack/poetry.lock* ./

COPY ./app-starter-pack/app ./app

COPY ./app-starter-pack/frontend ./frontend

RUN poetry install --no-interaction --no-ansi --no-dev

# install the frontend (common for all images) but wait to build it because we
# need the .env file to be in place first
RUN npm --prefix frontend install

# Stage 2: Create images for each API key
FROM builder AS base

# Copy the backend code
COPY --from=builder /code/app /code/app

EXPOSE 8080

CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8080"]

# Create a target for each API key
FROM base AS itinerary_planner
ARG GOOGLE_API_KEY
RUN bash -c "if [[ -z '$GOOGLE_API_KEY' ]] ; then echo No_API_Key_Dockerfile ; else echo 'VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_API_KEY' > ./frontend/.env ; fi"
# now that the .env is in place we can build the .env
RUN npm --prefix frontend run build
